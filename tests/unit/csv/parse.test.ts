import { describe, expect, it } from "vitest";

import { parseCsv } from "../../../src/csv/parse.js";

describe("parseCsv", () => {
  it("parses a simple table", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("ignores a trailing newline rather than inventing a row", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles a bare carriage return as a terminator", () => {
    expect(parseCsv("a,b\r1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns no rows for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("keeps empty fields, which is how CnosDB renders NULL", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("keeps a trailing empty field", () => {
    expect(parseCsv("a,b\n1,")).toEqual([
      ["a", "b"],
      ["1", ""],
    ]);
  });

  it("keeps a leading empty field", () => {
    expect(parseCsv("a,b\n,2")).toEqual([
      ["a", "b"],
      ["", "2"],
    ]);
  });

  it("parses a row of only empty fields", () => {
    expect(parseCsv("a,b,c\n,,")).toEqual([
      ["a", "b", "c"],
      ["", "", ""],
    ]);
  });

  it("unquotes a quoted field", () => {
    expect(parseCsv('a\n"hello"')).toEqual([["a"], ["hello"]]);
  });

  it("keeps a comma inside a quoted field", () => {
    expect(parseCsv('a\n"x,y"')).toEqual([["a"], ["x,y"]]);
  });

  it("collapses a doubled quote into one literal quote", () => {
    // This is exactly what CnosDB emits for a string containing a quote.
    expect(parseCsv('weird\n"a,b""c"')).toEqual([["weird"], ['a,b"c']]);
  });

  it("keeps a newline inside a quoted field", () => {
    expect(parseCsv('a\n"line1\nline2"')).toEqual([["a"], ["line1\nline2"]]);
  });

  it("keeps a CRLF inside a quoted field", () => {
    expect(parseCsv('a\n"line1\r\nline2"')).toEqual([
      ["a"],
      ["line1\r\nline2"],
    ]);
  });

  it("parses a quoted empty field", () => {
    expect(parseCsv('a,b\n"",x')).toEqual([
      ["a", "b"],
      ["", "x"],
    ]);
  });

  it("parses a field that is only quotes", () => {
    expect(parseCsv('a\n""""')).toEqual([["a"], ['"']]);
  });

  it("mixes quoted and bare fields on one row", () => {
    expect(parseCsv('a,b,c\n1,"two, too",3')).toEqual([
      ["a", "b", "c"],
      ["1", "two, too", "3"],
    ]);
  });

  it("keeps a backslash verbatim, since CSV does not escape with it", () => {
    expect(parseCsv('a\n"back\\slash"')).toEqual([["a"], ["back\\slash"]]);
  });

  it("preserves surrounding whitespace", () => {
    expect(parseCsv("a,b\n 1 , 2 ")).toEqual([
      ["a", "b"],
      [" 1 ", " 2 "],
    ]);
  });

  it("parses a header-only body, which is an empty result set", () => {
    expect(parseCsv("time,city,v\n")).toEqual([["time", "city", "v"]]);
  });

  it("handles multi-byte characters", () => {
    expect(parseCsv("city\nकाठमाडौँ")).toEqual([["city"], ["काठमाडौँ"]]);
  });

  it("does not merge rows of differing width", () => {
    expect(parseCsv("a,b,c\n1,2")).toEqual([
      ["a", "b", "c"],
      ["1", "2"],
    ]);
  });
});
