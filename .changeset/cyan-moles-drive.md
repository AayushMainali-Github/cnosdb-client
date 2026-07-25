---
"cnosdb-client": minor
---

Add `queryStream()`, an async generator that yields query rows as they arrive instead of buffering the whole response. It asks CnosDB for `chunked=true`, which replies with successive JSON arrays written back to back; the client parses each array and yields its elements so memory stays proportional to one server batch.

Row shape matches `query()` (alphabetically sorted keys, NULL columns omitted). SQL errors still arrive as an HTTP error before any row is sent; a failure after some rows have been yielded throws and leaves those rows consumed, so a partial result is visible rather than hidden. Breaking out of the loop or aborting `options.signal` cancels the underlying response.
