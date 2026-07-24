# ADR-0004: Use Changesets

**Status:** Accepted
**Date:** 2026-07-24

## Context

Release management needs to answer two questions reliably: what version comes
next, and what should the changelog say. Doing this by hand fails in familiar
ways — someone bumps the wrong number, the changelog is written from `git log`
weeks later by whoever remembers least, and release notes end up full of
"refactor request handler" entries that mean nothing to a user.

The information needed is freshest at the moment the change is written, and the
person who knows it best is the author, not the release manager.

## Decision

Use [Changesets](https://github.com/changesets/changesets) for versioning and
changelog management.

Each user-facing pull request includes a changeset created by
`npm run changeset`, recording the bump type and a user-facing description. The
release workflow consumes accumulated changesets on `main` and maintains a
single release pull request titled `chore(release): version cnosdb-client`,
which bumps the version, regenerates `CHANGELOG.md`, and deletes the consumed
files. A maintainer reviews and merges it; publication follows.

Nobody edits a version number by hand.

## Consequences

**Good:**

- Release impact is recorded by the author, while the reasoning is still fresh.
- The changelog is written for users, and reviewed at the same time as the code.
- The version bump is derived, not remembered.
- Releasing becomes a review decision rather than a sequence of manual commands.
- The release pull request is a natural checkpoint for the checks in [release-process.md](../release-process.md).

**Costs:**

- One extra step for contributors, which [CONTRIBUTING.md](../../CONTRIBUTING.md) explains and the pull request template prompts for.
- Not every change needs a changeset, so the "is one required?" judgement has to be documented, with a `no-changeset` label for the exceptions.
- A release pull request created with the default `GITHUB_TOKEN` may not trigger all workflows, which is called out in [release-process.md](../release-process.md).
- A development dependency on the Changesets CLI and its GitHub changelog integration. This never reaches the published artifact.

## Alternatives considered

**semantic-release.** Fully automatic releases derived from commit messages.
Rejected because it publishes on every qualifying merge with no human
checkpoint, and because it derives user-facing notes from commit subjects, which
are written for reviewers. This project deliberately wants a maintainer to
authorize each release.

**Manual versioning and a hand-written changelog.** Total control, no tooling.
Rejected: it is exactly the process that produces wrong bumps and stale
changelogs, and it puts the release burden on one person's memory.

**Conventional-commit-driven versioning without a release PR.** Half the
benefit, and it makes the commit message carry a release decision that is better
stated explicitly.
