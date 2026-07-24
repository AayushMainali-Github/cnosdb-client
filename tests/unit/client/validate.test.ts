import { describe, expect, it } from "vitest";

import { PRECISIONS } from "../../../src/client/defaults.js";
import {
  assertNonEmpty,
  assertOptionalString,
  assertPrecision,
  requireStatement,
} from "../../../src/client/validate.js";

describe("requireStatement", () => {
  it("returns the statement unchanged, preserving significant whitespace", () => {
    expect(requireStatement("  SELECT 1  ")).toBe("  SELECT 1  ");
  });

  it.each(["", "   ", "\n\t"])("rejects the blank statement %j", (value) => {
    expect(() => requireStatement(value)).toThrow(
      /SQL statement must be a non-empty string/,
    );
  });

  it.each<unknown>([undefined, null, 42, {}])("rejects %s", (value) => {
    expect(() => requireStatement(value as string)).toThrow(TypeError);
  });
});

describe("assertNonEmpty", () => {
  it("accepts a non-empty string", () => {
    expect(() => {
      assertNonEmpty("database", "telemetry");
    }).not.toThrow();
  });

  it("names the offending option so the message is actionable", () => {
    expect(() => {
      assertNonEmpty("tenant", "  ");
    }).toThrow(/`tenant` must be a non-empty string/);
  });

  it.each([undefined, null, 0])("rejects the non-string %s", (value) => {
    expect(() => {
      assertNonEmpty("database", value as unknown as string);
    }).toThrow(TypeError);
  });
});

describe("assertOptionalString", () => {
  it("accepts undefined, since the option is optional", () => {
    expect(() => {
      assertOptionalString("username", undefined);
    }).not.toThrow();
  });

  it("accepts an empty string, which CnosDB uses for the root password", () => {
    expect(() => {
      assertOptionalString("password", "");
    }).not.toThrow();
  });

  it.each([null, 42, {}])("rejects the non-string %s", (value) => {
    expect(() => {
      assertOptionalString("username", value);
    }).toThrow(/must be a string when provided/);
  });
});

describe("assertPrecision", () => {
  it.each(PRECISIONS)("accepts %s", (precision) => {
    expect(() => {
      assertPrecision(precision);
    }).not.toThrow();
  });

  it("lists the accepted values when rejecting", () => {
    expect(() => {
      assertPrecision("s");
    }).toThrow(/must be one of ms, us, ns; received s/);
  });

  it.each([undefined, null, "MS", 1])("rejects %s", (value) => {
    expect(() => {
      assertPrecision(value);
    }).toThrow(TypeError);
  });
});
