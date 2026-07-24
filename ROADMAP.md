# Roadmap

Everything below is a **proposal, not a promise**. Items are ideas the
maintainers consider reasonable; none is scheduled, and any of them can be
dropped. Nothing here is a commitment to a date or a release.

The guiding constraint is that `cnosdb-client` stays small and dependable. A
feature that would add a runtime dependency, an unbounded resource, or a
surprising default has to earn its place through an ADR.

## v0.1.x hardening

Small, compatible improvements to what already exists:

- Compatibility fixes as CnosDB versions change.
- Better diagnostics: clearer messages and richer, still secret-safe error context.
- Line Protocol serializer edge cases found in real use.
- Documentation improvements, especially around timestamps and precision.
- A wider tested compatibility matrix in [docs/compatibility.md](docs/compatibility.md).

## v0.2.0 candidates

Larger additions that each need a design issue first:

- **Chunked and streaming query support.** Read large result sets without holding the whole response in memory. Needs a safe, bounded design before implementation.
- **Opt-in retry policy.** Explicitly configured, never on by default, and never applied to non-idempotent writes without the caller asking. See [ADR-0006](docs/adr/0006-disable-automatic-retries-in-v0.1.0.md).
- **Controlled batch splitting.** An explicit helper for oversized write batches, so the caller chooses the behaviour rather than the client guessing.
- **Richer query result helpers.** Convenience for column metadata and typed row mapping, without becoming an ORM.

## Later exploration

Not planned, but worth investigating if there is real demand:

- OpenTSDB write helpers.
- Bulk log ingestion.
- Trace ingestion helpers.
- Browser feasibility, which would require solving credential handling honestly.
- Additional runtimes such as Deno and Bun, only with real tests behind the claim.
- Framework-specific integrations, likely better as separate packages.

## Explicitly out of scope

These are not planned at any version, because they belong in other layers:

- An ORM or schema migration framework.
- A fluent SQL query builder.
- Connection pooling or WebSocket transport.
- Arrow Flight SQL, JDBC, or ODBC.
- Client-side telemetry.
- A command-line interface.

## Influencing the roadmap

Open a feature request describing the problem you have, not just the API you
want. A concrete use case is the most persuasive thing you can bring. Larger
ideas start as an `rfc` issue.
