/**
 * Field value types that can be serialized into Line Protocol.
 *
 * `bigint` values are written as Line Protocol signed integers (`123i`);
 * `number` values are written as floats.
 */
export type PointFieldValue = string | number | bigint | boolean;

/**
 * A single measurement sample.
 */
export interface Point {
  /** Measurement (table) name. Required and non-empty. */
  readonly measurement: string;
  /** Optional tag set. Tag keys and values are strings. */
  readonly tags?: Readonly<Record<string, string>>;
  /** Field set. At least one field is required. */
  readonly fields: Readonly<Record<string, PointFieldValue>>;
  /**
   * Optional timestamp. Omit it to let the server assign the write time.
   * `Date` values are converted using the effective write precision;
   * `number` must be a safe integer already expressed in that precision;
   * `bigint` is emitted verbatim.
   */
  readonly timestamp?: Date | number | bigint;
}
