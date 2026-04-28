import { NextResponse } from "next/server";

export type RateLimitOptions = {
  namespace: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  key: string;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitGlobal = typeof globalThis & {
  __crisisLensRateLimitStore?: Map<string, RateLimitBucket>;
};

const DEFAULT_EXPENSIVE_LIMIT = 12;
const DEFAULT_READ_LIMIT = 60;
const DEFAULT_WINDOW_SECONDS = 15 * 60;
const RATE_LIMIT_MESSAGE =
  "Too many Databricks requests from this client. Please wait a bit before trying again.";

function getStore() {
  const globalStore = globalThis as RateLimitGlobal;
  if (!globalStore.__crisisLensRateLimitStore) {
    globalStore.__crisisLensRateLimitStore = new Map<string, RateLimitBucket>();
  }
  return globalStore.__crisisLensRateLimitStore;
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first || null;
}

function getClientKey(request: Pick<Request, "headers">): string {
  const forwardedFor = firstHeaderValue(request.headers.get("x-forwarded-for"));
  const vercelForwardedFor = firstHeaderValue(request.headers.get("x-vercel-forwarded-for"));
  const realIp = firstHeaderValue(request.headers.get("x-real-ip"));
  const cloudflareIp = firstHeaderValue(request.headers.get("cf-connecting-ip"));
  const flyIp = firstHeaderValue(request.headers.get("fly-client-ip"));
  const clientIp = cloudflareIp ?? vercelForwardedFor ?? forwardedFor ?? realIp ?? flyIp ?? "unknown";
  return `ip:${clientIp}`;
}

export function databricksExpensiveRateLimitOptions(): RateLimitOptions {
  return {
    namespace: "databricks-expensive",
    limit: readPositiveInt("DATABRICKS_EXPENSIVE_RATE_LIMIT", DEFAULT_EXPENSIVE_LIMIT),
    windowMs:
      readPositiveInt("DATABRICKS_RATE_LIMIT_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS) * 1000
  };
}

export function databricksReadRateLimitOptions(): RateLimitOptions {
  return {
    namespace: "databricks-read",
    limit: readPositiveInt("DATABRICKS_READ_RATE_LIMIT", DEFAULT_READ_LIMIT),
    windowMs:
      readPositiveInt("DATABRICKS_RATE_LIMIT_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS) * 1000
  };
}

export function checkRateLimit(
  request: Pick<Request, "headers">,
  options: RateLimitOptions,
  now = Date.now()
): RateLimitResult {
  const limit = Math.max(1, Math.floor(options.limit));
  const windowMs = Math.max(1000, Math.floor(options.windowMs));
  const key = `${options.namespace}:${getClientKey(request)}`;
  const store = getStore();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      key,
      limit,
      remaining: limit - 1,
      resetAt,
      retryAfterSeconds: 0
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      key,
      limit,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    key,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: 0
  };
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": new Date(result.resetAt).toISOString()
  };
}

export function rateLimitExceededResponse(
  result: RateLimitResult,
  message = RATE_LIMIT_MESSAGE
) {
  return NextResponse.json(
    {
      ok: false,
      code: "RATE_LIMITED",
      error: message,
      message,
      retryAfterSeconds: result.retryAfterSeconds
    },
    {
      status: 429,
      headers: getRateLimitHeaders(result)
    }
  );
}

export function checkDatabricksExpensiveRateLimit(request: Pick<Request, "headers">) {
  const result = checkRateLimit(request, databricksExpensiveRateLimitOptions());
  return result.allowed ? null : rateLimitExceededResponse(result);
}

export function checkDatabricksReadRateLimit(request: Pick<Request, "headers">) {
  const result = checkRateLimit(request, databricksReadRateLimitOptions());
  return result.allowed ? null : rateLimitExceededResponse(result);
}

export function resetRateLimitStore() {
  getStore().clear();
}
