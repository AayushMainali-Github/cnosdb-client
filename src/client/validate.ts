import type { Compression, TimePrecision } from "../types/index.js";
import { COMPRESSIONS, PRECISIONS } from "./defaults.js";

/**
 * Argument checks for the public methods. These run at runtime as well as in
 * the type system, because JavaScript callers and values decoded from JSON are
 * not constrained by the TypeScript signatures.
 */

export function requireStatement(statement: string): string {
  if (typeof statement !== "string" || statement.trim().length === 0) {
    throw new TypeError("SQL statement must be a non-empty string.");
  }
  return statement;
}

export function assertNonEmpty(name: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(
      `CnosDB client option \`${name}\` must be a non-empty string.`,
    );
  }
}

export function assertOptionalString(name: string, value: unknown): void {
  if (value !== undefined && typeof value !== "string") {
    throw new TypeError(
      `CnosDB client option \`${name}\` must be a string when provided.`,
    );
  }
}

export function assertPrecision(
  precision: unknown,
): asserts precision is TimePrecision {
  if (!PRECISIONS.includes(precision as TimePrecision)) {
    throw new TypeError(
      `\`precision\` must be one of ${PRECISIONS.join(", ")}; ` +
        `received ${String(precision)}.`,
    );
  }
}

export function assertCompression(
  compression: unknown,
): asserts compression is Compression {
  if (!COMPRESSIONS.includes(compression as Compression)) {
    throw new TypeError(
      `\`compression\` must be one of ${COMPRESSIONS.join(", ")}; ` +
        `received ${String(compression)}.`,
    );
  }
}
