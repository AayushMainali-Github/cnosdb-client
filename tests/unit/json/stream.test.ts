import { describe, expect, it } from "vitest";

import { CnosDBResponseError } from "../../../src/errors/index.js";
import { iterateJsonArrayStream } from "../../../src/json/stream.js";
import { captureError } from "../../helpers.js";

const CONTEXT = { method: "POST", path: "/api/v1/sql" };

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const rows: unknown[] = [];
  for await (const row of iterateJsonArrayStream(stream, CONTEXT)) {
    rows.push(row);
  }
  return rows;
}

describe("iterateJsonArrayStream", () => {
  it("yields rows from a single array", async () => {
    expect(await collect(streamOf('[{"a":1},{"a":2}]'))).toStrictEqual([
      { a: 1 },
      { a: 2 },
    ]);
  });

  it("yields rows across concatenated arrays with no separator", async () => {
    expect(
      await collect(streamOf('[{"a":1},{"a":2}][{"a":3}][][{"a":4}]')),
    ).toStrictEqual([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);
  });

  it("reassembles an array split across chunk boundaries", async () => {
    expect(
      await collect(streamOf('[{"a":', '1},{"a":2}', '][{"b":', '"x"}]')),
    ).toStrictEqual([{ a: 1 }, { a: 2 }, { b: "x" }]);
  });

  it("does not treat brackets inside strings as structure", async () => {
    expect(
      await collect(streamOf('[{"s":"a]b[c"},{"s":"{\\"x\\":1}"}]')),
    ).toStrictEqual([{ s: "a]b[c" }, { s: '{"x":1}' }]);
  });

  it("yields nothing for an empty body", async () => {
    expect(await collect(streamOf())).toStrictEqual([]);
  });

  it("yields nothing for whitespace-only input", async () => {
    expect(await collect(streamOf("  \n\t  "))).toStrictEqual([]);
  });

  it("rejects a truncated array at end of stream", async () => {
    const error = await captureError(collect(streamOf('[{"a":1}')));
    expect(error).toBeInstanceOf(CnosDBResponseError);
    expect(error.message).toMatch(/truncated or malformed/);
  });

  it("rejects a top-level object", async () => {
    const error = await captureError(collect(streamOf('{"a":1}')));
    expect(error).toBeInstanceOf(CnosDBResponseError);
    expect(error.message).toMatch(/expected a JSON array/);
  });

  it("rejects invalid JSON once a complete value is available", async () => {
    const error = await captureError(collect(streamOf("[1,]")));
    expect(error).toBeInstanceOf(CnosDBResponseError);
    expect(error.message).toMatch(/not valid JSON/);
  });

  it("cancels the underlying reader when the consumer stops early", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('[{"a":1},{"a":2}][{"a":3}]'),
        );
      },
      cancel() {
        cancelled = true;
      },
    });

    const iterator = iterateJsonArrayStream(stream, CONTEXT);
    expect((await iterator.next()).value).toStrictEqual({ a: 1 });
    await iterator.return(undefined);
    expect(cancelled).toBe(true);
  });
});
