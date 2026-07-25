/**
 * Backoff schedule between retry attempts.
 *
 * The delay doubles from `initialMs` and is capped at `maxMs`. With `jitter`
 * on, the actual wait is a random point between zero and that delay, so a
 * fleet of clients that all failed at the same moment does not come back in
 * lockstep and knock the server over again.
 */
export interface BackoffOptions {
  /** First delay, in milliseconds. Defaults to `100`. */
  readonly initialMs?: number;

  /** Upper bound on any single delay, in milliseconds. Defaults to `2_000`. */
  readonly maxMs?: number;

  /**
   * Spread the delay randomly across the interval. Defaults to `true`.
   *
   * Turn it off only when you need a deterministic schedule, such as in a
   * test; synchronized retries are a real failure mode in production.
   */
  readonly jitter?: boolean;
}

/**
 * Retry policy. Retries are off unless this is supplied, and nothing about
 * the policy is inferred from the environment.
 *
 * Only failures that could plausibly succeed on a second attempt are retried:
 * a connection that never completed, a timeout, HTTP 429, and 5xx other than
 * 501. A rejected password, a malformed statement, or a caller abort are
 * final, and retrying them would only waste the caller's time.
 *
 * `timeoutMs` remains the budget for a single attempt, not for the whole
 * sequence. Use `maxElapsedMs` when you need a bound on the total.
 */
export interface RetryOptions {
  /**
   * Total attempts including the first, so `1` disables retrying. Must be an
   * integer of at least 1.
   */
  readonly attempts: number;

  /** Delay schedule between attempts. */
  readonly backoff?: BackoffOptions;

  /**
   * Retry writes as well. Defaults to `false`.
   *
   * A write is not idempotent and CnosDB does not deduplicate, so a retried
   * write whose first attempt actually landed will duplicate points. Only
   * enable this when your points carry timestamps and tags that make a repeat
   * write harmless, which for Line Protocol usually means an overwrite of the
   * same series and time rather than a new row.
   */
  readonly retryWrites?: boolean;

  /**
   * Wall-clock ceiling for the whole sequence, in milliseconds. When set, a
   * further attempt is not started once this much time has passed since the
   * first one began. Unset by default, so `attempts` alone bounds the work.
   */
  readonly maxElapsedMs?: number;
}
