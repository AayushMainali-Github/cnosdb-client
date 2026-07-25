import { describe, expect, it } from "vitest";

import { CnosDBClient } from "../../../src/client/index.js";
import type {
  CnosDBClientOptions,
  FetchLike,
} from "../../../src/types/index.js";
import { toUrl } from "../../helpers.js";

interface Recorded {
  url: URL;
  init: RequestInit;
}

function harness(
  body: string,
  options: Partial<CnosDBClientOptions> = {},
): { client: CnosDBClient; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetch: FetchLike = (input, init = {}) => {
    calls.push({ url: toUrl(input), init });
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  const client = new CnosDBClient({
    url: "http://localhost:8902",
    fetch,
    ...options,
  });
  return { client, calls };
}

describe("queryTable", () => {
  it("asks for CSV, the only format carrying column order", async () => {
    const { client, calls } = harness("a\n1");
    await client.queryTable("SELECT 1");

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["accept"]).toBe("application/csv");
    expect(calls[0]!.init.body).toBe("SELECT 1");
  });

  it("splits the header row from the data rows", async () => {
    const { client } = harness("time,city,v\n2026-01-01,Pokhara,1.5");
    const table = await client.queryTable("SELECT * FROM t");

    expect(table.columns).toEqual(["time", "city", "v"]);
    expect(table.rows).toEqual([["2026-01-01", "Pokhara", "1.5"]]);
  });

  it("preserves the server's column order rather than sorting", async () => {
    const { client } = harness("v,city\n1.5,Pokhara");
    const table = await client.queryTable("SELECT v, city FROM t");

    expect(table.columns).toEqual(["v", "city"]);
  });

  it("returns the columns of an empty result set", async () => {
    // The point of the method: an empty table can still be rendered with
    // headings, which the JSON endpoint makes impossible.
    const { client } = harness("time,city,v\n");
    const table = await client.queryTable("SELECT * FROM t WHERE false");

    expect(table.columns).toEqual(["time", "city", "v"]);
    expect(table.rows).toEqual([]);
  });

  it("returns empty columns for a statement with no result set", async () => {
    const { client } = harness("");
    const table = await client.queryTable("CREATE DATABASE d");

    expect(table.columns).toEqual([]);
    expect(table.rows).toEqual([]);
  });

  it("keeps NULL fields aligned with their columns", async () => {
    const { client } = harness("city,v,n\nLalitpur,2.5,");
    const table = await client.queryTable("SELECT city, v, n FROM t");

    expect(table.rows[0]).toEqual(["Lalitpur", "2.5", ""]);
    expect(table.rows[0]).toHaveLength(table.columns.length);
  });

  it("decodes quoted fields containing separators", async () => {
    const { client } = harness('weird\n"a,b""c"');
    const table = await client.queryTable("SELECT ...");

    expect(table.rows[0]).toEqual(['a,b"c']);
  });

  it("applies database and tenant parameters", async () => {
    const { client, calls } = harness("a\n1", {
      database: "telemetry",
      tenant: "acme",
    });
    await client.queryTable("SELECT 1");

    expect(calls[0]!.url.searchParams.get("db")).toBe("telemetry");
    expect(calls[0]!.url.searchParams.get("tenant")).toBe("acme");
  });

  it("honours per-request overrides", async () => {
    const { client, calls } = harness("a\n1");
    await client.queryTable("SELECT 1", {
      database: "other",
      headers: { "x-request-id": "abc" },
    });

    expect(calls[0]!.url.searchParams.get("db")).toBe("other");
    expect(
      (calls[0]!.init.headers as Record<string, string>)["x-request-id"],
    ).toBe("abc");
  });

  it("rejects an empty statement", async () => {
    const { client } = harness("a\n1");
    await expect(client.queryTable("   ")).rejects.toThrow(
      /must be a non-empty string/,
    );
  });
});
