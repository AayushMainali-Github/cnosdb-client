import { describe, expect, it } from "vitest";

import { CnosDBClient } from "../../../src/client/index.js";
import { CnosDBRequestError } from "../../../src/errors/index.js";
import type { FetchLike } from "../../../src/types/index.js";
import { captureError, toUrl } from "../../helpers.js";

function streamResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

function recordingStreamFetch(body: string): {
  fetch: FetchLike;
  urls: URL[];
  inits: RequestInit[];
} {
  const urls: URL[] = [];
  const inits: RequestInit[] = [];
  const fetch: FetchLike = (input, init = {}) => {
    urls.push(toUrl(input));
    inits.push(init);
    return Promise.resolve(streamResponse(body));
  };
  return { fetch, urls, inits };
}

describe("queryStream", () => {
  it("requests chunked=true and yields each row", async () => {
    const { fetch, urls } = recordingStreamFetch('[{"v":1},{"v":2}][{"v":3}]');
    const client = new CnosDBClient({
      url: "http://localhost:8902",
      fetch,
    });

    const rows: unknown[] = [];
    for await (const row of client.queryStream<{ v: number }>(
      "SELECT v FROM m",
    )) {
      rows.push(row);
    }

    expect(rows).toStrictEqual([{ v: 1 }, { v: 2 }, { v: 3 }]);
    expect(urls[0]!.searchParams.get("chunked")).toBe("true");
  });

  it("leaves query() on chunked=false", async () => {
    const { fetch, urls } = recordingStreamFetch("[]");
    const client = new CnosDBClient({
      url: "http://localhost:8902",
      fetch,
    });
    await client.query("SELECT 1");
    expect(urls[0]!.searchParams.get("chunked")).toBe("false");
  });

  it("yields nothing for an empty result", async () => {
    const { fetch } = recordingStreamFetch("");
    const client = new CnosDBClient({
      url: "http://localhost:8902",
      fetch,
    });
    const rows: unknown[] = [];
    for await (const row of client.queryStream("SELECT * FROM empty")) {
      rows.push(row);
    }
    expect(rows).toStrictEqual([]);
  });

  it("surfaces a rejected statement before any row is yielded", async () => {
    const fetch: FetchLike = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error_code: "030019",
            error_message: 'Table not found: "nope"',
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
      );
    const client = new CnosDBClient({
      url: "http://localhost:8902",
      fetch,
    });
    const error = await captureError(
      (async () => {
        for await (const _row of client.queryStream("SELECT * FROM nope")) {
          // Should not run.
        }
      })(),
    );
    expect(error).toBeInstanceOf(CnosDBRequestError);
  });

  it("cancels the body when the caller aborts mid-stream", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('[{"v":1},{"v":2},{"v":3}]'),
        );
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetch: FetchLike = () =>
      Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const client = new CnosDBClient({
      url: "http://localhost:8902",
      fetch,
    });
    const controller = new AbortController();

    const rows: unknown[] = [];
    for await (const row of client.queryStream("SELECT v FROM m", {
      signal: controller.signal,
    })) {
      rows.push(row);
      controller.abort(new Error("enough"));
      break;
    }

    expect(rows).toStrictEqual([{ v: 1 }]);
    // Give the cancel listener a turn; Response body cancellation is async.
    await Promise.resolve();
    expect(cancelled).toBe(true);
  });
});
