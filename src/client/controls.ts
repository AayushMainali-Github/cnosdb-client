import type { RequestOptions } from "../types/index.js";

/**
 * Forwards only the cancellation controls the caller actually supplied.
 *
 * Omitting absent keys matters: spreading an explicit `undefined` would override
 * the transport's own defaults with nothing.
 */
export function requestControls(
  options: RequestOptions,
): Pick<{ signal?: AbortSignal; timeoutMs?: number }, "signal" | "timeoutMs"> {
  return {
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeoutMs === undefined
      ? {}
      : { timeoutMs: options.timeoutMs }),
  };
}
