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
- CnosDB **never returns HTTP 401**. It reuses 422 for nearly every application failure and distinguishes them only by `error_code`, so the client classifies errors on that code rather than on the status. The 401 mapping is retained for proxies that do use it.
- `POST /api/v1/write` accepts `precision` values `ms`, `us`, and `ns`, and returns HTTP 200 with an empty body.
- Writing with `precision=ms` and a millisecond timestamp round-trips to the expected wall-clock time.
- Line Protocol escaping round-trips: a string field containing `"`, `,`, and `\` is returned unchanged by a subsequent query.

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
- Only the `community-latest` image is tested; see [issue #32](https://github.com/AayushMainali-Github/cnosdb-client/issues/32).

## Node.js support

Node.js 22.14.0 is the minimum, and CI runs the current Node 22 and Node 24
releases. The floor comes from requiring a stable global `fetch` and from the
npm trusted-publishing requirements in
[release-process.md](release-process.md).

Browsers, Deno, Bun, and React Native are unsupported and untested. No claim is
made about them.
