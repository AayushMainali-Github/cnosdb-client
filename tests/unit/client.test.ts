import { describe, expect, it } from "vitest";

import { CnosDBClient } from "../../src/client.js";
import {
  CnosDBRequestError,
  CnosDBResponseError,
} from "../../src/errors/index.js";
import type { CnosDBClientOptions, FetchLike } from "../../src/types/index.js";
import { captureError, toUrl } from "../helpers.js";

interface Recorded {
  url: URL;
  init: RequestInit;
}

function harness(
  options: Partial<CnosDBClientOptions> = {},
  responder: (call: Recorded) => Response = () =>
    new Response("[]", { status: 200 }),
): { client: CnosDBClient; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetch: FetchLike = (input, init = {}) => {
    const call = { url: toUrl(input), init };
    calls.push(call);
    return Promise.resolve(responder(call));
  };
  const client = new CnosDBClient({
    url: "http://localhost:8902",
    fetch,
    ...options,
  });
  return { client, calls };
}

const pingBody = JSON.stringify({ version: "2.4.3", status: "healthy" });

describe("constructor", () => {
  it("applies documented defaults", async () => {
    const { client, calls } = harness();
    await client.query("SELECT 1");
    const { searchParams } = calls[0]!.url;
    expect(searchParams.get("db")).toBe("public");
    expect(searchParams.get("tenant")).toBe("cnosdb");
    expect(searchParams.get("chunked")).toBe("false");
  });

  it("applies configured database and tenant", async () => {
    const { client, calls } = harness({
      database: "telemetry",
      tenant: "acme",
    });
    await client.query("SELECT 1");
    expect(calls[0]!.url.searchParams.get("db")).toBe("telemetry");
    expect(calls[0]!.url.searchParams.get("tenant")).toBe("acme");
  });

  it("requires an options object", () => {
    expect(() => new CnosDBClient(undefined as never)).toThrow(
      /requires an options object/,
    );
  });

  it("requires a url", () => {
    expect(() => new CnosDBClient({} as never)).toThrow(/`url` is required/);
  });

  it("rejects an invalid url", () => {
    expect(() => new CnosDBClient({ url: "not a url" })).toThrow(
      /absolute URL/,
    );
  });

  it("rejects credentials embedded in the url", () => {
    expect(
      () => new CnosDBClient({ url: "http://root:pw@localhost:8902" }),
    ).toThrow(/must not embed credentials/);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects timeoutMs %s",
    (timeoutMs) => {
      expect(
        () => new CnosDBClient({ url: "http://localhost:8902", timeoutMs }),
      ).toThrow(/greater than zero/);
    },
  );

  it("rejects an empty database", () => {
    expect(
      () => new CnosDBClient({ url: "http://localhost:8902", database: "  " }),
    ).toThrow(/`database` must be a non-empty string/);
  });

  it("rejects an empty tenant", () => {
    expect(
      () => new CnosDBClient({ url: "http://localhost:8902", tenant: "" }),
    ).toThrow(/`tenant` must be a non-empty string/);
  });

  it("rejects an unknown precision", () => {
    expect(
      () =>
        new CnosDBClient({
          url: "http://localhost:8902",
          precision: "s" as never,
        }),
    ).toThrow(/`precision` must be one of/);
  });

  it("rejects a non-string username", () => {
    expect(
      () =>
        new CnosDBClient({
          url: "http://localhost:8902",
          username: 1 as never,
        }),
    ).toThrow(/`username` must be a string/);
  });

  it("rejects a non-string password", () => {
    expect(
      () =>
        new CnosDBClient({
          url: "http://localhost:8902",
          password: 1 as never,
        }),
    ).toThrow(/`password` must be a string/);
  });

  it("sends Basic auth built from username and password", async () => {
    const { client, calls } = harness({ username: "root", password: "secret" });
    await client.query("SELECT 1");
    expect(
      (calls[0]!.init.headers as Record<string, string>)["authorization"],
    ).toBe(`Basic ${Buffer.from("root:secret", "utf8").toString("base64")}`);
  });

  it("supports a username with an empty password", async () => {
    const { client, calls } = harness({ username: "root", password: "" });
    expect(
      (
        await (async () => {
          await client.query("SELECT 1");
          return calls[0]!.init.headers as Record<string, string>;
        })()
      )["authorization"],
    ).toBe("Basic cm9vdDo=");
  });

  it("omits authentication when no credentials are configured", async () => {
    const { client, calls } = harness();
    await client.query("SELECT 1");
    expect(
      (calls[0]!.init.headers as Record<string, string>)["authorization"],
    ).toBeUndefined();
  });

  it("does not expose the password on the instance", () => {
    const { client } = harness({ username: "root", password: "hunter2" });
    const serialized = JSON.stringify(
      client,
      Object.getOwnPropertyNames(client),
    );
    expect(serialized).not.toContain("hunter2");
    expect(Object.keys(client)).toHaveLength(0);
  });
});

describe("ping", () => {
  it("sends GET to the ping endpoint and returns the result", async () => {
    const { client, calls } = harness({}, () => new Response(pingBody));
    await expect(client.ping()).resolves.toEqual({
      version: "2.4.3",
      status: "healthy",
    });
    expect(calls[0]!.init.method).toBe("GET");
    expect(calls[0]!.url.pathname).toBe("/api/v1/ping");
  });

  it("returns only the documented fields", async () => {
    const { client } = harness(
      {},
      () =>
        new Response(
          JSON.stringify({ version: "2.4.3", status: "healthy", extra: 1 }),
        ),
    );
    expect(Object.keys(await client.ping()).sort()).toEqual([
      "status",
      "version",
    ]);
  });

  it.each([
    ["a missing version", JSON.stringify({ status: "healthy" })],
    ["a missing status", JSON.stringify({ version: "2.4.3" })],
    ["a non-string version", JSON.stringify({ version: 1, status: "ok" })],
    ["a non-object payload", JSON.stringify("healthy")],
    ["an empty body", ""],
  ])("rejects %s with CnosDBResponseError", async (_name, body) => {
    const { client } = harness({}, () => new Response(body));
    await expect(client.ping()).rejects.toBeInstanceOf(CnosDBResponseError);
  });

  it("honours a per-request timeout override", async () => {
    const client = new CnosDBClient({
      url: "http://localhost:8902",
      timeoutMs: 60_000,
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    });
    await expect(client.ping({ timeoutMs: 15 })).rejects.toThrow(
      /timed out after 15 ms/,
    );
  });
});

describe("query", () => {
  it("posts the statement unmodified to the SQL endpoint", async () => {
    const { client, calls } = harness();
    const sql = "SELECT time, temperature FROM weather LIMIT 10";
    await client.query(sql);
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.url.pathname).toBe("/api/v1/sql");
    expect(calls[0]!.init.body).toBe(sql);
  });

  it("requests JSON", async () => {
    const { client, calls } = harness();
    await client.query("SELECT 1");
    expect((calls[0]!.init.headers as Record<string, string>)["accept"]).toBe(
      "application/json",
    );
  });

  it("returns the parsed rows under the caller's generic type", async () => {
    interface Row {
      time: string;
      temperature: number;
    }
    const rows: Row[] = [{ time: "2026-07-24T13:33:20", temperature: 24.5 }];
    const { client } = harness({}, () => new Response(JSON.stringify(rows)));
    await expect(client.query<Row[]>("SELECT 1")).resolves.toEqual(rows);
  });

  it("applies per-request database and tenant overrides", async () => {
    const { client, calls } = harness({ database: "a", tenant: "b" });
    await client.query("SELECT 1", { database: "c", tenant: "d" });
    expect(calls[0]!.url.searchParams.get("db")).toBe("c");
    expect(calls[0]!.url.searchParams.get("tenant")).toBe("d");
  });

  it.each([
    ["", "empty"],
    ["   ", "blank"],
  ])("rejects a %s statement without making a request", async (statement) => {
    const { client, calls } = harness();
    await expect(client.query(statement)).rejects.toThrow(/non-empty string/);
    expect(calls).toHaveLength(0);
  });

  it("forwards a caller abort signal", async () => {
    const controller = new AbortController();
    const client = new CnosDBClient({
      url: "http://localhost:8902",
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
          setTimeout(() => {
            controller.abort();
          }, 5);
        }),
    });
    const error = await captureError<CnosDBRequestError>(
      client.query("SELECT 1", { signal: controller.signal }),
    );
    expect(error).toBeInstanceOf(CnosDBRequestError);
    expect(error.code).toBe("ABORT_ERR");
  });
});

