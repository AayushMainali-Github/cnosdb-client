# Compatibility

This table records what has actually been tested. Nothing is listed here
because it "should work".

| cnosdb-client version | Node versions | Tested CnosDB version / image            | Notes                                                        |
| --------------------- | ------------- | ---------------------------------------- | ------------------------------------------------------------ |
| 0.1.0                 | 22, 24        | 2.4.3 — `cnosdb/cnosdb:community-latest` | Verified locally on Node 24.5.0 and in CI on Node 22 and 24. |
| 0.2.0                 | 22, 24        | 2.4.1, 2.4.3.x, `community-latest`       | Server matrix runs on every pull request; see below.         |

## Supported CnosDB versions

Every pull request runs the full integration suite against three images, all of
them required to pass:

| Image               | Role                      | Result            |
| ------------------- | ------------------------- | ----------------- |
| `community-latest`  | Moving tag, early warning | All 18 tests pass |
| `community-2.4.3.4` | Newest pinned patch       | All 18 tests pass |
| `community-2.4.1`   | Oldest supported server   | All 18 tests pass |

**CnosDB 2.4.1 is the supported floor.** Older servers were probed by hand and
are recorded below, honestly labelled as not covered by CI.

| Image               | Verdict           | Detail                                                                                       |
| ------------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| `community-2.4.0`   | **Not supported** | Mangles Line Protocol string escapes and closes the connection on a gzip write. See below.   |
| `community-2.3.5.4` | Partially working | Data plane behaves correctly, including gzip and escaping, but passwords are never enforced. |

### Why 2.4.0 is excluded

2.4.0 is a single broken release between two working ones: 2.3.5 is fine and
2.4.1 is fine. Two failures were reproduced directly against it.

Line Protocol string escapes are stored literally rather than unescaped. Writing
`s="a\"b\\c"` and reading it back yields `a\"b\\c` instead of `a"b\c`, so any
string field containing a quote or a backslash comes back corrupted.

A write carrying `Content-Encoding: gzip` gets no HTTP response at all; the
connection is dropped, which surfaces as `CnosDBNetworkError` rather than a
clean rejection.

Neither is something the client can work around, so 2.4.0 is excluded rather
than accommodated.

### Password enforcement arrived in 2.4.x

On 2.3.5.4, setting `auth_enabled = true` does not make the server verify
passwords: `root` with a deliberately wrong password still returns HTTP 200.
Only an unknown user is rejected. Everything else this client does works on
2.3.5.4, so it is listed as partially working rather than unsupported, but do
not rely on it to authenticate anyone.

Note also that `community-2.4.1` reports its version as `2.4.0` from
`/api/v1/ping`, so the ping string is not a reliable way to tell those two
apart.

The tested server reported:

```text
version: 2.4.3, revision: c760943, build_time: 2026-07-24T11:03:20Z
status:  healthy
image:   cnosdb/cnosdb:community-latest
digest:  sha256:0f4d84d3f2e82765a8db2a5d6778b5a73aad5bb46fb1fcefd5a2d4836c938f2a
```

## Reproducibility tradeoff

The matrix runs the mutable `community-latest` tag alongside two pinned tags.
The moving tag surfaces upstream API changes early, which is what an unofficial
client needs; the pinned tags mean a green run stays reproducible even after
`latest` moves. The integration suite prints the server version it tested
against.

Pin a specific image when you need a reproducible run:

```bash
CNOSDB_IMAGE=cnosdb/cnosdb:community-latest npm run test:integration
```

## Endpoints used

| Endpoint        | Method | Parameters                  |
| --------------- | ------ | --------------------------- |
| `/api/v1/ping`  | GET    | none                        |
| `/api/v1/sql`   | POST   | `db`, `tenant`, `chunked`   |
| `/api/v1/write` | POST   | `db`, `tenant`, `precision` |

Authentication is HTTP Basic. SQL is sent as the request body with
`Accept: application/json`.

## Verified server behaviour

Observed on CnosDB 2.4.3 and encoded in the tests:

