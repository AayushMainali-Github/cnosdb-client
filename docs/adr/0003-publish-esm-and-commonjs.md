# ADR-0003: Publish ESM and CommonJS

**Status:** Accepted
**Date:** 2026-07-24

## Context

The Node.js ecosystem is still split. New projects and ESM-only tooling use
`import`; a very large body of existing services, especially those compiling
TypeScript to CommonJS, use `require`. A library that ships only ESM is
unusable to the second group without a build change they may not control.

Dual publishing is also easy to get subtly wrong: a mismatched `exports` map,
declarations that resolve for `import` but not `require`, or the "dual package
hazard" where both copies load and `instanceof` checks across them fail.

## Decision

Publish ESM, CommonJS, TypeScript declarations for both, and source maps, built
with tsup and exposed through a conditional `exports` map:

```json
{
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    },
    "./package.json": "./package.json"
  }
}
```

Only the root entry point and `package.json` are exported. Internal modules are
unreachable, so they remain free to change.

Correctness is enforced by tooling rather than assumed: `publint --strict` and
`attw --pack` run in `npm run check`, and the package smoke test installs the
real tarball into throwaway ESM, CommonJS, and TypeScript consumers.

## Consequences

**Good:**

- Both ecosystems can install the package without configuration.
- Declarations resolve correctly under `node10`, `node16` from CJS, `node16` from ESM, and bundler resolution, verified by `attw`.
- Source maps make stack traces from the published artifact point at real source.
- The controlled `exports` map means the public API is exactly what `src/index.ts` exports.

**Costs:**

- Two builds and two declaration files to keep in sync, which is why validation is automated rather than manual.
- The dual package hazard exists in principle: an application that somehow loads both builds would have two distinct copies of each error class, breaking `instanceof` across them. In practice a single resolution condition applies per package, and the client holds no module-level mutable state to diverge.
- The published tarball is roughly twice the size it would otherwise be. At this scale that is negligible.

## Alternatives considered

**ESM only.** Simpler to build and the direction the ecosystem is heading, but
it would exclude every CommonJS consumer today. Rejected as premature for a
client library whose users are ordinary backend services.

**CommonJS only.** Maximum compatibility with older code, but poor for
tree-shaking and increasingly awkward for modern tooling. Rejected.

**Hand-written build with `tsc` twice.** Workable, but tsup produces both
formats and both declaration files in one configuration, and it already handles
the `.cjs`/`.d.cts` naming that the `exports` map depends on.
