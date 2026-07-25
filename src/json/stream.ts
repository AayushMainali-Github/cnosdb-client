import { CnosDBResponseError } from "../errors/index.js";

/**
 * Yields the objects from a stream of concatenated JSON arrays.
 *
 * CnosDB's `chunked=true` response is not one JSON value and not NDJSON. It is
 * successive arrays written back to back with no separator:
 *
 * ```text
 * [{"a":1},{"a":2}][{"a":3}]
 * ```
 *
 * Each array is one server-side batch (about 500 rows on current builds). This
 * decoder finds the next complete top-level array, parses it, and yields its
 * elements, so memory stays proportional to one batch rather than the whole
 * result.
 *
 * @internal
 */
export async function* iterateJsonArrayStream(
  stream: ReadableStream<Uint8Array>,
  context: { method: string; path: string },
  signal?: AbortSignal,
): AsyncGenerator<unknown, void, undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";

  const onAbort = (): void => {
    void reader.cancel(signal?.reason);
  };
  if (signal !== undefined) {
    if (signal.aborted) {
      await reader.cancel(signal.reason);
      throw abortError(signal);
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      try {
        buffer += decoder.decode(value, { stream: true });
      } catch (error) {
        throw new CnosDBResponseError(
          `CnosDB returned a body that is not valid UTF-8 for ` +
            `${context.method} ${context.path}.`,
          { ...context, cause: error },
        );
      }

      const extracted = extractCompleteArrays(buffer, context);
      buffer = extracted.rest;
      for (const row of extracted.rows) {
        yield row;
      }
    }

    try {
      buffer += decoder.decode();
    } catch (error) {
      throw new CnosDBResponseError(
        `CnosDB returned a body that is not valid UTF-8 for ` +
          `${context.method} ${context.path}.`,
        { ...context, cause: error },
      );
    }

    const extracted = extractCompleteArrays(buffer, context);
    buffer = extracted.rest.trim();
    for (const row of extracted.rows) {
      yield row;
    }

    if (buffer.length > 0) {
      throw new CnosDBResponseError(
        `CnosDB returned a truncated or malformed JSON stream for ` +
          `${context.method} ${context.path}.`,
        { ...context, responseBody: buffer.slice(0, 300) },
      );
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    // Abandoning the iterator must release the connection rather than leak it.
    try {
      await reader.cancel();
    } catch {
      // Already closed or cancelled; nothing left to do.
    }
  }
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("The caller aborted the request.");
}

/**
 * Pulls every complete top-level JSON array off the front of `buffer` and
 * flattens their elements into `rows`. Incomplete trailing input stays in
 * `rest` until more bytes arrive.
 */
function extractCompleteArrays(
  buffer: string,
  context: { method: string; path: string },
): { rows: unknown[]; rest: string } {
  const rows: unknown[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    while (offset < buffer.length && isWhitespace(charAt(buffer, offset))) {
      offset += 1;
    }
    if (offset >= buffer.length) break;

    const end = endOfJsonValue(buffer, offset);
    if (end === undefined) {
      // Need more bytes before this value is complete.
      break;
    }

    const slice = buffer.slice(offset, end);
    let parsed: unknown;
    try {
      parsed = JSON.parse(slice) as unknown;
    } catch (error) {
      throw new CnosDBResponseError(
        `CnosDB returned a body that is not valid JSON for ` +
          `${context.method} ${context.path}.`,
        { ...context, responseBody: slice.slice(0, 300), cause: error },
      );
    }

    if (!Array.isArray(parsed)) {
      throw new CnosDBResponseError(
        `CnosDB chunked response expected a JSON array for ` +
          `${context.method} ${context.path}, but received ` +
          `${describeType(parsed)}.`,
        { ...context, responseBody: slice.slice(0, 300) },
      );
    }

    for (const row of parsed) {
      rows.push(row);
    }
    offset = end;
  }

  return { rows, rest: buffer.slice(offset) };
}

/**
 * Returns the index just past a complete JSON value starting at `start`, or
 * `undefined` if the value is incomplete. Tracks strings so brackets and
 * braces inside them do not confuse the depth count.
 */
function endOfJsonValue(input: string, start: number): number | undefined {
  const first = charAt(input, start);
  if (first !== "[" && first !== "{") {
    // CnosDB's chunked stream is arrays of objects. Anything else at the top
    // level is unexpected; let JSON.parse surface the failure once we have
    // enough of a token, or wait for more bytes if this looks truncated.
    return endOfPrimitive(input, start);
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let index = start; index < input.length; index += 1) {
    const char = charAt(input, index);

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      depth += 1;
      continue;
    }
    if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }

  return undefined;
}

/**
 * Locates the end of a JSON primitive (number, string, true/false/null). Used
 * only so a malformed stream that starts with one fails with a clear parse
 * error rather than hanging forever waiting for a bracket that never comes.
 */
function endOfPrimitive(input: string, start: number): number | undefined {
  if (charAt(input, start) === '"') {
    let escape = false;
    for (let index = start + 1; index < input.length; index += 1) {
      const char = charAt(input, index);
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') return index + 1;
    }
    return undefined;
  }

  let index = start;
  while (
    index < input.length &&
    !isWhitespace(charAt(input, index)) &&
    !isDelim(charAt(input, index))
  ) {
    index += 1;
  }
  // A primitive that runs to the end of the buffer might still be growing
  // (e.g. `tru` of `true`), so only commit when a delimiter follows or we
  // already have a complete token that JSON.parse accepts.
  if (index === start) return undefined;
  if (index < input.length || isCompletePrimitive(input.slice(start, index))) {
    return index;
  }
  return undefined;
}

/** Indexed access that is defined for `index < input.length`. */
function charAt(input: string, index: number): string {
  return input.charAt(index);
}

function isCompletePrimitive(token: string): boolean {
  return (
    token === "null" ||
    token === "true" ||
    token === "false" ||
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token)
  );
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t";
}

function isDelim(char: string): boolean {
  return (
    char === "," || char === "]" || char === "}" || char === "[" || char === "{"
  );
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
