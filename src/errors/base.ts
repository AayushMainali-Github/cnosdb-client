/**
 * Diagnostic context attached to every {@link CnosDBError}.
 *
 * The fields are deliberately limited to non-sensitive values: no credentials,
 * no `Authorization` header, and no full request URL.
 */
export interface CnosDBErrorOptions {
  /** HTTP status code, when the failure came from a response. */
  readonly status?: number;
  /** HTTP method of the failing request. */
  readonly method?: string;
  /** Request path only; never a credential-bearing URL. */
  readonly path?: string;
  /** Response body, truncated to a safe maximum. */
  readonly responseBody?: string;
  /**
   * CnosDB's own `error_code` from the response envelope, when the body
   * contained one. CnosDB reuses HTTP 422 for most application failures, so
   * this is the field that distinguishes them.
   */
  readonly errorCode?: string;
  /** Underlying cause, preserved for debugging. */
  readonly cause?: unknown;
}

/**
 * Base class for every error thrown by this package. Catch this to handle all
 * CnosDB failures uniformly.
 */
export class CnosDBError extends Error {
  readonly status?: number;
  readonly method?: string;
  readonly path?: string;
  readonly responseBody?: string;
  readonly errorCode?: string;

  constructor(message: string, options: CnosDBErrorOptions = {}) {
    super(message, "cause" in options ? { cause: options.cause } : undefined);
    this.name = "CnosDBError";
    if (options.status !== undefined) this.status = options.status;
    if (options.method !== undefined) this.method = options.method;
    if (options.path !== undefined) this.path = options.path;
    if (options.responseBody !== undefined) {
      this.responseBody = options.responseBody;
    }
    if (options.errorCode !== undefined) this.errorCode = options.errorCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
