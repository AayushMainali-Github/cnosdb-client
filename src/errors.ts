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

  constructor(message: string, options: CnosDBErrorOptions = {}) {
    super(message, "cause" in options ? { cause: options.cause } : undefined);
    this.name = "CnosDBError";
    if (options.status !== undefined) this.status = options.status;
    if (options.method !== undefined) this.method = options.method;
    if (options.path !== undefined) this.path = options.path;
    if (options.responseBody !== undefined) {
      this.responseBody = options.responseBody;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

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

/** The server responded successfully but the payload could not be understood. */
export class CnosDBResponseError extends CnosDBError {
  constructor(message: string, options: CnosDBErrorOptions = {}) {
    super(message, options);
    this.name = "CnosDBResponseError";
  }
}

/**
 * Maps an unsuccessful HTTP status onto the matching error class.
 *
 * @internal
 */
export function createErrorForStatus(
  status: number,
  options: CnosDBErrorOptions,
): CnosDBError {
  const context = { ...options, status };
  const summary = summarize(options.responseBody);
  const where =
    options.method && options.path ? `${options.method} ${options.path}` : "";
  const suffix = summary ? `: ${summary}` : "";

  if (status === 401) {
    return new CnosDBAuthenticationError(
      `CnosDB rejected the credentials for ${where} (HTTP 401)${suffix}`,
      context,
    );
  }
  if (status === 429) {
    return new CnosDBRateLimitError(
      `CnosDB is rate-limiting ${where} (HTTP 429)${suffix}`,
      context,
    );
  }
  if (status === 413) {
    return new CnosDBRequestError(
      `CnosDB rejected ${where} because the payload is too large ` +
        `(HTTP 413)${suffix}. Send fewer points per request.`,
      context,
    );
  }
  if (status >= 400 && status < 500) {
    return new CnosDBRequestError(
      `CnosDB rejected ${where} (HTTP ${status})${suffix}`,
      context,
    );
  }
  if (status >= 500 && status < 600) {
    return new CnosDBServerError(
      `CnosDB failed to process ${where} (HTTP ${status})${suffix}`,
      context,
    );
  }
  return new CnosDBError(
    `CnosDB returned an unexpected status for ${where} (HTTP ${status})${suffix}`,
    context,
  );
}

const SUMMARY_LIMIT = 300;

function summarize(body: string | undefined): string {
  if (!body) return "";
  const collapsed = body.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "";
  return collapsed.length > SUMMARY_LIMIT
    ? `${collapsed.slice(0, SUMMARY_LIMIT)}…`
    : collapsed;
}
