import type { Compression, FetchLike, TimePrecision } from "./common.js";
import type { RetryOptions } from "./retry.js";

/**
 * Construction options for {@link CnosDBClient}.
 */
export interface CnosDBClientOptions {
  /**
   * Base CnosDB URL, for example `http://localhost:8902`. Must be an absolute
   * `http:` or `https:` URL without credentials or a fragment. A base path is
   * preserved and every endpoint is resolved relative to it.
   */
  readonly url: string;

  /**
   * Basic-auth username. Authentication is omitted only when both `username`
   * and `password` are absent.
   */
  readonly username?: string;

  /**
   * Basic-auth password. May be an empty string, which CnosDB commonly uses
   * for the default `root` user.
   */
  readonly password?: string;

  /**
   * Default database. Defaults to `"public"`.
   */
  readonly database?: string;

  /**
   * Default tenant. Defaults to `"cnosdb"`.
   */
  readonly tenant?: string;

  /**
   * Default request timeout in milliseconds. Defaults to `10_000`.
   *
   * This is the budget for a single attempt. When `retry` is configured, each
   * attempt gets the full budget; bound the total with `retry.maxElapsedMs`.
   */
  readonly timeoutMs?: number;

  /**
   * Retry policy. Unset by default, so a failed request fails once and the
   * caller decides what to do.
   *
   * When set, `ping`, `query`, and `queryTable` are retried on failures that
   * could plausibly succeed later. Writes are retried only with
   * `retry.retryWrites`, and `execute` is never retried because it exists for
   * statements that change something.
   */
  readonly retry?: RetryOptions;

  /**
   * Default write precision. Defaults to `"ms"`, which matches JavaScript
   * `Date` resolution.
   */
  readonly precision?: TimePrecision;

  /**
   * Default compression for write payloads. Defaults to `"none"`.
   *
   * `"gzip"` typically shrinks Line Protocol by an order of magnitude, which
   * is worthwhile for sizeable batches. It is opt-in because it changes the
   * request shape and depends on server support.
   */
  readonly compression?: Compression;

  /**
   * Extra headers sent with every request, for gateways or proxies that
   * require them. Header names are case-insensitive.
   *
   * `authorization`, `content-type`, and `accept` are controlled by the client
   * and are rejected here, as is any value containing a line break.
   */
  readonly headers?: Readonly<Record<string, string>>;

  /**
   * Injectable fetch implementation for tests or controlled environments.
   * Captured once at construction time.
   */
  readonly fetch?: FetchLike;
}
