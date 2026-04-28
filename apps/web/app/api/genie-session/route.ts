import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkDatabricksExpensiveRateLimit } from "@/lib/api/rate-limit";
import { startConversation } from "@/lib/genie/databricks";
import { getConversationForSession, setConversationForSession } from "@/lib/genie/session-store";

const SESSION_COOKIE = "genie_session_id";

export async function POST(request: NextRequest) {
  const existingSession = request.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = existingSession ?? randomUUID();

  try {
    // Hackathon-friendly session state: cookie session id -> in-memory conversation id.
    let conversationId = getConversationForSession(sessionId);
    if (!conversationId) {
      const rateLimited = checkDatabricksExpensiveRateLimit(request);
      if (rateLimited) return rateLimited;

      const started = await startConversation("CrisisLens session started");
      conversationId = started.conversationId;
      setConversationForSession(sessionId, conversationId);
    }

    const response = NextResponse.json({ conversationId });
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
    const message = error instanceof Error ? error.message : "Failed to initialize Genie session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
