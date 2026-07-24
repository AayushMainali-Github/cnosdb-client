#!/usr/bin/env node
/**
 * Polls the CnosDB ping endpoint until the server is healthy or the bounded
 * deadline expires. Used by the integration workflow and by local runs.
 *
 * Usage: node scripts/wait-for-cnosdb.mjs [url] [timeoutMs]
 */

const url = process.argv[2] ?? "http://localhost:8902";
const timeoutMs = Number(process.argv[3] ?? 120_000);
const intervalMs = 1_000;

const deadline = Date.now() + timeoutMs;
let lastError = "no attempt completed";

while (Date.now() < deadline) {
  try {
    const response = await fetch(new URL("api/v1/ping", `${url}/`), {
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      const body = await response.json();
      console.log(
        `CnosDB is ready: status=${body.status} version=${body.version}`,
      );
      process.exit(0);
    }
    lastError = `HTTP ${response.status}`;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

console.error(
  `CnosDB did not become ready at ${url} within ${timeoutMs} ms. ` +
    `Last error: ${lastError}`,
);
process.exit(1);
