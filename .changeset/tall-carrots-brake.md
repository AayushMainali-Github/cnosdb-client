---
"cnosdb-client": minor
---

Add `splitPoints()`, a generator that cuts a batch of points into Line Protocol payloads no larger than a chosen size. Sizing is by encoded UTF-8 bytes rather than point count, since points vary enormously in encoded length and server limits are measured in bytes; the separating newlines are counted too, so a payload that fits also fits on the wire.

Splitting is opt-in with no default size, so existing writes are unchanged. A single point larger than `maxBytes` raises a `RangeError` naming its index and size rather than emitting an oversized payload.

Sending the chunks is left to the caller, so a failure part way through a batch makes it obvious which chunks were already written.
