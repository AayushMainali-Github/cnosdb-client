# ADR-0007: Use unofficial independent branding

**Status:** Accepted
**Date:** 2026-07-24

## Context

This package is named `cnosdb-client` and exists to talk to CnosDB, so its
identity is unavoidably bound up with a project it is not part of. That creates
two risks worth taking seriously.

The first is misrepresentation. An unscoped name like `cnosdb-client` reads as
semi-official. If users assume the CnosDB team maintains it, they will
mis-estimate its support guarantees, its security response, and its release
cadence — and the CnosDB project inherits reputational responsibility for
software it has never seen.

The second is licensing. CnosDB is distributed under AGPL-3.0. This package is
MIT. Copying implementation code, tests, or internal algorithms from the CnosDB
repository into an MIT package would be a licensing violation. Using a
documented public HTTP API and describing interoperability is a different thing
entirely, and is permitted.

## Decision

Adopt an explicitly unofficial, independent identity.

- Keep the exact package name `cnosdb-client`, which describes what the package does.
- Display a prominent notice near the top of the README: "**Unofficial project:** `cnosdb-client` is an independent, community-maintained client. It is not affiliated with, endorsed by, or maintained by the CnosDB project."
- Repeat the disclaimer in the package description and in a closing README section.
- Use no CnosDB logo or visual branding.
- Never describe the package as "official", "the CnosDB SDK", "maintained by CnosDB", or "CnosDB's JavaScript client" without the unofficial qualifier.
- Implement everything independently against the public HTTP API, verified black-box against a running server. Copy no code, tests, comments, or algorithms from the AGPL-licensed CnosDB repository.
- Use the CnosDB name only descriptively, to say what the client interoperates with.

## Consequences

**Good:**

- Users can judge the support and security guarantees accurately, because the project's status is stated plainly.
- The MIT license is defensible: the implementation derives from public API documentation and observed behaviour, not from AGPL source.
- The CnosDB project is not made responsible for software it does not control.
- The package name stays discoverable and descriptive.

**Costs:**

- The disclaimer must be repeated and maintained across the README, the package metadata, and support documentation.
- Some users will still assume the package is official; the notice reduces that but cannot eliminate it.
- Implementing independently means behaviour must be verified empirically, and the tested compatibility matrix in [compatibility.md](../compatibility.md) must be kept honest rather than optimistic.
- If CnosDB later publishes an official client under a conflicting name, this project may need to respond. Handing over the name is preferable to competing for the identity.

## Alternatives considered

**A scoped name such as `@aayushmainali/cnosdb-client`.** Removes all ambiguity
about who publishes it. Rejected: it is materially less discoverable for a
general-purpose client, and a clear disclaimer solves the ambiguity without
that cost.

**A distinct non-descriptive name.** Strongest separation, but users searching
for a CnosDB client would not find it, and the name would then have to explain
itself everywhere.

**Adopting AGPL-3.0 to allow reuse of upstream code.** Would permit deriving
from the CnosDB implementation, but AGPL is a serious obstacle to adoption in
the commercial backend services that are this package's users. Rejected;
independent implementation under MIT serves users better.

**Seeking official endorsement before release.** Reasonable to pursue later, but
it would block the release on a decision outside the project's control. Nothing
here prevents it happening in future.
