import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkDatabricksExpensiveRateLimit } from "@/lib/api/rate-limit";
import { startConversation } from "@/lib/genieClient";
import { getConversationForSession, setConversationForSession } from "@/lib/genie/session-store";

const SESSION_COOKIE = "crisis_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 6;

export async function POST(request: NextRequest) {
  const existingSessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = existingSessionId ?? randomUUID();

  try {
    let conversationId = getConversationForSession(sessionId);
    if (!conversationId) {
      const rateLimited = checkDatabricksExpensiveRateLimit(request);
      if (rateLimited) return rateLimited;

      const created = await startConversation();
      conversationId = created.conversationId;
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
      maxAge: SESSION_MAX_AGE_SECONDS
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Genie session.";
    return NextResponse.json(
      {
        ok: false,
        code: "GENIE_FAILED",
        message
      },
      { status: 502 }
    );
  }
}
