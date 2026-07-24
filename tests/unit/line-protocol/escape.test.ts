import { describe, expect, it } from "vitest";

import {
  escapeFieldKey,
  escapeMeasurement,
  escapeStringFieldValue,
  escapeTagComponent,
  rejectLineBreaks,
} from "../../../src/line-protocol/escape.js";

describe("escapeMeasurement", () => {
  it("escapes commas and spaces", () => {
    expect(escapeMeasurement("cpu load,total")).toBe("cpu\\ load\\,total");
  });

  it("leaves an equals sign alone, since it is not structural here", () => {
    expect(escapeMeasurement("a=b")).toBe("a=b");
  });

  it("leaves an ordinary name untouched", () => {
    expect(escapeMeasurement("weather")).toBe("weather");
  });

  it("escapes tabs, which are whitespace to the parser", () => {
    expect(escapeMeasurement("a\tb")).toBe("a\\\tb");
  });
});

describe("escapeTagComponent", () => {
  it("escapes commas, equals signs, and spaces", () => {
    expect(escapeTagComponent("a,b=c d")).toBe("a\\,b\\=c\\ d");
  });

  it("leaves quotes alone, which are not structural in the tag set", () => {
    expect(escapeTagComponent('say"hi"')).toBe('say"hi"');
  });

  it("is the same rule used for field keys", () => {
    expect(escapeFieldKey("a=b")).toBe(escapeTagComponent("a=b"));
  });
});

describe("escapeStringFieldValue", () => {
  it("escapes double quotes, which would end the value early", () => {
    expect(escapeStringFieldValue('say "hi"')).toBe('say \\"hi\\"');
  });

  it("escapes backslashes so an escape cannot be forged", () => {
    expect(escapeStringFieldValue("c:\\path")).toBe("c:\\\\path");
  });

  it("leaves commas, spaces, and equals signs alone inside quotes", () => {
    expect(escapeStringFieldValue("a, b=c")).toBe("a, b=c");
  });

  it("escapes a trailing backslash rather than letting it escape the closing quote", () => {
    expect(escapeStringFieldValue("ends\\")).toBe("ends\\\\");
  });
});

describe("rejectLineBreaks", () => {
  it.each(["\n", "\r", "\r\n"])(
    "rejects %j because it would inject another point",
    (breakChar) => {
      expect(() => {
        rejectLineBreaks("measurement", `a${breakChar}b`);
      }).toThrow(TypeError);
    },
  );

  it("names the component so the message is actionable", () => {
    expect(() => {
      rejectLineBreaks('tag value for "city"', "a\nb");
    }).toThrow(/tag value for "city" must not contain a newline/);
  });

  it("accepts a value with no line break", () => {
    expect(() => {
      rejectLineBreaks("measurement", "weather");
    }).not.toThrow();
  });
});
