import type { Point, PointFieldValue, TimePrecision } from "./types/index.js";

/**
 * Multipliers converting milliseconds into the requested precision.
 * `bigint` keeps nanosecond conversions exact.
 */
const MS_MULTIPLIER: Record<TimePrecision, bigint> = {
  ms: 1n,
  us: 1_000n,
  ns: 1_000_000n,
};

/**
 * Escapes a measurement name: commas and spaces are structural in Line
 * Protocol and must be backslash-escaped.
 */
function escapeMeasurement(value: string): string {
  return value.replace(/([,\s])/g, "\\$1");
}

/**
 * Escapes a tag key, tag value, or field key. Commas, equals signs, and
 * spaces separate elements and must be escaped.
 */
function escapeTagComponent(value: string): string {
  return value.replace(/([,=\s])/g, "\\$1");
}

const escapeFieldKey = escapeTagComponent;

/**
 * Escapes a string field value, which is transmitted inside double quotes.
 */
function escapeStringFieldValue(value: string): string {
  return value.replace(/([\\"])/g, "\\$1");
}

function rejectLineBreaks(kind: string, value: string): void {
  if (/[\n\r]/.test(value)) {
    throw new TypeError(
      `Line Protocol ${kind} must not contain a newline or carriage return.`,
    );
  }
}

function serializeFieldValue(key: string, value: PointFieldValue): string {
  switch (typeof value) {
    case "string":
      rejectLineBreaks(`field value for "${key}"`, value);
      return `"${escapeStringFieldValue(value)}"`;
    case "boolean":
      return value ? "true" : "false";
    case "bigint":
      return `${value.toString()}i`;
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(
          `Field "${key}" must be a finite number; received ${String(value)}.`,
        );
      }
      // Line Protocol accepts exponent notation, so the default JavaScript
      // representation is always valid.
      return String(value);
    default:
      throw new TypeError(
        `Field "${key}" has unsupported type ${describe(value)}. ` +
          `Use string, number, bigint, or boolean.`,
      );
  }
}

function describe(value: unknown): string {
  if (value === null) return "null";
  return typeof value;
}

function serializeTimestamp(
  timestamp: Date | number | bigint,
  precision: TimePrecision,
): string {
  if (timestamp instanceof Date) {
    const milliseconds = timestamp.getTime();
    if (Number.isNaN(milliseconds)) {
      throw new TypeError("Point timestamp is an invalid Date.");
    }
    return (BigInt(milliseconds) * MS_MULTIPLIER[precision]).toString();
  }
  if (typeof timestamp === "bigint") {
    return timestamp.toString();
  }
  if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp)) {
    throw new TypeError(
      `Point timestamp must be a Date, a safe integer, or a bigint; ` +
        `received ${String(timestamp)}.`,
    );
  }
  return timestamp.toString();
}

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
