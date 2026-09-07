/**
 * Formats integer cents to a dollar string: the money display edge (D7), the only
 * place cents become dollars. The dollars/remainder split stays integer-only so no
 * float rounding creeps in at the boundary.
 */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`formatCents expects integer cents, received ${cents}`);
  }

  const negative = cents < 0;
  const magnitude = Math.abs(cents);
  const dollars = Math.trunc(magnitude / 100);
  const remainder = magnitude % 100;

  const sign = negative ? "-" : "";
  return `${sign}$${dollars.toLocaleString("en-US")}.${String(remainder).padStart(2, "0")}`;
}
