# Development workflow

How a change travels from an idea to a published release.

```text
Issue
  ↓
Triage
  ↓
Accepted
  ↓
Focused branch
  ↓
Implementation + tests + docs + changeset
  ↓
Pull request
  ↓
CI + review
  ↓
Squash merge
  ↓
Release PR accumulation
```

## 1. Issue

Every ordinary change starts as an issue, using one of the forms in
[.github/ISSUE_TEMPLATE](../.github/ISSUE_TEMPLATE): bug report, feature
request, or documentation. Security reports never use the issue tracker; see
[SECURITY.md](../SECURITY.md).

## 2. Triage

A maintainer or triager:

1. checks the report is complete;
2. removes any secrets that were posted accidentally;
3. reproduces the bug where practical;
4. looks for duplicates;
5. assesses scope and compatibility impact;
6. marks it `status: accepted`, `status: blocked`, `status: declined`, or `status: needs-information`;
7. adds a `priority:` and an `area:` label.

Only `status: accepted` issues are normally implemented. This is a courtesy to
contributors: nobody should write code for a change that will be declined.

## 3. Branch

```text
<type>/<issue-number>-<short-kebab-description>
```

for example `feat/12-add-chunked-query-streaming`. There is no long-running
development branch; `main` is always releasable.

## 4. Implement

Alongside the code:

- unit tests for the behaviour, and integration tests when the server is involved;
- README and docs updates when user-facing behaviour changes;
- an ADR for a significant design decision;
- a changeset for a user-facing change (`npm run changeset`).

Run the gates before pushing:

```bash
npm run check
npm run test:integration   # when the change touches request or write behaviour
npm run smoke              # when the change touches packaging or exports
```

## 5. Pull request

Title in Conventional Commit form, because it becomes the squashed commit
message. Body links the issue with `Closes #12` and completes the template.

## 6. CI and review

Required checks run: format, lint, typecheck, unit tests on Node 22 and 24,
build, package validation, package smoke test, integration tests, PR title, and
dependency review. Reviewers look at correctness, security, public API shape,
tests, and documentation. Resolve every conversation.

## 7. Squash merge

One pull request becomes one commit on `main`, titled with the pull request
title. The branch is deleted automatically. Merge commits and failing merges are
not permitted.

## 8. Release

Merged changesets accumulate. The release workflow opens or updates a single
release pull request titled `chore(release): version cnosdb-client`, which
bumps the version, rewrites the changelog, and deletes consumed changesets. A
maintainer reviews and merges it, and publication follows. See
[release-process.md](release-process.md).

## Worked example

A complete pass through the process, for a feature that does not exist yet:

1. **Issue #12** is opened: "Add chunked query streaming."
2. **Triage** labels it `type: feature`, `area: client`, `status: accepted`.
3. **Branch** `feat/12-add-chunked-query-streaming` is created from `main`.
4. **Implement** the streaming query path in `src/client.ts` and `src/http.ts`.
5. **Test**: unit tests with an injected `fetch` producing a chunked body, plus an integration test against a real server.
6. **Document**: a README section, and an ADR recording the bounded-memory design.
7. **Changeset**: `npm run changeset` → `minor` → "Add `queryStream()` for reading large result sets without buffering the whole response."
8. **Pull request** titled `feat(client): add chunked query streaming`, with `Closes #12` in the body.
9. **CI and review** run; feedback is addressed; conversations are resolved.
10. **Squash merge** into `main`.
11. **Changesets** updates the open release pull request to propose `0.2.0`.
12. A **maintainer merges the release PR** when the release is ready.
13. **Trusted publishing** publishes to npm from GitHub Actions via OIDC.
14. The **tag and GitHub release** are created.
15. The published package is **verified** with a clean install.

Nothing in that sequence required a direct push to `main`, a hand-edited
version number, or a long-lived npm token.
