# ADR-0006: Disable automatic retries in v0.1.0

**Status:** Accepted, amended by [ADR-0009](0009-opt-in-retry-policy.md)
**Date:** 2026-07-24

## Context

Most HTTP clients retry failed requests, and users often expect it. For
read-only requests over a flaky network, a retry is usually helpful.

For writes it is not that simple. `POST /api/v1/write` is not idempotent from
the client's perspective, and the client cannot distinguish these two situations:

1. the request never reached the server, so retrying is safe and correct;
2. the server accepted and durably stored the write, and only the response was lost.

Both look identical: a timeout or a dropped connection. In case 2, an automatic
retry silently duplicates data. In a time-series database, duplicated points
quietly corrupt aggregates — and because nothing errors, the corruption is found
much later, if at all.

Retries also interact badly with the other failure modes. Retrying a 429
without coordination adds load to a server that has just said it is overloaded.
Retrying a 4xx caused by malformed SQL just repeats a request that cannot
succeed. And a retry that ignores the caller's overall deadline turns a 10-second
timeout into 30 seconds of waiting.

## Decision

v0.1.0 performs **no automatic retries** of any kind. Every request is attempted
exactly once.

Instead, the client makes it straightforward for callers to implement the retry
policy their situation calls for:

- typed errors distinguish rate limiting, server errors, network failure, timeout, and caller cancellation;
- `CnosDBTimeoutError` carries `timeoutMs`, and errors carry `status`;
- a caller abort is reported as `CnosDBRequestError` with `code === "ABORT_ERR"`, never as a timeout, so a retry loop does not mistake a deliberate cancellation for a transient failure;
- `serializePoint` is exported, so a caller can build and hold the exact payload it wants to resend.

An opt-in retry policy is a candidate for a later version
([ROADMAP.md](../../ROADMAP.md)). If added, it must be off by default and must
never retry a write unless the caller explicitly accepts duplication risk.

> [ADR-0009](0009-opt-in-retry-policy.md) added that policy under both
> conditions. The default is still one call, one request.

## Consequences

**Good:**

- The client cannot silently duplicate time-series data. Whatever else goes wrong, that failure mode is off the table.
- Behaviour is predictable: one call, one request, which makes both tests and production traces easy to reason about.
- Timeouts mean what they say, because no hidden attempts sit inside them.
- Callers who need retries can implement them with correct, application-specific knowledge of which operations are safe to repeat.
- Less code, and less code that must be right.

**Costs:**

- Users must handle transient failures themselves, which is more work than a built-in option would be. The README and the typed error table document what to catch.
- The package may look less featureful than clients that retry by default.
- Applications that would genuinely benefit from a read retry have to write a small loop.

## Alternatives considered

**Retry everything with exponential backoff.** The common default. Rejected:
it is precisely what causes duplicate writes, and a client library is the wrong
place to make that tradeoff on the user's behalf.

**Retry only reads, never writes.** Much safer, and a plausible future default.
Rejected for v0.1.0 because "read" is not a property the client can determine
reliably — `POST /api/v1/sql` carries both `SELECT` and `INSERT`, and inspecting
the SQL to guess would mean parsing it, which is explicitly out of scope.

**Retry only on 429 and 5xx.** Narrower, but a 5xx can still follow a partially
applied write, and retrying a 429 without server-directed backoff worsens the
overload it responds to.

**Make retries opt-in immediately in v0.1.0.** Reasonable, but designing a good
policy interface — budgets, jitter, deadline interaction, idempotency opt-in —
is real design work that would delay a release whose value is being small and
dependable. Deferred deliberately rather than rushed.
