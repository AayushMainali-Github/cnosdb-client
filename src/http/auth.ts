/**
 * Builds the `Authorization` header value, or `undefined` when no credentials
 * were configured. The encoded value is never exposed in errors or logs.
 *
 * @internal
 */
export function createAuthorizationHeader(
  username: string | undefined,
  password: string | undefined,
): string | undefined {
  if (username === undefined && password === undefined) {
    return undefined;
  }
  const encoded = Buffer.from(
    `${username ?? ""}:${password ?? ""}`,
    "utf8",
  ).toString("base64");
  return `Basic ${encoded}`;
}
