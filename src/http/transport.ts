import {
  CnosDBNetworkError,
  CnosDBRequestError,
  CnosDBResponseError,
  CnosDBTimeoutError,
  createErrorForStatus,
} from "../errors/index.js";
import type { Compression, FetchLike } from "../types/index.js";
import { readBodySafely, truncate } from "./body.js";
import { gzipBody } from "./compress.js";
import { isAbortError, isCnosDBError, validateTimeout } from "./guards.js";
import {
  delayFor,
  isRetryable,
  parseRetryAfter,
  rememberRetryAfter,
  retryAfterFor,
  sleep,
  type ResolvedRetry,
} from "./retry.js";

/** @internal */
export interface TransportOptions {
  readonly baseUrl: URL;
  readonly authorization: string | undefined;
  readonly timeoutMs: number;
  readonly fetch: FetchLike;
  /** Already normalized by {@link normalizeHeaders}. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Already validated by {@link normalizeRetry}. Absent means no retries. */
  readonly retry?: ResolvedRetry;
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
  /** Already normalized by {@link normalizeHeaders}. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Compression for this request's body. Defaults to `"none"`. */
  readonly compression?: Compression;
  /**
   * Whether this request may be sent more than once. Only requests marked
   * here are eligible for the configured retry policy; everything else is
   * sent exactly once regardless of configuration.
   */
  readonly retryable?: boolean;
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
  readonly #headers: Readonly<Record<string, string>>;
  readonly #retry: ResolvedRetry | undefined;

  constructor(options: TransportOptions) {
    this.#baseUrl = options.baseUrl;
    this.#authorization = options.authorization;
    this.#timeoutMs = options.timeoutMs;
    this.#fetch = options.fetch;
    this.#headers = options.headers ?? {};
    this.#retry = options.retry;
  }

  /**
   * Performs a request and returns the raw response together with the request
   * context needed for diagnostics. Non-2xx statuses are converted to errors.
   *
   * When a retry policy is configured and the request is marked retryable, a
   * failure that could plausibly succeed later is tried again. The last
   * failure is what propagates, so the caller sees the reason it gave up
   * rather than the reason it first stumbled.
   */
  async request(request: TransportRequest): Promise<Response> {
    const policy =
      request.retryable === true && this.#retry !== undefined
        ? this.#retry
        : undefined;
    if (policy === undefined) {
      return this.#attempt(request);
    }

    const startedAt = Date.now();
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.#attempt(request);
      } catch (error) {
        if (attempt >= policy.attempts || !isRetryable(error)) throw error;

        const delay = delayFor(policy, attempt + 1, retryAfterFor(error));
        if (
          policy.maxElapsedMs !== undefined &&
          Date.now() - startedAt + delay >= policy.maxElapsedMs
        ) {
          // Sleeping past the ceiling only to fail there wastes the caller's
          // time, so stop while the budget still means something.
          throw error;
        }
        await sleep(delay, request.signal);
      }
    }
  }

  async #attempt(request: TransportRequest): Promise<Response> {
    const url = new URL(request.path, this.#baseUrl);
    for (const [key, value] of Object.entries(request.searchParams ?? {})) {
      url.searchParams.set(key, value);
    }

    // Caller headers are applied first, then the transport's own, so the
    // headers this client owns win even if a reserved name somehow got past
    // validation. Per-request headers override client-level ones by name.
    const headers: Record<string, string> = {
      ...this.#headers,
      ...request.headers,
    };
    if (this.#authorization !== undefined) {
      headers["authorization"] = this.#authorization;
    }
    if (request.accept !== undefined) headers["accept"] = request.accept;
    if (request.contentType !== undefined) {
      headers["content-type"] = request.contentType;
    }

    let body: string | Uint8Array<ArrayBuffer> | undefined = request.body;
    if (body !== undefined && request.compression === "gzip") {
      body = await gzipBody(body);
      headers["content-encoding"] = "gzip";
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
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseBody = await readBodySafely(response);
        const failure = createErrorForStatus(response.status, {
          ...context,
          ...(responseBody === undefined ? {} : { responseBody }),
        });
        const retryAfterMs = parseRetryAfter(
          response.headers.get("retry-after"),
        );
        if (retryAfterMs !== undefined) {
          rememberRetryAfter(failure, retryAfterMs);
        }
        throw failure;
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

  /** Performs a request and returns the response body as text. */
  async requestText(request: TransportRequest): Promise<string> {
    const response = await this.request(request);
    return this.#readSuccessBody(response, request);
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
