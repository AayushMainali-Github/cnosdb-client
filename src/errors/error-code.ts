/**
 * CnosDB reports application failures in a JSON envelope and reuses HTTP 422
 * for almost all of them, so the status alone cannot tell a rejected password
 * apart from a missing table. The `error_code` field is what actually
 * distinguishes them.
 */

/** Credentials were rejected, or the user does not exist. */
export const AUTH_FAILED_CODE = "010016";

/** The user authenticated but lacks the privilege for the operation. */
export const INSUFFICIENT_PRIVILEGES_CODE = "010004";

/**
 * Extracts CnosDB's `error_code` from a response body.
 *
 * Returns `undefined` for a body that is absent, not JSON, or not shaped like
 * the envelope. Any of those simply means there is no code to report, which is
 * never worth failing over while already handling an error.
 *
 * @internal
 */
export function parseErrorCode(body: string | undefined): string | undefined {
  if (body === undefined || body.length === 0) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }

  const code = (parsed as { error_code?: unknown }).error_code;
  return typeof code === "string" && code.length > 0 ? code : undefined;
}
