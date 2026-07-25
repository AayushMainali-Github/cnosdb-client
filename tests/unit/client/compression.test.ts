import { gunzipSync } from "node:zlib";

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

function sentBody(call: Recorded): string {
  const { body } = call.init;
  return typeof body === "string"
    ? body
    : gunzipSync(body as Uint8Array).toString("utf8");
}

function encodingOf(call: Recorded): string | undefined {
  return (call.init.headers as Record<string, string>)["content-encoding"];
}

describe("client compression option", () => {
  it("defaults to sending writes uncompressed", async () => {
    const { client, calls } = harness();
    await client.writeLineProtocol("m v=1");

    expect(calls[0]!.init.body).toBe("m v=1");
    expect(encodingOf(calls[0]!)).toBeUndefined();
  });

  it("compresses raw Line Protocol writes when enabled", async () => {
    const { client, calls } = harness({ compression: "gzip" });
    await client.writeLineProtocol("m v=1");

    expect(encodingOf(calls[0]!)).toBe("gzip");
    expect(sentBody(calls[0]!)).toBe("m v=1");
  });

  it("compresses structured point writes when enabled", async () => {
    const { client, calls } = harness({ compression: "gzip" });
    await client.writePoints({
      measurement: "weather",
      tags: { city: "Pokhara" },
      fields: { temperature: 24.5 },
      timestamp: 1_700_000_000_000,
    });

    expect(encodingOf(calls[0]!)).toBe("gzip");
    expect(sentBody(calls[0]!)).toBe(
      "weather,city=Pokhara temperature=24.5 1700000000000",
    );
  });

  it("enables compression for a single write", async () => {
    const { client, calls } = harness();
    await client.writeLineProtocol("m v=1", { compression: "gzip" });

    expect(encodingOf(calls[0]!)).toBe("gzip");
    expect(sentBody(calls[0]!)).toBe("m v=1");
  });

  it("disables compression for a single write", async () => {
    const { client, calls } = harness({ compression: "gzip" });
    await client.writeLineProtocol("m v=1", { compression: "none" });

    expect(encodingOf(calls[0]!)).toBeUndefined();
    expect(calls[0]!.init.body).toBe("m v=1");
  });

  it("leaves queries uncompressed even when writes are compressed", async () => {
    // Statements are small, so compressing them would usually enlarge them.
    const { client, calls } = harness({ compression: "gzip" });
    await client.query("SELECT 1");
    await client.execute("CREATE DATABASE d");

    for (const call of calls) {
      expect(encodingOf(call)).toBeUndefined();
      expect(call.init.body).toBeTypeOf("string");
    }
  });

  it("rejects an unknown compression at construction", () => {
    expect(() => harness({ compression: "brotli" as never })).toThrow(
      /`compression` must be one of none, gzip/,
    );
  });

  it("rejects an unknown compression per write", async () => {
    const { client } = harness();
    await expect(
      client.writeLineProtocol("m v=1", { compression: "brotli" as never }),
    ).rejects.toThrow(/`compression` must be one of/);
  });

  it("refuses a caller-supplied content-encoding header", () => {
    expect(() => harness({ headers: { "content-encoding": "gzip" } })).toThrow(
      /client controls/,
    );
  });
});
