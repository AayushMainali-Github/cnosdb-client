import { describe, expect, it } from "vitest";

import { normalizeBaseUrl } from "../../../src/http/url.js";

describe("normalizeBaseUrl", () => {
  it("accepts a base URL without a trailing slash", () => {
    expect(normalizeBaseUrl("http://localhost:8902").href).toBe(
      "http://localhost:8902/",
    );
  });

  it("accepts a base URL with a trailing slash", () => {
    expect(normalizeBaseUrl("http://localhost:8902/").href).toBe(
      "http://localhost:8902/",
    );
  });

  it("accepts https", () => {
    expect(normalizeBaseUrl("https://db.example.com").protocol).toBe("https:");
  });

  it("preserves and terminates a base path", () => {
    expect(normalizeBaseUrl("https://example.com/cnosdb").href).toBe(
      "https://example.com/cnosdb/",
    );
  });

  it("discards a query string on the base URL", () => {
    expect(normalizeBaseUrl("http://localhost:8902/?a=b").href).toBe(
      "http://localhost:8902/",
    );
  });

  it("rejects a relative URL", () => {
    expect(() => normalizeBaseUrl("/api/v1")).toThrow(/absolute URL/);
  });

  it("rejects a host-only value that is not a URL", () => {
    expect(() => normalizeBaseUrl("localhost:8902")).toThrow(/http: or https:/);
  });

  it("rejects a non-http protocol", () => {
    expect(() => normalizeBaseUrl("ftp://localhost")).toThrow(
      /http: or https:/,
    );
  });

  it("rejects embedded credentials", () => {
    expect(() => normalizeBaseUrl("http://root:pw@localhost:8902")).toThrow(
      /must not embed credentials/,
    );
  });

  it("rejects a fragment", () => {
    expect(() => normalizeBaseUrl("http://localhost:8902/#frag")).toThrow(
      /fragment/,
    );
  });

  it("rejects an empty value", () => {
    expect(() => normalizeBaseUrl("")).toThrow(/is required/);
  });
});
