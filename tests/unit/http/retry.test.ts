import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CnosDBAuthenticationError,
  CnosDBNetworkError,
  CnosDBRateLimitError,
  CnosDBRequestError,
  CnosDBServerError,
  CnosDBTimeoutError,
} from "../../../src/errors/index.js";
import {
  delayFor,
  isRetryable,
  normalizeRetry,
  parseRetryAfter,
  sleep,
  type ResolvedRetry,
} from "../../../src/http/retry.js";
import { captureError } from "../../helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function policy(overrides: Partial<ResolvedRetry> = {}): ResolvedRetry {
  return {
    attempts: 3,
    initialMs: 100,
    maxMs: 2_000,
    jitter: false,
    retryWrites: false,
    maxElapsedMs: undefined,
    ...overrides,
  };
}

describe("normalizeRetry", () => {
  it("returns undefined when retries are not configured", () => {
    expect(normalizeRetry(undefined)).toBeUndefined();
  });

  it("fills in the documented defaults", () => {
    expect(normalizeRetry({ attempts: 3 })).toStrictEqual({
      attempts: 3,
      initialMs: 100,
      maxMs: 2_000,
      jitter: true,
      retryWrites: false,
      maxElapsedMs: undefined,
    });
  });

  it("keeps every supplied value", () => {
    expect(
      normalizeRetry({
        attempts: 5,
        backoff: { initialMs: 25, maxMs: 400, jitter: false },
        retryWrites: true,
        maxElapsedMs: 5_000,
      }),
    ).toStrictEqual({
      attempts: 5,
      initialMs: 25,
      maxMs: 400,
      jitter: false,
      retryWrites: true,
      maxElapsedMs: 5_000,
    });
  });

  it("accepts one attempt, which simply disables retrying", () => {
    expect(normalizeRetry({ attempts: 1 })?.attempts).toBe(1);
  });

  it.each([0, -1, 1.5, Number.NaN, "3", null])(
    "rejects attempts of %s",
    (attempts) => {
      expect(() =>
        normalizeRetry({ attempts } as unknown as { attempts: number }),
      ).toThrow(TypeError);
    },
  );

  it("rejects a maximum delay below the initial one", () => {
    expect(() =>
      normalizeRetry({ attempts: 2, backoff: { initialMs: 500, maxMs: 100 } }),
    ).toThrow(/must not be smaller/);
  });

  it("rejects a non-object policy", () => {
    expect(() => normalizeRetry(3 as unknown as { attempts: number })).toThrow(
      TypeError,
    );
  });
});

describe("isRetryable", () => {
  it.each([
    ["a timeout", new CnosDBTimeoutError("timed out", { timeoutMs: 1 })],
    ["a network failure", new CnosDBNetworkError("connection refused")],
    ["a rate limit", new CnosDBRateLimitError("slow down", { status: 429 })],
    ["a server error", new CnosDBServerError("boom", { status: 503 })],
  ])("retries %s", (_label, error) => {
    expect(isRetryable(error)).toBe(true);
  });

  it.each([
    [
      "rejected credentials",
      new CnosDBAuthenticationError("nope", { status: 422 }),
    ],
    ["a rejected request", new CnosDBRequestError("bad sql", { status: 400 })],
    ["an unimplemented endpoint", new CnosDBServerError("no", { status: 501 })],
    ["something that is not an error", "boom"],
  ])("does not retry %s", (_label, error) => {
    expect(isRetryable(error)).toBe(false);
  });
});

describe("delayFor", () => {
  it("doubles from the initial delay without jitter", () => {
    const p = policy({ initialMs: 100, maxMs: 10_000 });
    expect(delayFor(p, 2, undefined)).toBe(100);
    expect(delayFor(p, 3, undefined)).toBe(200);
    expect(delayFor(p, 4, undefined)).toBe(400);
  });

  it("caps the delay at the configured maximum", () => {
    const p = policy({ initialMs: 100, maxMs: 250 });
    expect(delayFor(p, 9, undefined)).toBe(250);
  });

  it("spreads the delay across the interval when jitter is on", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    expect(delayFor(policy({ jitter: true }), 3, undefined)).toBe(50);
  });

  it("prefers the server's Retry-After over the computed backoff", () => {
    expect(delayFor(policy(), 2, 750)).toBe(750);
  });

  it("caps Retry-After too, so a wild value cannot park the caller", () => {
    expect(delayFor(policy({ maxMs: 2_000 }), 2, 3_600_000)).toBe(2_000);
  });
});

describe("parseRetryAfter", () => {
  it("reads a delay in seconds", () => {
    expect(parseRetryAfter("5")).toBe(5_000);
  });

  it("reads an HTTP date as a delay from now", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:30 GMT", now)).toBe(30_000);
  });

  it("treats a date in the past as no delay", () => {
    const now = Date.parse("2026-01-01T00:01:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:00 GMT", now)).toBe(0);
  });

  it.each([null, "", "   ", "soon", "-5", "5.5"])("ignores %s", (header) => {
    expect(parseRetryAfter(header)).toBeUndefined();
  });
});

describe("sleep", () => {
  it("resolves after the delay", async () => {
    const started = Date.now();
    await sleep(20);
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("gone"));
    const error = await captureError(sleep(10_000, controller.signal));
    expect(error.message).toBe("gone");
  });

  it("rejects with the abort reason when the signal fires mid-wait", async () => {
    const controller = new AbortController();
    const promise = sleep(10_000, controller.signal);
    controller.abort(new Error("caller changed its mind"));
    const error = await captureError(promise);
    expect(error.message).toBe("caller changed its mind");
  });
});
