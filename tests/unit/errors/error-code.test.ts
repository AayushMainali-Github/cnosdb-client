import { describe, expect, it } from "vitest";

import {
  AUTH_FAILED_CODE,
  INSUFFICIENT_PRIVILEGES_CODE,
  parseErrorCode,
} from "../../../src/errors/error-code.js";
import { createErrorForStatus } from "../../../src/errors/from-status.js";
import {
  CnosDBAuthenticationError,
  CnosDBRequestError,
} from "../../../src/errors/http-status.js";

function envelope(code: string, message = "boom"): string {
  return JSON.stringify({ error_code: code, error_message: message });
}

describe("parseErrorCode", () => {
  it("extracts the code from a CnosDB error envelope", () => {
    expect(parseErrorCode(envelope("010016"))).toBe("010016");
  });

  it.each([
    ["an absent body", undefined],
    ["an empty body", ""],
    ["plain text", "Internal Server Error"],
    ["truncated JSON", '{"error_code":"0100'],
    ["a JSON array", "[]"],
    ["JSON null", "null"],
    ["an envelope without the field", '{"error_message":"boom"}'],
    ["a non-string code", '{"error_code":10016}'],
    ["an empty code", '{"error_code":""}'],
  ])("returns undefined for %s", (_label, body) => {
    expect(parseErrorCode(body)).toBeUndefined();
  });
});

describe("createErrorForStatus with CnosDB error codes", () => {
  it("treats the auth code as an authentication failure despite HTTP 422", () => {
    const error = createErrorForStatus(422, {
      responseBody: envelope(AUTH_FAILED_CODE, "Auth error: Access denied"),
      method: "POST",
      path: "/api/v1/sql",
    });

    expect(error).toBeInstanceOf(CnosDBAuthenticationError);
    expect(error.status).toBe(422);
    expect(error.errorCode).toBe(AUTH_FAILED_CODE);
    expect(error.message).toContain("rejected the credentials");
  });

  it("still maps HTTP 401 for proxies that use it", () => {
    const error = createErrorForStatus(401, { method: "GET", path: "/x" });
    expect(error).toBeInstanceOf(CnosDBAuthenticationError);
    expect(error.errorCode).toBeUndefined();
  });

  it("leaves insufficient privileges as a request error", () => {
    // Authorization is not authentication: the credentials were accepted, so
    // reporting this as an auth failure would send callers down the wrong path.
    const error = createErrorForStatus(422, {
      responseBody: envelope(INSUFFICIENT_PRIVILEGES_CODE),
    });

    expect(error).toBeInstanceOf(CnosDBRequestError);
    expect(error).not.toBeInstanceOf(CnosDBAuthenticationError);
    expect(error.errorCode).toBe(INSUFFICIENT_PRIVILEGES_CODE);
  });

  it("leaves an ordinary query failure as a request error", () => {
    const error = createErrorForStatus(422, {
      responseBody: envelope("030019", 'Table not found: "t"'),
    });

    expect(error).toBeInstanceOf(CnosDBRequestError);
    expect(error.errorCode).toBe("030019");
  });

  it("exposes the code on server errors too", () => {
    const error = createErrorForStatus(500, {
      responseBody: envelope("020001"),
    });
    expect(error.errorCode).toBe("020001");
  });

  it("reports no code when the body carries none", () => {
    const error = createErrorForStatus(400, { responseBody: "nope" });
    expect(error.errorCode).toBeUndefined();
  });

  it("prefers an explicitly supplied code over the body", () => {
    const error = createErrorForStatus(422, {
      responseBody: envelope("030019"),
      errorCode: AUTH_FAILED_CODE,
    });
    expect(error).toBeInstanceOf(CnosDBAuthenticationError);
  });
});
