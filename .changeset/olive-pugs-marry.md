---
"cnosdb-client": minor
---

Add `client.queryTable()`, which returns a result's columns alongside its rows. It requests CSV, the only CnosDB response format that carries column names in their true order, so the columns come back in the order the statement selected them and every row has exactly one value per column. The columns are reported even when no rows match, so an empty result can still be rendered with its headings.

This matters because the JSON format used by `query()` sorts keys alphabetically and omits any column that is NULL for a given row, which makes row objects differ in shape and hides nulls entirely. Both behaviours are now documented in `docs/compatibility.md`.

Values are returned as raw strings, because CnosDB sends no column types over HTTP in any response format; converting them would mean guessing.

Also exports the `Compression` type from the package root, which was added as a client option in 0.2.0 but was not importable.
