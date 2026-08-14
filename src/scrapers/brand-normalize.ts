/**
 * Pingo Doce labels its own fresh-food counters as sub-brands instead of
 * leaving brand empty (Continente's convention) - "Nossa Peixaria" (fresh
 * fish counter) and "Nosso Talho" (fresh meat counter) are Pingo Doce's own
 * in-house programs, not independent companies, same as "Pingo Doce" itself.
 * Add to this list as more in-house labels turn up during curation that
 * don't already match the "Nosso(a) ___" pattern below.
 */
const PINGO_DOCE_HOUSE_LABELS = new Set(["pingo doce", "nossa peixaria", "nosso talho"]);

/**
 * "Nossa"/"Nosso" means "our" - Pingo Doce's known in-house labels are all
 * "Our ___" (Our Fish Shop, Our Butcher), which a genuine third-party brand
 * wouldn't be named from Pingo Doce's own perspective. Catches future
 * in-house labels following the same convention without needing the exact
 * string added to the list above first.
 *
 * Plurals and a leading definite article both occur in the wild and the
 * original singular-only pattern missed them: the orange curation turned up
 * "Os Nossos Frescos" (Our Fresh Produce), and the already-tracked azeite is
 * branded "As Nossas Planícies" (Our Plains). Hence the optional "O/A/Os/As"
 * prefix and the optional plural "s".
 */
const OUR_SOMETHING_PATTERN = /^(?:[oa]s?\s+)?noss[ao]s?\s+\S/i;

export function normalizePingoDoceBrand(rawBrand: string | undefined): string {
  const brand = rawBrand?.trim() || "Pingo Doce";
  const isHouseLabel =
    PINGO_DOCE_HOUSE_LABELS.has(brand.toLowerCase()) || OUR_SOMETHING_PATTERN.test(brand);
  return isHouseLabel ? "Pingo Doce" : brand;
}
