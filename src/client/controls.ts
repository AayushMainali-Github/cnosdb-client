import { normalizeHeaders } from "../http/index.js";
import type { RequestOptions } from "../types/index.js";

/**
 * Forwards only the per-request controls the caller actually supplied.
 *
 * Omitting absent keys matters: spreading an explicit `undefined` would override
 * the transport's own defaults with nothing.
 */
export function requestControls(options: RequestOptions): {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
} {
  return {
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeoutMs === undefined
      ? {}
      : { timeoutMs: options.timeoutMs }),
    ...(options.headers === undefined
      ? {}
      : { headers: normalizeHeaders(options.headers, "options.headers") }),
  };
}
