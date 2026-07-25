# cnosdb-client

[![npm version](https://img.shields.io/npm/v/cnosdb-client.svg)](https://www.npmjs.com/package/cnosdb-client)
[![CI](https://github.com/AayushMainali-Github/cnosdb-client/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/AayushMainali-Github/cnosdb-client/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/node/v/cnosdb-client.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A small, dependency-free TypeScript client for the CnosDB HTTP API.

> **Unofficial project:** `cnosdb-client` is an independent, community-maintained client. It is not affiliated with, endorsed by, or maintained by the CnosDB project.

## Features

- Health checks, SQL queries, SQL execution, and time-series writes.
- Deterministic Line Protocol serialization from plain JavaScript objects.
- A `sql` tagged template that escapes interpolated values as SQL literals.
- Typed errors for authentication, rate limiting, timeouts, network failures, and malformed responses.
- Per-client and per-request timeouts, plus `AbortSignal` cancellation.
- Opt-in retries with jittered backoff, off by default and never retrying a write unless you say so.
- Streaming queries that yield rows as they arrive, so large results do not have to fit in memory.
- Zero runtime dependencies; built on the platform `fetch`.
- Ships ESM, CommonJS, and strict TypeScript declarations with source maps.
- No import-time side effects, so unused exports tree-shake away.

## Installation

```bash
npm install cnosdb-client
```

## Requirements

- Node.js 22.14.0 or newer.
- A reachable CnosDB server exposing the HTTP API (port `8902` by default).

## Quick start

```ts
import { CnosDBClient } from "cnosdb-client";

const client = new CnosDBClient({
  url: "http://localhost:8902",
  username: "root",
  password: "",
  database: "public",
  tenant: "cnosdb",
});

// 1. Confirm the server is reachable.
const health = await client.ping();
console.log(health.version, health.status);

// 2. Create somewhere to put the data.
await client.execute("CREATE DATABASE IF NOT EXISTS telemetry");

// 3. Write a point.
await client.writePoints(
  {
    measurement: "weather",
    tags: { city: "Pokhara" },
    fields: { temperature: 24.5, humidity: 68 },
    timestamp: new Date(),
  },
  { database: "telemetry" },
);

// 4. Read it back.
type Row = { time: string; temperature: number };

const rows = await client.query<Row[]>(
  "SELECT time, temperature FROM weather ORDER BY time DESC LIMIT 10",
  { database: "telemetry" },
);

console.log(rows);
```

## Configuration

| Option        | Type                    | Default    | Description                            |
| ------------- | ----------------------- | ---------- | -------------------------------------- |
| `url`         | `string`                | _required_ | Absolute `http:` or `https:` base URL. |
| `username`    | `string`                | —          | Basic-auth username.                   |
| `password`    | `string`                | —          | Basic-auth password; may be empty.     |
| `database`    | `string`                | `"public"` | Default database.                      |
| `tenant`      | `string`                | `"cnosdb"` | Default tenant.                        |
| `timeoutMs`   | `number`                | `10000`    | Timeout for a single attempt.          |
| `retry`       | `RetryOptions`          | —          | Retry policy; off unless supplied.     |
| `precision`   | `"ms" \| "us" \| "ns"`  | `"ms"`     | Default write precision.               |
| `compression` | `"none" \| "gzip"`      | `"none"`   | Compression for write payloads.        |
| `headers`     | `Record<string,string>` | —          | Extra headers sent with every request. |
| `fetch`       | `FetchLike`             | global     | Injectable fetch, mainly for tests.    |

The constructor rejects a relative URL, a non-HTTP protocol, a URL fragment,
and a URL with embedded credentials. A base path is preserved, so
`https://example.com/cnosdb` sends requests to
`https://example.com/cnosdb/api/v1/sql`.

Authentication is sent only when `username` or `password` is supplied. A
missing counterpart is treated as an empty string, matching CnosDB's common
`root` with an empty password setup.

## Compressing writes

Line Protocol compresses extremely well, so gzip is worth enabling for sizeable
batches on metered, slow, or cross-region links. It is opt-in, because it
changes the request shape and depends on server support.

```ts
const client = new CnosDBClient({ url, compression: "gzip" });

await client.writePoints(largeBatch);
await client.writePoints(tinyBatch, { compression: "none" });
```

Only write payloads are compressed. SQL statements are left alone because they
are small enough that gzip's overhead usually makes them bigger.

Compression is all-or-nothing rather than applied above some size threshold, so
what goes on the wire is always predictable from the option you set. A wrong
guess is cheap: CnosDB rejects a malformed encoding with a clear error rather
than storing anything, so a mismatch fails loudly instead of corrupting data.

## Custom headers

Deployments behind a gateway or proxy often need an extra header. Supply
`headers` on the client for every request, and on any single call to add to or
override them for that request only.

```ts
const client = new CnosDBClient({
  url: "https://cnosdb.internal",
  headers: { "x-api-key": process.env.GATEWAY_KEY! },
});

await client.query("SELECT 1", { headers: { "x-request-id": requestId } });
```

Header names are case-insensitive and are matched in lowercase. The client owns
`authorization`, `content-type`, and `accept`: supplying any of them raises a
`TypeError` rather than being ignored, so a misunderstanding surfaces at the
call site instead of producing a request that quietly behaves differently. A
value containing a line break is rejected for the same reason.

## Health check

```ts
const health = await client.ping();
// { version: "2.4.3, revision: …", status: "healthy" }
```

A response missing string `version` and `status` fields raises
`CnosDBResponseError`.

## Querying

```ts
interface WeatherRow {
  time: string;
  temperature: number;
}

const result = await client.query<WeatherRow[]>(
  "SELECT time, temperature FROM weather LIMIT 10",
);
```

`T` is a **caller assertion, not runtime validation**. The client parses JSON
and returns it under the type you name; it never checks that the data matches.
Validate untrusted results yourself.

The statement is sent verbatim. The client does not rewrite, interpolate, or
retry it. Statements that return no rows (such as DDL) resolve to `undefined`;
use `execute()` for those.

## Streaming query results

`query()` buffers the entire response before returning. For a result that would
not fit comfortably in memory, `queryStream()` yields rows as they arrive:

```ts
for await (const row of client.queryStream<WeatherRow>(
  "SELECT time, temperature FROM weather",
)) {
  process(row);
}
```

It asks CnosDB for `chunked=true`. The server replies with successive JSON
arrays written back to back (about 500 rows each on current builds); the client
parses each array and yields its elements, so memory stays proportional to one
batch rather than the whole result.

Row shape matches `query()`: JSON objects with keys sorted alphabetically and
NULL columns omitted. Prefer `queryTable()` when column order or NULL presence
matters and the result fits in memory.

If the stream fails after some rows have already been yielded, the iterator
throws and those rows stay consumed — you are looking at a partial result. SQL
errors still arrive as an HTTP error before any row is sent. Breaking out of
the loop, or aborting `options.signal`, cancels the underlying response so the
connection is not left half-read.

## Escaping SQL values

CnosDB's HTTP API has no bound parameters. If a value comes from outside your
code, build the statement with `sql` so the value is encoded as a literal
rather than concatenated by hand:

```ts
import { sql } from "cnosdb-client";

const site = "pokhara";
const rows = await client.query(
  sql`SELECT * FROM sensors WHERE site = ${site} AND active = ${true}`,
);
```

Only interpolated values are touched. Identifiers, keywords, and clause
structure stay in the literal parts of the template — passing a table name
through a hole produces a quoted string, not an identifier.

| Value                                            | Encoded as                      |
| ------------------------------------------------ | ------------------------------- |
| `null`                                           | `NULL`                          |
| `boolean`                                        | `true` / `false`                |
| finite `number` / `bigint`                       | decimal literal                 |
| `string`                                         | `'…'` with every `'` doubled    |
| `Date`                                           | `TIMESTAMP '…'` in UTC ISO-8601 |
| anything else, `NaN`, `Infinity`, invalid `Date` | throws `TypeError`              |

CnosDB string literals use SQL-standard quoting: a single quote is escaped by
doubling it. Backslash is not an escape, so `sql` does not treat it as one.

## Querying with column metadata

`query()` returns JSON objects, which is convenient but loses two things: CnosDB
sorts the keys alphabetically rather than by the order you selected, and it
**omits any column that is NULL for that row**, so row objects can differ in
shape from one row to the next.

`queryTable()` asks for CSV instead, the only format that carries column names
and their order:

```ts
const { columns, rows } = await client.queryTable(
  "SELECT v, city FROM weather",
);
// columns: ["v", "city"]        — the order you asked for
// rows:    [["1.5", "Pokhara"]] — always one value per column
```

Every row has exactly one value per column, so a NULL stays visible as an empty
string rather than vanishing.

On CnosDB 2.4.3 the columns are reported even when no rows match, so an empty
result can still be rendered with its headings. Do not rely on that below 2.4.3:
2.4.1 returns an empty body for an empty result, and `columns` is then also
empty. `rows` is empty either way.

Values are raw strings. CnosDB sends no column types over HTTP in any response
format, so converting them would mean guessing, and a wrong guess on a large
integer or a timestamp is worse than an honest string. Convert what you need at
the call site.

One ambiguity is unavoidable: CnosDB renders both NULL and an empty string as an
empty field, so the two cannot be told apart in a `queryTable()` result.

## Executing SQL

```ts
await client.execute("CREATE DATABASE IF NOT EXISTS telemetry");
```

Any 2xx response counts as success and the response body is discarded.

## Writing raw Line Protocol

```ts
await client.writeLineProtocol(
  "weather,city=Pokhara temperature=24.5 1784900000000",
  { database: "telemetry", precision: "ms" },
);
```

The payload is sent exactly as given. The client never splits a batch, dedupes
points, or retries a write.

## Writing structured points

```ts
await client.writePoints(
  [
    {
      measurement: "weather",
      tags: { city: "Pokhara", sensor: "outdoor-1" },
      fields: {
        temperature: 24.5,
        humidity: 68,
        active: true,
        observations: 12n,
        condition: "cloudy",
      },
      timestamp: new Date(),
    },
  ],
  { database: "telemetry", precision: "ms" },
);
```

Every point is serialized before any request is sent, so an invalid point
rejects the whole call without writing a partial batch.

## Splitting large batches

`writePoints()` always sends one request, however many points you give it. For
a batch large enough to hit a server limit, `splitPoints()` cuts it into
payloads of a chosen size:

```ts
import { splitPoints } from "cnosdb-client";

for (const chunk of splitPoints(points, { maxBytes: 1_000_000 })) {
  await client.writeLineProtocol(chunk);
}
```

Sizing is by encoded UTF-8 bytes, not point count, because points vary
enormously in encoded length and server limits are measured in bytes. The
newlines between lines are counted too, so a payload that fits here fits on the
wire.

There is no default size and nothing splits unless you ask, so existing writes
behave exactly as before. A single point larger than `maxBytes` throws a
`RangeError` naming its index and size, rather than emitting a payload that
breaks the limit you asked for.

The loop stays in your code on purpose. If the seventh chunk fails, the first
six are already written, and only you can decide what that means for your data.
Hiding the loop inside a write would turn one call into many requests and make
partial success invisible.

## Point value and timestamp rules

`serializePoint()` is a pure, deterministic function you can use directly:

```ts
import { serializePoint } from "cnosdb-client";

serializePoint({ measurement: "weather", fields: { temperature: 24.5 } });
// "weather temperature=24.5"
```

Serialization rules:

- Tag keys and field keys are sorted lexicographically, so equal points always produce identical lines.
- Measurements, tag keys, tag values, and field keys escape commas, spaces, and equals signs.
- String field values are quoted; embedded `"` and `\` are escaped.
- `boolean` becomes `true` / `false`.
- `number` becomes a Line Protocol float. `NaN` and infinities are rejected.
- `bigint` becomes a Line Protocol signed integer with the `i` suffix (`18n` → `18i`).
- `null`, `undefined`, objects, and symbols are rejected at runtime.
- Newlines and carriage returns are rejected everywhere they cannot be represented.
- No trailing newline is appended.

Timestamp rules:

- Omit `timestamp` to let the server assign the write time.
- A `Date` is converted using the effective precision: `ms` as-is, `us` × 1,000, `ns` × 1,000,000. The multiplication uses `bigint`, so nanoseconds stay exact.
- A `number` must be a safe integer already expressed in the effective precision.
- A `bigint` is emitted verbatim, which is the way to send full nanosecond resolution.
- An invalid `Date` is rejected.

The default precision is `ms`, chosen because JavaScript `Date` and
`Date.now()` are millisecond-based. Override it per client or per request. The
serializer and the `precision` query parameter always use the same effective
value.

## Cancellation and timeout

```ts
const controller = new AbortController();
const pending = client.query("SELECT * FROM weather", {
  signal: controller.signal,
});
controller.abort();

await pending; // rejects with CnosDBRequestError, code "ABORT_ERR"
```

- A client-side timeout raises `CnosDBTimeoutError`, which carries `timeoutMs`.
- A caller abort raises `CnosDBRequestError` with `code === "ABORT_ERR"`, so cancellation is never misreported as a timeout.
- An already-aborted signal rejects without sending a request.
- Timers and abort listeners are cleaned up on every path.

Override the timeout per request with `timeoutMs`.

## Retries

Retries are off by default: one call, one request. A client that retries a
write silently can duplicate points and corrupt aggregates long before anyone
notices, so nothing is retried until you ask.

```ts
const client = new CnosDBClient({
  url: "http://localhost:8902",
  retry: {
    attempts: 3,
    backoff: { initialMs: 100, maxMs: 2_000, jitter: true },
    retryWrites: false,
  },
});
```

| Option              | Default | Description                                       |
| ------------------- | ------- | ------------------------------------------------- |
| `attempts`          | —       | Total attempts including the first; `1` disables. |
| `backoff.initialMs` | `100`   | First delay.                                      |
| `backoff.maxMs`     | `2000`  | Cap on any single delay.                          |
| `backoff.jitter`    | `true`  | Spread the delay randomly across the interval.    |
| `retryWrites`       | `false` | Also retry writes.                                |
| `maxElapsedMs`      | —       | Wall-clock ceiling for the whole sequence.        |

**What gets retried.** `ping`, `query`, and `queryTable` are retried, because
they are the methods that return rows. Writes are retried only with
`retryWrites`. `execute` is never retried, whatever you configure: it exists for
statements whose point is their effect, and the client cannot tell whether a
failed attempt took hold before the connection dropped. If you send an `INSERT`
through `query` with retries on, it will be retried — send it through `execute`.

**Which failures.** Timeouts, connection failures, HTTP 429, and 5xx other than 501. Rejected credentials, malformed SQL, an oversized payload, and a caller
abort are final, because the server will decide them the same way next time.

**Timing.** `timeoutMs` is the budget for one attempt, not for the sequence, so
enabling retries does not shrink the time any single attempt gets. Use
`maxElapsedMs` for a bound on the total. Backoff doubles from `initialMs` up to
`maxMs`, and with jitter the actual wait is a random point below that, so a
fleet of clients that failed together does not come back in lockstep. A
`Retry-After` header wins over the computed delay, capped by `maxMs`.

An `AbortSignal` ends the sequence immediately, including during a backoff.

`retryWrites` is worth a moment's thought before enabling. CnosDB does not
deduplicate, so a retried write whose first attempt actually landed writes the
points twice. That is harmless when a repeat overwrites the same series and
timestamp, and quietly wrong otherwise. The reasoning is recorded in
[ADR-0009](docs/adr/0009-opt-in-retry-policy.md).

## Error handling

```ts
import {
  CnosDBAuthenticationError,
  CnosDBError,
  CnosDBRateLimitError,
  CnosDBTimeoutError,
} from "cnosdb-client";

try {
  await client.query("SELECT * FROM weather");
} catch (error) {
  if (error instanceof CnosDBAuthenticationError) {
    console.error("Authentication failed.");
  } else if (error instanceof CnosDBRateLimitError) {
    console.error("CnosDB is rate-limiting requests.");
  } else if (error instanceof CnosDBTimeoutError) {
    console.error("The request timed out.");
  } else if (error instanceof CnosDBError) {
    console.error(error.message, error.status);
  } else {
    throw error;
  }
}
```

| Condition                       | Error                       |
| ------------------------------- | --------------------------- |
| Rejected credentials            | `CnosDBAuthenticationError` |
| HTTP 429                        | `CnosDBRateLimitError`      |
| Other HTTP 4xx (incl. 413, 422) | `CnosDBRequestError`        |
| HTTP 5xx                        | `CnosDBServerError`         |
| Client timeout                  | `CnosDBTimeoutError`        |
| Connection failure              | `CnosDBNetworkError`        |
| Unreadable payload              | `CnosDBResponseError`       |
| Anything else                   | `CnosDBError`               |

Every error extends `CnosDBError` and carries `status`, `method`, `path`, a
truncated `responseBody`, and CnosDB's own `errorCode` where available, plus the
original `cause`. Errors never contain the password, the `Authorization` header,
or a credential-bearing URL.

CnosDB does not use HTTP 401. It answers rejected credentials with 422, the same
status it uses for a missing table, and distinguishes the two only through the
`error_code` in the body. The client therefore classifies on that code, which is
why `CnosDBAuthenticationError` can carry a status of 422. HTTP 401 is still
mapped, for proxies that use it.

`errorCode` is passed through verbatim so you can act on cases the client does
not model, such as `010004` for a user who authenticated but lacks the required
privilege. See [docs/compatibility.md](docs/compatibility.md) for the observed
codes.

## API reference

```ts
new CnosDBClient(options: CnosDBClientOptions)

client.ping(options?: RequestOptions): Promise<PingResult>
client.query<T>(statement: string, options?: QueryOptions): Promise<T>
client.queryStream<T>(statement: string, options?: QueryOptions): AsyncGenerator<T>
client.queryTable(statement: string, options?: QueryOptions): Promise<QueryTable>
client.execute(statement: string, options?: QueryOptions): Promise<void>
client.writeLineProtocol(data: string, options?: WriteOptions): Promise<void>
client.writePoints(points: Point | readonly Point[], options?: WriteOptions): Promise<void>

serializePoint(point: Point, precision?: TimePrecision): string
splitPoints(points: readonly Point[], options: SplitOptions): Generator<string>
sql(strings, ...values: SqlValue[]): string
```

Exported types: `CnosDBClientOptions`, `RequestOptions`, `QueryOptions`,
`WriteOptions`, `RetryOptions`, `BackoffOptions`, `SplitOptions`, `PingResult`,
`QueryTable`, `Point`, `PointFieldValue`, `SqlValue`, `TimePrecision`, `Compression`,
`FetchLike`, and `CnosDBErrorOptions`.

## Compatibility

Tested against Node.js 22 and 24, and against three CnosDB servers on every
pull request: `community-latest`, the pinned `community-2.4.3.4`, and
`community-2.4.1`.

**CnosDB 2.4.1 is the oldest supported server.** 2.4.0 specifically is not
supported: it stores Line Protocol string escapes literally and drops the
connection on a compressed write. Both 2.3.5 and 2.4.1 are fine, so 2.4.0 is an
isolated bad release rather than the start of a range.

See [docs/compatibility.md](docs/compatibility.md) for the full matrix and the
evidence behind each verdict.

## Security notes

- Use HTTPS outside a trusted local network. Basic authentication over plain HTTP exposes credentials to anyone observing the connection.
- Keep credentials in environment variables or a secret manager, never in source control.
- This is a server-side package. Do not embed CnosDB credentials in a browser bundle.
- Avoid logging whole configuration objects; they hold your password.
- The client sends raw SQL. It does **not** parameterize or sanitize statements, so never concatenate untrusted input into a query.
- Generic query types are compile-time assertions, not runtime validation.
- The client never retries automatically, so a failed write is never silently duplicated.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Development

```bash
npm ci
npm run check            # format, lint, typecheck, coverage, build, package validation
npm run test:unit
npm run test:integration # requires Docker
npm run smoke            # tarball install into clean ESM, CJS, and TS consumers
```

See [docs/development-workflow.md](docs/development-workflow.md) and
[docs/architecture.md](docs/architecture.md).

## Versioning

This package is pre-1.0, so treat any minor bump as potentially breaking. The
exact guarantees are in
[docs/versioning-policy.md](docs/versioning-policy.md), and released changes are
listed in [CHANGELOG.md](CHANGELOG.md).

## Contributing

Contributions are welcome. Work normally starts with an accepted issue and
arrives through a pull request with tests, documentation, and a changeset.
Read [CONTRIBUTING.md](CONTRIBUTING.md) before you begin, and note the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Roadmap

Planned directions, which are proposals rather than promises, are listed in
[ROADMAP.md](ROADMAP.md).

## Support

Usage questions, bug reports, and security contacts are described in
[SUPPORT.md](SUPPORT.md).

## License

[MIT](LICENSE) © Aayush Mainali

## Trademark and affiliation

CnosDB is a project of its respective owners, distributed under AGPL-3.0. This
package is an independent client implemented against the publicly documented
CnosDB HTTP API. It contains no CnosDB source code, uses no CnosDB logo, and
claims no endorsement or affiliation. "CnosDB" is used only to describe
interoperability.
