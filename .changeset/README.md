# Changesets

This folder holds [changesets](https://github.com/changesets/changesets): short
Markdown files describing the release impact of a change, written by the person
who made it.

## Adding one

```bash
npm run changeset
```

Choose the bump type and write a description aimed at someone reading release
notes, not at the reviewer:

- Good: "Preserve CnosDB response bodies on rate-limit errors to improve retry diagnostics."
- Bad: "Refactored request handler."

Commit the generated file with your change.

## Choosing a bump, before 1.0

| Bump    | Use for                                                    |
| ------- | ---------------------------------------------------------- |
| `patch` | Backwards-compatible bug fix or hardening.                 |
| `minor` | New feature, or an intentional breaking change before 1.0. |
| `major` | Not used before 1.0.                                       |

A pre-1.0 breaking change also needs the `breaking change` label, an accepted
design issue, migration notes, and prominent changeset wording. See
[docs/versioning-policy.md](../docs/versioning-policy.md).

## When one is not needed

Tests only, CI only, issue templates, contributor docs, formatting, and
internal refactors with provably unchanged behaviour. Explain the omission in
the pull request and apply the `no-changeset` label.

## What happens next

Merged changesets accumulate on `main`. The release workflow maintains a single
release pull request that applies the version bump, regenerates the changelog,
and deletes the consumed files. A maintainer reviews and merges it to authorize
publication. See [docs/release-process.md](../docs/release-process.md).
