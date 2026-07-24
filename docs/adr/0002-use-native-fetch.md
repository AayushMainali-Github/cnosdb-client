# ADR-0002: Use native fetch

**Status:** Accepted
**Date:** 2026-07-24

## Context

The client needs an HTTP mechanism. The traditional options in Node.js are a
dependency such as `axios`, `node-fetch`, or `undici`, or the `http` module
directly, or the global `fetch` that has been stable in Node.js since version 21.

Every runtime dependency in a client library is inherited by every service that
installs it, bringing its own supply-chain risk, its own release cadence, and
potential version conflicts with whatever else the application uses. That cost
is paid by users who never chose the dependency.

The tests also need to observe requests and control responses precisely, without
a real server and without intercepting global state.

## Decision

Use the platform's global `fetch`, and let callers inject their own
implementation through the `fetch` option:

```ts
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
```

The implementation is captured once in the constructor and bound to
`globalThis`, so later mutation of the global cannot change a live client's
behaviour. The constructor fails immediately with a clear message when no
implementation is available.

This sets the Node.js floor at 22.14.0, which also matches the npm trusted
publishing requirements in [release-process.md](../release-process.md).

## Consequences

**Good:**

- Zero runtime dependencies, which is the single biggest supply-chain win available to a library this size.
- `AbortSignal`, `Request`, and `Response` come from the platform, so timeouts and cancellation use standard mechanisms.
- Unit tests inject a recording `fetch` and assert on the exact URL, headers, and body, with no network, no port binding, and no global patching.
- Users can supply a proxy-aware or instrumented `fetch` without the client growing configuration for it.

**Costs:**

- Node.js 22.14.0 or newer is required; older runtimes are unsupported.
- No built-in connection pooling control. Users needing custom agents must inject a `fetch` built on `undici`.
- The client is subject to platform `fetch` behaviour, including its error shapes, which is why `src/http.ts` normalizes them into typed errors.

## Alternatives considered

**axios.** Familiar and feature-rich, with interceptors and retries built in.
Rejected: a runtime dependency for every consumer, and it brings features such
as automatic retries that this project deliberately does not want
([ADR-0006](0006-disable-automatic-retries-in-v0.1.0.md)).

**undici directly.** Excellent performance and fine-grained control, but it is
still a dependency for something the platform already provides, and `fetch` in
Node.js is built on undici anyway.

**Node's `http` module.** No dependency, but it would mean hand-writing
redirects, body handling, and cancellation — more code to test and get wrong,
for no benefit over `fetch`.

**Depending on a `fetch` polyfill for older Node.js.** Rejected: it would trade
the zero-dependency property to support runtimes that are already past their
maintenance window.
