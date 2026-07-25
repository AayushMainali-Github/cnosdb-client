import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CnosDBClient } from "../../src/client/index.js";
import {
  AUTH_FAILED_CODE,
  CnosDBAuthenticationError,
  CnosDBRequestError,
} from "../../src/errors/index.js";
import { captureError } from "../helpers.js";

/**
 * Authentication against a server that actually enforces it.
 *
 * The stock image ships `auth_enabled = false`, so the main integration suite
 * cannot tell a correct password from a wrong one: both succeed. These tests
 * therefore run their own container in two phases — create a user while
 * authentication is off, then restart with it on — because CnosDB reads the
 * setting only at startup and the built-in `root` user carries
 * `must_change_password`, which locks it out once enforcement begins.
 *
 * This suite always builds its own container on its own port, so it ignores
 * `CNOSDB_URL` and runs even in CI, where a shared server is already supplied.
 * It skips only when Docker is unavailable, since there is then nothing to
 * configure.
 */
const IMAGE = process.env["CNOSDB_IMAGE"] ?? "cnosdb/cnosdb:community-latest";
const CONTAINER = `cnosdb-client-auth-${process.pid}`;
const PORT = Number(process.env["CNOSDB_AUTH_PORT"] ?? 8903);
const USER = "auth_probe";
const PASSWORD = "auth-probe-secret";
const baseUrl = `http://127.0.0.1:${PORT}`;

let configDir: string | undefined;
let configPath = "";

function docker(args: readonly string[]): string {
  return execFileSync("docker", [...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function dockerAvailable(): boolean {
  try {
    docker(["info"]);
    return true;
  } catch {
    return false;
  }
}

const skip = !dockerAvailable();

function writeConfig(authEnabled: boolean): void {
  // `--entrypoint` is required: the image's entrypoint is the server itself,
  // which would treat the path as an argument instead of printing the file.
  const source = docker([
    "run",
    "--rm",
    "--entrypoint",
    "cat",
    IMAGE,
    "/etc/cnosdb/cnosdb.conf",
  ]);
  const setting = /^auth_enabled = .*$/m;
  if (!setting.test(source)) {
    throw new Error(
      "The CnosDB config no longer contains an `auth_enabled` line; this " +
        "test's assumption about how to enable authentication is stale.",
    );
  }
  writeFileSync(
    configPath,
    source.replace(setting, `auth_enabled = ${String(authEnabled)}`),
  );
}

async function waitForHealth(timeoutMs = 120_000): Promise<void> {
  const probe = new CnosDBClient({ url: baseUrl, timeoutMs: 5_000 });
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await probe.ping();
      return;
    } catch (error) {
      lastError = error;
      await sleep(1_000);
    }
  }
  throw new Error(
    `CnosDB at ${baseUrl} never became healthy: ${String(lastError)}`,
  );
}

function clientFor(username?: string, password?: string): CnosDBClient {
  return new CnosDBClient({
    url: baseUrl,
    timeoutMs: 30_000,
    ...(username === undefined ? {} : { username }),
    ...(password === undefined ? {} : { password }),
  });
}

beforeAll(async () => {
  if (skip) return;

  configDir = mkdtempSync(join(tmpdir(), "cnosdb-auth-"));
  configPath = join(configDir, "cnosdb.conf");

  writeConfig(false);
  docker(["rm", "-f", CONTAINER]);
  docker([
    "run",
    "-d",
    "--name",
    CONTAINER,
    "-p",
    `${PORT}:8902`,
    "-v",
    `${configPath}:/etc/cnosdb/cnosdb.conf:ro`,
    IMAGE,
  ]);
  await waitForHealth();

  // Create the user while anyone may issue SQL. `root` cannot be used once
  // enforcement is on, because it must change its password first.
  const admin = clientFor("root", "");
  await admin.execute(
    `CREATE USER IF NOT EXISTS ${USER} WITH PASSWORD = '${PASSWORD}'`,
  );
  await admin.execute(`ALTER TENANT cnosdb ADD USER ${USER} AS member`);

  writeConfig(true);
  docker(["restart", CONTAINER]);
  await waitForHealth();
}, 300_000);

afterAll(() => {
  if (skip) return;
  docker(["rm", "-f", CONTAINER]);
  if (configDir !== undefined) {
    rmSync(configDir, { recursive: true, force: true });
  }
});

describe.skipIf(skip)("authentication against an enforcing server", () => {
  it("accepts correct credentials", async () => {
    const rows = await clientFor(USER, PASSWORD).query<{ x: number }[]>(
      "SELECT 1 AS x",
    );
    expect(rows).toBeTruthy();
  });

  it("raises CnosDBAuthenticationError for a wrong password", async () => {
    const error = await captureError<CnosDBAuthenticationError>(
      clientFor(USER, "definitely-not-the-password").query("SELECT 1"),
    );

    expect(error).toBeInstanceOf(CnosDBAuthenticationError);
    // CnosDB answers 422 rather than 401, which is exactly why the client
    // classifies on the error code instead of the status.
    expect(error.status).toBe(422);
    expect(error.errorCode).toBe(AUTH_FAILED_CODE);
  });

  it("raises CnosDBAuthenticationError for an unknown user", async () => {
    const error = await captureError<CnosDBAuthenticationError>(
      clientFor("no_such_user", PASSWORD).query("SELECT 1"),
    );

    expect(error).toBeInstanceOf(CnosDBAuthenticationError);
    expect(error.errorCode).toBe(AUTH_FAILED_CODE);
  });

  it("reports absent credentials as a rejected request, not an auth failure", async () => {
    // The server never sees a credential to reject: it refuses the request for
    // lacking the header at all, with a generic code, so the client cannot
    // honestly classify it as an authentication failure.
    const error = await captureError<CnosDBRequestError>(
      clientFor().query("SELECT 1"),
    );

    expect(error).toBeInstanceOf(CnosDBRequestError);
    expect(error).not.toBeInstanceOf(CnosDBAuthenticationError);
    expect(error.status).toBe(400);
    expect(error.responseBody).toContain("authorization");
  });

  it("rejects writes with bad credentials too", async () => {
    const error = await captureError<CnosDBAuthenticationError>(
      clientFor(USER, "wrong").writePoints({
        measurement: "m",
        fields: { v: 1 },
      }),
    );

    expect(error).toBeInstanceOf(CnosDBAuthenticationError);
    expect(error.errorCode).toBe(AUTH_FAILED_CODE);
  });

  it("leaves ping open, which the server does not authenticate", async () => {
    const health = await clientFor().ping();
    expect(health.status).toBe("healthy");
  });

  it("never leaks the password into the error", async () => {
    const error = await captureError<CnosDBAuthenticationError>(
      clientFor(USER, PASSWORD.concat("-wrong")).query("SELECT 1"),
    );

    const serialized = `${error.message} ${error.responseBody ?? ""}`;
    expect(serialized).not.toContain(PASSWORD);
  });
});
