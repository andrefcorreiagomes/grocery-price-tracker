/**
 * A price in euros as the site shows it: two decimals, rounded to whole cents
 * the same way the "cheapest" markers compare prices (Math.round of cents, in
 * cheapestStores and the basket).
 *
 * `toFixed` alone rounds the binary float, and the two disagree on half cents:
 * 0.995 €/kg (1.99 € for 2 kg of onions) printed as 0.99 beside a real 0.99
 * that was marked cheaper - a tie on screen, a winner in green (21 Oct 2026).
 */
export function euros(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}
