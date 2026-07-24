import type { TimePrecision } from "../types/index.js";

export const DEFAULT_DATABASE = "public";
export const DEFAULT_TENANT = "cnosdb";
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_PRECISION: TimePrecision = "ms";

/** Accepted write precisions, in the order used by error messages. */
export const PRECISIONS: readonly TimePrecision[] = ["ms", "us", "ns"];

/**
 * Endpoint paths, relative to the configured base URL so that a base path is
 * preserved. A leading slash here would discard it.
 */
export const PING_PATH = "api/v1/ping";
export const SQL_PATH = "api/v1/sql";
export const WRITE_PATH = "api/v1/write";