- `GET /api/v1/ping` returns `{"version": "...", "status": "healthy"}` and needs no authentication.
- A successful `SELECT` with `Accept: application/json` returns a JSON array of row objects, with two caveats worth knowing. Keys are sorted **alphabetically**, not in the order the statement selected them, so `SELECT v, city` returns `{"city": ..., "v": ...}`. A column that is NULL for a row is **omitted from that row's object** entirely, so row objects can differ in shape and a NULL cannot be distinguished from an absent column.
- `Accept: application/csv` and `text/csv` return a header row followed by data rows. This is the only format that carries column names in their true order, and it emits every column for every row, so it is what `queryTable()` uses. On 2.4.3, an empty result set still returns the header row, whereas the JSON format returns a completely empty body. **This differs by version:** 2.4.1 returns an empty body for an empty CSV result too, so `queryTable()` reports no columns there. The ping string cannot be used to branch on this, since 2.4.1 identifies itself as 2.4.0. Fields are quoted per RFC 4180, with doubled quotes for a literal quote. Both NULL and an empty string render as an empty field and cannot be told apart.
- `Accept: application/nd-json` returns newline-delimited JSON objects. `application/x-ndjson` is rejected with `040005`.
- `chunked=true` on `/api/v1/sql` with `Accept: application/json` does **not** return one JSON value and does **not** return NDJSON. It returns successive JSON arrays written back to back with no separator, each about 500 rows on current 2.4.x builds: `[{...},{...}][{...}]`. An empty result is an empty body. Invalid SQL still fails with HTTP 422 **before** any array is sent, so a mid-stream failure after HTTP 200 is a transport problem rather than an application error. This is what `queryStream()` consumes. The same NULL-omission and key-sorting behaviour as non-chunked JSON applies inside each array.
- No response format carries column **types**.
- DDL such as `CREATE DATABASE` returns HTTP 200 with an **empty body**. `query()` therefore resolves to `undefined` for such statements; use `execute()` instead.
- Invalid SQL returns HTTP **422** with a JSON body such as `{"error_code":"030019","error_message":"Table not found: ..."}`. This maps to `CnosDBRequestError`.
- CnosDB **never returns HTTP 401**. It reuses 422 for nearly every application failure and distinguishes them only by `error_code`, so the client classifies errors on that code rather than on the status. The 401 mapping is retained for proxies that do use it.
- `POST /api/v1/write` accepts `precision` values `ms`, `us`, and `ns`, and returns HTTP 200 with an empty body.
- Writing with `precision=ms` and a millisecond timestamp round-trips to the expected wall-clock time.
- Line Protocol escaping round-trips: a string field containing `"`, `,`, and `\` is returned unchanged by a subsequent query.
- `Content-Encoding: gzip` is honoured on `POST /api/v1/write`, and the decompressed points are stored correctly. The SQL endpoint accepts it too, though the client does not use it there.
- Encoding mismatches fail loudly rather than corrupting data: gzip bytes sent without the header return 422 `040015` (`Invalid utf-8 sequence`), and plain text sent with the header returns 400 `040013` (`invalid gzip header`). A `Content-Encoding` other than `gzip` is also rejected with `040013`.

## Authentication

The stock image ships `auth_enabled = false` in `/etc/cnosdb/cnosdb.conf`, and
with that default **the server does not check passwords at all**: a wrong
password returns HTTP 200. Only the existence of the user and their tenant
membership are checked. Treat the default container as unauthenticated.

`tests/integration/auth.integration.test.ts` therefore runs its own container in
two phases — create a user while enforcement is off, restart with it on —
because CnosDB reads the setting only at startup, and the built-in `root` user
has `must_change_password` set, which locks it out once enforcement begins.

Observed with `auth_enabled = true` on CnosDB 2.4.3:

| Situation                       | Status | `error_code` | Client error                |
| ------------------------------- | ------ | ------------ | --------------------------- |
| Correct credentials             | 200    | —            | —                           |
| Wrong password                  | 422    | `010016`     | `CnosDBAuthenticationError` |
| Unknown user                    | 422    | `010016`     | `CnosDBAuthenticationError` |
| No `Authorization` header       | 400    | `000000`     | `CnosDBRequestError`        |
| Authenticated, lacks privileges | 422    | `010004`     | `CnosDBRequestError`        |

Absent credentials stay a `CnosDBRequestError` deliberately. The server never
sees a credential to reject; it refuses the request for lacking the header, and
reports it with the generic `000000` code that carries no authentication
meaning. Classifying it from the message text would break on any wording change.

`GET /api/v1/ping` is not authenticated even with enforcement on.

## Known gaps in test coverage

- Rate limiting (HTTP 429) is not exercised against a live server.
- Enterprise builds and clustered deployments are untested; every result here comes from a single-node community container.

## Node.js support

Node.js 22.14.0 is the minimum, and CI runs the current Node 22 and Node 24
releases. The floor comes from requiring a stable global `fetch` and from the
npm trusted-publishing requirements in
[release-process.md](release-process.md).

Browsers, Deno, Bun, and React Native are unsupported and untested. No claim is
made about them.
