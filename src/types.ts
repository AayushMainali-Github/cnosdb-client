/**
 * Timestamp precision understood by the CnosDB write endpoint.
 */
export type TimePrecision = "ms" | "us" | "ns";

/**
 * Minimal structural type of the global `fetch` function. Supplying a custom
 * implementation makes the client testable without a network.
 */
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

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
   */
  readonly timeoutMs?: number;

  /**
   * Default write precision. Defaults to `"ms"`, which matches JavaScript
   * `Date` resolution.
   */
  readonly precision?: TimePrecision;

  /**
   * Injectable fetch implementation for tests or controlled environments.
   * Captured once at construction time.
   */
  readonly fetch?: FetchLike;
}

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

/**
 * Result of {@link CnosDBClient.ping}.
 */
export interface PingResult {
  /** Server-reported version string. */
  readonly version: string;
  /** Server-reported status string, for example `"healthy"`. */
  readonly status: string;
}

/**
 * Field value types that can be serialized into Line Protocol.
 *
 * `bigint` values are written as Line Protocol signed integers (`123i`);
 * `number` values are written as floats.
 */
export type PointFieldValue = string | number | bigint | boolean;

/**
 * A single measurement sample.
 */
export interface Point {
  /** Measurement (table) name. Required and non-empty. */
  readonly measurement: string;
  /** Optional tag set. Tag keys and values are strings. */
  readonly tags?: Readonly<Record<string, string>>;
  /** Field set. At least one field is required. */
  readonly fields: Readonly<Record<string, PointFieldValue>>;
  /**
   * Optional timestamp. Omit it to let the server assign the write time.
   * `Date` values are converted using the effective write precision;
   * `number` must be a safe integer already expressed in that precision;
   * `bigint` is emitted verbatim.
   */
  readonly timestamp?: Date | number | bigint;
}
