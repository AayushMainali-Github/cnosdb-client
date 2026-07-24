import type { Point, PointFieldValue, TimePrecision } from "../types/index.js";
import {
  escapeFieldKey,
  escapeMeasurement,
  escapeTagComponent,
  rejectLineBreaks,
} from "./escape.js";
import { describe, serializeFieldValue } from "./field.js";
import { serializeTimestamp } from "./timestamp.js";

/**
 * Serializes a single {@link Point} into one Line Protocol line.
 *
 * The output is deterministic: tag keys and field keys are sorted
 * lexicographically, so equal points always produce byte-identical lines.
 * No trailing newline is appended.
 *
 * @param point - The point to serialize.
 * @param precision - Precision used to convert `Date` timestamps. Defaults to
 * `"ms"`, matching the client's default write precision.
 * @throws TypeError when the point cannot be represented in Line Protocol.
 */
export function serializePoint(
  point: Point,
  precision: TimePrecision = "ms",
): string {
  // Validate at runtime as well as in the type system: JavaScript callers and
  // data decoded from JSON can violate the `Point` contract.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof point !== "object" || point === null) {
    throw new TypeError(
      `Point must be an object; received ${describe(point)}.`,
    );
  }

  const { measurement, tags, fields, timestamp } = point;

  if (typeof measurement !== "string" || measurement.trim().length === 0) {
    throw new TypeError("Point measurement must be a non-empty string.");
  }
  rejectLineBreaks("measurement", measurement);

  let line = escapeMeasurement(measurement);

  if (tags) {
    for (const key of Object.keys(tags).sort()) {
      const value = tags[key];
      if (typeof value !== "string") {
        throw new TypeError(
          `Tag "${key}" must be a string; received ${describe(value)}.`,
        );
      }
      if (key.length === 0) {
        throw new TypeError("Tag keys must be non-empty.");
      }
      // CnosDB drops empty tag values, so reject them rather than write a
      // line that silently loses a dimension.
      if (value.length === 0) {
        throw new TypeError(`Tag "${key}" must have a non-empty value.`);
      }
      rejectLineBreaks(`tag key "${key}"`, key);
      rejectLineBreaks(`tag value for "${key}"`, value);
      line += `,${escapeTagComponent(key)}=${escapeTagComponent(value)}`;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof fields !== "object" || fields === null) {
    throw new TypeError(
      "Point fields must be an object with at least one field.",
    );
  }

  const fieldKeys = Object.keys(fields).sort();
  if (fieldKeys.length === 0) {
    throw new TypeError(`Point "${measurement}" must have at least one field.`);
  }

  const serializedFields: string[] = [];
  for (const key of fieldKeys) {
    if (key.length === 0) {
      throw new TypeError("Field keys must be non-empty.");
    }
    rejectLineBreaks(`field key "${key}"`, key);
    const value = fields[key] as PointFieldValue;
    serializedFields.push(
      `${escapeFieldKey(key)}=${serializeFieldValue(key, value)}`,
    );
  }

  line += ` ${serializedFields.join(",")}`;

  if (timestamp !== undefined) {
    line += ` ${serializeTimestamp(timestamp, precision)}`;
  }

  return line;
}

/**
 * Serializes an ordered batch of points into a newline-joined Line Protocol
 * payload. Order is preserved and no trailing newline is appended.
 *
 * @internal
 */
export function serializePoints(
  points: readonly Point[],
  precision: TimePrecision,
): string {
  return points
    .map((point, index) => {
      try {
        return serializePoint(point, precision);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new TypeError(
          `Point at index ${index} could not be serialized: ${reason}`,
          { cause: error },
        );
      }
    })
    .join("\n");
}
