import type { TimePrecision } from "../types/index.js";

/**
 * Multipliers converting milliseconds into the requested precision.
 * `bigint` keeps nanosecond conversions exact.
 */
const MS_MULTIPLIER: Record<TimePrecision, bigint> = {
  ms: 1n,
  us: 1_000n,
  ns: 1_000_000n,
};

export function serializeTimestamp(
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
