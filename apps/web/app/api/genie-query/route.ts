import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  GenieClientError,
  createMessage,
  fetchQueryResult,
  pollMessage,
  startConversation
} from "@/lib/genieClient";
import { checkDatabricksExpensiveRateLimit } from "@/lib/api/rate-limit";
import { getConversationForSession, setConversationForSession } from "@/lib/genie/session-store";

type GeniePayload = {
  nl_query?: string;
  iso3?: string;
};

type GenieRow = {
  iso3: string;
  metric: string;
  score: number;
  rationale: string;
};

const SESSION_COOKIE = "crisis_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 6;

function findIndex(columns: string[], ...aliases: string[]): number {
  const normalized = columns.map((column) => column.toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.findIndex((column) => column === alias.toLowerCase());
    if (idx !== -1) return idx;
  }
  for (const alias of aliases) {
    const idx = normalized.findIndex((column) => column.includes(alias.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

function toNum(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function asIso3(value: unknown): string | null {
  const text = String(value ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(text) ? text : null;
}

function metricCandidates(columns: string[]): Array<{ idx: number; metric: string }> {
  const candidates: Array<{ aliases: string[]; metric: string }> = [
    { aliases: ["overlooked_crisis_index", "oci", "oci_score"], metric: "overlooked_crisis_index" },
    { aliases: ["funding_gap_per_person_usd", "funding_gap_per_person"], metric: "funding_gap_per_person_usd" },
    { aliases: ["funding_coverage_pct", "coverage_pct"], metric: "funding_coverage_pct" },
    { aliases: ["severity_score"], metric: "severity_score" },
    { aliases: ["total_people_in_need", "people_in_need"], metric: "total_people_in_need" },
    { aliases: ["funding_gap_usd"], metric: "funding_gap_usd" }
  ];

  const resolved: Array<{ idx: number; metric: string }> = [];
  for (const candidate of candidates) {
    const idx = findIndex(columns, ...candidate.aliases);
    if (idx !== -1) resolved.push({ idx, metric: candidate.metric });
  }
  return resolved;
}

function genericNumericMetricCandidates(columns: string[]): Array<{ idx: number; metric: string }> {
  const blocked = ["year", "rank", "index", "id", "iso", "country", "name"];
  return columns
    .map((column, idx) => ({ idx, metric: column.trim().toLowerCase() }))
    .filter(({ metric }) => metric.length > 0 && !blocked.some((token) => metric.includes(token)));
}

function inferRows(args: {
  columns: string[];
  rows: unknown[][];
  scopedIso3?: string;
}): GenieRow[] {
  const isoIdx = findIndex(args.columns, "iso3", "country_iso3");
  const countryIdx = findIndex(args.columns, "country", "country_plan_name");
  const metrics = metricCandidates(args.columns);
  const genericMetrics = genericNumericMetricCandidates(args.columns);
  if (!metrics.length) return [];

  const out: GenieRow[] = [];
  for (const row of args.rows.slice(0, 120)) {
    if (!Array.isArray(row)) continue;
    const rowIso = (isoIdx >= 0 ? asIso3(row[isoIdx]) : null) ?? args.scopedIso3 ?? null;
    if (!rowIso) continue;
    const country = countryIdx >= 0 ? String(row[countryIdx] ?? rowIso) : rowIso;
    const seenMetrics = new Set<string>();

    for (const metric of metrics) {
      const value = toNum(row[metric.idx]);
      if (value === null) continue;
      out.push({
        iso3: rowIso,
        metric: metric.metric,
        score: value,
        rationale: `From Genie query result for ${country}.`
      });
      seenMetrics.add(metric.metric);
    }

    for (const metric of genericMetrics.slice(0, 10)) {
      if (seenMetrics.has(metric.metric)) continue;
      const value = toNum(row[metric.idx]);
      if (value === null) continue;
      out.push({
        iso3: rowIso,
        metric: metric.metric,
        score: value,
        rationale: `From Genie query result for ${country}.`
      });
    }
  }

  return out.slice(0, 150);
}

function normalizeGenieError(error: unknown) {
  if (error instanceof GenieClientError) {
    const status =
      error.status === 429
        ? 429
        : 
      error.code === "BAD_REQUEST"
        ? 400
        : error.code === "AUTH"
          ? 401
          : error.code === "GENIE_TIMEOUT"
            ? 504
            : 502;
    return {
      status,
      message:
        error.status === 429
          ? "Genie is currently rate-limited. Wait 15-30 seconds, then retry."
          :
        error.code === "GENIE_TIMEOUT"
          ? "Genie timed out while generating a response. Please retry."
          : error.message
    };
  }

  return {
    status: 500,
    message: error instanceof Error ? error.message : "Unexpected Genie error."
  };
}

function extractSqlAndAttachmentId(attachments: Array<Record<string, unknown>>) {
  for (const attachment of attachments) {
    const query = attachment.query as { query?: unknown } | undefined;
    const attachmentId = attachment.attachment_id;
    if (typeof query?.query === "string" && query.query.trim() && typeof attachmentId === "string") {
      return { sql: query.query.trim(), attachmentId };
    }
  }
  return { sql: null as string | null, attachmentId: null as string | null };
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as GeniePayload | null;
  const nlQuery = payload?.nl_query?.trim();
  if (!nlQuery) {
    return NextResponse.json({ error: "nl_query is required." }, { status: 400 });
  }

  const rateLimited = checkDatabricksExpensiveRateLimit(request);
  if (rateLimited) return rateLimited;

  const scopedIso3 = payload?.iso3?.trim().toUpperCase();
  const existingSessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = existingSessionId ?? randomUUID();

  try {
    let conversationId = getConversationForSession(sessionId);
    if (!conversationId) {
      const created = await startConversation();
      conversationId = created.conversationId;
      setConversationForSession(sessionId, conversationId);
    }

    const question = scopedIso3
      ? `${nlQuery}\n\nUse ISO3=${scopedIso3} as the primary country context when relevant. Return tabular country-level results with ISO3 and numeric metric columns when possible.`
      : `${nlQuery}\n\nReturn tabular country-level results with ISO3 and numeric metric columns when possible.`;

    let createdMessage;
    try {
      createdMessage = await createMessage(conversationId, question);
    } catch (error) {
      if (error instanceof GenieClientError && (error.status === 400 || error.status === 404)) {
        const restarted = await startConversation();
        conversationId = restarted.conversationId;
        setConversationForSession(sessionId, conversationId);
        createdMessage = await createMessage(conversationId, question);
      } else {
        throw error;
      }
    }

    const finalMessage = await pollMessage(conversationId, createdMessage.messageId);
    const attachments = (finalMessage.attachments ?? []) as Array<Record<string, unknown>>;
    const { attachmentId } = extractSqlAndAttachmentId(attachments);

    let columns: string[] = [];
    let rows: unknown[][] = [];
    if (attachmentId) {
      const queryResult = await fetchQueryResult(conversationId, finalMessage.id, attachmentId);
      columns = queryResult.columns ?? [];
      rows = queryResult.rows ?? [];
    }

    const parsedRows = inferRows({ columns, rows, scopedIso3 });
    const highlightIso3 = [...new Set(parsedRows.map((row) => row.iso3))];
    const fallbackHighlight = scopedIso3 ? [scopedIso3] : [];
    const answerText = finalMessage.content?.trim();
    const answer =
      answerText && answerText.length > 0
        ? answerText
        : parsedRows.length > 0
          ? `Genie returned ${parsedRows.length} scored signal rows from live query results.`
          : "Genie completed the query but returned no textual narrative.";

    const response = NextResponse.json({
      nl_query: nlQuery,
      answer,
      source: "genie",
      results: parsedRows,
      highlight_iso3: highlightIso3.length ? highlightIso3 : fallbackHighlight
    });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: sessionId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS
    });
    return response;
  } catch (error) {
    const normalized = normalizeGenieError(error);
    return NextResponse.json({ error: normalized.message }, { status: normalized.status });
  }
}
