/**
 * Escaping rules for Line Protocol. Commas, equals signs, and spaces are
 * structural, so any occurrence inside a name or value must be escaped or the
 * server parses the line differently than intended.
 */

/**
 * Escapes a measurement name: commas and spaces are structural in Line
 * Protocol and must be backslash-escaped.
 */
export function escapeMeasurement(value: string): string {
  return value.replace(/([,\s])/g, "\\$1");
}

/**
 * Escapes a tag key, tag value, or field key. Commas, equals signs, and
 * spaces separate elements and must be escaped.
 */
export function escapeTagComponent(value: string): string {
  return value.replace(/([,=\s])/g, "\\$1");
}

export const escapeFieldKey = escapeTagComponent;

/**
 * Escapes a string field value, which is transmitted inside double quotes.
 */
export function escapeStringFieldValue(value: string): string {
  return value.replace(/([\\"])/g, "\\$1");
}

/**
 * Line breaks separate points, so they can never be escaped into a value.
 * Rejecting them is the only safe option: silently stripping them would corrupt
 * data, and passing them through would inject an extra point.
 */
export function rejectLineBreaks(kind: string, value: string): void {
  if (/[\n\r]/.test(value)) {
    throw new TypeError(
      `Line Protocol ${kind} must not contain a newline or carriage return.`,
    );
  }
}
