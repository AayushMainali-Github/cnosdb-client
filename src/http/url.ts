/**
 * Normalizes and validates a user-supplied base URL.
 *
 * A trailing slash is enforced so that a configured base path such as
 * `https://host/cnosdb` is preserved when endpoint paths are resolved against
 * it. Endpoint paths must therefore always be relative.
 *
 * @internal
 */
export function normalizeBaseUrl(rawUrl: string): URL {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    throw new TypeError("CnosDB client option `url` is required.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new TypeError(
      `CnosDB client option \`url\` must be an absolute URL such as ` +
        `"http://localhost:8902"; received "${rawUrl}".`,
      { cause: error },
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(
      `CnosDB client option \`url\` must use http: or https:; ` +
        `received "${url.protocol}".`,
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new TypeError(
      "CnosDB client option `url` must not embed credentials. " +
        "Use the `username` and `password` options instead.",
    );
  }
  if (url.hash !== "") {
    throw new TypeError(
      "CnosDB client option `url` must not contain a fragment.",
    );
  }

  url.search = "";
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  return url;
}
