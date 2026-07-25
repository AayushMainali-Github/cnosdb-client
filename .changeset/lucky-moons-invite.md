---
"cnosdb-client": minor
---

Add an opt-in `compression` option for write payloads, settable on the client and per write. Setting it to `"gzip"` compresses the body with `node:zlib` and sends `Content-Encoding: gzip`, which typically shrinks Line Protocol by an order of magnitude on metered, slow, or cross-region links. The default stays `"none"`.

Only write payloads are compressed; SQL statements are small enough that gzip's overhead would usually enlarge them. Verified against a live server: CnosDB decompresses the body and stores the points correctly, and rejects an encoding mismatch with a clear error rather than storing anything.

`content-encoding` joins `authorization`, `content-type`, and `accept` as a header the client owns, so supplying it through the `headers` option now raises a `TypeError`.