describe("execute", () => {
  it("posts to the SQL endpoint and resolves with no value", async () => {
    const { client, calls } = harness(
      {},
      () => new Response("", { status: 200 }),
    );
    await expect(client.execute("CREATE DATABASE t")).resolves.toBeUndefined();
    expect(calls[0]!.url.pathname).toBe("/api/v1/sql");
    expect(calls[0]!.init.body).toBe("CREATE DATABASE t");
  });

  it("succeeds on any 2xx status and ignores the body", async () => {
    const { client } = harness(
      {},
      () => new Response("not json at all", { status: 202 }),
    );
    await expect(client.execute("DROP DATABASE t")).resolves.toBeUndefined();
  });

  it("rejects a blank statement without making a request", async () => {
    const { client, calls } = harness();
    await expect(client.execute("  ")).rejects.toThrow(/non-empty string/);
    expect(calls).toHaveLength(0);
  });

  it("surfaces a server rejection as a typed error", async () => {
    const { client } = harness(
      {},
      () => new Response('{"error_code":"030019"}', { status: 422 }),
    );
    await expect(client.execute("SELECT bogus")).rejects.toBeInstanceOf(
      CnosDBRequestError,
    );
  });
});

describe("writeLineProtocol", () => {
  it("posts the payload verbatim to the write endpoint", async () => {
    const { client, calls } = harness({}, () => new Response(""));
    const line = "weather,city=Pokhara temperature=24.5 1784900000000";
    await client.writeLineProtocol(line, { precision: "ms" });
    expect(calls[0]!.url.pathname).toBe("/api/v1/write");
    expect(calls[0]!.init.body).toBe(line);
    expect(calls[0]!.url.searchParams.get("precision")).toBe("ms");
  });

  it("defaults precision to milliseconds", async () => {
    const { client, calls } = harness({}, () => new Response(""));
    await client.writeLineProtocol("m a=1");
    expect(calls[0]!.url.searchParams.get("precision")).toBe("ms");
  });

  it("uses the client-level precision default when configured", async () => {
    const { client, calls } = harness(
      { precision: "ns" },
      () => new Response(""),
    );
    await client.writeLineProtocol("m a=1");
    expect(calls[0]!.url.searchParams.get("precision")).toBe("ns");
  });

  it("sends a text content type", async () => {
    const { client, calls } = harness({}, () => new Response(""));
    await client.writeLineProtocol("m a=1");
    expect(
      (calls[0]!.init.headers as Record<string, string>)["content-type"],
    ).toMatch(/^text\/plain/);
  });

  it.each([
    ["", "empty"],
    ["   \n ", "whitespace-only"],
  ])("rejects a %s payload without making a request", async (payload) => {
    const { client, calls } = harness();
    await expect(client.writeLineProtocol(payload)).rejects.toThrow(
      /non-empty string/,
    );
    expect(calls).toHaveLength(0);
  });

  it("surfaces HTTP 413 with actionable context", async () => {
    const { client } = harness(
      {},
      () => new Response("too big", { status: 413 }),
    );
    await expect(client.writeLineProtocol("m a=1")).rejects.toThrow(
      /payload is too large/,
    );
  });
});

