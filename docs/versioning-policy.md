# Versioning policy

`cnosdb-client` follows Semantic Versioning, with the pre-1.0 conventions that
SemVer itself allows for the `0.x` range.

## Before 1.0

The project is currently in the `0.x` range. The public API is young and may
still change.

| Bump      | Used for                                                       |
| --------- | -------------------------------------------------------------- |
| **patch** | Backwards-compatible bug fixes and hardening.                  |
| **minor** | New features, **and** intentional breaking changes before 1.0. |
| **major** | Reserved. A `1.0.0` release marks API stability.               |

The important consequence: **before 1.0 a minor bump can break you.** Pin the
minor version, or read the changelog before upgrading.

```json
{
  "dependencies": {
    "cnosdb-client": "~0.1.0"
  }
}
```

## Breaking changes still cost something

A minor version number does not make a breaking change casual. Every one
requires all of:

- an issue or RFC accepted before implementation;
- the `breaking change` label;
- a written rationale for why the break is worth it;
- migration notes showing the before and after;
- prominent wording in the changeset, so it leads the release notes;
- maintainer approval.

A break that cannot justify itself in those terms is not made.

## After 1.0

Once `1.0.0` ships, ordinary SemVer applies: breaking changes require a major
version, and the same rationale-and-migration requirements continue to apply.

## What counts as the public API

Only what `src/index.ts` exports and what the documented behaviour of those
exports guarantees:

- the `CnosDBClient` class and its documented method signatures and behaviour;
- `serializePoint` and its documented output;
- the eight error classes, their names, and their `instanceof` relationships;
- the exported TypeScript types;
- the package's entry points, `exports` map, and supported Node.js range.

Not part of the public API, and changeable in a patch:

- internal modules such as `src/http.ts`, including `Transport`;
- exact wording of error messages;
- internal helper names;
- the shape of `cause` values passed through from the runtime;
- anything not reachable from `src/index.ts`.

Raising the minimum Node.js version is a breaking change. Adding a runtime
dependency is at least a minor change and requires an ADR.

## Deprecation

Where practical a feature is deprecated before removal: marked with
`@deprecated` and documented in the changelog for at least one minor release,
with a working alternative available. Security fixes may move faster.

## Version support

Only the latest `0.x` line receives fixes, including security fixes. Older
minors are not backported. See [SECURITY.md](../SECURITY.md).
