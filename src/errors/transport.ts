import { CnosDBError, type CnosDBErrorOptions } from "./base.js";

/**
 * Failures where no usable response was ever received, so there is no status to
 * report.
 */

/** The request exceeded the configured timeout and was aborted by the client. */
export class CnosDBTimeoutError extends CnosDBError {
  /** The timeout that elapsed, in milliseconds. */
  readonly timeoutMs?: number;

  constructor(
    message: string,
    options: CnosDBErrorOptions & { readonly timeoutMs?: number } = {},
  ) {
    super(message, options);
    this.name = "CnosDBTimeoutError";
    if (options.timeoutMs !== undefined) this.timeoutMs = options.timeoutMs;
  }
}

/** The request never reached the server, or the connection failed. */
export class CnosDBNetworkError extends CnosDBError {
  constructor(message: string, options: CnosDBErrorOptions = {}) {
    super(message, options);
    this.name = "CnosDBNetworkError";
  }
}
