import { describe, expect, it } from "vitest";

import { escapeSqlValue, sql } from "../../../src/sql/escape.js";

describe("sql tagged template", () => {
  it("leaves a template with no holes unchanged", () => {
    expect(sql`SELECT 1`).toBe("SELECT 1");
  });

  it("interpolates several values in order", () => {
    expect(
      sql`SELECT * FROM t WHERE site = ${"pokhara"} AND n = ${3} AND ok = ${true}`,
    ).toBe("SELECT * FROM t WHERE site = 'pokhara' AND n = 3 AND ok = true");
  });

  it("encodes null as NULL", () => {
    expect(sql`SELECT ${null}`).toBe("SELECT NULL");
  });

  it("doubles single quotes inside strings", () => {
    expect(sql`SELECT ${"a'b"}`).toBe("SELECT 'a''b'");
    expect(sql`SELECT ${"a''b"}`).toBe("SELECT 'a''''b'");
    expect(sql`SELECT ${""}`).toBe("SELECT ''");
  });

  it("leaves backslashes and double quotes as ordinary characters", () => {
    // Backslash is not an escape in CnosDB string literals; treating it as one
    // would be the subtle wrongness this helper exists to avoid.
    expect(sql`SELECT ${"a\\b"}`).toBe("SELECT 'a\\b'");
    expect(sql`SELECT ${'a"b'}`).toBe("SELECT 'a\"b'");
  });

  it("preserves newlines inside strings", () => {
    expect(sql`SELECT ${"line\nbreak"}`).toBe("SELECT 'line\nbreak'");
  });

  it("encodes booleans as lowercase keywords", () => {
    expect(escapeSqlValue(true)).toBe("true");
    expect(escapeSqlValue(false)).toBe("false");
  });

  it("encodes finite numbers, including zero and scientific form", () => {
    expect(escapeSqlValue(0)).toBe("0");
    expect(escapeSqlValue(-0)).toBe("0");
    expect(escapeSqlValue(1.5)).toBe("1.5");
    expect(escapeSqlValue(150)).toBe("150");
  });

  it("encodes bigints as decimal digits", () => {
    expect(escapeSqlValue(9_223_372_036_854_775_807n)).toBe(
      "9223372036854775807",
    );
    expect(escapeSqlValue(-1n)).toBe("-1");
  });

  it("encodes Date as a UTC TIMESTAMP literal", () => {
    expect(escapeSqlValue(new Date("2024-01-01T00:00:00.123Z"))).toBe(
      "TIMESTAMP '2024-01-01T00:00:00.123Z'",
    );
  });

  it("rejects NaN and Infinity rather than emitting them", () => {
    expect(() => escapeSqlValue(Number.NaN)).toThrow(/not a finite number/);
    expect(() => escapeSqlValue(Number.POSITIVE_INFINITY)).toThrow(
      /not a finite number/,
    );
  });

  it("rejects an invalid Date", () => {
    expect(() => escapeSqlValue(new Date(Number.NaN))).toThrow(/invalid/);
  });

  it("rejects values it cannot encode safely", () => {
    expect(() => sql`SELECT ${{ x: 1 } as unknown as string}`).toThrow(
      /cannot encode/,
    );
    expect(() => sql`SELECT ${[1] as unknown as string}`).toThrow(
      /cannot encode/,
    );
    expect(() => sql`SELECT ${undefined as unknown as string}`).toThrow(
      /cannot encode/,
    );
  });
});

describe("adversarial string escaping", () => {
  it.each([
    ["quote then comment", "x' --", "'x'' --'"],
    ["quote then OR", "x' OR '1'='1", "'x'' OR ''1''=''1'"],
    ["backslash quote bait", "x\\'", "'x\\'''"],
    ["only quotes", "'''", "''''''''"],
    ["unicode", "pokhara—काठमाडौं", "'pokhara—काठमाडौं'"],
  ])("%s", (_label, input, expected) => {
    expect(escapeSqlValue(input)).toBe(expected);
  });
});
