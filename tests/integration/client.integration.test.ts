import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CnosDBClient } from "../../src/client.js";
import { CnosDBRequestError } from "../../src/errors/index.js";
import type { PingResult } from "../../src/types/index.js";
import { captureError } from "../helpers.js";

/**
 * These tests run against a real CnosDB server.
 *
 * By default a throwaway container is started and removed automatically. Set
 * `CNOSDB_URL` to reuse a server that is already running, which is how the
 * integration workflow supplies its service container.
 */
const IMAGE = process.env["CNOSDB_IMAGE"] ?? "cnosdb/cnosdb:community-latest";
const CONTAINER_NAME = `cnosdb-client-it-${process.pid}`;
const EXTERNAL_URL = process.env["CNOSDB_URL"];
const PORT = Number(process.env["CNOSDB_PORT"] ?? 8902);
const USERNAME = process.env["CNOSDB_USERNAME"] ?? "root";
const PASSWORD = process.env["CNOSDB_PASSWORD"] ?? "";

const baseUrl = EXTERNAL_URL ?? `http://127.0.0.1:${PORT}`;
const database = `cnosdb_client_it_${Date.now()}`;
const measurement = "weather";

let startedContainer = false;
let client: CnosDBClient;
let serverInfo: PingResult;

function docker(args: readonly string[]): string {
  return execFileSync("docker", [...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

async function waitForHealth(timeoutMs = 120_000): Promise<PingResult> {
  const probe = new CnosDBClient({ url: baseUrl, timeoutMs: 5_000 });
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await probe.ping();
    } catch (error) {
      lastError = error;
      await sleep(1_000);
    }
  }
  throw new Error(
    `CnosDB at ${baseUrl} never became healthy: ${String(lastError)}`,
  );
}

beforeAll(async () => {
  if (!EXTERNAL_URL) {
    docker(["rm", "-f", CONTAINER_NAME]);
    docker([
      "run",
      "-d",
      "--name",
      CONTAINER_NAME,
      "-p",
      `${PORT}:8902`,
      IMAGE,
    ]);
    startedContainer = true;
  }

  serverInfo = await waitForHealth();

  client = new CnosDBClient({
    url: baseUrl,
    username: USERNAME,
    password: PASSWORD,
    timeoutMs: 30_000,
  });

  await client.execute(`CREATE DATABASE IF NOT EXISTS ${database}`);
});

afterAll(async () => {
  try {
    await client.execute(`DROP DATABASE IF EXISTS ${database}`);
  } catch {
    // Cleanup of the test database must never mask a test failure.
  }
  if (startedContainer) {
    // Always remove the container, even when a test failed.
    docker(["rm", "-f", CONTAINER_NAME]);
  }
});

describe("ping", () => {
  it("reports a healthy server and a version string", () => {
    expect(serverInfo.status).toBe("healthy");
    expect(serverInfo.version).toMatch(/\d+\.\d+\.\d+/);
    // Recorded so the tested server version appears in integration output.
    console.log(`Tested against CnosDB ${serverInfo.version} (${IMAGE})`);
  });
});

describe("execute", () => {
  it("creates a table", async () => {
    await expect(
      client.execute(
        `CREATE TABLE IF NOT EXISTS ${measurement} ` +
          `(temperature DOUBLE, humidity DOUBLE, TAGS(city))`,
        { database },
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects malformed SQL with a typed request error", async () => {
    const error = await captureError<CnosDBRequestError>(
      client.execute("SELECT * FROM table_that_does_not_exist", { database }),
    );
    expect(error).toBeInstanceOf(CnosDBRequestError);
    expect(error.status).toBeGreaterThanOrEqual(400);
    expect(error.responseBody).toBeTruthy();
  });
});

describe("writes and queries", () => {
  const city = "Pokhara";

  it("writes raw Line Protocol", async () => {
    await expect(
      client.writeLineProtocol(
        `${measurement},city=Kathmandu temperature=21.5,humidity=60 ` +
          `${Date.now()}`,
        { database, precision: "ms" },
      ),
    ).resolves.toBeUndefined();
  });

  it("writes a single structured point", async () => {
    await client.writePoints(
      {
        measurement,
        tags: { city },
        fields: { temperature: 24.5, humidity: 68 },
        timestamp: new Date(),
      },
      { database, precision: "ms" },
    );

    const rows = await client.query<{ temperature: number; city: string }[]>(
      `SELECT city, temperature FROM ${measurement} WHERE city = '${city}'`,
      { database },
    );
    expect(rows.some((row) => row.temperature === 24.5)).toBe(true);
  });

  it("writes multiple structured points and reads them back", async () => {
    const base = Date.now();
    await client.writePoints(
      [
        {
          measurement,
          tags: { city: "Lalitpur" },
          fields: { temperature: 30.5, humidity: 40 },
          timestamp: base,
        },
        {
          measurement,
          tags: { city: "Lalitpur" },
          fields: { temperature: 31.5, humidity: 41 },
          timestamp: base + 1,
        },
      ],
      { database, precision: "ms" },
    );

    const rows = await client.query<{ temperature: number }[]>(
      `SELECT temperature FROM ${measurement} ` +
        `WHERE city = 'Lalitpur' ORDER BY time`,
      { database },
    );
    const temperatures = rows.map((row) => row.temperature);
    expect(temperatures).toContain(30.5);
    expect(temperatures).toContain(31.5);
  });

  it("round-trips every supported field type", async () => {
    await client.writePoints(
      {
        measurement: "types_check",
        tags: { kind: "all" },
        fields: {
          floatValue: -1.25,
          intValue: 42n,
          boolValue: true,
          stringValue: 'quoted "value", with comma\\slash',
        },
        timestamp: new Date(),
      },
      { database, precision: "ms" },
    );

    const rows = await client.query<
      {
        floatValue: number;
        intValue: number;
        boolValue: boolean;
        stringValue: string;
      }[]
    >("SELECT * FROM types_check", { database });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.floatValue).toBe(-1.25);
    expect(rows[0]!.intValue).toBe(42);
    expect(rows[0]!.boolValue).toBe(true);
    expect(rows[0]!.stringValue).toBe('quoted "value", with comma\\slash');
  });

  it("returns an empty result set rather than throwing", async () => {
    // CnosDB returns an empty body rather than "[]" when nothing matches,
    // which the client surfaces as undefined.
    const rows = await client.query<unknown[] | undefined>(
      `SELECT * FROM ${measurement} WHERE city = 'nowhere-at-all'`,
      { database },
    );
    expect(rows ?? []).toEqual([]);
  });
});

describe("cancellation", () => {
  it("rejects with an abort error when the caller cancels", async () => {
    const controller = new AbortController();
    const pending = client.query(`SELECT * FROM ${measurement}`, {
      database,
      signal: controller.signal,
    });
    controller.abort();

    const error = await captureError<CnosDBRequestError>(pending);
    expect(error).toBeInstanceOf(CnosDBRequestError);
    expect(error.code).toBe("ABORT_ERR");
  });
});
