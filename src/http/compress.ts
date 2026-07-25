import { gzip } from "node:zlib";

/**
 * Compresses a request body with gzip.
 *
 * The async form is deliberate: a large Line Protocol batch is exactly the
 * payload worth compressing, and the synchronous variant would block the event
 * loop for the whole of it.
 *
 * @internal
 */
export async function gzipBody(body: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    gzip(body, (error, compressed) => {
      if (error) {
        reject(error);
        return;
      }
      // A view rather than a copy: `fetch` accepts an `ArrayBuffer`-backed
      // view, and duplicating a large compressed batch would waste the memory
      // that compressing it was meant to save.
      resolve(
        new Uint8Array(
          compressed.buffer,
          compressed.byteOffset,
          compressed.byteLength,
        ),
      );
    });
  });
}
