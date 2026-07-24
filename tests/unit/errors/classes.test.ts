import { describe, expect, it } from "vitest";

import { CnosDBError } from "../../../src/errors/base.js";
import {
  CnosDBAuthenticationError,
  CnosDBRateLimitError,
  CnosDBRequestError,
  CnosDBServerError,
} from "../../../src/errors/http-status.js";
import {
  CnosDBNetworkError,
  CnosDBTimeoutError,
} from "../../../src/errors/transport.js";
import { CnosDBResponseError } from "../../../src/errors/response.js";

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
