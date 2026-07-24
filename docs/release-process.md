# Release process

Releases are assembled by automation and authorized by a human. Nobody edits a
version number by hand.

## 1. Changesets accumulate

Each user-facing pull request carries a changeset created with
`npm run changeset`. It records the bump type and a user-facing description, and
lands in `.changeset/` with the code it describes. Version selection rules are in
[versioning-policy.md](versioning-policy.md).

Changeset summaries keep each paragraph on one line. Changesets reproduces the
text verbatim in `CHANGELOG.md` and in the release pull request body, and GitHub
turns a single newline inside a pull request body into a line break, so
hard-wrapped prose arrives broken mid-sentence.

For the same reason `CHANGELOG.md` begins with its heading and nothing else.
Changesets inserts each new release immediately below that heading, so any
introductory prose there ends up beneath the newest entry and reads as though it
belongs to that release. Context that would otherwise live there belongs in this
document or in [versioning-policy.md](versioning-policy.md).

## 2. The release pull request

When changesets reach `main`, the release workflow opens or updates a single
pull request titled `chore(release): version cnosdb-client`. It contains only:

- the version bump in `package.json`;
- the regenerated `CHANGELOG.md`;
- deletion of the consumed changeset files.

It is never auto-merged.

## 3. Release review

Before merging, verify:

```text
[ ] The version bump is correct for the changes included.
[ ] Changelog wording is user-facing, not internal.
[ ] Every intended pull request is included.
[ ] Breaking changes are prominent and have migration notes.
[ ] CI passes.
[ ] Integration tests pass.
[ ] Tarball contents are correct (npm run pack:check).
[ ] No secrets are present anywhere in the diff.
[ ] The package name is exactly cnosdb-client.
[ ] The package is not marked private.
[ ] License and metadata are correct.
```

Merging the release pull request is what authorizes publication.

## 4. Publication

Merging triggers `changeset publish` in the release workflow, which publishes to
npm and creates the Git tag.

### npm trusted publishing

Publication uses npm trusted publishing through GitHub Actions OIDC, so no
long-lived npm token exists anywhere in this repository. Requirements:

- a GitHub-hosted runner;
- `permissions: id-token: write` in the workflow;
- npm CLI 11.5.1 or newer;
- Node.js 22.14.0 or newer;
- a trusted publisher configured in the npm package settings, naming this repository and the exact workflow filename.

Because npm matches on the workflow filename, `.github/workflows/release.yml`
must not be renamed after the trusted publisher is configured. Renaming it
breaks publishing until the npm setting is updated.

### Provenance

Trusted publishing generates a provenance attestation automatically, linking
the published tarball to the commit and workflow that produced it. It appears as
a "Provenance" section on the npm package page.

## 5. GitHub release

The Changesets action creates the `v<version>` tag on the release commit.
Release notes come from the changelog. Tags matching `v*` are protected and
should be created only by release automation or a maintainer.

## 6. Verification

Always verify from the registry rather than trusting the workflow log:

```bash
npm view cnosdb-client version
npm view cnosdb-client dist-tags
npm pack cnosdb-client@<version>
```

Then, in a clean directory:

```bash
npm install cnosdb-client@<version>
node -e "import('cnosdb-client').then(m => console.log(Object.keys(m)))"
node -e "console.log(Object.keys(require('cnosdb-client')))"
```

Confirm the ESM import, the CommonJS require, TypeScript resolution, the file
list, the Git tag, the GitHub release, the changelog, and the provenance
indicator.

## Recovering from a failed release

**Published versions are immutable. Never rewrite history to fix a release.**

- **Publication failed after the tag was created.** Investigate, fix forward, and release a new patch version. Do not force-push the tag.
- **A broken version reached npm.** Publish a fixed patch release, then deprecate the broken one:

```bash
npm deprecate cnosdb-client@0.1.1 "Broken release; use 0.1.2 or newer."
```

- **A version has a security flaw.** Publish the fix, deprecate the affected versions, and open a GitHub Security Advisory per [SECURITY.md](../SECURITY.md).

## Unpublishing

Do not unpublish casually. Unpublishing breaks every lockfile that references
the version, and npm restricts it in any case. Prefer, in order: publish a fixed
patch, deprecate the bad version, and publish a security advisory when users are
at risk.

Unpublishing is reserved for a genuine emergency, such as a leaked credential or
accidentally published private code, and even then the credential must be
rotated on the assumption that it is already compromised.

## Emergency patch

A critical bug or vulnerability follows the same path, only faster:

1. Fix on a branch, privately if it is a vulnerability.
2. Include a `patch` changeset.
3. Merge the pull request with expedited review.
4. Merge the release pull request immediately.
5. Verify the published artifact.
6. Publish the advisory and deprecate affected versions.

The process is not skipped under pressure. A rushed direct publish is how a
broken release reaches users.

## Release authentication for the release PR

GitHub does not dispatch workflow events for activity performed with the default
`GITHUB_TOKEN`, which is how it avoids recursive workflow runs. Every required
check on `main` is triggered by `pull_request`, so a release pull request opened
with `GITHUB_TOKEN` starts no checks at all: they stay pending forever and the
pull request can never be merged. Adding `push` triggers does not help, because
the release branch is pushed with the same token.

`main` requires those checks, so the release pull request needs a token that
does trigger workflows. The workflow reads `CHANGESETS_GITHUB_TOKEN` and falls
back to `GITHUB_TOKEN`, which keeps it runnable while the secret is missing but
produces a release pull request that cannot merge. Supply one of:

- **Preferred:** a GitHub App token scoped to this repository with only contents and pull-requests read/write.
- **Acceptable bootstrap:** a fine-grained PAT stored as the `CHANGESETS_GITHUB_TOKEN` secret, restricted to this repository with contents read/write and pull requests read/write.

That token manages the release pull request only. It is never used to publish to
npm, and it must never appear in a file or a log. Publishing authenticates
separately through npm trusted publishing over OIDC, so no npm credential is
stored in this repository.