describe("writePoints", () => {
  it("accepts a single point", async () => {
    const { client, calls } = harness({}, () => new Response(""));
    await client.writePoints({
      measurement: "weather",
      tags: { city: "Pokhara" },
      fields: { temperature: 24.5 },
      timestamp: 1_784_900_000_000,
    });
    expect(calls[0]!.init.body).toBe(
      "weather,city=Pokhara temperature=24.5 1784900000000",
    );
  });

  it("joins a batch with single newlines and preserves order", async () => {
    const { client, calls } = harness({}, () => new Response(""));
    await client.writePoints([
      { measurement: "m", fields: { a: 1 } },
      { measurement: "m", fields: { a: 2 } },
      { measurement: "m", fields: { a: 3 } },
    ]);
    expect(calls[0]!.init.body).toBe("m a=1\nm a=2\nm a=3");
  });

  it("serializes Date timestamps using the effective precision", async () => {
    const { client, calls } = harness({}, () => new Response(""));
    await client.writePoints(
      {
        measurement: "m",
        fields: { a: 1 },
        timestamp: new Date(1_784_900_000_000),
      },
      { precision: "ns" },
    );
    expect(calls[0]!.init.body).toBe("m a=1 1784900000000000000");
    expect(calls[0]!.url.searchParams.get("precision")).toBe("ns");
  });

  it("uses the same write transport as writeLineProtocol", async () => {
    const { client, calls } = harness({}, () => new Response(""));
    await client.writePoints({ measurement: "m", fields: { a: 1 } });
    await client.writeLineProtocol("m a=1");
    expect(calls[0]!.url.href).toBe(calls[1]!.url.href);
    expect(calls[0]!.init.headers).toEqual(calls[1]!.init.headers);
  });

  it("rejects an empty array without making a request", async () => {
    const { client, calls } = harness();
    await expect(client.writePoints([])).rejects.toThrow(/at least one point/);
    expect(calls).toHaveLength(0);
  });

  it("rejects the whole batch when one point is invalid, before requesting", async () => {
    const { client, calls } = harness();
    await expect(
      client.writePoints([
        { measurement: "m", fields: { a: 1 } },
        { measurement: "m", fields: { a: Number.NaN } },
      ]),
    ).rejects.toThrow(/Point at index 1/);
    expect(calls).toHaveLength(0);
  });

  it("reports the failing index for an invalid point", async () => {
    const { client } = harness();
    await expect(
      client.writePoints([
        { measurement: "m", fields: { a: 1 } },
        { measurement: "m", fields: { a: 1 } },
        { measurement: "", fields: { a: 1 } },
      ]),
    ).rejects.toThrow(/Point at index 2/);
  });

  it("applies per-request database overrides", async () => {
    const { client, calls } = harness(
      { database: "a" },
      () => new Response(""),
    );
    await client.writePoints(
      { measurement: "m", fields: { a: 1 } },
      { database: "telemetry" },
    );
    expect(calls[0]!.url.searchParams.get("db")).toBe("telemetry");
  });
});
