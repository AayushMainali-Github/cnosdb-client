/**
 * Maximum number of characters retained from an error response body. Bounding
 * this prevents a hostile or misbehaving server from forcing the client to
 * hold an unbounded string in memory.
 */
export const MAX_RESPONSE_BODY_CHARS = 64 * 1024;

/** Truncates a body to the documented safe maximum. @internal */
export function truncate(body: string): string {
  return body.length > MAX_RESPONSE_BODY_CHARS
    ? `${body.slice(0, MAX_RESPONSE_BODY_CHARS)}… [truncated]`
    : body;
}

/**
 * Reads an error response body without ever throwing. A body that cannot be
 * read is not worth reporting, because the status error it would replace is far
 * more informative.
 *
 * @internal
 */
export async function readBodySafely(
  response: Response,
): Promise<string | undefined> {
  try {
    const text = await response.text();
    return text.length === 0 ? undefined : truncate(text);
  } catch {
    // A failure to read the error body must never mask the status error.
    return undefined;
  }
}
