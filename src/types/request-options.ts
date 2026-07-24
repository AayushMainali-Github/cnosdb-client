import type { TimePrecision } from "./common.js";

/**
 * Cancellation and timeout controls accepted by every request method.
 */
export interface RequestOptions {
  /**
   * Caller-controlled cancellation signal. Aborting it rejects the request
   * with a {@link CnosDBRequestError} whose `code` is `"ABORT_ERR"`.
   */
  readonly signal?: AbortSignal;

  /**
   * Overrides the client-level timeout for this request only.
   */
  readonly timeoutMs?: number;
}

/**
 * Per-request routing overrides for SQL requests.
 */
export interface QueryOptions extends RequestOptions {
  readonly database?: string;
  readonly tenant?: string;
}

/**
 * Per-request routing and precision overrides for write requests.
 */
export interface WriteOptions extends QueryOptions {
  readonly precision?: TimePrecision;
}
