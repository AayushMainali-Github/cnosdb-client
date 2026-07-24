# Governance

This document describes how decisions are made in `cnosdb-client`. The project
is small, so the governance is deliberately light — but it is written down, so
that it stays predictable as the project grows or changes hands.

## Roles

### Contributor

Anyone who participates. A contributor may:

- open issues;
- join discussions;
- submit pull requests;
- review other people's work.

No permission is needed to become a contributor.

### Triager

A trusted contributor who helps keep the issue tracker honest. A triager may:

- apply and correct labels;
- request missing information;
- close duplicates and stale issues;
- help route accepted work to people who want it.

### Maintainer

A person responsible for the health of the project. A maintainer may:

- accept or decline proposals;
- review and merge pull requests;
- manage repository configuration;
- manage security reporting and remediation;
- appoint triagers and maintainers.

### Release manager

A maintainer acting in a release capacity. A release manager may:

- review release pull requests;
- verify build artifacts;
- authorize a release;
- verify npm and GitHub publication.

Initially one person holds all of these roles. That is a normal state for a new
project, not a permanent design.

## How decisions are made

Decisions are made by seeking consensus in the open, on the relevant issue or
pull request. Most decisions are uncontroversial and need no ceremony.

When consensus is not reached, maintainers decide, and the maintainer who
decides explains the reasoning in the thread. Maintainers hold final
responsibility for the result — including for decisions that turn out to be
wrong.

Significant decisions are recorded so that future contributors can understand
them without archaeology:

- Design decisions become an ADR in [docs/adr/](docs/adr/).
- Larger proposals start as an RFC issue labelled `rfc`.

Anything that changes the public API, the security posture, the release
process, or the project's licensing or branding is significant.

## Conflict of interest

Disclose any relevant commercial or organizational interest in an outcome
before participating in that decision. Do not merge a change whose main
beneficiary is an undisclosed interest of your own.

## Inactivity and removal

A maintainer who has been unreachable for roughly six months may be moved to
emeritus status by the remaining maintainers, with a note in
[MAINTAINERS.md](MAINTAINERS.md). This is administrative housekeeping, not a
judgement; returning maintainers can be reinstated by asking.

A maintainer may be removed for a serious or repeated breach of the
[Code of Conduct](CODE_OF_CONDUCT.md), or for actions that endanger users, such
as publishing unreviewed code or mishandling credentials.

## Succession

The project should never depend on one person being reachable. Maintainers
should:

- keep at least the npm package and GitHub repository access documented;
- add a second maintainer once a sustained contributor emerges;
- if stepping away, say so publicly and hand over access deliberately.

If the project becomes unmaintained, maintainers should mark it clearly in the
README and on npm rather than leaving users to guess.

## Changing this document

Changes to governance follow the ordinary contribution process: an issue, a
pull request, and maintainer approval.
