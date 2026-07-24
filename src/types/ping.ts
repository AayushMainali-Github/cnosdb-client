/**
 * Result of {@link CnosDBClient.ping}.
 */
export interface PingResult {
  /** Server-reported version string. */
  readonly version: string;
  /** Server-reported status string, for example `"healthy"`. */
  readonly status: string;
}
