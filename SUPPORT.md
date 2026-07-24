# Support

Thanks for using `cnosdb-client`. Here is where to go for what.

## Where to ask

| What you have            | Where it goes                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| A usage question         | [Discussions](https://github.com/AayushMainali-Github/cnosdb-client/discussions), when enabled   |
| A reproducible bug       | [Bug report issue](https://github.com/AayushMainali-Github/cnosdb-client/issues/new/choose)      |
| A feature proposal       | [Feature request issue](https://github.com/AayushMainali-Github/cnosdb-client/issues/new/choose) |
| A documentation problem  | [Documentation issue](https://github.com/AayushMainali-Github/cnosdb-client/issues/new/choose)   |
| A security vulnerability | [SECURITY.md](SECURITY.md) — never a public issue                                                |

Read the [README](README.md) first; the error handling, timeout, and
serialization sections answer most questions.

## No service-level agreement

This is a volunteer-maintained open-source project. There is no guaranteed
response time and no support contract. Maintainers aim to respond to issues
within about a week. Well-prepared reports get answered fastest.

## What to include in a bug report

A bug we can reproduce is a bug we can fix. Please include:

- `cnosdb-client` version;
- Node.js version and operating system;
- CnosDB version and how it is running, for example the Docker image tag;
- a minimal code sample that fails;
- what you expected and what actually happened;
- the full error, including `name`, `message`, and `status`.

Remove passwords, tokens, hostnames, and any real data before posting. If you
paste a configuration object, redact the `password` field.

## Out of scope

These are not supported here:

- CnosDB server administration, tuning, and installation — ask the CnosDB project.
- SQL authoring help unrelated to this client.
- Browser, Deno, Bun, and React Native usage. This package targets Node.js 22 and newer only.
- Features explicitly excluded from the current scope, such as streaming queries, retries, or connection pooling. See [ROADMAP.md](ROADMAP.md).

This project is unofficial and not affiliated with CnosDB, so it cannot answer
for the CnosDB server or its roadmap.
