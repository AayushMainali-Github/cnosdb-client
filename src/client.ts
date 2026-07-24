import { CnosDBResponseError } from "./errors.js";
import {
  createAuthorizationHeader,
  normalizeBaseUrl,
  Transport,
} from "./http.js";
import { serializePoints } from "./line-protocol.js";
import type {
  CnosDBClientOptions,
  Point,
  PingResult,
  QueryOptions,
  RequestOptions,
  TimePrecision,
  WriteOptions,
} from "./types/index.js";

const DEFAULT_DATABASE = "public";
const DEFAULT_TENANT = "cnosdb";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_PRECISION: TimePrecision = "ms";
const PRECISIONS: readonly TimePrecision[] = ["ms", "us", "ns"];

const PING_PATH = "api/v1/ping";
const SQL_PATH = "api/v1/sql";
const WRITE_PATH = "api/v1/write";

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

    assertNonEmpty("database", database);
    assertNonEmpty("tenant", tenant);
    assertPrecision(precision);

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
    this.#transport = new Transport({
      baseUrl,
      authorization: createAuthorizationHeader(
        options.username,
        options.password,
      ),
      timeoutMs,
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
      ...requestControls(options),
    });
  }

  #resolvePrecision(options: WriteOptions): TimePrecision {
    const precision = options.precision ?? this.#precision;
    assertPrecision(precision);
    return precision;
  }

  #sqlParams(options: QueryOptions): Record<string, string> {
    return {
      db: options.database ?? this.#database,
      tenant: options.tenant ?? this.#tenant,
      chunked: "false",
    };
  }
}

function requestControls(
  options: RequestOptions,
): Pick<{ signal?: AbortSignal; timeoutMs?: number }, "signal" | "timeoutMs"> {
  return {
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeoutMs === undefined
      ? {}
      : { timeoutMs: options.timeoutMs }),
  };
}

function requireStatement(statement: string): string {
  if (typeof statement !== "string" || statement.trim().length === 0) {
    throw new TypeError("SQL statement must be a non-empty string.");
  }
  return statement;
}

function assertNonEmpty(name: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(
      `CnosDB client option \`${name}\` must be a non-empty string.`,
    );
  }
}

function assertOptionalString(name: string, value: unknown): void {
  if (value !== undefined && typeof value !== "string") {
    throw new TypeError(
      `CnosDB client option \`${name}\` must be a string when provided.`,
    );
  }
}

function assertPrecision(
  precision: unknown,
): asserts precision is TimePrecision {
  if (!PRECISIONS.includes(precision as TimePrecision)) {
    throw new TypeError(
      `\`precision\` must be one of ${PRECISIONS.join(", ")}; ` +
        `received ${String(precision)}.`,
    );
  }
}
