# Compatibility

This table records what has actually been tested. Nothing is listed here
because it "should work".

| cnosdb-client version | Node versions | Tested CnosDB version / image            | Notes                                                        |
| --------------------- | ------------- | ---------------------------------------- | ------------------------------------------------------------ |
| 0.1.0                 | 22, 24        | 2.4.3 — `cnosdb/cnosdb:community-latest` | Verified locally on Node 24.5.0 and in CI on Node 22 and 24. |

The tested server reported:

```text
version: 2.4.3, revision: c760943, build_time: 2026-07-24T11:03:20Z
status:  healthy
image:   cnosdb/cnosdb:community-latest
digest:  sha256:0f4d84d3f2e82765a8db2a5d6778b5a73aad5bb46fb1fcefd5a2d4836c938f2a
```

## Reproducibility tradeoff

Integration tests run against the mutable `community-latest` tag, so the exact
server version changes over time and a green run today does not guarantee an
identical run next month. The tradeoff is deliberate: the moving tag surfaces
upstream API changes early, which is exactly what an unofficial client needs to
know about. The integration suite prints the server version it tested against,
and that version is recorded in the table above.

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
- A successful `SELECT` with `Accept: application/json` returns a JSON array of row objects.
- DDL such as `CREATE DATABASE` returns HTTP 200 with an **empty body**. `query()` therefore resolves to `undefined` for such statements; use `execute()` instead.
- Invalid SQL returns HTTP **422** with a JSON body such as `{"error_code":"030019","error_message":"Table not found: ..."}`. This maps to `CnosDBRequestError`.
- `POST /api/v1/write` accepts `precision` values `ms`, `us`, and `ns`, and returns HTTP 200 with an empty body.
- Writing with `precision=ms` and a millisecond timestamp round-trips to the expected wall-clock time.
- Line Protocol escaping round-trips: a string field containing `"`, `,`, and `\` is returned unchanged by a subsequent query.

## Known gaps in test coverage

- **Authentication rejection is not integration-tested.** The default `cnosdb/cnosdb:community-latest` container accepts any password for `root`, so a wrong password still returns HTTP 200. Mapping HTTP 401 to `CnosDBAuthenticationError` is therefore covered by unit tests against an injected `fetch` rather than against a live server. Enabling real authentication requires a custom server configuration, which is out of scope for v0.1.0.
- A request with **no** `Authorization` header at all returns HTTP 400 from this image rather than 401.
- Rate limiting (HTTP 429) is not exercised against a live server.

## Node.js support

Node.js 22.14.0 is the minimum, and CI runs the current Node 22 and Node 24
releases. The floor comes from requiring a stable global `fetch` and from the
npm trusted-publishing requirements in
[release-process.md](release-process.md).

Browsers, Deno, Bun, and React Native are unsupported and untested. No claim is
made about them.
