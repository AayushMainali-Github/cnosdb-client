---
"cnosdb-client": minor
---

Raise `CnosDBAuthenticationError` when CnosDB actually rejects credentials. CnosDB never returns HTTP 401: it answers a wrong password with HTTP 422 and the error code `010016`, the same status it uses for an unrelated failure such as a missing table. Rejected credentials therefore used to surface as a generic `CnosDBRequestError`, so catching `CnosDBAuthenticationError` never worked against a real server. The client now classifies on CnosDB's error code, and still maps HTTP 401 for proxies that use it.

Errors now expose CnosDB's `errorCode` from the response body, so callers can act on cases the client does not model, such as `010004` for a user who authenticated but lacks the required privilege.

This behaviour is now verified against a live server that genuinely enforces authentication, rather than against an assumption. The stock container ships with password checking disabled and accepts any password, which is what hid the problem.
