# ADR-0008: Group source into domain folders

**Status:** Accepted
**Date:** 2026-07-24

## Context

Version 0.1.0 shipped with five flat source files: `types.ts`, `errors.ts`,
`line-protocol.ts`, `http.ts`, and `client.ts`, totalling 1,189 lines. Nothing
was failing. The files were a normal size, the largest being `http.ts` at 356
lines, and the public API was already isolated behind `index.ts`.

Two pressures argued for change anyway.

Each file had accumulated several concerns. `errors.ts` held the base class,
seven subclasses, the status-to-error mapping, and a response-body summarizer.
`http.ts` mixed URL normalization, credential encoding, body truncation, abort
detection, and the request lifecycle. The concerns were separable, but nothing in
the layout said so, and each roadmap item adds surface to the same files.

The tests inherited the shape. `tests/unit/http.test.ts` was 533 lines and
`client.test.ts` 461, so a failure named a layer rather than a unit. Worse, the
most correctness-critical logic in the package — Line Protocol escaping, and the
argument validation every error message depends on — was private to a large file
and reachable only indirectly, through `serializePoint` and through five public
client methods respectively.

## Decision

Group source into one folder per domain: `types/`, `errors/`,
`line-protocol/`, `http/`, and `client/`. Each folder holds three to five focused
files and an `index.ts` barrel. Cross-folder imports go through the barrel;
imports within a folder are direct.

Unit tests mirror the structure under `tests/unit/<folder>/` and import the
specific file under test rather than the barrel, so a failure localizes.

The published API is unchanged. `src/index.ts` remains the only entry point, the
`exports` map is untouched, and folder internals are not exported from the
package.

## Alternatives considered

**Leave the flat layout.** Defensible on size alone: 1,189 lines does not
require folders, and restructuring spends effort without adding a feature. It was
rejected because the cost only grows. The seams are already visible, and
splitting a file after it has doubled means a larger diff over code with more
history. It also leaves escaping and validation effectively untestable in
isolation, which is a present cost, not a future one.

**One exported symbol per file.** Maximum granularity, and consistent. Rejected
as an over-correction. Eight error classes in eight files would mean opening
eight files to understand one hierarchy, and the sibling classes are genuinely
cohesive — each is five lines that sets a name. Grouping them by cause conveys
something a directory listing of individual classes cannot.

**Split `CnosDBClient` into per-operation modules.** One file each for `ping`,
`query`, `execute`, and the writes. Rejected because those five methods are one
coherent public surface sharing configuration and private helpers. Splitting them
would scatter the class a reader most wants to read as a whole, and would force
the shared state into an awkward extra seam.

**Barrel-free, direct imports everywhere.** Slightly less indirection and
marginally better for bundlers. Rejected because it couples callers to another
folder's internal file names, so any internal rename becomes a cross-folder
change. `sideEffects: false` plus the bundler's own analysis already handles
tree-shaking, which the packaging checks verify.

## Consequences

Finding code is now a two-step lookup — folder, then file — which is faster than
scanning a long file once a reader knows the domains, and slower for someone who
knew the old layout by heart.

Escaping rules and argument validation are directly testable. The suite grew from
203 to 245 tests, entirely from cases that could not be written against the
private helpers before.

There are more files, so a change that crosses concerns touches more of them. The
barrel rule bounds this: a folder's internals can be rearranged without any other
folder noticing.

The public surface is now asserted by a test as well as by the packaging checks,
so this restructuring — and any future one — cannot quietly change what consumers
import.
