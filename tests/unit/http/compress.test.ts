import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { gzipBody } from "../../../src/http/compress.js";
import { headerOf, makeTransport, recordingFetch } from "./helpers.js";

function decompress(body: unknown): string {
  return gunzipSync(body as Uint8Array).toString("utf8");
}

describe("gzipBody", () => {
  it("produces output that gunzips back to the input", async () => {
    const original = "weather,city=Pokhara temperature=24.5 1700000000000";
    expect(decompress(await gzipBody(original))).toBe(original);
  });

  it("round-trips multi-byte characters", async () => {
    const original = "m,city=काठमाडौँ value=1";
    expect(decompress(await gzipBody(original))).toBe(original);
  });

  it("shrinks a repetitive payload substantially", async () => {
    const payload = Array.from(
      { length: 2_000 },
      (_unused, index) => `weather,city=Pokhara temperature=24.5 ${index}`,
    ).join("\n");

    const compressed = await gzipBody(payload);

    expect(compressed.byteLength).toBeLessThan(payload.length / 5);
  });

  it("emits a gzip magic header", async () => {
    const compressed = await gzipBody("m v=1");
    expect(compressed[0]).toBe(0x1f);
    expect(compressed[1]).toBe(0x8b);
  });

  it("handles an empty string", async () => {
    expect(decompress(await gzipBody(""))).toBe("");
  });
});

describe("Transport compression", () => {
  it("sends the body verbatim by default", async () => {
    const { fetch, calls } = recordingFetch();
    const transport = makeTransport(fetch);

    await transport.requestVoid({
      method: "POST",
      path: "api/v1/write",
      body: "m v=1",
    });

    expect(calls[0]!.init.body).toBe("m v=1");
    expect(headerOf(calls[0]!, "content-encoding")).toBeUndefined();
  });

  it("gzips the body and sets the encoding header when asked", async () => {
    const { fetch, calls } = recordingFetch();
    const transport = makeTransport(fetch);

    await transport.requestVoid({
      method: "POST",
      path: "api/v1/write",
      body: "m v=1",
      compression: "gzip",
    });

    expect(headerOf(calls[0]!, "content-encoding")).toBe("gzip");
    expect(decompress(calls[0]!.init.body)).toBe("m v=1");
  });

  it("leaves a bodiless request alone", async () => {
    const { fetch, calls } = recordingFetch();
    const transport = makeTransport(fetch);

    await transport.requestVoid({
      method: "GET",
      path: "api/v1/ping",
      compression: "gzip",
    });

    expect(calls[0]!.init.body).toBeUndefined();
    // Declaring an encoding for a body that does not exist would be a lie the
    // server could reasonably reject.
    expect(headerOf(calls[0]!, "content-encoding")).toBeUndefined();
  });

  it("keeps content-type alongside the encoding", async () => {
    const { fetch, calls } = recordingFetch();
    const transport = makeTransport(fetch);

    await transport.requestVoid({
      method: "POST",
      path: "api/v1/write",
      body: "m v=1",
      contentType: "text/plain; charset=utf-8",
      compression: "gzip",
    });

    expect(headerOf(calls[0]!, "content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(headerOf(calls[0]!, "content-encoding")).toBe("gzip");
  });
});
