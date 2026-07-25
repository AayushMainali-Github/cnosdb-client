export { CnosDBError } from "./base.js";
export type { CnosDBErrorOptions } from "./base.js";
export {
  CnosDBAuthenticationError,
  CnosDBRateLimitError,
  CnosDBRequestError,
  CnosDBServerError,
} from "./http-status.js";
export { CnosDBNetworkError, CnosDBTimeoutError } from "./transport.js";
export { CnosDBResponseError } from "./response.js";
export { createErrorForStatus } from "./from-status.js";
export {
  AUTH_FAILED_CODE,
  INSUFFICIENT_PRIVILEGES_CODE,
  parseErrorCode,
} from "./error-code.js";
