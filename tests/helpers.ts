/**
 * Awaits a promise that is expected to reject and returns the thrown error,
 * typed for assertions. Failing to reject is itself a test failure, which a
 * bare `.catch()` would silently allow.
 */
export async function captureError<T = Error>(
  promise: Promise<unknown>,
): Promise<T> {
  try {
    await promise;
  } catch (error) {
    return error as T;
  }
  throw new Error("Expected the promise to reject, but it resolved.");
}

/**
 * Normalizes the first argument of a `fetch` call into a `URL`, so tests can
 * assert on it without relying on default stringification.
 */
export function toUrl(input: string | URL | Request): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}
