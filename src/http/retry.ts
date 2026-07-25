import {
  CnosDBNetworkError,
  CnosDBRateLimitError,
  CnosDBServerError,
  CnosDBTimeoutError,
} from "../errors/index.js";
import type { RetryOptions } from "../types/index.js";

/** A validated retry policy with every default resolved. @internal */
export interface ResolvedRetry {
  readonly attempts: number;
  readonly initialMs: number;
  readonly maxMs: number;
  readonly jitter: boolean;
  readonly retryWrites: boolean;
  readonly maxElapsedMs: number | undefined;
}

const DEFAULT_INITIAL_MS = 100;
const DEFAULT_MAX_MS = 2_000;

/**
 * Validates a caller-supplied policy and fills in defaults. Returns
 * `undefined` when retries are not configured, which is the default.
 *
 * @internal
 */
export function normalizeRetry(
  retry: RetryOptions | undefined,
): ResolvedRetry | undefined {
  if (retry === undefined) return undefined;
  if (typeof retry !== "object") {
    throw new TypeError(
      `CnosDB client option \`retry\` must be an object; received ${String(retry)}.`,
    );
  }

  const attempts = requirePositiveInteger("retry.attempts", retry.attempts);
  const backoff = retry.backoff ?? {};
  const initialMs = optionalPositiveInteger(
    "retry.backoff.initialMs",
    backoff.initialMs,
    DEFAULT_INITIAL_MS,
  );
  const maxMs = optionalPositiveInteger(
    "retry.backoff.maxMs",
    backoff.maxMs,
    DEFAULT_MAX_MS,
  );
  if (maxMs < initialMs) {
    throw new TypeError(
      `CnosDB client option \`retry.backoff.maxMs\` (${String(maxMs)}) must ` +
        `not be smaller than \`retry.backoff.initialMs\` (${String(initialMs)}).`,
    );
  }

  const maxElapsedMs =
    retry.maxElapsedMs === undefined
      ? undefined
      : requirePositiveInteger("retry.maxElapsedMs", retry.maxElapsedMs);

  return {
    attempts,
    initialMs,
    maxMs,
    jitter: retry.backoff?.jitter ?? true,
    retryWrites: retry.retryWrites ?? false,
    maxElapsedMs,
  };
}

/**
 * Whether a failure could plausibly succeed if tried again.
 *
 * The list is deliberately short. Anything the server has decided about the
 * request itself — bad credentials, a malformed statement, a payload that is
 * too large — will be decided the same way next time, and a caller abort is
 * an instruction, not a failure.
 *
 * @internal
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof CnosDBTimeoutError) return true;
  if (error instanceof CnosDBNetworkError) return true;
  if (error instanceof CnosDBRateLimitError) return true;
  if (error instanceof CnosDBServerError) {
    // 501 means the server will never implement it, so waiting cannot help.
    return error.status !== 501;
  }
  return false;
}

/**
 * Delay before attempt number `attempt`, where the first retry is attempt 2.
 *
 * A `Retry-After` from the server wins over the computed backoff, because the
 * server knows when it will be ready and we do not. It is still capped by
 * `maxMs` so a hostile or mistaken header cannot park the caller for an hour.
 *
 * @internal
 */
export function delayFor(
  policy: ResolvedRetry,
  attempt: number,
  retryAfterMs: number | undefined,
): number {
  const exponential = Math.min(
    policy.maxMs,
    policy.initialMs * 2 ** Math.max(0, attempt - 2),
  );
  if (retryAfterMs !== undefined) {
    return Math.min(policy.maxMs, retryAfterMs);
  }
  return policy.jitter ? Math.random() * exponential : exponential;
}

/**
 * Parses a `Retry-After` header, which is either a delay in seconds or an
 * HTTP date. Returns `undefined` for anything else, including a date in the
 * past, so that a nonsense value falls back to normal backoff.
 *
 * @internal
 */
export function parseRetryAfter(
  header: string | null,
  now: number = Date.now(),
): number | undefined {
  if (header === null) return undefined;
  const value = header.trim();
  if (value.length === 0) return undefined;

  if (/^\d+$/.test(value)) {
    return Number(value) * 1_000;
  }

  // An HTTP date always begins with an abbreviated weekday. Requiring that
  // keeps `Date.parse`'s generosity from reading "-5" as a year.
  if (!/^[A-Za-z]{3},/.test(value)) return undefined;

  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

/**
 * Retry-After values are carried out of band rather than on the error, so the
 * error classes stay a description of what went wrong rather than a channel
 * for transport bookkeeping.
 */
const retryAfterByError = new WeakMap<object, number>();

/** @internal */
export function rememberRetryAfter(error: unknown, delayMs: number): void {
  if (typeof error === "object" && error !== null) {
    retryAfterByError.set(error, delayMs);
  }
}

/** @internal */
export function retryAfterFor(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null) {
    return retryAfterByError.get(error);
  }
  return undefined;
}

/**
 * Waits, unless the caller aborts first — in which case the abort reason is
 * thrown so the caller's cancellation is not swallowed by a sleeping client.
 *
 * @internal
 */
export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) {
    throw signal.reason ?? new Error("The caller aborted the request.");
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    // A pending backoff must never be the reason a process stays alive.
    timer.unref();

    function onAbort(): void {
      clearTimeout(timer);
      reject(
        (signal?.reason as Error | undefined) ??
          new Error("The caller aborted the request."),
      );
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function requirePositiveInteger(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new TypeError(
      `CnosDB client option \`${name}\` must be an integer of at least 1; ` +
        `received ${String(value)}.`,
    );
  }
  return value;
}

function optionalPositiveInteger(
  name: string,
  value: unknown,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  return requirePositiveInteger(name, value);
}
