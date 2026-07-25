# Changelog

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
