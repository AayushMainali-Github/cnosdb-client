import type { FetchLike, TimePrecision } from "./common.js";

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
