/**
 * Barcodes (EAN/GTIN): their standard form, their check digit, and which
 * ones may be matched between stores.
 *
 * Moved out of matching.ts on 22 October 2026 (code review M8), unchanged.
 * Pure and I/O-free.
 */

// ---------------------------------------------------------------------------
// EAN
// ---------------------------------------------------------------------------

/** Zero-pad to GTIN-14, the GS1 standard form and a clean fixed index width. */
export function normalizeEan(raw: string): string {
  return raw.replace(/\D/g, "").padStart(14, "0");
}

/**
 * GS1 prefix 2 = restricted circulation: codes each retailer mints for its own
 * weighed/counter goods. They identify a scale ticket, not a product, so they
 * must never be matched between stores. Tested on the GTIN-14 form, where the
 * leading pad zero puts the "2" at index 1.
 */
export function isRestrictedCirculationEan(raw: string): boolean {
  const n = normalizeEan(raw);
  return n[1] === "2";
}

/** Standard GS1 mod-10 check digit over the GTIN-14 form. */
export function isValidEan(raw: string): boolean {
  const n = normalizeEan(raw);
  if (!/^\d{14}$/.test(n)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const d = n.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === n.charCodeAt(13) - 48;
}

/** A barcode usable for cross-store matching: valid, and not restricted-circulation. */
export function matchableEan(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!isValidEan(raw)) return null;
  if (isRestrictedCirculationEan(raw)) return null;
  return normalizeEan(raw);
}
