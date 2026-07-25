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

/**
 * Node exits with code 13 when the event loop drains while a top-level `await`
 * is pending. Before the server accepts connections, an attempt can leave
 * nothing else queued, so the process would abandon the retry loop on the very
 * first failure — and the per-attempt abort timer could never fire either.
 * A referenced interval keeps the loop alive until polling is finished.
 */
const keepAlive = setInterval(() => {}, intervalMs);

const finish = (code, message) => {
  clearInterval(keepAlive);
  if (message !== undefined) {
    (code === 0 ? console.log : console.error)(message);
  }
  process.exit(code);
};

while (Date.now() < deadline) {
  try {
    const response = await fetch(new URL("api/v1/ping", `${url}/`), {
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      const body = await response.json();
      finish(
        0,
        `CnosDB is ready: status=${body.status} version=${body.version}`,
      );
    }
    lastError = `HTTP ${response.status}`;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

finish(
  1,
  `CnosDB did not become ready at ${url} within ${timeoutMs} ms. ` +
    `Last error: ${lastError}`,
);
