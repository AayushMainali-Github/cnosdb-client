/**
 * Timestamp precision understood by the CnosDB write endpoint.
 */
export type TimePrecision = "ms" | "us" | "ns";

/**
 * Request body compression.
 *
 * `"gzip"` compresses write payloads and sets `Content-Encoding: gzip`.
 * `"none"` is the default and sends the body verbatim.
 */
export type Compression = "none" | "gzip";

/**
 * Minimal structural type of the global `fetch` function. Supplying a custom
 * implementation makes the client testable without a network.
 */
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
