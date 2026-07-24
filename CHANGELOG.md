# Changelog

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
