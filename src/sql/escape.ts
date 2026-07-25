/**
 * Values the {@link sql} tagged template knows how to encode as a CnosDB SQL
 * literal. Anything else is rejected rather than guessed at.
 */
export type SqlValue = string | number | boolean | bigint | Date | null;

/**
 * Builds a SQL string, escaping each interpolated value as a literal.
 *
 * This is a **value** escaper, not a query builder. Identifiers, keywords, and
 * statement structure stay in the literal parts of the template; only the
 * `${…}` holes are touched. Passing a table name or a clause through a hole is
 * a misuse and will produce a quoted string, not an identifier.
 *
 * Encoding follows what CnosDB 2.4.x actually accepts:
 *
 * - `null` → `NULL`
 * - booleans → `true` / `false`
 * - finite numbers and bigints → decimal literals
 * - strings → single-quoted, with every `'` doubled (`'a''b'`)
 * - `Date` → `TIMESTAMP '…'` in UTC ISO-8601
 *
 * Backslash is **not** an escape in CnosDB string literals; doubling the quote
 * is. Values that cannot be encoded safely (`NaN`, `Infinity`, an invalid
 * `Date`) throw rather than emit something the server would misread.
 *
 * @example
 * ```ts
 * await client.query(sql`SELECT * FROM sensors WHERE site = ${site}`);
 * ```
 */
export function sql(
  strings: TemplateStringsArray,
  ...values: readonly SqlValue[]
): string {
  if (strings.length !== values.length + 1) {
    throw new TypeError(
      `sql\`\` expected ${String(values.length + 1)} static parts for ` +
        `${String(values.length)} values; received ${String(strings.length)}.`,
    );
  }

  let result = strings[0] ?? "";
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] as SqlValue;
    result += escapeSqlValue(value, index);
    result += strings[index + 1] ?? "";
  }
  return result;
}

/**
 * Encodes one value as a CnosDB SQL literal.
 *
 * @internal Exported for unit tests; prefer {@link sql} at call sites.
 */
export function escapeSqlValue(value: SqlValue, index?: number): string {
  const where =
    index === undefined ? "value" : `interpolated value at index ${index}`;

  if (value === null) return "NULL";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return escapeNumber(value, where);
    case "bigint":
      return value.toString(10);
    case "string":
      return escapeString(value);
    case "object":
      if (value instanceof Date) return escapeDate(value, where);
      break;
  }

  throw new TypeError(
    `sql\`\` cannot encode ${where} of type ${describe(value)}. ` +
      `Supported types are string, number, boolean, bigint, Date, and null.`,
  );
}

function escapeString(value: string): string {
  // CnosDB uses SQL-standard quoting: a single quote is escaped by doubling
  // it. Backslash is not special and must not be treated as an escape, or a
  // string containing `\'` would be emitted incorrectly.
  return `'${value.replaceAll("'", "''")}'`;
}

function escapeNumber(value: number, where: string): string {
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `sql\`\` cannot encode ${where}: ${String(value)} is not a finite number.`,
    );
  }
  // `Number.toString` already yields a SQL-compatible decimal or scientific
  // form for finite values, including `-0` which becomes `"0"`.
  return value.toString();
}

function escapeDate(value: Date, where: string): string {
  const time = value.getTime();
  if (!Number.isFinite(time)) {
    throw new TypeError(`sql\`\` cannot encode ${where}: Date is invalid.`);
  }
  // UTC ISO-8601 is accepted by `TIMESTAMP '…'` and does not depend on the
  // host's local timezone, which would otherwise make the same Date encode
  // differently on different machines.
  return `TIMESTAMP '${value.toISOString()}'`;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
