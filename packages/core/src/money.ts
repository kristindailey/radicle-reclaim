/**
 * Money convention (D7): every amount in this core is **integer cents**.
 *
 * 835 amounts parse to integer cents at the adapter boundary, every calculation
 * stays in cents, and formatting to dollars happens only at the Vue display edge
 * (out of scope for the core). No float arithmetic runs anywhere behind the seam —
 * a billing engine doing money in JS floats is a tell.
 *
 * `Cents` is a branded number so an accidental dollar figure or float can't be
 * passed where cents are expected without going through {@link cents}.
 */
export type Cents = number & { readonly __brand: "Cents" };

/**
 * Constructs a {@link Cents} value from an integer. Throws on a non-integer, so a
 * float (e.g. a dollars amount like `12.34`) can never enter the cents domain.
 */
export function cents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw new RangeError(`money must be integer cents, received ${value}`);
  }
  return value as Cents;
}

/** Zero cents. */
export const ZERO_CENTS: Cents = cents(0);

/** Adds cents values, staying in the integer-cents domain. */
export function addCents(...values: Cents[]): Cents {
  return cents(values.reduce((total, value) => total + value, 0));
}

/**
 * Parses an X12 monetary amount (dollars-with-decimals, e.g. `"500"` or
 * `"12.34"`) to integer cents without any float arithmetic (D7): the whole and
 * fractional parts are combined as integers, so `"12.34"` becomes `1234`, never
 * `12.34 * 100`. An empty element parses to zero; a leading `-` is preserved.
 */
export function dollarsToCents(raw: string): Cents {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return ZERO_CENTS;
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = "", fraction = ""] = unsigned.split(".");

  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) {
    throw new RangeError(`not a monetary amount: ${JSON.stringify(raw)}`);
  }

  // Pad/truncate the fraction to exactly two digits (currency scale).
  const fractionCents = Number(`${fraction}00`.slice(0, 2));
  const magnitude = Number(whole || "0") * 100 + fractionCents;
  return cents(negative ? -magnitude : magnitude);
}
