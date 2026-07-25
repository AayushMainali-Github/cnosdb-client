import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CnosDBNetworkError,
  CnosDBRequestError,
  CnosDBServerError,
} from "../../../src/errors/index.js";
import type { ResolvedRetry } from "../../../src/http/retry.js";
import type { FetchLike } from "../../../src/types/index.js";
import { captureError } from "../../helpers.js";
import { makeTransport } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const FAST: ResolvedRetry = {
  attempts: 3,
  initialMs: 1,
  maxMs: 2,
  jitter: false,
  retryWrites: false,
  maxElapsedMs: undefined,
};

/** A fetch that replays the given responses or errors, one per call. */
function scriptedFetch(steps: (Response | Error)[]): {
  fetch: FetchLike;
  count: () => number;
} {
  let index = 0;
  const fetch: FetchLike = () => {
    const step = steps[Math.min(index, steps.length - 1)]!;
    index += 1;
    return step instanceof Error
      ? Promise.reject(step)
      : Promise.resolve(step.clone());
  };
  return { fetch, count: () => index };
}

function ok(): Response {
  return new Response("{}", {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function failure(
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response("{}", { status, headers });
}

describe("Transport retries", () => {
  it("sends once when no policy is configured", async () => {
    const { fetch, count } = scriptedFetch([failure(503), ok()]);
    const error = await captureError(
      makeTransport(fetch).requestJson({
        method: "GET",
        path: "api/v1/ping",
        retryable: true,
      }),
    );
    expect(error).toBeInstanceOf(CnosDBServerError);
    expect(count()).toBe(1);
  });

  it("sends once when the request is not marked retryable", async () => {
    const { fetch, count } = scriptedFetch([failure(503), ok()]);
    await captureError(
      makeTransport(fetch, { retry: FAST }).requestJson({
        method: "POST",
        path: "api/v1/sql",
      }),
    );
    expect(count()).toBe(1);
  });

  it("retries a server error and returns the eventual success", async () => {
    const { fetch, count } = scriptedFetch([failure(503), failure(500), ok()]);
    const result = await makeTransport(fetch, { retry: FAST }).requestJson({
      method: "GET",
      path: "api/v1/ping",
      retryable: true,
    });
    expect(result).toStrictEqual({});
    expect(count()).toBe(3);
  });

  it("retries a network failure", async () => {
    const { fetch, count } = scriptedFetch([
      new TypeError("fetch failed"),
      ok(),
    ]);
    await makeTransport(fetch, { retry: FAST }).requestJson({
      method: "GET",
      path: "api/v1/ping",
      retryable: true,
    });
    expect(count()).toBe(2);
  });

  it("gives up after the configured number of attempts", async () => {
    const { fetch, count } = scriptedFetch([failure(503)]);
    const error = await captureError(
      makeTransport(fetch, { retry: FAST }).requestJson({
        method: "GET",
        path: "api/v1/ping",
        retryable: true,
      }),
    );
    expect(error).toBeInstanceOf(CnosDBServerError);
    expect(count()).toBe(3);
  });

  it("does not retry a failure the server will repeat", async () => {
    const { fetch, count } = scriptedFetch([failure(400)]);
    const error = await captureError(
      makeTransport(fetch, { retry: FAST }).requestJson({
        method: "GET",
        path: "api/v1/ping",
        retryable: true,
      }),
    );
    expect(error).toBeInstanceOf(CnosDBRequestError);
    expect(count()).toBe(1);
  });

  it("waits as long as Retry-After asks", async () => {
    const { fetch } = scriptedFetch([
      failure(429, { "retry-after": "1" }),
      ok(),
    ]);
    const transport = makeTransport(fetch, {
      retry: { ...FAST, maxMs: 60 },
    });
    const started = Date.now();
    await transport.requestJson({
      method: "GET",
      path: "api/v1/ping",
      retryable: true,
    });
    // Capped at maxMs, but longer than the 1 ms backoff it would have used.
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });

  it("stops retrying once the elapsed ceiling is in reach", async () => {
    const { fetch, count } = scriptedFetch([failure(503)]);
    const error = await captureError(
      makeTransport(fetch, {
        retry: {
          ...FAST,
          attempts: 10,
          initialMs: 50,
          maxMs: 50,
          maxElapsedMs: 60,
        },
      }).requestJson({ method: "GET", path: "api/v1/ping", retryable: true }),
    );
    expect(error).toBeInstanceOf(CnosDBServerError);
    expect(count()).toBeLessThanOrEqual(2);
  });

  it("abandons the sequence when the caller aborts during a backoff", async () => {
    const { fetch, count } = scriptedFetch([failure(503)]);
    const controller = new AbortController();
    const promise = makeTransport(fetch, {
      retry: { ...FAST, initialMs: 5_000, maxMs: 5_000 },
    }).requestJson({
      method: "GET",
      path: "api/v1/ping",
      retryable: true,
      signal: controller.signal,
    });
    setTimeout(() => {
      controller.abort(new Error("caller gave up"));
    }, 10);
    const error = await captureError(promise);
    expect(error.message).toBe("caller gave up");
    expect(count()).toBe(1);
  });

  it("propagates the final failure, not the first", async () => {
    const { fetch } = scriptedFetch([
      failure(503),
      new TypeError("fetch failed"),
    ]);
    const error = await captureError(
      makeTransport(fetch, { retry: { ...FAST, attempts: 2 } }).requestJson({
        method: "GET",
        path: "api/v1/ping",
        retryable: true,
      }),
    );
    expect(error).toBeInstanceOf(CnosDBNetworkError);
  });
});
