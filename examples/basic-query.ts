/**
 * Health check and a simple typed query.
 *
 * Run against a local CnosDB server:
 *   npx tsx examples/basic-query.ts
 */

import { CnosDBClient, CnosDBError } from "../src/index.js";

const client = new CnosDBClient({
  url: process.env["CNOSDB_URL"] ?? "http://localhost:8902",
  username: process.env["CNOSDB_USERNAME"] ?? "root",
  password: process.env["CNOSDB_PASSWORD"] ?? "",
  database: "public",
  tenant: "cnosdb",
});

interface DatabaseRow {
  database_name: string;
}

try {
  const health = await client.ping();
  console.log(`CnosDB ${health.version} is ${health.status}`);

  // `T` is an assertion about the response shape, not runtime validation.
  const databases = await client.query<DatabaseRow[]>("SHOW DATABASES");
  console.log(
    "Databases:",
    databases.map((row) => row.database_name).join(", "),
  );
} catch (error) {
  if (error instanceof CnosDBError) {
    console.error(`CnosDB request failed: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
