---
"cnosdb-client": minor
---

Add an opt-in `retry` policy. Retries stay off unless configured, so the default remains one call, one request; enabling them retries `ping`, `query`, and `queryTable` on timeouts, connection failures, HTTP 429, and 5xx other than 501. Writes are retried only with `retryWrites`, and `execute` is never retried, because the client cannot tell whether a failed attempt took effect.

Backoff doubles from `backoff.initialMs` up to `backoff.maxMs` with full jitter by default, a `Retry-After` header overrides the computed delay within that cap, and an `AbortSignal` ends the sequence immediately including mid-backoff.

`timeoutMs` keeps its existing meaning as the budget for a single attempt rather than becoming a deadline across the sequence; `retry.maxElapsedMs` bounds the total. The reasoning, and the amendment to ADR-0006, are recorded in ADR-0009.
