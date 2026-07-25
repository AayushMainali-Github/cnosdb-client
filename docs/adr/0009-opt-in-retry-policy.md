# ADR-0009: Opt-in retry policy, with a per-attempt timeout

**Status:** Accepted
**Date:** 2026-07-25
**Amends:** [ADR-0006](0006-disable-automatic-retries-in-v0.1.0.md)

## Context

ADR-0006 shipped v0.1.0 with no retries, because a client that silently retries
a write can duplicate points and corrupt aggregates without the caller ever
learning that it happened. That reasoning still holds, and the default is not
changing.

What has changed is the evidence about the cost. Every caller running against a
real network ends up writing the same backoff loop, and the loop they write
cannot see what the client already knows: the `Retry-After` header on a 429,
whether a connection ever opened, and whether a timeout was the one the caller
configured or one the server imposed. Rebuilding that outside the client means
reconstructing information the client threw away.

ADR-0006 left two conditions on any future policy: off by default, and never
retry a write unless the caller explicitly accepts the duplication risk. It also
noted the interface design as the real work, and named one question it did not
answer: what `timeoutMs` means once there is more than one attempt.

## Decision

Add an opt-in `retry` option on the client. Absent, behaviour is exactly what
v0.1.0 shipped: one call, one request.

**`timeoutMs` stays the budget for a single attempt.** Each attempt gets the
full amount. A caller who needs a ceiling on the whole sequence sets
`retry.maxElapsedMs`, which stops the client from starting an attempt it knows
cannot finish inside the budget.

The alternative — reinterpreting `timeoutMs` as a deadline across all attempts —
was rejected. It would silently redefine an existing option, so the same code
would behave differently after an upgrade, and the redefinition would be
invisible until the day a request was slow. It would also make each attempt's
budget shrink as attempts accumulate, so the last attempt, the one made under
the worst conditions, would be given the least time to succeed. That is exactly
backwards. A per-attempt budget also means "a single request must not hang for
more than X", which is what a caller writing `timeoutMs` is actually saying.

**What is retried.** `ping`, `query`, and `queryTable` are retried. Writes are
retried only with `retry.retryWrites`, which is the explicit acceptance of
duplication risk that ADR-0006 required. `execute` is never retried, whatever
the configuration.

ADR-0006 rejected "retry reads, never writes" on the grounds that `POST
/api/v1/sql` carries both `SELECT` and `INSERT` and the client cannot tell them
apart without parsing SQL. That is still true, and this ADR does not solve it by
parsing. It solves it by using the method the caller chose as the declaration:
`query` and `queryTable` return rows and are treated as reads, `execute` exists
for statements whose point is their effect and is treated as unsafe to repeat.
A caller who sends an `INSERT` through `query` has miscategorised it, and the
documentation says so plainly at both methods.

**Which failures are retried.** Timeouts, network failures, 429, and 5xx other
than 501. Everything else — rejected credentials, malformed SQL, a payload too
large, a caller abort — is final, because the server will decide it the same way
next time.

**Backoff.** Exponential from `initialMs`, capped at `maxMs`, with full jitter
on by default so a fleet of clients that failed together does not return in
lockstep. A `Retry-After` from the server overrides the computed delay, since
the server knows when it will be ready, but is still capped by `maxMs` so a
mistaken or hostile header cannot park the caller indefinitely.

**Cancellation.** An `AbortSignal` ends the sequence immediately, including
during a backoff sleep. A caller who cancels does not wait out a delay first.

## Consequences

**Good:**

- The duplicate-write failure mode ADR-0006 exists to prevent stays off by default and behind an explicit flag when enabled.
- Callers stop rewriting the same loop, and the loop they no longer write is the one that could not see `Retry-After`.
- `timeoutMs` keeps its meaning, so upgrading changes nothing for code that does not set `retry`.
- The retry decision lives next to the typed errors that classify failures, which is where the information already is.

**Costs:**

- `query` being retryable is a judgement about intent, not a fact the client can verify. A caller who sends mutating SQL through `query` and enables retries can duplicate work. Documented at the method, but documentation is weaker than a guarantee.
- More configuration surface, and more behaviour that must be explained before someone can predict what a failing call will do.
- A retried request occupies a connection longer than a failed one, so an overloaded server sees load fall more slowly than it would without retries, jitter notwithstanding.

## Alternatives considered

**Leave retries to the caller.** The status quo, and still workable. Rejected
because the argument for building it was never that the loop is hard to write;
it is that the caller cannot see what the client discarded.

**Retry `execute` too.** Rejected. `execute` exists precisely for statements
that change something, and the client cannot tell whether a failed attempt took
effect before the connection dropped.

**Infer idempotency by parsing SQL.** Rejected for the same reason ADR-0006
rejected it: parsing SQL to guess intent is out of scope and would be wrong at
exactly the moments it mattered.

**Retry on any 5xx including 501.** Rejected. 501 means the server will never
implement the endpoint, so waiting cannot change the answer.
