---
"cnosdb-client": minor
---

Add a `headers` option for sending extra HTTP headers, on the client for every request and on any individual call to add to or override them for that request. This unblocks deployments behind a gateway or proxy that requires an API key, a routing header, or a correlation ID, which previously forced callers to replace the whole `fetch` implementation.

The client keeps control of `authorization`, `content-type`, and `accept`. Supplying one of those, an invalid header name, or a value containing a line break raises a `TypeError` at the call site rather than being silently dropped.
