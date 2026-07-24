import { CnosDBError, type CnosDBErrorOptions } from "./base.js";

/**
 * Errors raised from an unsuccessful response status.
 *
 * `CnosDBRequestError` is the one exception to that rule: it also represents a
 * request the caller cancelled, which never reaches the server and therefore
 * carries a `code` instead of a `status`. It lives here because both cases mean
 * the same thing to a caller — the request was rejected, not the server broke.
 */

/** The server rejected the supplied credentials (HTTP 401). */
export class CnosDBAuthenticationError extends CnosDBError {
  constructor(message: string, options: CnosDBErrorOptions = {}) {
    super(message, options);
    this.name = "CnosDBAuthenticationError";
  }
}

/** The request was rejected as invalid (HTTP 4xx other than 401 and 429). */
export class CnosDBRequestError extends CnosDBError {
  /**
   * Machine-readable reason for non-HTTP request failures, such as
   * `"ABORT_ERR"` when the caller cancelled the request.
   */
  readonly code?: string;

  constructor(
    message: string,
    options: CnosDBErrorOptions & { readonly code?: string } = {},
  ) {
    super(message, options);
    this.name = "CnosDBRequestError";
    if (options.code !== undefined) this.code = options.code;
  }
}

/** The server is rate-limiting requests (HTTP 429). */
export class CnosDBRateLimitError extends CnosDBError {
  constructor(message: string, options: CnosDBErrorOptions = {}) {
    super(message, options);
    this.name = "CnosDBRateLimitError";
  }
}

/** The server failed to process an otherwise valid request (HTTP 5xx). */
export class CnosDBServerError extends CnosDBError {
  constructor(message: string, options: CnosDBErrorOptions = {}) {
    super(message, options);
    this.name = "CnosDBServerError";
  }
}
