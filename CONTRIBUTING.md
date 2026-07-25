# Contributing to cnosdb-client

Thanks for taking the time to contribute. This project is small on purpose, and
that makes every contribution easy to review and easy to release. Whether you
are reporting a bug, improving a sentence in the README, or adding a feature,
you are welcome here.

Everyone participating agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).

## The one rule that shapes everything else

> Except for the initial repository bootstrap, changes must not be pushed
> directly to `main`. Every proposed change should normally begin with an
> issue, be implemented on a focused branch, include appropriate tests and
> documentation, and be submitted through a pull request. User-facing changes
> must include a Changeset describing their release impact. Pull requests are
> squash-merged after required checks pass. Package versions and changelogs are
> prepared through automated release pull requests.

### Issue first

Open an issue before writing code, and wait for it to be labelled
`status: accepted`. This protects your time: it is far better to discover in a
three-line comment that an idea needs a different shape than to discover it
after you have written the implementation.

A tiny typo fix still needs traceability, but it does not need ceremony. Open a
short documentation issue and reference it. Traceability is not waived just
because a change is small.

### Contribution exceptions

Only these may bypass the issue-first rule:

- Automated release pull requests created by Changesets.
- Dependabot pull requests. They still require passing checks and review.
- Private security remediation coordinated through [SECURITY.md](SECURITY.md).
- Emergency repository repair by a maintainer, followed by a public note when appropriate.

Maintainer convenience is not an exception.

## Prerequisites

- Node.js 22.14.0 or newer.
- npm 10 or newer.
- Docker, only if you intend to run integration tests.

## Setup

```bash
git clone https://github.com/AayushMainali-Github/cnosdb-client.git
cd cnosdb-client
npm ci
npm run check
```

`npm run check` runs every fast, deterministic gate: format check, lint,
typecheck, unit tests with coverage, build, and package validation. If it
passes locally, CI will usually agree.

## Branch naming

```text
<type>/<issue-number>-<short-kebab-description>
```

Types are `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, and `security`.

```text
feat/12-add-chunked-query-streaming
fix/27-handle-empty-response
docs/31-improve-authentication-guide
```

There is no `develop` branch. `main` is always releasable.

## Where code goes

`src/` is grouped into one folder per domain — `types/`, `errors/`,
`line-protocol/`, `csv/`, `json/`, `http/`, and `client/` — each with an
`index.ts` barrel. Add code to the folder that owns the concern, and export it
from that barrel only if another folder needs it.

Cross-folder imports go through the barrel, never into a sibling's internals:
import from `../http/index.js`, not `../http/transport.js`. Files inside one
folder import each other directly. Unit tests are the exception and import the
specific file under test, so a failure names the unit that broke.

New public types go in `types/` and must be re-exported from `src/index.ts` to
reach consumers. `tests/unit/public-api.test.ts` asserts the exact published
export set, so it will fail until you do — that is deliberate, since adding to
the public surface is a decision, not a side effect.

[docs/architecture.md](docs/architecture.md) describes the layout, and
[ADR-0008](docs/adr/0008-group-source-into-domain-folders.md) records why it is
this shape.

## Coding standards

- TypeScript is strict. Do not weaken `tsconfig.json` to make an error go away.
- Prefer small, readable code over clever abstractions.
- Keep runtime dependencies at zero. Adding one requires an ADR.
- Public API changes need TSDoc.
- Do not log from `src/`; a library should not decide how an application logs.
- Never let a credential reach an error message, a log line, or a URL.
- Formatting is Prettier's job. Run `npm run format`.

## Tests

Every behavioural change needs a test.

```bash
npm run test:unit
npm run test:coverage
npm run test:integration   # starts and removes a CnosDB container
npm run smoke              # packs the tarball into clean ESM/CJS/TS consumers
```

Coverage thresholds are 90% lines, functions, and statements, and 85% branches.
Do not reach a threshold by excluding files or writing assertions that cannot
fail. If code is genuinely hard to test, say so in the pull request and we will
work it out in review.

Unit tests must never touch the network; inject `fetch` instead. Integration
tests must clean up their container and database even when they fail.

## Documentation

Update the README when user-facing behaviour changes, add or update an example
when it helps, and record significant design decisions as an ADR in
[docs/adr/](docs/adr/).

## Changesets

User-facing changes need a changeset:

```bash
npm run changeset
```

Pick `patch` for a backwards-compatible fix and `minor` for a new feature. Before
1.0, an intentional breaking change is also `minor` and additionally needs the
`breaking change` label, an accepted design issue, and migration notes.

Write the changeset for the person reading release notes, not for the reviewer:

- Good: "Preserve CnosDB response bodies on rate-limit errors to improve retry diagnostics."
- Bad: "Refactored request handler."

Keep each paragraph of the summary on a single line, however long. Unlike the
rest of the repository, changeset prose must not be hard-wrapped: Changesets
copies it verbatim into `CHANGELOG.md` and into the release pull request body,
and GitHub renders a single newline inside a pull request body as a line break.
A summary wrapped at 80 columns therefore arrives with breaks mid-sentence.

A changeset is usually unnecessary for test-only, CI-only, or internal
refactoring changes with provably unchanged behaviour. Say why in the pull
request and apply the `no-changeset` label.

## Pull requests

Title your pull request in Conventional Commit form, because it becomes the
squashed commit message:

```text
feat(client): add configurable query timeout
fix(protocol): escape string-field backslashes
docs(readme): explain Basic authentication
```

The title is validated by CI against:

```regex
^(feat|fix|docs|test|refactor|perf|build|ci|chore|revert|security)(\([a-z0-9-]+\))?!?: .+
```

Do not put the issue number in the title; GitHub appends the pull request number
on squash. Link the issue in the body with `Closes #12`.

Fill in the pull request template, keep the change focused on one problem, and
leave unrelated cleanup for another pull request.

## Review expectations

Maintainers aim to make a first response within about a week; this is a goal,
not a guarantee. Reviews focus on correctness, security, public API shape, test
quality, and documentation. Expect questions — they are about the code, never
about you. Resolve every conversation before merge.

## Definition of Done

```text
[ ] An accepted issue exists.
[ ] The PR links the issue.
[ ] The change is focused.
[ ] The implementation is complete.
[ ] Public API is documented.
[ ] Unit tests are added or updated.
[ ] Integration tests are added or updated when applicable.
[ ] Examples are updated when applicable.
[ ] A changeset is included or omission is justified.
[ ] Formatting passes.
[ ] Lint passes.
[ ] Type checking passes.
[ ] Tests pass.
[ ] Build passes.
[ ] Package validation passes when relevant.
[ ] No secrets are present.
[ ] Review discussions are resolved.
[ ] PR title follows convention.
[ ] Breaking behavior has migration notes.
```

## How a release happens

You do not edit the version number. Merged changesets accumulate into an
automated release pull request that updates the version and changelog. A
maintainer reviews and merges it, and publication to npm follows. The full
process is in [docs/release-process.md](docs/release-process.md).

## Security

Do not open a public issue for a vulnerability. Follow
[SECURITY.md](SECURITY.md) for private reporting.
