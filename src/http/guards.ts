/**
 * Recognizes an error this package already produced, so the transport does not
 * wrap it a second time and bury the original diagnosis.
 *
 * The check is by name rather than `instanceof` so that an error crossing a
 * module realm boundary is still recognized.
 *
 * @internal
 */
export function isCnosDBError(error: unknown): boolean {
  return error instanceof Error && error.name.startsWith("CnosDB");
}

/**
 * Recognizes an abort, which `fetch` reports differently across runtimes: some
 * set the name, others only the code.
 *
 * @internal
 */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      (error as { code?: string }).code === "ABORT_ERR")
  );
}

/** @internal */
export function validateTimeout(timeoutMs: number): void {
  if (
    typeof timeoutMs !== "number" ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  ) {
    throw new TypeError(
      `\`timeoutMs\` must be a finite number greater than zero; ` +
        `received ${String(timeoutMs)}.`,
    );
  }
}
