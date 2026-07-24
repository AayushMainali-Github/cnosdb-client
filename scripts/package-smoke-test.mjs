#!/usr/bin/env node
/**
 * Builds a real tarball and installs it into throwaway ESM, CommonJS, and
 * TypeScript consumers. This catches packaging mistakes that unit tests
 * cannot see: a broken exports map, a missing build artifact, unresolvable
 * declarations, or files accidentally excluded from the tarball.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const workspace = mkdtempSync(join(tmpdir(), "cnosdb-client-smoke-"));

let failures = 0;

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    const detail = error.stdout || error.stderr || error.message;
    console.error(`  FAIL ${name}\n${String(detail).trim()}`);
  }
}

function createConsumer(name, files) {
  const dir = join(workspace, name);
  mkdirSync(dir, { recursive: true });
  for (const [file, contents] of Object.entries(files)) {
    writeFileSync(join(dir, file), contents);
  }
  run("npm", ["install", "--no-audit", "--no-fund", tarball], dir);
  return dir;
}

console.log("Building package…");
run("npm", ["run", "build"], projectRoot);

console.log("Packing tarball…");
const packed = JSON.parse(
  run("npm", ["pack", "--json", "--pack-destination", workspace], projectRoot),
);
const tarball = join(workspace, packed[0].filename);

console.log("\nTarball contents:");
const entries = packed[0].files.map((file) => file.path);
for (const entry of entries) console.log(`  ${entry}`);

console.log("\nChecking tarball contents:");
const required = [
  "dist/index.js",
  "dist/index.cjs",
  "dist/index.d.ts",
  "dist/index.d.cts",
  "dist/index.js.map",
  "dist/index.cjs.map",
  "package.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
];
for (const file of required) {
  check(`contains ${file}`, () => {
    if (!entries.includes(file)) throw new Error(`missing ${file}`);
  });
}

const forbidden = [
  /^src\//,
  /^tests\//,
  /^\.github\//,
  /^coverage\//,
  /^examples\//,
  /^docs\//,
  /^scripts\//,
  /\.env/,
  /tsconfig/,
  /vitest/,
];
for (const pattern of forbidden) {
  check(`excludes ${pattern}`, () => {
    const leaked = entries.filter((entry) => pattern.test(entry));
    if (leaked.length > 0) {
      throw new Error(`unexpected files: ${leaked.join(", ")}`);
    }
  });
}

console.log("\nESM consumer:");
const esmDir = createConsumer("esm", {
  "package.json": JSON.stringify({
    name: "smoke-esm",
    private: true,
    type: "module",
  }),
  "index.mjs": `
import assert from "node:assert/strict";
import {
  CnosDBClient,
  CnosDBAuthenticationError,
  CnosDBError,
  CnosDBTimeoutError,
  serializePoint,
} from "cnosdb-client";

assert.equal(typeof CnosDBClient, "function");
assert.equal(typeof serializePoint, "function");
assert.ok(new CnosDBAuthenticationError("x") instanceof CnosDBError);
assert.ok(new CnosDBTimeoutError("x") instanceof CnosDBError);

assert.equal(
  serializePoint({
    measurement: "weather",
    tags: { city: "Pokhara" },
    fields: { temperature: 24.5 },
    timestamp: 1784900000000,
  }),
  "weather,city=Pokhara temperature=24.5 1784900000000",
);

const calls = [];
const client = new CnosDBClient({
  url: "http://localhost:8902",
  username: "root",
  password: "",
  fetch: async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify({ version: "2.4.3", status: "healthy" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  },
});

const health = await client.ping();
assert.deepEqual(health, { version: "2.4.3", status: "healthy" });
assert.ok(calls[0].url.endsWith("/api/v1/ping"));

await client.writePoints({ measurement: "m", fields: { a: 1 } });
assert.ok(calls[1].url.includes("/api/v1/write"));
assert.equal(calls[1].init.body, "m a=1");

console.log("ESM consumer OK");
`,
});
check("imports and runs", () => run("node", ["index.mjs"], esmDir));

console.log("\nCommonJS consumer:");
const cjsDir = createConsumer("cjs", {
  "package.json": JSON.stringify({ name: "smoke-cjs", private: true }),
  "index.cjs": `
const assert = require("node:assert/strict");
const pkg = require("cnosdb-client");

assert.equal(typeof pkg.CnosDBClient, "function");
assert.equal(typeof pkg.serializePoint, "function");
for (const name of [
  "CnosDBError",
  "CnosDBAuthenticationError",
  "CnosDBRequestError",
  "CnosDBRateLimitError",
  "CnosDBServerError",
  "CnosDBTimeoutError",
  "CnosDBNetworkError",
  "CnosDBResponseError",
]) {
  assert.equal(typeof pkg[name], "function", name + " must be exported");
}

// Internal modules must not leak through the package root.
assert.equal(pkg.Transport, undefined);
assert.equal(pkg.normalizeBaseUrl, undefined);

const client = new pkg.CnosDBClient({ url: "http://localhost:8902" });
assert.ok(client instanceof pkg.CnosDBClient);
assert.equal(pkg.serializePoint({ measurement: "m", fields: { a: true } }), "m a=true");

console.log("CommonJS consumer OK");
`,
});
check("requires and runs", () => run("node", ["index.cjs"], cjsDir));

console.log("\nTypeScript consumer:");
const tsDir = createConsumer("ts", {
  "package.json": JSON.stringify({
    name: "smoke-ts",
    private: true,
    type: "module",
  }),
  "tsconfig.json": JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    },
    include: ["index.ts"],
  }),
  "index.ts": `
import {
  CnosDBClient,
  CnosDBError,
  serializePoint,
  type FetchLike,
  type Point,
  type PingResult,
  type TimePrecision,
} from "cnosdb-client";

const precision: TimePrecision = "ms";

const point: Point = {
  measurement: "weather",
  tags: { city: "Pokhara" },
  fields: { temperature: 24.5, active: true, visitors: 18n, note: "clear" },
  timestamp: new Date(),
};

const line: string = serializePoint(point, precision);

const fetchImpl: FetchLike = async () =>
  new Response("{}", { status: 200 });

const client = new CnosDBClient({
  url: "http://localhost:8902",
  username: "root",
  password: "",
  timeoutMs: 5_000,
  fetch: fetchImpl,
});

interface Row {
  time: string;
  temperature: number;
}

export async function main(): Promise<void> {
  const health: PingResult = await client.ping();
  const rows: Row[] = await client.query<Row[]>("SELECT 1");
  await client.execute("CREATE DATABASE IF NOT EXISTS t");
  await client.writeLineProtocol(line, { precision });
  await client.writePoints([point], { precision });
  try {
    await client.query("SELECT 1", { signal: AbortSignal.timeout(1_000) });
  } catch (error) {
    if (error instanceof CnosDBError) {
      const status: number | undefined = error.status;
      void status;
    }
  }
  void health;
  void rows;
}
`,
});
check("type checks against published declarations", () => {
  run(
    "npm",
    ["install", "--no-audit", "--no-fund", "--save-dev", "typescript"],
    tsDir,
  );
  run("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], tsDir);
});

rmSync(workspace, { recursive: true, force: true });

console.log("");
if (failures > 0) {
  console.error(`Package smoke test failed with ${failures} problem(s).`);
  process.exit(1);
}
console.log("Package smoke test passed.");
