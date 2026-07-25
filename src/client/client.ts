import { CnosDBResponseError } from "../errors/index.js";
import {
  createAuthorizationHeader,
  normalizeBaseUrl,
  normalizeHeaders,
  Transport,
} from "../http/index.js";
import { serializePoints } from "../line-protocol/index.js";
import { parseCsv } from "../csv/index.js";
import type {
  CnosDBClientOptions,
  Compression,
  Point,
  PingResult,
  QueryOptions,
  QueryTable,
  RequestOptions,
  TimePrecision,
  WriteOptions,
} from "../types/index.js";
import { requestControls } from "./controls.js";
import {
  DEFAULT_COMPRESSION,
  DEFAULT_DATABASE,
  DEFAULT_PRECISION,
  DEFAULT_TENANT,
  DEFAULT_TIMEOUT_MS,
  PING_PATH,
  SQL_PATH,
  WRITE_PATH,
} from "./defaults.js";
import {
  assertCompression,
  assertNonEmpty,
  assertOptionalString,
  assertPrecision,
  requireStatement,
} from "./validate.js";

/**
 * A client for the CnosDB HTTP API.
 *
 * Instances are cheap, stateless beyond configuration, and safe to share
 * across concurrent requests.
 *
 * @example
 * ```ts
 * const client = new CnosDBClient({
 *   url: "http://localhost:8902",
 *   username: "root",
 *   password: "",
 * });
 *
 * const health = await client.ping();
 * ```
 */
export class CnosDBClient {
  readonly #transport: Transport;
  readonly #database: string;
  readonly #tenant: string;
  readonly #precision: TimePrecision;
  readonly #compression: Compression;

  constructor(options: CnosDBClientOptions) {
    // Runtime guards throughout the constructor protect JavaScript callers,
    // for whom the TypeScript signatures are not enforced.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof options !== "object" || options === null) {
      throw new TypeError("CnosDBClient requires an options object.");
    }

    const baseUrl = normalizeBaseUrl(options.url);
    const database = options.database ?? DEFAULT_DATABASE;
    const tenant = options.tenant ?? DEFAULT_TENANT;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const precision = options.precision ?? DEFAULT_PRECISION;
    const compression = options.compression ?? DEFAULT_COMPRESSION;

