import { describe, expect, it } from "vitest";

import { CnosDBClient } from "../../../src/client/index.js";
import { CnosDBServerError } from "../../../src/errors/index.js";
import type { FetchLike, RetryOptions } from "../../../src/types/index.js";
import { captureError } from "../../helpers.js";

const RETRY: RetryOptions = {
  attempts: 3,
  backoff: { initialMs: 1, maxMs: 2, jitter: false },
};

/** Fails every call with 503, counting how many times it was asked. */
function countingFetch(): { fetch: FetchLike; count: () => number } {
  let calls = 0;
  const fetch: FetchLike = () => {
    calls += 1;
    return Promise.resolve(new Response("{}", { status: 503 }));
  };
  return { fetch, count: () => calls };
}

function makeClient(
  fetch: FetchLike,
  retry: RetryOptions | "none" = RETRY,
): CnosDBClient {
  return new CnosDBClient({
    url: "http://localhost:8902",
    fetch,
    ...(retry === "none" ? {} : { retry }),
  });
}

describe("client retry policy", () => {
  it("is off by default", async () => {
    const { fetch, count } = countingFetch();
    await captureError(makeClient(fetch, "none").ping());
    expect(count()).toBe(1);
  });

  it.each([
    ["ping", (c: CnosDBClient) => c.ping()],
    ["query", (c: CnosDBClient) => c.query("SELECT 1")],
    ["queryTable", (c: CnosDBClient) => c.queryTable("SELECT 1")],
  ])("retries %s", async (_label, call) => {
    const { fetch, count } = countingFetch();
    const error = await captureError(call(makeClient(fetch)));
    expect(error).toBeInstanceOf(CnosDBServerError);
    expect(count()).toBe(3);
  });

  it("never retries execute, which exists for statements with effects", async () => {
    const { fetch, count } = countingFetch();
    await captureError(makeClient(fetch).execute("DROP DATABASE d"));
    expect(count()).toBe(1);
  });

  it.each([
    ["writeLineProtocol", (c: CnosDBClient) => c.writeLineProtocol("m v=1")],
    [
      "writePoints",
      (c: CnosDBClient) =>
        c.writePoints({ measurement: "m", fields: { v: 1 } }),
    ],
  ])("does not retry %s without retryWrites", async (_label, call) => {
    const { fetch, count } = countingFetch();
    await captureError(call(makeClient(fetch)));
    expect(count()).toBe(1);
  });

  it("retries writes once the caller accepts the duplication risk", async () => {
    const { fetch, count } = countingFetch();
    const client = makeClient(fetch, { ...RETRY, retryWrites: true });
    await captureError(client.writeLineProtocol("m v=1"));
    expect(count()).toBe(3);
  });

  it("rejects an invalid policy at construction, not at first use", () => {
    expect(
      () =>
        new CnosDBClient({
          url: "http://localhost:8902",
          retry: { attempts: 0 },
        }),
    ).toThrow(/retry.attempts/);
  });
});
