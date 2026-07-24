import { describe, expect, it } from "vitest";

import { serializePoint } from "../../src/line-protocol.js";
import type { Point } from "../../src/types.js";

describe("serializePoint", () => {
  describe("valid points", () => {
    const cases: ReadonlyArray<[string, Point, string]> = [
      [
        "simple measurement and field",
        { measurement: "weather", fields: { temperature: 24.5 } },
        "weather temperature=24.5",
      ],
      [
        "multiple fields sorted lexicographically",
        {
          measurement: "weather",
          fields: { temperature: 1, altitude: 2, humidity: 3 },
        },
        "weather altitude=2,humidity=3,temperature=1",
      ],
      [
        "multiple tags sorted lexicographically",
        {
          measurement: "weather",
          tags: { region: "west", city: "Pokhara" },
          fields: { temperature: 1 },
        },
        "weather,city=Pokhara,region=west temperature=1",
      ],
      [
        "spaces in measurement are escaped",
        { measurement: "my measurement", fields: { a: 1 } },
        "my\\ measurement a=1",
      ],
      [
        "commas in measurement are escaped",
        { measurement: "we,ather", fields: { a: 1 } },
        "we\\,ather a=1",
      ],
      [
        "spaces, commas and equals in tag components are escaped",
        {
          measurement: "m",
          tags: { "tag key": "a,b c=d" },
          fields: { a: 1 },
        },
        "m,tag\\ key=a\\,b\\ c\\=d a=1",
      ],
      [
        "special field keys are escaped",
        { measurement: "m", fields: { "field key=x,y": 1 } },
        "m field\\ key\\=x\\,y=1",
      ],
      [
        "string field values are quoted",
        { measurement: "m", fields: { s: "cloudy" } },
        'm s="cloudy"',
      ],
      [
        "double quotes in string fields are escaped",
        { measurement: "m", fields: { s: 'say "hi"' } },
        'm s="say \\"hi\\""',
      ],
      [
        "backslashes in string fields are escaped",
        { measurement: "m", fields: { s: "a\\b" } },
        'm s="a\\\\b"',
      ],
      [
        "boolean fields are lowercase",
        { measurement: "m", fields: { yes: true, no: false } },
        "m no=false,yes=true",
      ],
      [
        "positive number",
        { measurement: "m", fields: { a: 42.25 } },
        "m a=42.25",
      ],
      [
        "negative number",
        { measurement: "m", fields: { a: -7.5 } },
        "m a=-7.5",
      ],
      ["zero", { measurement: "m", fields: { a: 0 } }, "m a=0"],
      [
        "exponent-form number",
        { measurement: "m", fields: { a: 1e21 } },
        "m a=1e+21",
      ],
      [
        "positive bigint uses the integer suffix",
        { measurement: "m", fields: { a: 18n } },
        "m a=18i",
      ],
      [
        "negative bigint uses the integer suffix",
        { measurement: "m", fields: { a: -18n } },
        "m a=-18i",
      ],
      [
        "numeric timestamp is emitted verbatim",
        { measurement: "m", fields: { a: 1 }, timestamp: 1_784_900_000_000 },
        "m a=1 1784900000000",
      ],
      [
        "bigint timestamp is emitted exactly",
        {
          measurement: "m",
          fields: { a: 1 },
          timestamp: 1_784_900_000_000_123_456n,
        },
        "m a=1 1784900000000123456",
      ],
      [
        "omitted timestamp is omitted from the line",
        { measurement: "m", fields: { a: 1 } },
        "m a=1",
      ],
      [
        "empty tag object adds no tag section",
        { measurement: "m", tags: {}, fields: { a: 1 } },
        "m a=1",
      ],
    ];

    it.each(cases)("%s", (_name, point, expected) => {
      expect(serializePoint(point)).toBe(expected);
    });

    it("converts a Date using millisecond precision", () => {
      const point: Point = {
        measurement: "m",
        fields: { a: 1 },
        timestamp: new Date(1_784_900_000_000),
      };
      expect(serializePoint(point, "ms")).toBe("m a=1 1784900000000");
    });

    it("converts a Date using microsecond precision", () => {
      const point: Point = {
        measurement: "m",
        fields: { a: 1 },
        timestamp: new Date(1_784_900_000_000),
      };
      expect(serializePoint(point, "us")).toBe("m a=1 1784900000000000");
    });

    it("converts a Date using nanosecond precision without precision loss", () => {
      const point: Point = {
        measurement: "m",
        fields: { a: 1 },
        timestamp: new Date(1_784_900_000_000),
      };
      expect(serializePoint(point, "ns")).toBe("m a=1 1784900000000000000");
    });

    it("defaults to millisecond precision", () => {
      const point: Point = {
        measurement: "m",
        fields: { a: 1 },
        timestamp: new Date(1_784_900_000_000),
      };
      expect(serializePoint(point)).toBe(serializePoint(point, "ms"));
    });

    it("is deterministic regardless of key insertion order", () => {
      const a: Point = {
        measurement: "m",
        tags: { b: "2", a: "1" },
        fields: { y: 1, x: 2 },
      };
      const b: Point = {
        measurement: "m",
        tags: { a: "1", b: "2" },
        fields: { x: 2, y: 1 },
      };
      expect(serializePoint(a)).toBe(serializePoint(b));
    });

    it("never appends a trailing newline", () => {
      expect(
        serializePoint({ measurement: "m", fields: { a: 1 } }),
      ).not.toMatch(/\n$/);
    });
  });

  describe("invalid points", () => {
    it("rejects an empty measurement", () => {
      expect(() =>
        serializePoint({ measurement: "", fields: { a: 1 } }),
      ).toThrow(/measurement must be a non-empty string/);
    });

    it("rejects a whitespace-only measurement", () => {
      expect(() =>
        serializePoint({ measurement: "   ", fields: { a: 1 } }),
      ).toThrow(/measurement must be a non-empty string/);
    });

    it("rejects a newline in the measurement", () => {
      expect(() =>
        serializePoint({ measurement: "a\nb", fields: { a: 1 } }),
      ).toThrow(/must not contain a newline/);
    });

    it("rejects a carriage return in a string field value", () => {
      expect(() =>
        serializePoint({ measurement: "m", fields: { a: "x\ry" } }),
      ).toThrow(/must not contain a newline/);
    });

    it("rejects a newline in a tag value", () => {
      expect(() =>
        serializePoint({
          measurement: "m",
          tags: { t: "a\nb" },
          fields: { a: 1 },
        }),
      ).toThrow(/must not contain a newline/);
    });

    it("rejects a point with no fields", () => {
      expect(() => serializePoint({ measurement: "m", fields: {} })).toThrow(
        /at least one field/,
      );
    });

    it("rejects NaN", () => {
      expect(() =>
        serializePoint({ measurement: "m", fields: { a: Number.NaN } }),
      ).toThrow(/must be a finite number/);
    });

    it("rejects Infinity", () => {
      expect(() =>
        serializePoint({
          measurement: "m",
          fields: { a: Number.POSITIVE_INFINITY },
        }),
      ).toThrow(/must be a finite number/);
    });

    it("rejects -Infinity", () => {
      expect(() =>
        serializePoint({
          measurement: "m",
          fields: { a: Number.NEGATIVE_INFINITY },
        }),
      ).toThrow(/must be a finite number/);
    });

    it("rejects an invalid Date", () => {
      expect(() =>
        serializePoint({
          measurement: "m",
          fields: { a: 1 },
          timestamp: new Date("not a date"),
        }),
      ).toThrow(/invalid Date/);
    });

    it("rejects an unsafe numeric timestamp", () => {
      expect(() =>
        serializePoint({
          measurement: "m",
          fields: { a: 1 },
          timestamp: Number.MAX_SAFE_INTEGER + 2,
        }),
      ).toThrow(/safe integer/);
    });

    it("rejects a non-integer numeric timestamp", () => {
      expect(() =>
        serializePoint({ measurement: "m", fields: { a: 1 }, timestamp: 1.5 }),
      ).toThrow(/safe integer/);
    });

    it("rejects a null field injected at runtime", () => {
      const point = {
        measurement: "m",
        fields: { a: null },
      } as unknown as Point;
      expect(() => serializePoint(point)).toThrow(/unsupported type null/);
    });

    it("rejects an undefined field injected at runtime", () => {
      const point = {
        measurement: "m",
        fields: { a: undefined },
      } as unknown as Point;
      expect(() => serializePoint(point)).toThrow(/unsupported type undefined/);
    });

    it("rejects an object field injected at runtime", () => {
      const point = { measurement: "m", fields: { a: {} } } as unknown as Point;
      expect(() => serializePoint(point)).toThrow(/unsupported type object/);
    });

    it("rejects a symbol field injected at runtime", () => {
      const point = {
        measurement: "m",
        fields: { a: Symbol("s") },
      } as unknown as Point;
      expect(() => serializePoint(point)).toThrow(/unsupported type symbol/);
    });

    it("rejects a non-string tag value injected at runtime", () => {
      const point = {
        measurement: "m",
        tags: { t: 5 },
        fields: { a: 1 },
      } as unknown as Point;
      expect(() => serializePoint(point)).toThrow(/must be a string/);
    });

    it("rejects an empty tag value", () => {
      expect(() =>
        serializePoint({ measurement: "m", tags: { t: "" }, fields: { a: 1 } }),
      ).toThrow(/non-empty value/);
    });

    it("rejects an empty tag key", () => {
      expect(() =>
        serializePoint({
          measurement: "m",
          tags: { "": "v" },
          fields: { a: 1 },
        }),
      ).toThrow(/Tag keys must be non-empty/);
    });

    it("rejects an empty field key", () => {
      expect(() =>
        serializePoint({ measurement: "m", fields: { "": 1 } }),
      ).toThrow(/Field keys must be non-empty/);
    });

    it("rejects a non-object point injected at runtime", () => {
      expect(() => serializePoint(null as unknown as Point)).toThrow(
        /Point must be an object/,
      );
    });

    it("rejects non-object fields injected at runtime", () => {
      const point = { measurement: "m", fields: null } as unknown as Point;
      expect(() => serializePoint(point)).toThrow(/fields must be an object/);
    });
  });
});
