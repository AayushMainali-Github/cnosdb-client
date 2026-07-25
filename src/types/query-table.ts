/**
 * A query result with its columns, in the order the server returned them.
 *
 * This is the shape to reach for when the columns matter: rendering a table,
 * exporting to a file, or handling a statement whose shape is not known ahead
 * of time. Use {@link CnosDBClient.query} instead when you know the columns and
 * want convenient JavaScript values.
 */
export interface QueryTable {
  /**
   * Column names in the order the server produced them. Present even when
   * `rows` is empty, so an empty result can still be rendered with headings.
   */
  readonly columns: readonly string[];

  /**
   * Rows as raw field strings, aligned with {@link columns}.
   *
   * Values are strings because CnosDB sends no column types over HTTP; nothing
   * is converted, so nothing is guessed. A NULL arrives as an empty string and
   * is indistinguishable from an empty string value, which is a limitation of
   * the server's CSV output rather than a choice made here.
   */
  readonly rows: readonly (readonly string[])[];
}
