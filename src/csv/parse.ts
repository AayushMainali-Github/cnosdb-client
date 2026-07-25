/**
 * Minimal RFC 4180 parser for CnosDB's CSV responses.
 *
 * A hand-written parser rather than a dependency: the grammar is small, the
 * input comes from one known producer, and a parser is easier to audit than an
 * extra supply-chain entry in a client whose whole job is talking to one
 * server.
 *
 * @internal
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStarted = false;

  const endField = (): void => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };

  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] as string;

    if (quoted) {
      if (char !== '"') {
        field += char;
        continue;
      }
      // A doubled quote inside a quoted field is one literal quote.
      if (input[index + 1] === '"') {
        field += '"';
        index += 1;
        continue;
      }
      quoted = false;
      continue;
    }

    if (char === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
      continue;
    }

    if (char === ",") {
      endField();
      continue;
    }

    if (char === "\r") {
      // Tolerate both CRLF and a bare CR as a row terminator.
      if (input[index + 1] === "\n") index += 1;
      endRow();
      continue;
    }

    if (char === "\n") {
      endRow();
      continue;
    }

    field += char;
    fieldStarted = true;
  }

  // A trailing newline ends the last row rather than starting an empty one.
  if (field.length > 0 || fieldStarted || row.length > 0 || quoted) {
    endRow();
  }

  return rows;
}
