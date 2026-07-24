# ADR-0005: Use issue-first GitHub Flow

**Status:** Accepted
**Date:** 2026-07-24

## Context

The project needs a branching and contribution model. Git Flow, with its
`develop`, `release`, and `hotfix` branches, was designed for versioned software
with long release cycles and parallel supported versions. A single-package
library that publishes continuously from one line has none of those problems,
and a `develop` branch would mostly create merge overhead and ambiguity about
which branch is real.

The second question is when work should be discussed. A contributor who writes
an implementation before any discussion can have it declined on scope grounds
after all the effort is spent, which is a bad experience and a waste of
everyone's time.

## Decision

Use GitHub Flow with a single long-lived branch, plus an issue-first rule.

- `main` is the only permanent branch and is always releasable.
- Work happens on focused branches named `<type>/<issue-number>-<short-kebab-description>`.
- Ordinary changes begin with an issue that a maintainer labels `status: accepted`.
- Pull requests are squash-merged, so one pull request becomes one commit.
- Merge commits are disabled and merged branches are deleted automatically.
- No `develop`, `staging`, or `integration` branch is created.

The initial bootstrap commit is the single documented exception. The other
exceptions — release pull requests, Dependabot, private security remediation,
and emergency repair — are listed in
[CONTRIBUTING.md](../../CONTRIBUTING.md) and do not extend to maintainer
convenience.

## Consequences

**Good:**

- `main` history is a readable sequence of one-commit changes, each linked to a pull request and an issue.
- Any commit on `main` can be released, which is what makes the Changesets flow in [ADR-0004](0004-use-changesets.md) work.
- Contributors get a scope decision before they invest in an implementation.
- Reverting a change means reverting one commit.
- Triage labels give a real picture of what is accepted, blocked, or declined.

**Costs:**

- A small amount of ceremony for small changes. Mitigated by allowing a short documentation issue for a typo fix, rather than waiving traceability.
- Issue-first depends on maintainers triaging promptly; slow triage becomes a bottleneck for contributors.
- Squash merging discards intermediate commit history, so a long-running branch loses its internal narrative. Acceptable, and an argument for smaller pull requests.
- Only one release line is supported at a time; there is no branch from which to patch an older minor.

## Alternatives considered

**Git Flow.** Well known, and suited to shipping several supported versions at
once. Rejected: this project releases from one line continuously, so `develop`
would add a merge step and a "which branch is truth?" question with nothing in
return.

**Trunk-based development with direct pushes.** Fast for a solo maintainer, but
it removes the review checkpoint and makes required status checks meaningless.
Rejected as incompatible with a governance-first repository.

**Pull requests without the issue-first rule.** Lower friction, and reasonable
for many projects. Rejected here because a small, deliberately scoped library
declines proposals often enough that discussing scope first is a kindness to
contributors.
