# ADR-0001: Use the CnosDB HTTP API

**Status:** Accepted
**Date:** 2026-07-24

## Context

CnosDB can be reached several ways: the documented HTTP REST API, Arrow Flight
SQL, and various ecosystem protocols such as Prometheus remote write and
OpenTSDB endpoints. A client has to pick a foundation before anything else can
be designed.

Three forces shaped the choice. The HTTP API is the interface CnosDB documents
publicly and demonstrates with `curl`, so its behaviour can be verified
black-box without reading server source. It needs no runtime dependency in
Node.js because `fetch` is built in. And CnosDB is AGPL-3.0 licensed, so this
MIT-licensed client must be implemented against public interfaces rather than by
adapting upstream code — which effectively rules out reimplementing a wire
protocol whose only real specification is the server's source.

## Decision

Implement `cnosdb-client` exclusively against the documented CnosDB HTTP
endpoints:

- `GET /api/v1/ping` for health;
- `POST /api/v1/sql` for queries and statements;
- `POST /api/v1/write` for Line Protocol writes;
- HTTP Basic authentication, with `db`, `tenant`, `precision`, and `chunked` as query parameters.

Behaviour is verified against a real server, and the observed responses are
recorded in [compatibility.md](../compatibility.md).

## Consequences

**Good:**

- Zero runtime dependencies are achievable.
- Behaviour is verifiable with `curl`, so bug reports are easy to reproduce.
- The implementation stays independent of AGPL-licensed source.
- The surface is small enough to test thoroughly.

**Costs:**

- No access to Arrow Flight SQL performance characteristics.
- Result sets are JSON, which is bulkier than a columnar format.
- The client depends on endpoints that could change between CnosDB versions, so the tested matrix must be kept honest.
- Large result sets are buffered in memory until streaming support lands.

## Alternatives considered

**Arrow Flight SQL.** Better throughput and a columnar result format, but it
would add a substantial gRPC and Arrow dependency chain to every consuming
service and is far harder to verify black-box. Rejected for v0.1.0; it remains a
possible future package.

**Supporting several protocols behind one interface.** An abstraction over
transports would have to be designed before we know what the second transport
needs, which is the classic way to get the abstraction wrong. Rejected as
premature.

**Ecosystem endpoints such as OpenTSDB or Prometheus remote write.** Useful for
specific ingestion pipelines but not a general-purpose client foundation. Listed
in [ROADMAP.md](../../ROADMAP.md) as later exploration.
