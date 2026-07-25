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

function harness(options: Partial<CnosDBClientOptions> = {}): {
  client: CnosDBClient;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const fetch: FetchLike = (input, init = {}) => {
    calls.push({ url: toUrl(input), init });
    return Promise.resolve(new Response("[]", { status: 200 }));
  };
  const client = new CnosDBClient({
    url: "http://localhost:8902",
    fetch,
    ...options,
  });
  return { client, calls };
}

function sentHeaders(call: Recorded): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

describe("client headers option", () => {
  it("rejects reserved headers at construction, before any request", () => {
    expect(() =>
      harness({ headers: { "Content-Type": "application/xml" } }),
    ).toThrow(/client controls/);
  });

  it("names the client option in the error", () => {
    expect(() => harness({ headers: { "bad name": "v" } })).toThrow(
      /`headers`/,
    );
  });

  it("applies client headers to every operation", async () => {
    const { client, calls } = harness({ headers: { "x-api-key": "k" } });

    await client.ping().catch(() => undefined);
    await client.query("SELECT 1");
    await client.execute("CREATE DATABASE d");
    await client.writeLineProtocol("m v=1");
    await client.writePoints({ measurement: "m", fields: { v: 1 } });

    expect(calls).toHaveLength(5);
    for (const call of calls) {
      expect(sentHeaders(call)["x-api-key"]).toBe("k");
    }
  });

  it("merges per-request headers over client headers", async () => {
    const { client, calls } = harness({
      headers: { "x-api-key": "client", "x-keep": "kept" },
    });

    await client.query("SELECT 1", {
      headers: { "X-Api-Key": "request", "x-extra": "e" },
    });

    const headers = sentHeaders(calls[0]!);
    expect(headers["x-api-key"]).toBe("request");
    expect(headers["x-keep"]).toBe("kept");
    expect(headers["x-extra"]).toBe("e");
  });

  it("leaves client headers untouched for later requests", async () => {
    const { client, calls } = harness({ headers: { "x-api-key": "client" } });

    await client.query("SELECT 1", { headers: { "x-api-key": "once" } });
    await client.query("SELECT 1");

    expect(sentHeaders(calls[0]!)["x-api-key"]).toBe("once");
    expect(sentHeaders(calls[1]!)["x-api-key"]).toBe("client");
  });

  it("rejects reserved per-request headers", async () => {
    const { client } = harness();

    await expect(
      client.query("SELECT 1", { headers: { accept: "text/csv" } }),
    ).rejects.toThrow(/`options.headers`/);
  });

  it("accepts per-request headers on write operations", async () => {
    const { client, calls } = harness();

    await client.writePoints(
      { measurement: "m", fields: { v: 1 } },
      { headers: { "x-request-id": "abc" } },
    );

    expect(sentHeaders(calls[0]!)["x-request-id"]).toBe("abc");
  });

  it("still sends the headers the client owns", async () => {
    const { client, calls } = harness({
      username: "root",
      password: "",
      headers: { "x-api-key": "k" },
    });

    await client.query("SELECT 1");

    const headers = sentHeaders(calls[0]!);
    expect(headers["authorization"]).toMatch(/^Basic /);
    expect(headers["accept"]).toBe("application/json");
    expect(headers["content-type"]).toBe("text/plain; charset=utf-8");
  });
});
