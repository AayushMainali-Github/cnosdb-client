import { describe, expect, it } from "vitest";

import {
  normalizeHeaders,
  RESERVED_HEADERS,
} from "../../../src/http/headers.js";
import { headerOf, makeTransport, recordingFetch } from "./helpers.js";

describe("normalizeHeaders", () => {
  it("returns an empty object when no headers are supplied", () => {
    expect(normalizeHeaders(undefined, "headers")).toEqual({});
  });

  it("lowercases header names so merging compares one canonical form", () => {
    expect(normalizeHeaders({ "X-Api-Key": "k" }, "headers")).toEqual({
      "x-api-key": "k",
    });
  });

  it("preserves values verbatim, including case and whitespace", () => {
    expect(normalizeHeaders({ "x-trace": " Ab C " }, "headers")).toEqual({
      "x-trace": " Ab C ",
    });
  });

  it.each(RESERVED_HEADERS)("rejects the reserved header %s", (name) => {
    expect(() => normalizeHeaders({ [name]: "x" }, "headers")).toThrow(
      TypeError,
    );
  });

  it("rejects a reserved header regardless of its case", () => {
    expect(() => normalizeHeaders({ AUTHORIZATION: "x" }, "headers")).toThrow(
      /client controls/,
    );
  });

  it("points at the authentication options when authorization is set", () => {
    expect(() => normalizeHeaders({ authorization: "x" }, "headers")).toThrow(
      /`username` and `password`/,
    );
  });

  it.each([
    ["a space", "x api key"],
    ["a colon", "x:key"],
    ["an empty name", ""],
    ["a newline", "x\nkey"],
  ])("rejects a header name containing %s", (_label, name) => {
    expect(() => normalizeHeaders({ [name]: "v" }, "headers")).toThrow(
      /invalid header name/,
    );
  });

  it.each([
    ["a carriage return", "a\rb"],
    ["a line feed", "a\nb"],
  ])(
    "rejects a value containing %s, which could inject a second header",
    (_label, value) => {
      expect(() => normalizeHeaders({ "x-a": value }, "headers")).toThrow(
        /line break/,
      );
    },
  );

  it.each([
    ["a number", 1],
    ["null", null],
    ["an object", {}],
    ["undefined", undefined],
  ])("rejects %s as a header value", (_label, value) => {
    expect(() => normalizeHeaders({ "x-a": value }, "headers")).toThrow(
      /must be a string/,
    );
  });

  it.each([
    ["an array", []],
    ["null", null],
    ["a string", "x-a: b"],
  ])("rejects %s as the headers option itself", (_label, headers) => {
    expect(() => normalizeHeaders(headers, "headers")).toThrow(
      /must be a plain object/,
    );
  });

  it("names the offending option so the caller knows which one to fix", () => {
    expect(() => normalizeHeaders({ accept: "x" }, "options.headers")).toThrow(
      /`options.headers`/,
    );
  });
});

describe("Transport headers", () => {
  it("sends client-level headers on every request", async () => {
    const { fetch, calls } = recordingFetch();
    const transport = makeTransport(fetch, { headers: { "x-api-key": "k" } });

    await transport.requestVoid({ method: "GET", path: "api/v1/ping" });
    await transport.requestVoid({ method: "GET", path: "api/v1/ping" });

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(headerOf(call, "x-api-key")).toBe("k");
    }
  });

  it("merges per-request headers over client-level ones", async () => {
    const { fetch, calls } = recordingFetch();
    const transport = makeTransport(fetch, {
      headers: { "x-api-key": "client", "x-keep": "kept" },
    });

    await transport.requestVoid({
      method: "GET",
      path: "api/v1/ping",
      headers: { "x-api-key": "request" },
    });

    expect(headerOf(calls[0]!, "x-api-key")).toBe("request");
    expect(headerOf(calls[0]!, "x-keep")).toBe("kept");
  });

  it("keeps transport-owned headers even if a reserved name slips through", async () => {
    const { fetch, calls } = recordingFetch();
    const transport = makeTransport(fetch, {
      authorization: "Basic real",
      // Bypasses normalizeHeaders deliberately: ordering inside the transport
      // must make the override impossible on its own.
      headers: { authorization: "Basic forged", accept: "text/forged" },
    });

    await transport.requestVoid({
      method: "GET",
      path: "api/v1/ping",
      accept: "application/json",
    });

    expect(headerOf(calls[0]!, "authorization")).toBe("Basic real");
    expect(headerOf(calls[0]!, "accept")).toBe("application/json");
  });

  it("sends no extra headers when none are configured", async () => {
    const { fetch, calls } = recordingFetch();
    const transport = makeTransport(fetch);

    await transport.requestVoid({ method: "GET", path: "api/v1/ping" });

    expect(
      Object.keys(calls[0]!.init.headers as Record<string, string>),
    ).toEqual([]);
  });
});
