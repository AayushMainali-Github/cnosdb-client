# Architecture Decision Records

An ADR captures a decision that was expensive to make and would be expensive to
revisit: what we chose, why, and what it costs us. It records the reasoning at
the time, so a future contributor can tell the difference between a deliberate
constraint and an accident.

## Index

| ADR                                                 | Title                               | Status                                                   |
| --------------------------------------------------- | ----------------------------------- | -------------------------------------------------------- |
| [0001](0001-use-cnosdb-http-api.md)                 | Use the CnosDB HTTP API             | Accepted                                                 |
| [0002](0002-use-native-fetch.md)                    | Use native fetch                    | Accepted                                                 |
| [0003](0003-publish-esm-and-commonjs.md)            | Publish ESM and CommonJS            | Accepted                                                 |
| [0004](0004-use-changesets.md)                      | Use Changesets                      | Accepted                                                 |
| [0005](0005-use-issue-first-github-flow.md)         | Use issue-first GitHub Flow         | Accepted                                                 |
| [0006](0006-disable-automatic-retries-in-v0.1.0.md) | Disable automatic retries in v0.1.0 | Accepted, amended by [0009](0009-opt-in-retry-policy.md) |
| [0007](0007-use-unofficial-independent-branding.md) | Use unofficial independent branding | Accepted                                                 |
| [0008](0008-group-source-into-domain-folders.md)    | Group source into domain folders    | Accepted                                                 |
| [0009](0009-opt-in-retry-policy.md)                 | Opt-in retry policy                 | Accepted                                                 |

## When to write one

Write an ADR when a decision affects the public API, the security posture, the
dependency policy, the supported runtimes, the release process, or the project's
legal positioning. Do not write one for ordinary implementation choices.

## Format

```text
Title
Status      Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
Amends      ADR-XXXX, when this narrows or extends an earlier decision
Date
Context     The forces at play, and what makes this hard.
Decision    What we are doing, stated plainly.
Consequences  What this buys us, and what it costs us.
Alternatives considered  What else was on the table, and why it lost.
```

Number files sequentially and never renumber. A decision that is reversed is
not deleted: mark it superseded and link forward to its replacement.
