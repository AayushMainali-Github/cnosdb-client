import { describe, expect, it } from "vitest";

import { CnosDBError } from "../../../src/errors/base.js";
import { createErrorForStatus } from "../../../src/errors/from-status.js";
import {
  CnosDBAuthenticationError,
  CnosDBRateLimitError,
  CnosDBRequestError,
  CnosDBServerError,
} from "../../../src/errors/http-status.js";

describe("createErrorForStatus", () => {
  const context = { method: "POST", path: "/api/v1/sql" };

  it("maps 401 to an authentication error", () => {
    const error = createErrorForStatus(401, context);
    expect(error).toBeInstanceOf(CnosDBAuthenticationError);
    expect(error.status).toBe(401);
  });

  it("maps 429 to a rate-limit error", () => {
    expect(createErrorForStatus(429, context)).toBeInstanceOf(
      CnosDBRateLimitError,
    );
  });

  it("maps 413 to a request error with actionable guidance", () => {
    const error = createErrorForStatus(413, context);
    expect(error).toBeInstanceOf(CnosDBRequestError);
    expect(error.message).toMatch(/payload is too large/);
    expect(error.message).toMatch(/fewer points/);
  });

  it.each([400, 404, 422])("maps %i to a request error", (status) => {
    const error = createErrorForStatus(status, context);
    expect(error).toBeInstanceOf(CnosDBRequestError);
    expect(error.status).toBe(status);
  });

  it.each([500, 503])("maps %i to a server error", (status) => {
    expect(createErrorForStatus(status, context)).toBeInstanceOf(
      CnosDBServerError,
    );
  });

  it("maps an unexpected status to the base error", () => {
    const error = createErrorForStatus(302, context);
    expect(error.constructor).toBe(CnosDBError);
    expect(error.status).toBe(302);
  });

  it("includes a summary of the response body", () => {
    const error = createErrorForStatus(422, {
      ...context,
      responseBody: '{"error_code":"030019","error_message":"Table not found"}',
    });
    expect(error.message).toContain("Table not found");
  });

  it("collapses whitespace and truncates a long body summary", () => {
    const error = createErrorForStatus(500, {
      ...context,
      responseBody: `${"x".repeat(5000)}\n\n   y`,
    });
    expect(error.message.length).toBeLessThan(500);
    expect(error.message).toContain("…");
  });

  it("omits the summary when the body is empty or blank", () => {
    expect(
      createErrorForStatus(500, { ...context, responseBody: "   " }).message,
    ).not.toContain(":  ");
    expect(createErrorForStatus(500, context).message).toMatch(/HTTP 500\)$/);
  });

  it("keeps the response body available for inspection", () => {
    const error = createErrorForStatus(429, {
      ...context,
      responseBody: "slow down",
    });
    expect(error.responseBody).toBe("slow down");
  });
});

describe("secret safety", () => {
  const secrets = ["hunter2", "Basic cm9vdDpodW50ZXIy"];

  it("does not retain credentials passed only as context", () => {
    const error = createErrorForStatus(401, {
      method: "POST",
      path: "/api/v1/sql",
      responseBody: "unauthorized",
    });
    const serialized = `${error.message}${JSON.stringify(error)}${String(error.stack)}`;
    for (const secret of secrets) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("has no property holding a password or authorization header", () => {
    const error = createErrorForStatus(401, {
      method: "POST",
      path: "/api/v1/sql",
    });
    expect(Object.keys(error)).not.toContain("password");
    expect(Object.keys(error)).not.toContain("authorization");
    expect(Object.keys(error)).not.toContain("headers");
  });
});
