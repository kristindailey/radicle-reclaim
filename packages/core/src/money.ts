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
