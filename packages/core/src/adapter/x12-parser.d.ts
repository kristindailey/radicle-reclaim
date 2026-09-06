/**
 * Hand-written `.d.ts` shim for `x12-parser` (D21).
 *
 * `x12-parser` 1.3.0 ships `.d.ts` files inside `dist/`, but its `package.json`
 * `exports` map declares only `import`/`require` conditions and no `types`
 * condition, so TypeScript cannot resolve them for a consumer, and the library is
 * effectively untyped. We own the typed loop-mapper on top of it regardless
 * (D11), and the adapter boundary is exactly where we want the typing to live,
 * so a thin ambient declaration of the surface we consume is all it costs.
 *
 * Only the pieces the 835 adapter uses are declared here.
 */
declare module "x12-parser" {
  import { Transform } from "node:stream";

  /**
   * A parsed segment emitted by {@link X12parser}. `name` is the segment id
   * (e.g. `"CLP"`); positional elements are keyed by their 1-based position as a
   * bare string (`"1"`, `"2"`, and so on, so `CLP01` is `segment["1"]`), and
   * composite components are keyed `"<element>-<component>"`, e.g. the procedure
   * code in `SVC01` is `segment["1-1"]`.
   */
  export interface FormattedSegment {
    /** Segment id, e.g. `"CLP"`. */
    name: string;
    [element: string]: string;
  }

  /**
   * A Transform stream that turns a raw X12 buffer/string into a stream of
   * {@link FormattedSegment} objects.
   */
  export class X12parser extends Transform {
    constructor(defaultEncoding?: BufferEncoding);
  }
}
