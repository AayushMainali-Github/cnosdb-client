# Changelog

## 0.3.0

### Minor Changes

- [#56](https://github.com/AayushMainali-Github/cnosdb-client/pull/56) [`d784699`](https://github.com/AayushMainali-Github/cnosdb-client/commit/d7846990c341d024c24a8366e266d93dacc74fe4) Thanks [@AayushMainali-Github](https://github.com/AayushMainali-Github)! - Add `sql`, a tagged template that escapes interpolated values as CnosDB SQL literals. Strings use SQL-standard quote doubling, `null`/`boolean`/`number`/`bigint`/`Date` have fixed encodings, and anything else — including `NaN`, `Infinity`, and invalid dates — throws rather than guessing. Identifiers and statement structure stay in the literal parts of the template; this is a value escaper, not a query builder.

- [#55](https://github.com/AayushMainali-Github/cnosdb-client/pull/55) [`f183f3b`](https://github.com/AayushMainali-Github/cnosdb-client/commit/f183f3bd3097b0a3204166608a6c9d854f500df8) Thanks [@AayushMainali-Github](https://github.com/AayushMainali-Github)! - Add `queryStream()`, an async generator that yields query rows as they arrive instead of buffering the whole response. It asks CnosDB for `chunked=true`, which replies with successive JSON arrays written back to back; the client parses each array and yields its elements so memory stays proportional to one server batch.

  Row shape matches `query()` (alphabetically sorted keys, NULL columns omitted). SQL errors still arrive as an HTTP error before any row is sent; a failure after some rows have been yielded throws and leaves those rows consumed, so a partial result is visible rather than hidden. Breaking out of the loop or aborting `options.signal` cancels the underlying response.

- [#54](https://github.com/AayushMainali-Github/cnosdb-client/pull/54) [`94cd075`](https://github.com/AayushMainali-Github/cnosdb-client/commit/94cd075871c6fd9e777a3a911244957eae497231) Thanks [@AayushMainali-Github](https://github.com/AayushMainali-Github)! - Add an opt-in `retry` policy. Retries stay off unless configured, so the default remains one call, one request; enabling them retries `ping`, `query`, and `queryTable` on timeouts, connection failures, HTTP 429, and 5xx other than 501. Writes are retried only with `retryWrites`, and `execute` is never retried, because the client cannot tell whether a failed attempt took effect.

  Backoff doubles from `backoff.initialMs` up to `backoff.maxMs` with full jitter by default, a `Retry-After` header overrides the computed delay within that cap, and an `AbortSignal` ends the sequence immediately including mid-backoff.

  `timeoutMs` keeps its existing meaning as the budget for a single attempt rather than becoming a deadline across the sequence; `retry.maxElapsedMs` bounds the total. The reasoning, and the amendment to ADR-0006, are recorded in ADR-0009.

- [#51](https://github.com/AayushMainali-Github/cnosdb-client/pull/51) [`6340578`](https://github.com/AayushMainali-Github/cnosdb-client/commit/63405786aa50ac75b6e40f7b975a111cdcacc90e) Thanks [@AayushMainali-Github](https://github.com/AayushMainali-Github)! - Add `client.queryTable()`, which returns a result's columns alongside its rows. It requests CSV, the only CnosDB response format that carries column names in their true order, so the columns come back in the order the statement selected them and every row has exactly one value per column. On CnosDB 2.4.3 the columns survive an empty result, so a table with no matching rows can still be rendered with its headings; 2.4.1 returns an empty body instead and reports no columns.

  This matters because the JSON format used by `query()` sorts keys alphabetically and omits any column that is NULL for a given row, which makes row objects differ in shape and hides nulls entirely. Both behaviours are now documented in `docs/compatibility.md`.

  Values are returned as raw strings, because CnosDB sends no column types over HTTP in any response format; converting them would mean guessing.

  Also exports the `Compression` type from the package root, which was added as a client option in 0.2.0 but was not importable.

- [#53](https://github.com/AayushMainali-Github/cnosdb-client/pull/53) [`2ef8eea`](https://github.com/AayushMainali-Github/cnosdb-client/commit/2ef8eeacbde85927d4fcc588468014c9e3297298) Thanks [@AayushMainali-Github](https://github.com/AayushMainali-Github)! - Add `splitPoints()`, a generator that cuts a batch of points into Line Protocol payloads no larger than a chosen size. Sizing is by encoded UTF-8 bytes rather than point count, since points vary enormously in encoded length and server limits are measured in bytes; the separating newlines are counted too, so a payload that fits also fits on the wire.

  Splitting is opt-in with no default size, so existing writes are unchanged. A single point larger than `maxBytes` raises a `RangeError` naming its index and size rather than emitting an oversized payload.

  Sending the chunks is left to the caller, so a failure part way through a batch makes it obvious which chunks were already written.

## 0.2.0

### Minor Changes

- [#45](https://github.com/AayushMainali-Github/cnosdb-client/pull/45) [`e709784`](https://github.com/AayushMainali-Github/cnosdb-client/commit/e709784a277c5516dcb945cbff0e4ba29fd69d5e) Thanks [@AayushMainali-Github](https://github.com/AayushMainali-Github)! - Add an opt-in `compression` option for write payloads, settable on the client and per write. Setting it to `"gzip"` compresses the body with `node:zlib` and sends `Content-Encoding: gzip`, which typically shrinks Line Protocol by an order of magnitude on metered, slow, or cross-region links. The default stays `"none"`.

  Only write payloads are compressed; SQL statements are small enough that gzip's overhead would usually enlarge them. Verified against a live server: CnosDB decompresses the body and stores the points correctly, and rejects an encoding mismatch with a clear error rather than storing anything.

  `content-encoding` joins `authorization`, `content-type`, and `accept` as a header the client owns, so supplying it through the `headers` option now raises a `TypeError`.

- [#42](https://github.com/AayushMainali-Github/cnosdb-client/pull/42) [`9068655`](https://github.com/AayushMainali-Github/cnosdb-client/commit/9068655bbe00d5a2399c53c38cb95c64baea4f20) Thanks [@AayushMainali-Github](https://github.com/AayushMainali-Github)! - Raise `CnosDBAuthenticationError` when CnosDB actually rejects credentials. CnosDB never returns HTTP 401: it answers a wrong password with HTTP 422 and the error code `010016`, the same status it uses for an unrelated failure such as a missing table. Rejected credentials therefore used to surface as a generic `CnosDBRequestError`, so catching `CnosDBAuthenticationError` never worked against a real server. The client now classifies on CnosDB's error code, and still maps HTTP 401 for proxies that use it.

  Errors now expose CnosDB's `errorCode` from the response body, so callers can act on cases the client does not model, such as `010004` for a user who authenticated but lacks the required privilege.

  This behaviour is now verified against a live server that genuinely enforces authentication, rather than against an assumption. The stock container ships with password checking disabled and accepts any password, which is what hid the problem.

- [#40](https://github.com/AayushMainali-Github/cnosdb-client/pull/40) [`e490b14`](https://github.com/AayushMainali-Github/cnosdb-client/commit/e490b148852bd2a1c64dab330d4875ac5686c285) Thanks [@AayushMainali-Github](https://github.com/AayushMainali-Github)! - Add a `headers` option for sending extra HTTP headers, on the client for every request and on any individual call to add to or override them for that request. This unblocks deployments behind a gateway or proxy that requires an API key, a routing header, or a correlation ID, which previously forced callers to replace the whole `fetch` implementation.

  The client keeps control of `authorization`, `content-type`, and `accept`. Supplying one of those, an invalid header name, or a value containing a line break raises a `TypeError` at the call site rather than being silently dropped.

## 0.1.1

### Patch Changes

- [#11](https://github.com/AayushMainali-Github/cnosdb-client/pull/11) [`f2bcdb3`](https://github.com/AayushMainali-Github/cnosdb-client/commit/f2bcdb3d9ab68f06e92e9bad062be77a38f1435e) Thanks [@AayushMainali-Github](https://github.com/AayushMainali-Github)! - Add npm version, CI status, supported Node version, and license badges to the README. The README ships inside the published tarball, so this updates the package page on npm. No runtime code changed.

## 0.1.0 - 2026-07-24

### Added

- Initial unofficial TypeScript client for the CnosDB HTTP API.
- Health checks through `ping()`.
- SQL queries through `query<T>()`.
- SQL statement execution through `execute()`.
- Raw Line Protocol writes through `writeLineProtocol()`.
- Structured point writes through `writePoints()`.
- Deterministic Line Protocol serialization through `serializePoint()`.
- Basic authentication, timeouts, cancellation, and typed errors.
- ESM, CommonJS, and TypeScript declaration support.
