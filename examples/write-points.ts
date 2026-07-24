/**
 * Writing structured points, including every supported field type.
 *
 *   npx tsx examples/write-points.ts
 */

import { CnosDBClient, serializePoint, type Point } from "../src/index.js";

const client = new CnosDBClient({
  url: process.env["CNOSDB_URL"] ?? "http://localhost:8902",
  username: process.env["CNOSDB_USERNAME"] ?? "root",
  password: process.env["CNOSDB_PASSWORD"] ?? "",
});

const database = "telemetry";
await client.execute(`CREATE DATABASE IF NOT EXISTS ${database}`);

const points: Point[] = [
  {
    measurement: "weather",
    tags: { city: "Pokhara", sensor: "outdoor-1" },
    fields: {
      temperature: 24.5, // number  -> float
      humidity: 68, // number  -> float
      active: true, // boolean -> true/false
      observations: 12n, // bigint  -> 12i
      condition: "cloudy", // string  -> "cloudy"
    },
    timestamp: new Date(),
  },
  {
    measurement: "weather",
    tags: { city: "Kathmandu", sensor: "outdoor-2" },
    fields: { temperature: 21.5, humidity: 60, active: false },
    // Omitting the timestamp lets the server assign the write time.
  },
];

// Inspect exactly what will be sent; serializePoint is pure and deterministic.
for (const point of points) {
  console.log(serializePoint(point, "ms"));
}

// Every point is serialized before any request, so an invalid point rejects
// the whole batch instead of writing part of it.
await client.writePoints(points, { database, precision: "ms" });
console.log(`Wrote ${points.length} points.`);

const rows = await client.query<{ city: string; temperature: number }[]>(
  "SELECT city, temperature FROM weather ORDER BY time DESC LIMIT 5",
  { database },
);
console.log(rows);
