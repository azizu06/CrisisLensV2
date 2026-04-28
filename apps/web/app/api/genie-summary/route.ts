import { NextRequest, NextResponse } from "next/server";
import { checkDatabricksExpensiveRateLimit } from "@/lib/api/rate-limit";
import { resolveCountryIso3 } from "@/lib/country-insights";
import {
  GenieApiError,
  GenieTimeoutError,
  getAttachmentRows,
  isWarehouseStoppedError,
  listConversationMessages,
  pollMessageUntilComplete,
  sendMessage,
  startConversation
} from "@/lib/genie/databricks";
import { buildCountrySummaryPrompt, parseGenieSummaryText } from "@/lib/genie/summary";
import { getConversationForSession, setConversationForSession } from "@/lib/genie/session-store";

type SummaryPayload = {
  countryCode?: string;
  countryName?: string;
  conversationId?: string;
  followUpQuestion?: string;
};
const SESSION_COOKIE = "genie_session_id";

function extractAttachmentText(attachments: Array<Record<string, unknown>>): string {
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
  return "";
}

function synthesizeSummaryFromRows(countryLabel: string, rows: Array<Record<string, unknown>>): string {
  const first = rows[0];
  if (!first) return "";

  const pin = Number(first.people_in_need ?? first.pin ?? 0);
  const targeted = Number(first.people_targeted ?? 0);
  const funding = Number(first.funding_usd ?? first.funding_received ?? 0);
  const required = Number(first.requirements_usd ?? first.funding_required ?? 0);
  const gap = Number(first.funding_gap_usd ?? Math.max(required - funding, 0));
  const coverage = Number(first.coverage_pct ?? (required > 0 ? (funding / required) * 100 : 0));

  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  });

  const summaryParts = [
    `${countryLabel} has approximately ${compact.format(Math.max(pin, 0))} people in need`,
    targeted > 0 ? `with ${compact.format(targeted)} currently targeted.` : null,
    required > 0
      ? `Funding coverage is about ${Number.isFinite(coverage) ? coverage.toFixed(1) : "0.0"}% (${money.format(
          funding
        )} received of ${money.format(required)} required).`
      : null,
    gap > 0 ? `The estimated funding gap is ${money.format(gap)}.` : null
  ].filter(Boolean);

  return `${summaryParts.join(" ")} This summary was generated from Genie SQL attachment results.`;
}

export async function POST(request: NextRequest) {
  let payload: SummaryPayload;

  try {
    payload = (await request.json()) as SummaryPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const countryCode = payload.countryCode?.trim();
  if (!countryCode) {
    return NextResponse.json({ error: "countryCode is required." }, { status: 400 });
  }

  const iso3 = resolveCountryIso3(countryCode);
  if (!iso3) {
    return NextResponse.json({ error: "Unknown countryCode. Use ISO3 or ISO2." }, { status: 400 });
  }

  const rateLimited = checkDatabricksExpensiveRateLimit(request);
  if (rateLimited) return rateLimited;

  try {
    const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
    let conversationId = payload.conversationId?.trim() ?? null;
    if (!conversationId && sessionId) {
      conversationId = getConversationForSession(sessionId);
    }

    if (!conversationId) {
      const started = await startConversation("CrisisLens session started");
      conversationId = started.conversationId;
      if (sessionId) {
        setConversationForSession(sessionId, conversationId);
      }
    } else if (sessionId) {
      setConversationForSession(sessionId, conversationId);
    }

    const prompt = buildCountrySummaryPrompt({
      countryCode: iso3,
      countryName: payload.countryName,
      followUpQuestion: payload.followUpQuestion
    });

    const activeConversationId = conversationId as string;

    const sent = await sendMessage({
      conversationId: activeConversationId,
      content: prompt
    });

    let message = await pollMessageUntilComplete({
      conversationId: activeConversationId,
      messageId: sent.messageId,
      timeoutMs: 50_000,
      pollIntervalMs: 1_500
    });

    let attachments = (message.attachments ?? []).filter((item) => typeof item?.attachment_id === "string");
    const promptEcho = String(message.content ?? "").trim();

    // Some Genie runs return the user message in `content`; fetch latest completed message fallback.
    if (attachments.length === 0 || promptEcho === prompt.trim()) {
      const allMessages = await listConversationMessages({ conversationId: activeConversationId });
      const latestCompleted = allMessages
        .filter((item) => item.status === "COMPLETED")
        .sort((a, b) => {
          const aTs = Number((a as { created_timestamp?: unknown }).created_timestamp ?? 0);
          const bTs = Number((b as { created_timestamp?: unknown }).created_timestamp ?? 0);
          return bTs - aTs;
        })[0];
      if (latestCompleted) {
        message = latestCompleted;
        attachments = (message.attachments ?? []).filter((item) => typeof item?.attachment_id === "string");
      }
    }

    const attachmentText = extractAttachmentText(attachments as Array<Record<string, unknown>>);
    const rawSummary = attachmentText || String(message.content ?? "");
    const parsed = parseGenieSummaryText(rawSummary);
    let rows: Array<Record<string, unknown>> = [];
    let sql: string | null = null;

    if (attachments.length > 0) {
      for (const attachment of attachments) {
        const queryObj = attachment.query as { query?: unknown } | undefined;
        if (!queryObj || typeof queryObj.query !== "string" || !queryObj.query.trim()) {
          // Skip non-query attachments (e.g. suggested_questions).
          continue;
        }
        if (!sql) {
          sql = queryObj.query;
        }
        if (!attachment.attachment_id) continue;
        const candidateRows = await getAttachmentRows({
          conversationId: activeConversationId,
          messageId: String(message.id ?? sent.messageId),
          attachmentId: attachment.attachment_id
        });
        if (candidateRows.length > 0) {
          rows = candidateRows.slice(0, 10).map((row) => row);
          break;
        }
      }
    }

    const fallbackSummary = rows.length > 0 ? synthesizeSummaryFromRows(payload.countryName ?? iso3, rows) : "";
    const resolvedSummary =
      parsed.summaryText && parsed.summaryText.trim() && parsed.summaryText.trim() !== prompt.trim()
        ? parsed.summaryText
        : fallbackSummary || "Genie returned no readable summary text for this run. Try Refresh Summary.";

    return NextResponse.json({
      status: message.status,
      conversationId: activeConversationId,
      messageId: String(message.id ?? sent.messageId),
      summaryText: resolvedSummary,
      keyDrivers: parsed.keyDrivers,
      outliers: parsed.outliers,
      sql,
      topList: parsed.topList,
      attachments,
      rows
    });
  } catch (error) {
    if (error instanceof GenieTimeoutError) {
      return NextResponse.json(
        {
          error: "Genie timed out while building this summary. Try again in a few seconds."
        },
        { status: 504 }
      );
    }

    if (isWarehouseStoppedError(error)) {
      return NextResponse.json(
        {
          error:
            "Databricks SQL Warehouse appears to be stopped. Start the warehouse in Databricks and retry."
        },
        { status: 503 }
      );
    }

    if (error instanceof GenieApiError) {
      return NextResponse.json(
        {
          error: "Genie request failed.",
          details: error.details ?? error.message
        },
        { status: 502 }
      );
    }

    const message = error instanceof Error ? error.message : "Unable to fetch Genie summary.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