    assertNonEmpty("database", database);
    assertNonEmpty("tenant", tenant);
    assertPrecision(precision);
    assertCompression(compression);

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError(
        `CnosDB client option \`timeoutMs\` must be a finite number greater ` +
          `than zero; received ${String(timeoutMs)}.`,
      );
    }

    assertOptionalString("username", options.username);
    assertOptionalString("password", options.password);

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new TypeError(
        "No fetch implementation is available. Use Node.js 22.14.0 or newer, " +
          "or supply the `fetch` option.",
      );
    }

    this.#database = database;
    this.#tenant = tenant;
    this.#precision = precision;
    this.#compression = compression;
    this.#transport = new Transport({
      baseUrl,
      authorization: createAuthorizationHeader(
        options.username,
        options.password,
      ),
      timeoutMs,
      headers: normalizeHeaders(options.headers, "headers"),
      // Bind so that a supplied global `fetch` keeps its expected receiver.
      fetch: fetchImpl.bind(globalThis),
    });
  }

  /**
   * Checks server health.
   *
   * @throws CnosDBResponseError when the payload is not a valid ping result.
   */
  async ping(options: RequestOptions = {}): Promise<PingResult> {
    const payload = await this.#transport.requestJson<unknown>({
      method: "GET",
      path: PING_PATH,
      accept: "application/json",
      ...requestControls(options),
    });

    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as PingResult).version !== "string" ||
      typeof (payload as PingResult).status !== "string"
    ) {
      throw new CnosDBResponseError(
        "CnosDB ping response did not contain string `version` and `status` " +
          "fields.",
        { method: "GET", path: `/${PING_PATH}` },
      );
    }

    const { version, status } = payload as PingResult;
    return { version, status };
  }

  /**
   * Executes a SQL statement and returns the decoded JSON result.
   *
   * `T` is a caller assertion about the response shape. This method performs
   * no runtime schema validation; validate the result yourself if the data is
   * untrusted.
   *
   * Statements that produce no rows (for example DDL) resolve to `undefined`
   * cast to `T`; prefer {@link CnosDBClient.execute} for those.
   */
  async query<T = unknown>(
    statement: string,
    options: QueryOptions = {},
  ): Promise<T> {
    const sql = requireStatement(statement);
    const result = await this.#transport.requestJson<T>({
      method: "POST",
      path: SQL_PATH,
      searchParams: this.#sqlParams(options),
      body: sql,
      contentType: "text/plain; charset=utf-8",
      accept: "application/json",
      ...requestControls(options),
    });
    return result as T;
  }

  /**
   * Executes a SQL statement and returns its columns alongside raw row values.
   *
   * Use this when the columns matter: rendering a table, exporting data, or
   * running a statement whose shape is not known in advance. It asks CnosDB
   * for CSV, which is the only response format that carries the column names
   * and their order; the JSON format sorts keys alphabetically and omits any
   * column that is NULL for a given row.
   *
   * Values are returned as raw strings, because CnosDB sends no column types
   * over HTTP. See {@link QueryTable} for what that implies.
   */
  async queryTable(
    statement: string,
    options: QueryOptions = {},
  ): Promise<QueryTable> {
    const sql = requireStatement(statement);
    const body = await this.#transport.requestText({
      method: "POST",
      path: SQL_PATH,
      searchParams: this.#sqlParams(options),
      body: sql,
      contentType: "text/plain; charset=utf-8",
      accept: "application/csv",
      ...requestControls(options),
    });

    const parsed = parseCsv(body);
    // A statement with no result set at all, such as DDL, returns an empty
    // body rather than a header row.
    const [columns, ...rows] = parsed;
    return { columns: columns ?? [], rows };
  }

  /**
   * Executes a SQL statement whose result rows are not needed, such as DDL.
   * Any 2xx response counts as success and the body is discarded.
   */
  async execute(statement: string, options: QueryOptions = {}): Promise<void> {
    const sql = requireStatement(statement);
    await this.#transport.requestVoid({
      method: "POST",
      path: SQL_PATH,
      searchParams: this.#sqlParams(options),
      body: sql,
      contentType: "text/plain; charset=utf-8",
      accept: "application/json",
      ...requestControls(options),
    });
  }

  /**
   * Writes a raw Line Protocol payload.
   *
   * The payload is sent verbatim: it is neither validated, split, nor retried.
   */
  async writeLineProtocol(
    data: string,
    options: WriteOptions = {},
  ): Promise<void> {
    if (typeof data !== "string" || data.trim().length === 0) {
      throw new TypeError("Line Protocol payload must be a non-empty string.");
    }
    await this.#write(data, options);
  }

  /**
   * Serializes and writes one or more structured points.
   *
   * Every point is serialized before any request is made, so an invalid point
   * rejects without writing a partial batch.
   */
  async writePoints(
    points: Point | readonly Point[],
    options: WriteOptions = {},
  ): Promise<void> {
    const batch = Array.isArray(points)
      ? (points as readonly Point[])
      : [points as Point];

    if (batch.length === 0) {
      throw new TypeError("writePoints requires at least one point.");
    }

    const precision = this.#resolvePrecision(options);
    const payload = serializePoints(batch, precision);
    await this.#write(payload, { ...options, precision });
  }

  async #write(payload: string, options: WriteOptions): Promise<void> {
    await this.#transport.requestVoid({
      method: "POST",
      path: WRITE_PATH,
      searchParams: {
        db: options.database ?? this.#database,
        tenant: options.tenant ?? this.#tenant,
        precision: this.#resolvePrecision(options),
      },
      body: payload,
      contentType: "text/plain; charset=utf-8",
      accept: "application/json",
      compression: this.#resolveCompression(options),
      ...requestControls(options),
    });
  }

  #resolvePrecision(options: WriteOptions): TimePrecision {
    const precision = options.precision ?? this.#precision;
    assertPrecision(precision);
    return precision;
  }

  #resolveCompression(options: WriteOptions): Compression {
    const compression = options.compression ?? this.#compression;
    assertCompression(compression);
    return compression;
  }

  #sqlParams(options: QueryOptions): Record<string, string> {
    return {
      db: options.database ?? this.#database,
      tenant: options.tenant ?? this.#tenant,
      chunked: "false",
    };
  }
}
