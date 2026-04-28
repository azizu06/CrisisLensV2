import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  getRateLimitHeaders,
  resetRateLimitStore
} from "@/lib/api/rate-limit";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("https://crisislens.test/api/genie-query", { headers });
}

describe("API rate limiting", () => {
  beforeEach(() => {
    resetRateLimitStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00.000Z"));
  });

  afterEach(() => {
    resetRateLimitStore();
    vi.useRealTimers();
  });

  it("blocks a client after the configured request limit until the window resets", () => {
    const options = { namespace: "genie", limit: 2, windowMs: 60_000 };
    const request = makeRequest({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" });

    expect(checkRateLimit(request, options)).toMatchObject({
      allowed: true,
      limit: 2,
      remaining: 1,
      retryAfterSeconds: 0
    });
    expect(checkRateLimit(request, options)).toMatchObject({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0
    });

    const blocked = checkRateLimit(request, options);
    expect(blocked).toMatchObject({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 60
    });
    expect(getRateLimitHeaders(blocked)).toMatchObject({
      "Retry-After": "60",
      "X-RateLimit-Limit": "2",
      "X-RateLimit-Remaining": "0"
    });

    vi.advanceTimersByTime(60_000);
    expect(checkRateLimit(request, options)).toMatchObject({
      allowed: true,
      remaining: 1
    });
  });

  it("keeps clients and namespaces isolated", () => {
    const options = { namespace: "genie", limit: 1, windowMs: 60_000 };

    expect(checkRateLimit(makeRequest({ "x-real-ip": "198.51.100.1" }), options).allowed).toBe(true);
    expect(checkRateLimit(makeRequest({ "x-real-ip": "198.51.100.1" }), options).allowed).toBe(false);
    expect(checkRateLimit(makeRequest({ "x-real-ip": "198.51.100.2" }), options).allowed).toBe(true);
    expect(
      checkRateLimit(makeRequest({ "x-real-ip": "198.51.100.1" }), {
        ...options,
        namespace: "databricks-read"
      }).allowed
    ).toBe(true);
  });
});
