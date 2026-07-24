import {
  CnosDBNetworkError,
  CnosDBRequestError,
  CnosDBResponseError,
  CnosDBTimeoutError,
  createErrorForStatus,
} from "../errors/index.js";
import type { FetchLike } from "../types/index.js";
import { readBodySafely, truncate } from "./body.js";
import { isAbortError, isCnosDBError, validateTimeout } from "./guards.js";

/** @internal */
export interface TransportOptions {
  readonly baseUrl: URL;
  readonly authorization: string | undefined;
  readonly timeoutMs: number;
  readonly fetch: FetchLike;
}

/** @internal */
export interface TransportRequest {
  readonly method: "GET" | "POST";
  /** Path relative to the base URL, without a leading slash. */
  readonly path: string;
  readonly searchParams?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly contentType?: string;
  readonly accept?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/**
 * Internal HTTP transport. It owns URL construction, authentication,
 * timeouts, cancellation, and the mapping of failures onto typed errors.
 *
 * This class is intentionally not exported from the package root.
 *
 * @internal
 */
export class Transport {
  readonly #baseUrl: URL;
  readonly #authorization: string | undefined;
  readonly #timeoutMs: number;
  readonly #fetch: FetchLike;

  constructor(options: TransportOptions) {
    this.#baseUrl = options.baseUrl;
    this.#authorization = options.authorization;
    this.#timeoutMs = options.timeoutMs;
    this.#fetch = options.fetch;
  }

  /**
   * Performs a request and returns the raw response together with the request
   * context needed for diagnostics. Non-2xx statuses are converted to errors.
   */
  async request(request: TransportRequest): Promise<Response> {
    const url = new URL(request.path, this.#baseUrl);
    for (const [key, value] of Object.entries(request.searchParams ?? {})) {
      url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = {};
    if (this.#authorization !== undefined) {
      headers["authorization"] = this.#authorization;
    }
    if (request.accept !== undefined) headers["accept"] = request.accept;
    if (request.contentType !== undefined) {
      headers["content-type"] = request.contentType;
    }

    const timeoutMs = request.timeoutMs ?? this.#timeoutMs;
    validateTimeout(timeoutMs);

    const controller = new AbortController();
    const callerSignal = request.signal;
    let timedOut = false;

    const onCallerAbort = (): void => {
      controller.abort(callerSignal?.reason);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    // Never keep the process alive purely for a pending request timer.
    timer.unref();
    if (callerSignal) {
      if (callerSignal.aborted) {
        onCallerAbort();
      } else {
        callerSignal.addEventListener("abort", onCallerAbort, { once: true });
      }
    }

    const context = { method: request.method, path: url.pathname };

    try {
      // An already-cancelled request must never reach the network.
      if (callerSignal?.aborted === true) {
        throw new CnosDBRequestError(
          `The caller aborted ${request.method} ${url.pathname} before it was sent.`,
          {
            ...context,
            code: "ABORT_ERR",
            ...(callerSignal.reason === undefined
              ? {}
              : { cause: callerSignal.reason }),
          },
        );
      }

      const response = await this.#fetch(url, {
        method: request.method,
        headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseBody = await readBodySafely(response);
        throw createErrorForStatus(response.status, {
          ...context,
          ...(responseBody === undefined ? {} : { responseBody }),
        });
      }

      return response;
    } catch (error) {
      throw this.#normalizeError(error, {
        ...context,
        timedOut,
        callerAborted: callerSignal?.aborted === true,
        timeoutMs,
      });
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  }

  /**
   * Performs a request and parses a JSON response body. An empty body — which
   * CnosDB returns for DDL statements — resolves to `undefined`.
   */
  async requestJson<T>(request: TransportRequest): Promise<T | undefined> {
    const response = await this.request(request);
    const text = await this.#readSuccessBody(response, request);

    if (text.trim().length === 0) {
      return undefined;
    }

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new CnosDBResponseError(
        `CnosDB returned a body that is not valid JSON for ` +
          `${request.method} ${new URL(request.path, this.#baseUrl).pathname}.`,
        {
          status: response.status,
          method: request.method,
          path: new URL(request.path, this.#baseUrl).pathname,
          responseBody: truncate(text),
          cause: error,
        },
      );
    }
  }

  /**
   * Performs a request and discards the response body, ensuring the
   * underlying connection is not left half-read.
   */
  async requestVoid(request: TransportRequest): Promise<void> {
    const response = await this.request(request);
    await this.#readSuccessBody(response, request);
  }

  async #readSuccessBody(
    response: Response,
    request: TransportRequest,
  ): Promise<string> {
    try {
      return await response.text();
    } catch (error) {
      throw new CnosDBResponseError(
        `CnosDB response body could not be read for ${request.method} ` +
          `${new URL(request.path, this.#baseUrl).pathname}.`,
        {
          status: response.status,
          method: request.method,
          path: new URL(request.path, this.#baseUrl).pathname,
          cause: error,
        },
      );
    }
  }

  #normalizeError(
    error: unknown,
    context: {
      method: string;
      path: string;
      timedOut: boolean;
      callerAborted: boolean;
      timeoutMs: number;
    },
  ): unknown {
    const { method, path, timedOut, callerAborted, timeoutMs } = context;

    if (error instanceof CnosDBRequestError || isCnosDBError(error)) {
      return error;
    }

    if (isAbortError(error)) {
      if (callerAborted) {
        return new CnosDBRequestError(`The caller aborted ${method} ${path}.`, {
          method,
          path,
          cause: error,
          code: "ABORT_ERR",
        });
      }
      if (timedOut) {
        return new CnosDBTimeoutError(
          `${method} ${path} timed out after ${timeoutMs} ms.`,
          { method, path, cause: error, timeoutMs },
        );
      }
    }

    return new CnosDBNetworkError(
      `${method} ${path} failed before a response was received.`,
      { method, path, cause: error },
    );
  }
}
