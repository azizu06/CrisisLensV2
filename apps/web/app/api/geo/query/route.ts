import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  GenieClientError,
  createMessage,
  fetchQueryResult,
  listConversationMessages,
  pollMessage,
  startConversation
} from "@/lib/genieClient";
import { checkDatabricksExpensiveRateLimit } from "@/lib/api/rate-limit";
import { formatGenieNarrative } from "@/lib/genie/response-format";
import { getConversationForSession, setConversationForSession } from "@/lib/genie/session-store";

type Payload = {
  question?: string;
};

type Intent = "compare" | "funding_up" | "funding_cut" | "solutions" | "general";

const SESSION_COOKIE = "crisis_session";

function detectIntent(question: string): Intent {
  const q = question.toLowerCase();
  if (/(compare|versus|vs\b|rank|across countries|higher than|lower than)/.test(q)) return "compare";
  if (/(cut funding|reduce funding|overfund|over-funded|doesnt need|doesn't need|excess funding)/.test(q)) {
    return "funding_cut";
  }
  if (/(increase funding|prioritize funding|where to fund|allocate)/.test(q)) return "funding_up";
  if (/(solution|intervention|action plan|recommend)/.test(q)) return "solutions";
  return "general";
}

function buildPrompt(question: string): string {
  return [
    `User question: ${question}`,
    "Use the curated Genie space data (crisislens_master).",
    "Keep the user's request scope. Use latest available year per country unless user asks otherwise.",
    "Return ONLY valid JSON (no markdown) with schema:",
    '{"headline":"string","summary":"2-4 concise sentences","keyPoints":["2-4 concise bullets"],"recommendations":["0-4 practical actions"],"followups":["0-4 useful follow-up questions"]}.',
    "If evidence is limited, state the limitation clearly."
  ].join(" ");
}

function normalizeText(value: string | null): string {
  if (!value) return "";
  return value.trim();
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

function extractAttachmentText(attachments: Array<Record<string, unknown>>): string | null {
  for (const attachment of attachments) {
    const text = attachment.text;
    if (typeof text === "string" && text.trim()) return text.trim();
    if (Array.isArray(text)) {
      const joined = text.map((item) => String(item)).join(" ").trim();
      if (joined) return joined;
    }
    if (text && typeof text === "object") {
      const candidate = (text as { value?: unknown; content?: unknown }).value;
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
      const content = (text as { value?: unknown; content?: unknown }).content;
      if (typeof content === "string" && content.trim()) return content.trim();
    }
  }
  return null;
}

function synthesizeFromQueryResult(queryResult: { columns: string[]; rows: unknown[][] } | null): string {
  if (!queryResult || !queryResult.columns.length || !queryResult.rows.length) return "";
  const top = queryResult.rows[0];
  if (!Array.isArray(top)) return "";
  const cols = queryResult.columns.map((col) => col.toLowerCase());
  const idxCountry = cols.findIndex((c) => c.includes("country"));
  const idxIso3 = cols.findIndex((c) => c === "iso3" || c.includes("iso3"));
  const idxCoverage = cols.findIndex((c) => c.includes("coverage") || c.includes("funding_gap_pct"));
  const idxGap = cols.findIndex((c) => c.includes("funding_gap_usd") || c.includes("gap_millions_usd"));
  const country = idxCountry >= 0 ? String(top[idxCountry] ?? "") : "";
  const iso3 = idxIso3 >= 0 ? String(top[idxIso3] ?? "") : "";
  const coverage = idxCoverage >= 0 ? String(top[idxCoverage] ?? "") : "";
  const gap = idxGap >= 0 ? String(top[idxGap] ?? "") : "";
  const label = [country, iso3 ? `(${iso3})` : ""].join(" ").trim();
  if (!label) return "Genie returned ranked table results.";
  return `${label} appears at the top of the returned table${coverage ? ` with coverage ${coverage}` : ""}${gap ? ` and gap/person ${gap}` : ""}.`;
}

function buildHeadlineFallback(rows: Array<{ country: string; iso3: string }>, intent: Intent): string {
  if (!rows.length) return "Genie returned no ranked rows for this request.";
  if (intent === "funding_cut") return `Potential reallocation screen generated from ${rows.length} ranked rows.`;
  if (intent === "funding_up") return `Priority funding candidates generated from ${rows.length} ranked rows.`;
  if (intent === "compare") return `Cross-country comparison generated from ${rows.length} ranked rows.`;
  return `Query results generated from ${rows.length} ranked rows.`;
}

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

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

function mapRowsForUi(queryResult: { columns: string[]; rows: unknown[][] } | null) {
  if (!queryResult || !queryResult.columns.length || !queryResult.rows.length) return [];
  const columns = queryResult.columns;
  const idxIso3 = findIndex(columns, "iso3", "country_iso3", "country_code");
  const idxCountry = findIndex(columns, "country_plan_name", "country_name", "country");
  const idxYear = findIndex(columns, "year");
  const idxCoverage = findIndex(columns, "funding_coverage_pct", "coverage_pct", "coverage", "funding_coverage_ratio");
  const idxFundingGapPct = findIndex(columns, "funding_gap_pct", "gap_pct");
  const idxGapPerPerson = findIndex(columns, "funding_gap_per_person_usd", "funding_gap_per_person", "gap_per_person");
  const idxGapUsd = findIndex(columns, "funding_gap_usd", "gap_usd");
  const idxGapMillions = findIndex(columns, "gap_millions_usd", "funding_gap_millions_usd", "gap_millions");
  const idxPin = findIndex(columns, "total_people_in_need", "people_in_need", "pin");
  const idxOci = findIndex(columns, "overlooked_crisis_index", "oci_score", "oci");
  const idxSeverity = findIndex(columns, "severity_score");
  const idxStatus = findIndex(columns, "crisis_status");
  const idxOciVariant = findIndex(columns, "oci_variant");
  const idxCompleteness = findIndex(columns, "data_completeness_label", "data_completeness");

  return queryResult.rows
    .map((row) => {
      const values = Array.isArray(row) ? row : [];
      const rawCoverage = idxCoverage >= 0 ? toNum(values[idxCoverage]) : null;
      const rawFundingGapPct = idxFundingGapPct >= 0 ? toNum(values[idxFundingGapPct]) : null;
      const coveragePct =
        rawCoverage !== null && rawCoverage > 0
          ? rawCoverage <= 1
            ? rawCoverage * 100
            : rawCoverage
          : rawFundingGapPct !== null && rawFundingGapPct > 0
            ? Math.max(0, 100 - rawFundingGapPct)
            : 0;
      const gapUsdRaw =
        idxGapUsd >= 0
          ? toNum(values[idxGapUsd])
          : idxGapMillions >= 0
            ? toNum(values[idxGapMillions]) * 1_000_000
            : 0;
      return {
        iso3: idxIso3 >= 0 ? String(values[idxIso3] ?? "") : "",
        country: idxCountry >= 0 ? String(values[idxCountry] ?? "") : "Unknown",
        year: idxYear >= 0 ? Math.round(toNum(values[idxYear])) : 0,
        funding_coverage_ratio: Math.max(0, Math.min(1, coveragePct / 100)),
        coverage_pct: coveragePct,
        funding_gap_usd: gapUsdRaw,
        funding_gap_per_person: idxGapPerPerson >= 0 ? toNum(values[idxGapPerPerson]) : 0,
        people_in_need: idxPin >= 0 ? toNum(values[idxPin]) : 0,
        oci_score: idxOci >= 0 ? toNum(values[idxOci]) : undefined,
        severity_score: idxSeverity >= 0 ? toNum(values[idxSeverity]) : undefined,
        crisis_status: idxStatus >= 0 ? String(values[idxStatus] ?? "") : undefined,
        oci_variant: idxOciVariant >= 0 ? String(values[idxOciVariant] ?? "") : undefined,
        data_completeness_label: idxCompleteness >= 0 ? String(values[idxCompleteness] ?? "") : undefined
      };
    })
    .filter((row) => row.iso3 || row.country)
    .slice(0, 40);
}

export async function POST(request: NextRequest) {
  let payload: Payload;

  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const question = payload.question?.trim();
  if (!question) {
    return NextResponse.json({ ok: false, error: "question is required." }, { status: 400 });
  }

  const rateLimited = checkDatabricksExpensiveRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const intent = detectIntent(question);
    const existingSessionId = request.cookies.get(SESSION_COOKIE)?.value;
    const sessionId = existingSessionId ?? randomUUID();
    let conversationId = getConversationForSession(sessionId);
    if (!conversationId) {
      const started = await startConversation();
      conversationId = started.conversationId;
      setConversationForSession(sessionId, conversationId);
    }

    const prompt = buildPrompt(question);
    let activeConversationId = conversationId;
    let sent;
    try {
      sent = await createMessage(activeConversationId, prompt);
    } catch (error) {
      if (error instanceof GenieClientError && (error.status === 400 || error.status === 404)) {
        const restarted = await startConversation();
        activeConversationId = restarted.conversationId;
        setConversationForSession(sessionId, activeConversationId);
        sent = await createMessage(activeConversationId, prompt);
      } else {
        throw error;
      }
    }

    const finalMessage = await pollMessage(activeConversationId, sent.messageId);
    const attachments = finalMessage.attachments as Array<Record<string, unknown>>;
    const { attachmentId } = extractSqlAndAttachmentId(attachments);
    const queryResult = attachmentId
      ? await fetchQueryResult(activeConversationId, finalMessage.id, attachmentId)
      : null;
    const rows = mapRowsForUi(queryResult);
    let attachmentText = extractAttachmentText(attachments);
    let contentText = normalizeText(finalMessage.content);
    if (!attachmentText && (contentText === prompt.trim() || contentText.startsWith("Use the curated Genie space data"))) {
      const messages = await listConversationMessages(activeConversationId);
      const latestCompleted = messages
        .filter((message) => message.status === "COMPLETED")
        .sort((a, b) => Number(b.created_timestamp ?? 0) - Number(a.created_timestamp ?? 0))[0];
      if (latestCompleted) {
        contentText = normalizeText(latestCompleted.content ?? null);
        attachmentText = extractAttachmentText((latestCompleted.attachments ?? []) as Array<Record<string, unknown>>);
      }
    }
    const isPromptEcho = contentText === prompt.trim() || contentText.startsWith("Use the curated Genie space data");
    const summaryText = attachmentText ?? (!isPromptEcho ? contentText : "");
    const narrative = formatGenieNarrative(
      summaryText || synthesizeFromQueryResult(queryResult) || "Genie returned a structured query result table for this request."
    );
    const data = {
      intent,
      headline: narrative.headline || buildHeadlineFallback(rows, intent),
      answer: narrative.summary || summaryText || synthesizeFromQueryResult(queryResult) || "Genie returned a structured query result table for this request.",
      keyPoints: narrative.keyPoints,
      recommendations: narrative.actions,
      followups: narrative.followups,
      rows,
      askedQuestion: question
    };

    const response = NextResponse.json({ ok: true, data });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: sessionId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 6
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Genie query failed.";
    if (error instanceof GenieClientError) {
      return NextResponse.json(
        {
          ok: false,
          error: `${message}${error.details ? ` | ${error.details}` : ""}`
        },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 }
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
