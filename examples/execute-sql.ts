/**
 * Executing statements that do not return rows.
 *
 *   npx tsx examples/execute-sql.ts
 */

import { CnosDBClient } from "../src/index.js";

const client = new CnosDBClient({
  url: process.env["CNOSDB_URL"] ?? "http://localhost:8902",
  username: process.env["CNOSDB_USERNAME"] ?? "root",
  password: process.env["CNOSDB_PASSWORD"] ?? "",
});

const database = "telemetry";

// `execute` treats any 2xx response as success and discards the body.
await client.execute(`CREATE DATABASE IF NOT EXISTS ${database}`);
console.log(`Database ${database} is ready.`);

await client.execute(
  `CREATE TABLE IF NOT EXISTS weather ` +
    `(temperature DOUBLE, humidity DOUBLE, TAGS(city))`,
  { database },
);
console.log("Table weather is ready.");

// Statements are sent verbatim; never concatenate untrusted input into SQL.
await client.execute(`DROP DATABASE IF EXISTS ${database}`);
console.log(`Database ${database} removed.`);
