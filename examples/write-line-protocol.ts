/**
 * Writing a raw Line Protocol payload.
 *
 *   npx tsx examples/write-line-protocol.ts
 */

import { CnosDBClient, CnosDBRequestError } from "../src/index.js";

const client = new CnosDBClient({
  url: process.env["CNOSDB_URL"] ?? "http://localhost:8902",
  username: process.env["CNOSDB_USERNAME"] ?? "root",
  password: process.env["CNOSDB_PASSWORD"] ?? "",
});

const database = "telemetry";
await client.execute(`CREATE DATABASE IF NOT EXISTS ${database}`);

// The payload is sent exactly as written: one line per point, no trailing
// newline required, and the precision must match the timestamps you supply.
const now = Date.now();
const payload = [
  `weather,city=Pokhara temperature=24.5,humidity=68 ${now}`,
  `weather,city=Kathmandu temperature=21.5,humidity=60 ${now}`,
].join("\n");

try {
  await client.writeLineProtocol(payload, { database, precision: "ms" });
  console.log("Wrote 2 points.");
} catch (error) {
  if (error instanceof CnosDBRequestError && error.status === 413) {
    console.error("Payload too large; send fewer points per request.");
  } else {
    throw error;
  }
}
