/**
 * Timestamp precision understood by the CnosDB write endpoint.
 */
export type TimePrecision = "ms" | "us" | "ns";

/**
 * Minimal structural type of the global `fetch` function. Supplying a custom
 * implementation makes the client testable without a network.
 */
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
