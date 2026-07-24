import { describe, expect, it } from "vitest";

import { createAuthorizationHeader } from "../../../src/http/auth.js";

describe("createAuthorizationHeader", () => {
  it("returns undefined when no credentials are configured", () => {
    expect(createAuthorizationHeader(undefined, undefined)).toBeUndefined();
  });

  it("encodes username and password as UTF-8 Base64", () => {
    expect(createAuthorizationHeader("root", "pw")).toBe(
      `Basic ${Buffer.from("root:pw", "utf8").toString("base64")}`,
    );
  });

  it("supports an empty password", () => {
    expect(createAuthorizationHeader("root", "")).toBe("Basic cm9vdDo=");
  });

  it("supports a username with no password supplied", () => {
    expect(createAuthorizationHeader("root", undefined)).toBe("Basic cm9vdDo=");
  });

  it("encodes non-ASCII credentials as UTF-8", () => {
    expect(createAuthorizationHeader("üser", "pä")).toBe(
      `Basic ${Buffer.from("üser:pä", "utf8").toString("base64")}`,
    );
  });
});
