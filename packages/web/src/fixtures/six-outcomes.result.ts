import type { ReconciliationResult } from "core";

import raw from "./six-outcomes.result.json";

/**
 * The core-produced six-outcome result the browser reads as data (it never
 * reconciles, STANDARDS). JSON carries no branded `Cents`, so the shape is
 * asserted here at the one boundary the lockstep test in `__tests__` guards
 * against drift from live `reconcile()` output.
 */
export const sixOutcomeResult = raw as unknown as ReconciliationResult;
