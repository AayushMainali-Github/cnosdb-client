---
"cnosdb-client": minor
---

Add `sql`, a tagged template that escapes interpolated values as CnosDB SQL literals. Strings use SQL-standard quote doubling, `null`/`boolean`/`number`/`bigint`/`Date` have fixed encodings, and anything else — including `NaN`, `Infinity`, and invalid dates — throws rather than guessing. Identifiers and statement structure stay in the literal parts of the template; this is a value escaper, not a query builder.
