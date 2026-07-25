import type { Point, TimePrecision } from "../types/index.js";
import { serializePoint } from "./serialize.js";

/** Options for {@link splitPoints}. */
export interface SplitOptions {
  /**
   * Maximum encoded size of each payload, in UTF-8 bytes.
   *
   * There is no default. A caller who does not ask for splitting keeps the
   * single-request behaviour, and a default here would be this library
   * guessing at a server limit it cannot see.
   */
  readonly maxBytes: number;

  /** Timestamp precision, matching the write it will be sent with. */
  readonly precision?: TimePrecision;
}

/**
 * Splits points into Line Protocol payloads, none larger than `maxBytes`.
 *
 * Sizing is by encoded UTF-8 bytes rather than point count, because points vary
 * enormously in encoded length and a server limit is measured in bytes. The
 * separating newlines are counted too, so a payload that fits here fits on the
 * wire.
 *
 * This is a generator, so points are serialized as they are consumed rather
 * than all at once, and a caller writing chunk by chunk never holds the whole
 * batch in memory as one string.
 *
 * Sending the chunks is left to the caller:
 *
 * ```ts
 * let written = 0;
 * for (const chunk of splitPoints(points, { maxBytes: 1_000_000 })) {
 *   await client.writeLineProtocol(chunk);
 *   written += 1;
 * }
 * ```
 *
 * Keeping the loop in the caller is deliberate. A failure on the seventh chunk
 * leaves the first six written, and only the caller can decide what that means
 * for their data. Hiding the loop inside a write would turn one call into many
 * requests and make partial success invisible.
 *
 * @throws TypeError if `maxBytes` is not a positive integer.
 * @throws RangeError if a single point exceeds `maxBytes`, since no split can
 * satisfy the request and emitting an oversized payload anyway would break the
 * guarantee the caller asked for.
 */
export function* splitPoints(
  points: readonly Point[],
  options: SplitOptions,
): Generator<string, void, undefined> {
  const { maxBytes, precision = "ms" } = options;

  if (
    typeof maxBytes !== "number" ||
    !Number.isInteger(maxBytes) ||
    maxBytes <= 0
  ) {
    throw new TypeError(
      `\`maxBytes\` must be a positive integer; received ${String(maxBytes)}.`,
    );
  }

  let batch: string[] = [];
  let size = 0;

  for (const [index, point] of points.entries()) {
    let line: string;
    try {
      line = serializePoint(point, precision);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new TypeError(
        `Point at index ${index} could not be serialized: ${reason}`,
        { cause: error },
      );
    }

    const lineBytes = utf8Length(line);
    if (lineBytes > maxBytes) {
      throw new RangeError(
        `Point at index ${index} encodes to ${lineBytes} bytes, which exceeds ` +
          `\`maxBytes\` of ${maxBytes}. No split can satisfy this; raise the ` +
          `limit or shorten the point.`,
      );
    }

    // Every line after the first costs one more byte for its newline.
    const projected = batch.length === 0 ? lineBytes : size + 1 + lineBytes;
    if (projected > maxBytes) {
      yield batch.join("\n");
      batch = [];
      size = 0;
    }

    size = batch.length === 0 ? lineBytes : size + 1 + lineBytes;
    batch.push(line);
  }

  if (batch.length > 0) {
    yield batch.join("\n");
  }
}

/**
 * Encoded length in UTF-8 bytes, which is what a size limit measures.
 * `String.length` counts UTF-16 code units and undercounts anything outside
 * the Basic Multilingual Plane.
 */
function utf8Length(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
