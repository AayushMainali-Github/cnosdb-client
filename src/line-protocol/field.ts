import type { PointFieldValue } from "../types/index.js";
import { escapeStringFieldValue, rejectLineBreaks } from "./escape.js";

export function serializeFieldValue(
  key: string,
  value: PointFieldValue,
): string {
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

/**
 * Names a value's type for an error message. `typeof null` is `"object"`, which
 * would be actively misleading in a message telling someone what they passed.
 */
export function describe(value: unknown): string {
  if (value === null) return "null";
  return typeof value;
}
