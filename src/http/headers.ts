/**
 * Headers the transport sets itself. A caller who overrode one of these could
 * silently break authentication or change how a body is interpreted, so they
 * stay under client control.
 *
 * @internal
 */
export const RESERVED_HEADERS: readonly string[] = [
  "authorization",
  "content-type",
  "accept",
];

/**
 * RFC 9110 token characters, which are the only ones valid in a header name.
 * Validating here turns a malformed name into a `TypeError` naming the option,
 * rather than an opaque failure from `fetch`.
 */
const TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Validates caller-supplied headers and lowercases their names.
 *
 * Names are lowercased so that later merging and reserved-name checks compare
 * on one canonical form; HTTP header names are case-insensitive, so this does
 * not change what is sent.
 *
 * @param headers - Raw headers from a client or request option.
 * @param source - Option path used in error messages, such as
 * `` `headers` `` or `` `options.headers` ``.
 * @internal
 */
export function normalizeHeaders(
  headers: unknown,
  source: string,
): Record<string, string> {
  if (headers === undefined) {
    return {};
  }

  if (
    typeof headers !== "object" ||
    headers === null ||
    Array.isArray(headers)
  ) {
    throw new TypeError(
      `CnosDB client option \`${source}\` must be a plain object mapping ` +
        `header names to string values.`,
    );
  }

  const normalized: Record<string, string> = {};

  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();

    if (!TOKEN_PATTERN.test(rawName)) {
      throw new TypeError(
        `\`${source}\` contains an invalid header name "${rawName}".`,
      );
    }

    if (RESERVED_HEADERS.includes(name)) {
      throw new TypeError(
        `\`${source}\` must not set "${name}", which the client controls. ` +
          `Use the \`username\` and \`password\` options for authentication.`,
      );
    }

    if (typeof value !== "string") {
      throw new TypeError(
        `\`${source}\` value for "${name}" must be a string; received ` +
          `${typeof value}.`,
      );
    }

    // A line break would let a value inject a second header, and it is never
    // legitimate in one, so reject it rather than stripping it.
    if (/[\r\n]/.test(value)) {
      throw new TypeError(
        `\`${source}\` value for "${name}" must not contain a line break.`,
      );
    }

    normalized[name] = value;
  }

  return normalized;
}
