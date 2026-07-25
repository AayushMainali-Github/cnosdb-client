import { CnosDBError, type CnosDBErrorOptions } from "./base.js";
import { AUTH_FAILED_CODE, parseErrorCode } from "./error-code.js";
import {
  CnosDBAuthenticationError,
  CnosDBRateLimitError,
  CnosDBRequestError,
  CnosDBServerError,
} from "./http-status.js";

/**
 * Maps an unsuccessful response onto the matching error class.
 *
 * The status alone is not enough. CnosDB answers a rejected password with 422,
 * the same status it uses for a missing table, so its `error_code` decides the
 * class whenever the body carries one.
 *
 * @internal
 */
export function createErrorForStatus(
  status: number,
  options: CnosDBErrorOptions,
): CnosDBError {
  const errorCode = options.errorCode ?? parseErrorCode(options.responseBody);
  const context = {
    ...options,
    status,
    ...(errorCode === undefined ? {} : { errorCode }),
  };
  const summary = summarize(options.responseBody);
  const where =
    options.method && options.path ? `${options.method} ${options.path}` : "";
  const suffix = summary ? `: ${summary}` : "";

  // 401 is kept for proxies and future servers that use it; CnosDB itself
  // signals rejected credentials with this error code instead.
  if (status === 401 || errorCode === AUTH_FAILED_CODE) {
    return new CnosDBAuthenticationError(
      `CnosDB rejected the credentials for ${where} ` +
        `(HTTP ${status})${suffix}`,
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

/**
 * Collapses a response body into a short, single-line fragment for an error
 * message. Bounding the length keeps a large or hostile body out of logs.
 */
function summarize(body: string | undefined): string {
  if (!body) return "";
  const collapsed = body.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "";
  return collapsed.length > SUMMARY_LIMIT
    ? `${collapsed.slice(0, SUMMARY_LIMIT)}…`
    : collapsed;
}
