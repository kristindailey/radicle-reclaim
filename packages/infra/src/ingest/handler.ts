import { reconcile } from "core";
import type { Charge, LogFigures, ReconciliationResult } from "core";

export interface IngestOutcome {
  result: ReconciliationResult;
  /** The core's own log figures (D15); the edge adds the duration a pure core can't measure. */
  logFigures: LogFigures;
}

/**
 * The pure ingest core the Lambda wraps (issue #25): reconcile the raw 835 buffer
 * against the seeded charges with no AWS in the loop, so the domain path stays
 * verifiable in Jest. The edge supplies the buffer and charges and persists.
 */
export function handleIngest(
  raw835: Buffer,
  charges: Charge[],
): IngestOutcome {
  const result = reconcile({ charges, raw835 });
  return { result, logFigures: result.logFigures };
}
