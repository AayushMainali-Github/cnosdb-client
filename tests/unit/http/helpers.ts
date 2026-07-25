import { normalizeBaseUrl } from "../../../src/http/url.js";
import type { ResolvedRetry } from "../../../src/http/retry.js";
import { Transport } from "../../../src/http/transport.js";
import type { FetchLike } from "../../../src/types/index.js";
import { toUrl } from "../../helpers.js";

export interface Recorded {
  url: URL;
  init: RequestInit;
}

export function recordingFetch(
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
export const hangingFetch: FetchLike = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new DOMException("aborted", "AbortError"));
    });
  });

export function makeTransport(
  fetchImpl: FetchLike,
  overrides: {
    url?: string;
    authorization?: string | undefined;
    timeoutMs?: number;
    headers?: Record<string, string>;
    retry?: ResolvedRetry;
  } = {},
): Transport {
  return new Transport({
    baseUrl: normalizeBaseUrl(overrides.url ?? "http://localhost:8902"),
    authorization: overrides.authorization,
    timeoutMs: overrides.timeoutMs ?? 10_000,
    fetch: fetchImpl,
    ...(overrides.headers === undefined ? {} : { headers: overrides.headers }),
    ...(overrides.retry === undefined ? {} : { retry: overrides.retry }),
  });
}

export function headerOf(call: Recorded, name: string): string | undefined {
  return (call.init.headers as Record<string, string> | undefined)?.[name];
}
