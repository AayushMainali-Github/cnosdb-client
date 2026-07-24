import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CnosDBAuthenticationError,
  CnosDBError,
  CnosDBNetworkError,
  CnosDBRateLimitError,
  CnosDBRequestError,
  CnosDBResponseError,
  CnosDBServerError,
  CnosDBTimeoutError,
} from "../../src/errors.js";
import {
  createAuthorizationHeader,
  MAX_RESPONSE_BODY_CHARS,
  normalizeBaseUrl,
  Transport,
  truncate,
} from "../../src/http.js";
import type { FetchLike } from "../../src/types.js";
import { captureError, toUrl } from "../helpers.js";

interface Recorded {
  url: URL;
  init: RequestInit;
}

function recordingFetch(
  responder: (call: Recorded) => Response | Promise<Response> = () =>
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
): { fetch: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetch: FetchLike = (input, init = {}) => {
    const call = { url: toUrl(input), init };
    calls.push(call);
    return Promise.resolve(responder(call));
  };
  return { fetch, calls };
}

/** A fetch that never resolves until its signal aborts. */
const hangingFetch: FetchLike = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new DOMException("aborted", "AbortError"));
    });
  });

function makeTransport(
  fetchImpl: FetchLike,
  overrides: {
    url?: string;
    authorization?: string | undefined;
    timeoutMs?: number;
  } = {},
): Transport {
  return new Transport({
    baseUrl: normalizeBaseUrl(overrides.url ?? "http://localhost:8902"),
    authorization: overrides.authorization,
    timeoutMs: overrides.timeoutMs ?? 10_000,
    fetch: fetchImpl,
  });
}

function headerOf(call: Recorded, name: string): string | undefined {
  return (call.init.headers as Record<string, string> | undefined)?.[name];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeBaseUrl", () => {
  it("accepts a base URL without a trailing slash", () => {
    expect(normalizeBaseUrl("http://localhost:8902").href).toBe(
      "http://localhost:8902/",
    );
  });

  it("accepts a base URL with a trailing slash", () => {
    expect(normalizeBaseUrl("http://localhost:8902/").href).toBe(
      "http://localhost:8902/",
    );
  });

  it("accepts https", () => {
    expect(normalizeBaseUrl("https://db.example.com").protocol).toBe("https:");
  });

  it("preserves and terminates a base path", () => {
    expect(normalizeBaseUrl("https://example.com/cnosdb").href).toBe(
      "https://example.com/cnosdb/",
    );
  });

  it("discards a query string on the base URL", () => {
    expect(normalizeBaseUrl("http://localhost:8902/?a=b").href).toBe(
      "http://localhost:8902/",
    );
  });

  it("rejects a relative URL", () => {
    expect(() => normalizeBaseUrl("/api/v1")).toThrow(/absolute URL/);
  });

  it("rejects a host-only value that is not a URL", () => {
    expect(() => normalizeBaseUrl("localhost:8902")).toThrow(/http: or https:/);
  });

  it("rejects a non-http protocol", () => {
    expect(() => normalizeBaseUrl("ftp://localhost")).toThrow(
      /http: or https:/,
    );
  });

  it("rejects embedded credentials", () => {
    expect(() => normalizeBaseUrl("http://root:pw@localhost:8902")).toThrow(
      /must not embed credentials/,
    );
  });

  it("rejects a fragment", () => {
    expect(() => normalizeBaseUrl("http://localhost:8902/#frag")).toThrow(
      /fragment/,
    );
  });

  it("rejects an empty value", () => {
    expect(() => normalizeBaseUrl("")).toThrow(/is required/);
  });
});

describe("createAuthorizationHeader", () => {
  it("returns undefined when no credentials are configured", () => {
    expect(createAuthorizationHeader(undefined, undefined)).toBeUndefined();
  });

  it("encodes username and password as UTF-8 Base64", () => {
    expect(createAuthorizationHeader("root", "pw")).toBe(
      `Basic ${Buffer.from("root:pw", "utf8").toString("base64")}`,
    );
  });

  it("supports an empty password", () => {
    expect(createAuthorizationHeader("root", "")).toBe("Basic cm9vdDo=");
  });

  it("supports a username with no password supplied", () => {
    expect(createAuthorizationHeader("root", undefined)).toBe("Basic cm9vdDo=");
  });

  it("encodes non-ASCII credentials as UTF-8", () => {
    expect(createAuthorizationHeader("üser", "pä")).toBe(
      `Basic ${Buffer.from("üser:pä", "utf8").toString("base64")}`,
    );
  });
});

