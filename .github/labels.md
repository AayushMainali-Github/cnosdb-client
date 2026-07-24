# Issue and pull request labels

The label set is intentionally small. Every issue should end up with one
`type:`, one `status:`, one `priority:`, and at least one `area:` label.

Create these in a new repository with:

```bash
gh label create "type: bug" --color d73a4a --description "Incorrect behaviour" --force
```

## Type — what kind of work this is

| Label                 | Colour   | Description                      |
| --------------------- | -------- | -------------------------------- |
| `type: bug`           | `d73a4a` | Incorrect behaviour              |
| `type: feature`       | `0e8a16` | New functionality                |
| `type: documentation` | `0075ca` | Documentation only               |
| `type: maintenance`   | `fef2c0` | Build, tooling, and housekeeping |
| `type: security`      | `b60205` | Security-relevant work           |

## Status — where it is in triage

| Label                       | Colour   | Description                               |
| --------------------------- | -------- | ----------------------------------------- |
| `status: needs-triage`      | `ededed` | Not yet reviewed by a maintainer          |
| `status: needs-information` | `d4c5f9` | Waiting on the reporter                   |
| `status: accepted`          | `0e8a16` | Agreed; ready to be implemented           |
| `status: blocked`           | `b60205` | Cannot proceed until something else lands |
| `status: declined`          | `ffffff` | Will not be implemented; reason given     |

## Priority — how urgent it is

| Label                | Colour   | Description                            |
| -------------------- | -------- | -------------------------------------- |
| `priority: critical` | `b60205` | Data loss, security, or broken release |
| `priority: high`     | `d93f0b` | Significant user impact                |
| `priority: normal`   | `fbca04` | Default                                |
| `priority: low`      | `c2e0c6` | Nice to have                           |

## Area — which part of the project

| Label                 | Colour   | Description                       |
| --------------------- | -------- | --------------------------------- |
| `area: client`        | `1d76db` | `CnosDBClient` and public exports |
| `area: http`          | `1d76db` | Internal transport                |
| `area: line-protocol` | `1d76db` | Serialization                     |
| `area: types`         | `1d76db` | Public TypeScript types           |
| `area: testing`       | `1d76db` | Test suites and harnesses         |
| `area: documentation` | `1d76db` | README, docs, examples            |
| `area: ci`            | `1d76db` | Workflows and automation          |
| `area: release`       | `1d76db` | Packaging, changesets, publishing |
| `area: governance`    | `1d76db` | Policy and project process        |

## Other

| Label              | Colour   | Description                                        |
| ------------------ | -------- | -------------------------------------------------- |
| `good first issue` | `7057ff` | Well-scoped and suitable for a first contribution  |
| `help wanted`      | `008672` | Maintainers would welcome help here                |
| `breaking change`  | `b60205` | Changes existing behaviour; needs migration notes  |
| `rfc`              | `5319e7` | Larger proposal open for discussion                |
| `no-changeset`     | `ededed` | No release impact; omission is justified in the PR |
| `dependencies`     | `0366d6` | Dependency updates, usually from Dependabot        |
