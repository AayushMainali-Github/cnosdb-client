import { describe, expect, it } from "vitest";

import {
  CnosDBAuthenticationError,
  CnosDBError,
  CnosDBNetworkError,
  CnosDBRateLimitError,
  CnosDBRequestError,
  CnosDBResponseError,
  CnosDBServerError,
  CnosDBTimeoutError,
  createErrorForStatus,
} from "../../src/errors.js";

const subclasses = [
  ["CnosDBAuthenticationError", CnosDBAuthenticationError],
  ["CnosDBRequestError", CnosDBRequestError],
  ["CnosDBRateLimitError", CnosDBRateLimitError],
  ["CnosDBServerError", CnosDBServerError],
  ["CnosDBTimeoutError", CnosDBTimeoutError],
  ["CnosDBNetworkError", CnosDBNetworkError],
  ["CnosDBResponseError", CnosDBResponseError],
] as const;

describe("error classes", () => {
  it.each(subclasses)("%s extends CnosDBError and Error", (_name, Ctor) => {
    const error = new Ctor("boom");
    expect(error).toBeInstanceOf(CnosDBError);
    expect(error).toBeInstanceOf(Error);
  });

  it.each(subclasses)("%s sets its own name", (name, Ctor) => {
    expect(new Ctor("boom").name).toBe(name);
  });

  it.each(subclasses)("%s keeps a usable stack trace", (_name, Ctor) => {
    expect(new Ctor("boom").stack).toContain("boom");
  });

  it("exposes the base name on the base class", () => {
    expect(new CnosDBError("boom").name).toBe("CnosDBError");
  });

  it("preserves the cause", () => {
    const cause = new Error("underlying");
    expect(new CnosDBError("boom", { cause }).cause).toBe(cause);
  });

  it("leaves cause undefined when none is supplied", () => {
    expect(new CnosDBError("boom").cause).toBeUndefined();
  });

  it("records diagnostic metadata", () => {
    const error = new CnosDBError("boom", {
      status: 500,
      method: "POST",
      path: "/api/v1/sql",
      responseBody: "internal",
    });
    expect(error.status).toBe(500);
    expect(error.method).toBe("POST");
    expect(error.path).toBe("/api/v1/sql");
    expect(error.responseBody).toBe("internal");
  });

  it("omits metadata that was not supplied", () => {
    const error = new CnosDBError("boom");
    expect(error.status).toBeUndefined();
    expect(error.method).toBeUndefined();
    expect(error.path).toBeUndefined();
    expect(error.responseBody).toBeUndefined();
  });

  it("records the timeout on CnosDBTimeoutError", () => {
    expect(new CnosDBTimeoutError("slow", { timeoutMs: 250 }).timeoutMs).toBe(
      250,
    );
  });

  it("records the abort code on CnosDBRequestError", () => {
    expect(new CnosDBRequestError("stopped", { code: "ABORT_ERR" }).code).toBe(
      "ABORT_ERR",
    );
  });

  it("is distinguishable by instanceof between siblings", () => {
    expect(new CnosDBServerError("x")).not.toBeInstanceOf(CnosDBRequestError);
  });
});

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
