# Changelog

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
