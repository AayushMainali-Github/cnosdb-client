import { describe, expect, it } from "vitest";

import { splitPoints } from "../../../src/line-protocol/split.js";
import type { Point } from "../../../src/types/index.js";

function point(
  city: string,
  value: number,
  timestamp = 1_700_000_000_000,
): Point {
  return {
    measurement: "weather",
    tags: { city },
    fields: { v: value },
    timestamp,
  };
}

function chunks(...args: Parameters<typeof splitPoints>): string[] {
  return [...splitPoints(...args)];
}

function bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

describe("splitPoints", () => {
  it("returns nothing for no points", () => {
    expect(chunks([], { maxBytes: 100 })).toEqual([]);
  });

  it("keeps a batch that fits in a single payload", () => {
    const result = chunks([point("a", 1), point("b", 2)], { maxBytes: 1_000 });

    expect(result).toHaveLength(1);
    expect(result[0]!.split("\n")).toHaveLength(2);
  });

  it("splits when the batch exceeds the limit", () => {
    const one = bytes("weather,city=a v=1 1700000000000");
    // Room for one line plus a newline, but not two lines.
    const result = chunks([point("a", 1), point("b", 2), point("c", 3)], {
      maxBytes: one + 1,
    });

    expect(result).toHaveLength(3);
  });

  it("never emits a payload larger than the limit", () => {
    const points = Array.from({ length: 200 }, (_unused, index) =>
      point(`city${String(index)}`, index),
    );

    for (const chunk of splitPoints(points, { maxBytes: 200 })) {
      expect(bytes(chunk)).toBeLessThanOrEqual(200);
    }
  });

  it("counts the separating newlines in the budget", () => {
    const line = "weather,city=a v=1 1700000000000";
    const two = [point("a", 1), point("a", 1)];

    // Exactly two lines with no room for the newline between them.
    expect(chunks(two, { maxBytes: bytes(line) * 2 })).toHaveLength(2);
    // One more byte is all it takes to fit both.
    expect(chunks(two, { maxBytes: bytes(line) * 2 + 1 })).toHaveLength(1);
  });

  it("emits every point exactly once, in order", () => {
    const points = Array.from({ length: 50 }, (_unused, index) =>
      point(`c${String(index)}`, index),
    );

    const lines = chunks(points, { maxBytes: 150 }).flatMap((chunk) =>
      chunk.split("\n"),
    );

    expect(lines).toHaveLength(50);
    expect(lines[0]).toContain("city=c0");
    expect(lines.at(-1)).toContain("city=c49");
  });

  it("measures UTF-8 bytes rather than string length", () => {
    // Each of these characters is three bytes, so a length-based measure would
    // let a payload through at triple the real size.
    const wide = point("काठमाडौँ", 1);
    const line = [...splitPoints([wide], { maxBytes: 1_000 })][0] as string;

    expect(bytes(line)).toBeGreaterThan(line.length);

    for (const chunk of splitPoints([wide, wide, wide], { maxBytes: 120 })) {
      expect(bytes(chunk)).toBeLessThanOrEqual(120);
    }
  });

  it("applies the requested precision", () => {
    // Only a Date is converted; a numeric timestamp is taken as already being
    // in the target precision.
    const dated: Point = {
      measurement: "weather",
      fields: { v: 1 },
      timestamp: new Date(1_700_000_000_000),
    };

    expect(chunks([dated], { maxBytes: 1_000, precision: "ns" })[0]).toContain(
      "1700000000000000000",
    );
  });

  it("defaults to millisecond precision", () => {
    const dated: Point = {
      measurement: "weather",
      fields: { v: 1 },
      timestamp: new Date(1_700_000_000_000),
    };

    expect(chunks([dated], { maxBytes: 1_000 })[0]).toContain("1700000000000");
  });

  it("throws when one point alone exceeds the limit", () => {
    // Silently emitting an oversized payload would break the guarantee the
    // caller asked for, so this fails loudly instead.
    expect(() => chunks([point("a", 1)], { maxBytes: 5 })).toThrow(RangeError);
  });

  it("names the offending point and both sizes", () => {
    const oversized = point("a-very-long-city-name-that-does-not-fit", 2);

    expect(() => chunks([point("a", 1), oversized], { maxBytes: 40 })).toThrow(
      /index 1 encodes to \d+ bytes, which exceeds `maxBytes` of 40/,
    );
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 10.5],
    ["not a number", "100"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("rejects a %s maxBytes", (_label, maxBytes) => {
    expect(() =>
      chunks([point("a", 1)], { maxBytes: maxBytes as number }),
    ).toThrow(TypeError);
  });

  it("reports which point failed to serialize", () => {
    const bad = { measurement: "m", fields: {} } as Point;
    expect(() => chunks([point("a", 1), bad], { maxBytes: 1_000 })).toThrow(
      /Point at index 1 could not be serialized/,
    );
  });

  it("is lazy, serializing only what is consumed", () => {
    let serialized = 0;
    const points = Array.from({ length: 100 }, (_unused, index) => {
      const value = point(`c${String(index)}`, index);
      return new Proxy(value, {
        get(target, property, receiver) {
          if (property === "measurement") serialized += 1;
          return Reflect.get(target, property, receiver) as unknown;
        },
      });
    });

    const iterator = splitPoints(points, { maxBytes: 60 });
    iterator.next();

    expect(serialized).toBeGreaterThan(0);
    expect(serialized).toBeLessThan(100);
  });
});
