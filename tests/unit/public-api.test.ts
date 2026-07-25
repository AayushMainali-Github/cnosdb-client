import { describe, expect, it } from "vitest";

import * as publicApi from "../../src/index.js";
import type {
  BackoffOptions,
  CnosDBClientOptions,
  CnosDBErrorOptions,
  Compression,
  FetchLike,
  PingResult,
  Point,
  PointFieldValue,
  QueryOptions,
  QueryTable,
  RequestOptions,
  RetryOptions,
  SplitOptions,
  SqlValue,
  TimePrecision,
  WriteOptions,
} from "../../src/index.js";

/**
 * The published surface is a compatibility promise, and internal restructuring
 * must never change it. Asserting the exact export set turns an accidental
 * addition or removal into a failing test rather than a surprise in a release.
 */
const EXPECTED_RUNTIME_EXPORTS = [
  "CnosDBAuthenticationError",
  "CnosDBClient",
  "CnosDBError",
  "CnosDBNetworkError",
  "CnosDBRateLimitError",
  "CnosDBRequestError",
  "CnosDBResponseError",
  "CnosDBServerError",
  "CnosDBTimeoutError",
  "serializePoint",
  "splitPoints",
  "sql",
] as const;

describe("public API surface", () => {
  it("exports exactly the documented runtime members", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      ...EXPECTED_RUNTIME_EXPORTS,
    ]);
  });

  it("exports the client as a constructor and the helpers as functions", () => {
    expect(typeof publicApi.CnosDBClient).toBe("function");
    expect(typeof publicApi.serializePoint).toBe("function");
    expect(typeof publicApi.splitPoints).toBe("function");
    expect(typeof publicApi.sql).toBe("function");
  });

  it("preserves the error hierarchy", () => {
    const subclasses = [
      publicApi.CnosDBAuthenticationError,
      publicApi.CnosDBNetworkError,
      publicApi.CnosDBRateLimitError,
      publicApi.CnosDBRequestError,
      publicApi.CnosDBResponseError,
      publicApi.CnosDBServerError,
      publicApi.CnosDBTimeoutError,
    ];

    for (const subclass of subclasses) {
      expect(Object.create(subclass.prototype)).toBeInstanceOf(
        publicApi.CnosDBError,
      );
    }

    expect(Object.create(publicApi.CnosDBError.prototype)).toBeInstanceOf(
      Error,
    );
  });

  it("keeps every public type importable from the entry point", () => {
    // Compilation is the assertion: each alias fails typecheck if a type stops
    // being exported or changes shape incompatibly.
    const precision: TimePrecision = "ms";
    const compression: Compression = "gzip";
    const fetchLike: FetchLike = () => Promise.resolve(new Response());
    const backoff: BackoffOptions = { initialMs: 10, maxMs: 20, jitter: false };
    const retry: RetryOptions = { attempts: 2, backoff, retryWrites: false };
    const clientOptions: CnosDBClientOptions = {
      url: "http://localhost:8902",
      precision,
      compression,
      retry,
      headers: { "x-api-key": "k" },
      fetch: fetchLike,
    };
    const requestOptions: RequestOptions = { timeoutMs: 1_000 };
    const queryOptions: QueryOptions = { ...requestOptions, database: "db" };
    const writeOptions: WriteOptions = {
      ...queryOptions,
      precision,
      compression,
    };
    const table: QueryTable = { columns: ["a"], rows: [["1"]] };
    const splitOptions: SplitOptions = { maxBytes: 1_000, precision };
    const sqlValue: SqlValue = "site-1";
    const fieldValue: PointFieldValue = 1;
    const point: Point = {
      measurement: "m",
      fields: { value: fieldValue },
    };
    const ping: PingResult = { version: "2.4.0", status: "healthy" };
    const errorOptions: CnosDBErrorOptions = { cause: new Error("boom") };

    expect(clientOptions.url).toBe("http://localhost:8902");
    expect(writeOptions.precision).toBe("ms");
    expect(table.columns).toEqual(["a"]);
    expect(splitOptions.maxBytes).toBe(1_000);
    expect(sqlValue).toBe("site-1");
    expect(retry.attempts).toBe(2);
    expect(point.measurement).toBe("m");
    expect(ping.status).toBe("healthy");
    expect(errorOptions.cause).toBeInstanceOf(Error);
  });
});
