import { CnosDBError, type CnosDBErrorOptions } from "./base.js";

/** The server responded successfully but the payload could not be understood. */
export class CnosDBResponseError extends CnosDBError {
  constructor(message: string, options: CnosDBErrorOptions = {}) {
    super(message, options);
    this.name = "CnosDBResponseError";
  }
}