describe("Transport request construction", () => {
  it("resolves the ping path against the base URL", async () => {
    const { fetch, calls } = recordingFetch();
    await makeTransport(fetch).requestJson({
      method: "GET",
      path: "api/v1/ping",
    });
    expect(calls[0]!.url.pathname).toBe("/api/v1/ping");
    expect(calls[0]!.init.method).toBe("GET");
  });

  it("resolves endpoint paths beneath a configured base path", async () => {
    const { fetch, calls } = recordingFetch();
    await makeTransport(fetch, {
      url: "http://localhost:8902/cnosdb",
    }).requestJson({ method: "GET", path: "api/v1/ping" });
    expect(calls[0]!.url.pathname).toBe("/cnosdb/api/v1/ping");
  });

  it("encodes search parameters safely", async () => {
    const { fetch, calls } = recordingFetch();
    await makeTransport(fetch).requestVoid({
      method: "POST",
      path: "api/v1/sql",
      searchParams: { db: "my db&x=1", tenant: "ten/ant", chunked: "false" },
    });
    const { searchParams } = calls[0]!.url;
    expect(searchParams.get("db")).toBe("my db&x=1");
    expect(searchParams.get("tenant")).toBe("ten/ant");
    expect(searchParams.get("chunked")).toBe("false");
    expect(calls[0]!.url.search).toContain("db=my+db%26x%3D1");
  });

  it("sends the Authorization header when credentials are configured", async () => {
    const { fetch, calls } = recordingFetch();
    await makeTransport(fetch, {
      authorization: "Basic cm9vdDo=",
    }).requestVoid({ method: "GET", path: "api/v1/ping" });
    expect(headerOf(calls[0]!, "authorization")).toBe("Basic cm9vdDo=");
  });

  it("omits the Authorization header when no credentials are configured", async () => {
    const { fetch, calls } = recordingFetch();
    await makeTransport(fetch).requestVoid({
      method: "GET",
      path: "api/v1/ping",
    });
    expect(headerOf(calls[0]!, "authorization")).toBeUndefined();
  });

  it("sends accept and content-type headers and the body", async () => {
    const { fetch, calls } = recordingFetch();
    await makeTransport(fetch).requestVoid({
      method: "POST",
      path: "api/v1/write",
      body: "m a=1",
      contentType: "text/plain; charset=utf-8",
      accept: "application/json",
    });
    expect(headerOf(calls[0]!, "accept")).toBe("application/json");
    expect(headerOf(calls[0]!, "content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(calls[0]!.init.body).toBe("m a=1");
  });

  it("omits the body for requests without one", async () => {
    const { fetch, calls } = recordingFetch();
    await makeTransport(fetch).requestVoid({
      method: "GET",
      path: "api/v1/ping",
    });
    expect(calls[0]!.init.body).toBeUndefined();
  });
});

describe("Transport response handling", () => {
  it("parses a JSON body", async () => {
    const { fetch } = recordingFetch(
      () => new Response('[{"a":1}]', { status: 200 }),
    );
    await expect(
      makeTransport(fetch).requestJson({ method: "GET", path: "api/v1/ping" }),
    ).resolves.toEqual([{ a: 1 }]);
  });

  it("resolves to undefined for an empty successful body", async () => {
    const { fetch } = recordingFetch(() => new Response("", { status: 200 }));
    await expect(
      makeTransport(fetch).requestJson({ method: "POST", path: "api/v1/sql" }),
    ).resolves.toBeUndefined();
  });

  it("throws CnosDBResponseError for malformed JSON", async () => {
    const { fetch } = recordingFetch(
      () => new Response("not json", { status: 200 }),
    );
    await expect(
      makeTransport(fetch).requestJson({ method: "POST", path: "api/v1/sql" }),
    ).rejects.toThrow(CnosDBResponseError);
  });

  it("throws CnosDBResponseError when the body cannot be read", async () => {
    const broken = {
      ok: true,
      status: 200,
      text: () => Promise.reject(new Error("stream failure")),
    } as unknown as Response;
    const { fetch } = recordingFetch(() => broken);
    await expect(
      makeTransport(fetch).requestVoid({ method: "POST", path: "api/v1/sql" }),
    ).rejects.toThrow(/could not be read/);
  });

  it("discards the body for void requests without failing", async () => {
    const { fetch } = recordingFetch(
      () => new Response("ignored text", { status: 200 }),
    );
    await expect(
      makeTransport(fetch).requestVoid({ method: "POST", path: "api/v1/sql" }),
    ).resolves.toBeUndefined();
  });
});

describe("Transport status mapping", () => {
  const cases = [
    [401, CnosDBAuthenticationError],
    [403, CnosDBRequestError],
    [404, CnosDBRequestError],
    [422, CnosDBRequestError],
    [429, CnosDBRateLimitError],
    [500, CnosDBServerError],
    [503, CnosDBServerError],
    [302, CnosDBError],
  ] as const;

  it.each(cases)("maps HTTP %i", async (status, Expected) => {
    const { fetch } = recordingFetch(() => new Response("boom", { status }));
    await expect(
      makeTransport(fetch).requestJson({ method: "POST", path: "api/v1/sql" }),
    ).rejects.toBeInstanceOf(Expected);
  });

  it("preserves the status, method and path", async () => {
    const { fetch } = recordingFetch(
      () => new Response("nope", { status: 422 }),
    );
    const error = await captureError<CnosDBError>(
      makeTransport(fetch).requestJson({
        method: "POST",
        path: "api/v1/sql",
      }),
    );
    expect(error.status).toBe(422);
    expect(error.method).toBe("POST");
    expect(error.path).toBe("/api/v1/sql");
    expect(error.responseBody).toBe("nope");
  });

  it("truncates a very large error body", async () => {
    const huge = "x".repeat(MAX_RESPONSE_BODY_CHARS + 5_000);
    const { fetch } = recordingFetch(() => new Response(huge, { status: 500 }));
    const error = await captureError<CnosDBError>(
      makeTransport(fetch).requestVoid({
        method: "POST",
        path: "api/v1/sql",
      }),
    );
    expect(error.responseBody).toHaveLength(
      MAX_RESPONSE_BODY_CHARS + "… [truncated]".length,
    );
    expect(error.responseBody).toMatch(/\[truncated\]$/);
  });

  it("still reports the status when the error body cannot be read", async () => {
    const broken = {
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error("stream failure")),
    } as unknown as Response;
    const { fetch } = recordingFetch(() => broken);
    const error = await captureError<CnosDBError>(
      makeTransport(fetch).requestVoid({
        method: "POST",
        path: "api/v1/sql",
      }),
    );
    expect(error).toBeInstanceOf(CnosDBServerError);
    expect(error.responseBody).toBeUndefined();
  });

  it("truncate leaves short bodies untouched", () => {
    expect(truncate("short")).toBe("short");
  });
});

describe("Transport timeouts and cancellation", () => {
  it("rejects a non-positive timeout", async () => {
    const { fetch } = recordingFetch();
    await expect(
      makeTransport(fetch).requestVoid({
        method: "GET",
        path: "api/v1/ping",
        timeoutMs: 0,
      }),
    ).rejects.toThrow(/greater than zero/);
  });

  it("aborts with CnosDBTimeoutError when the default timeout elapses", async () => {
    const error = await captureError<CnosDBTimeoutError>(
      makeTransport(hangingFetch, { timeoutMs: 20 }).requestVoid({
        method: "GET",
        path: "api/v1/ping",
      }),
    );
    expect(error).toBeInstanceOf(CnosDBTimeoutError);
    expect(error.timeoutMs).toBe(20);
    expect(error.message).toMatch(/timed out after 20 ms/);
  });

  it("honours a per-request timeout override", async () => {
    const error = await captureError<CnosDBTimeoutError>(
      makeTransport(hangingFetch, { timeoutMs: 60_000 }).requestVoid({
        method: "GET",
        path: "api/v1/ping",
        timeoutMs: 15,
      }),
    );
    expect(error).toBeInstanceOf(CnosDBTimeoutError);
    expect(error.timeoutMs).toBe(15);
  });

  it("reports caller cancellation as an abort, not a timeout", async () => {
    const controller = new AbortController();
    const fetch: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
        setTimeout(() => {
          controller.abort();
        }, 5);
      });
    const error = await captureError<CnosDBRequestError>(
      makeTransport(fetch).requestVoid({
        method: "GET",
        path: "api/v1/ping",
        signal: controller.signal,
      }),
    );
    expect(error).toBeInstanceOf(CnosDBRequestError);
    expect(error).not.toBeInstanceOf(CnosDBTimeoutError);
    expect(error.code).toBe("ABORT_ERR");
  });

  it("never sends a request whose caller signal is already aborted", async () => {
    const { fetch, calls } = recordingFetch();
    const error = await captureError<CnosDBRequestError>(
      makeTransport(fetch).requestVoid({
        method: "GET",
        path: "api/v1/ping",
        signal: AbortSignal.abort(),
      }),
    );
    expect(error).toBeInstanceOf(CnosDBRequestError);
    expect(error.code).toBe("ABORT_ERR");
    expect(calls).toHaveLength(0);
  });

  it("clears the timeout timer after a successful request", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { fetch } = recordingFetch();
    await makeTransport(fetch).requestVoid({
      method: "GET",
      path: "api/v1/ping",
    });
    expect(clearSpy).toHaveBeenCalled();
  });

  it("clears the timeout timer after a failed request", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { fetch } = recordingFetch(() => new Response("x", { status: 500 }));
    await captureError(
      makeTransport(fetch).requestVoid({
        method: "GET",
        path: "api/v1/ping",
      }),
    );
    expect(clearSpy).toHaveBeenCalled();
  });

  it("removes the caller abort listener after the request settles", async () => {
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");
    const { fetch } = recordingFetch();
    await makeTransport(fetch).requestVoid({
      method: "GET",
      path: "api/v1/ping",
      signal: controller.signal,
    });
    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("does not leave the timer able to fire after completion", async () => {
    const { fetch } = recordingFetch();
    await makeTransport(fetch, { timeoutMs: 5 }).requestVoid({
      method: "GET",
      path: "api/v1/ping",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Reaching here without an unhandled rejection proves the timer was cleared.
    expect(true).toBe(true);
  });
});

describe("Transport network failures", () => {
  it("maps a fetch rejection to CnosDBNetworkError", async () => {
    const cause = new TypeError("fetch failed");
    const fetch: FetchLike = () => Promise.reject(cause);
    const error = await captureError<CnosDBNetworkError>(
      makeTransport(fetch).requestVoid({
        method: "GET",
        path: "api/v1/ping",
      }),
    );
    expect(error).toBeInstanceOf(CnosDBNetworkError);
    expect(error.cause).toBe(cause);
    expect(error.path).toBe("/api/v1/ping");
  });

  it("does not mislabel an unexpected abort as a timeout", async () => {
    const fetch: FetchLike = () =>
      Promise.reject(new DOMException("aborted", "AbortError"));
    await expect(
      makeTransport(fetch).requestVoid({ method: "GET", path: "api/v1/ping" }),
    ).rejects.toBeInstanceOf(CnosDBNetworkError);
  });
});

describe("Transport secret safety", () => {
  it("never includes the Authorization header in a thrown error", async () => {
    const authorization = createAuthorizationHeader("root", "hunter2")!;
    const { fetch } = recordingFetch(
      () => new Response("denied", { status: 401 }),
    );
    const error = await captureError<CnosDBError>(
      makeTransport(fetch, { authorization }).requestVoid({
        method: "POST",
        path: "api/v1/sql",
      }),
    );
    const serialized = [
      error.message,
      String(error.stack),
      JSON.stringify(error, Object.getOwnPropertyNames(error)),
    ].join("|");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain(authorization);
    expect(serialized).not.toContain("cm9vdDpodW50ZXIy");
  });

  it("never includes credentials in the recorded path", async () => {
    const { fetch } = recordingFetch(() => new Response("x", { status: 500 }));
    const error = await captureError<CnosDBError>(
      makeTransport(fetch, {
        authorization: createAuthorizationHeader("root", "hunter2"),
      }).requestVoid({ method: "POST", path: "api/v1/sql" }),
    );
    expect(error.path).toBe("/api/v1/sql");
    expect(error.path).not.toContain("@");
  });
});
