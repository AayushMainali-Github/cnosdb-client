import type { Compression, TimePrecision } from "./common.js";

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

  /**
   * Extra headers for this request, merged over the client-level `headers`
   * and overriding them by name. The same restrictions apply: the client
   * controls `authorization`, `content-type`, and `accept`.
   */
  readonly headers?: Readonly<Record<string, string>>;
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

  /**
   * Overrides the client-level compression for this write only.
   */
  readonly compression?: Compression;
}
