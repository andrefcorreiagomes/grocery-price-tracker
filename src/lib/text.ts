/**
 * Comparing product names and brands as text: accents, case, plurals, the
 * words that are not the product, and the overlap score.
 *
 * Moved out of matching.ts on 22 October 2026 (code review M8), unchanged.
 * Pure and I/O-free.
 */

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Drop diacritics so "cafe" and "café" compare equal. */
export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * A Portuguese plural folded to its singular: mostly a trailing "s", with the
 * irregular endings that matter - "limões" to "limão", "pães" to "pão",
 * "naturais" to "natural". Short tokens are left alone, where a final "s" is
 * likelier part of the word. Works on accent-free text.
 *
 * The one rule for the classifier, the matcher and the catalogue search since
 * 22 October 2026 (code review M8). Until then there were three copies, and
 * the matcher's only dropped the "s", so its "paes" became "pae" and
 * "limoes" became "limoe" while the classifier said "pao" and "limao".
 */
export function foldPlural(token: string): string {
  if (token.length >= 5 && token.endsWith("oes")) return token.slice(0, -3) + "ao";
  if (token.length >= 4 && token.endsWith("aes")) return token.slice(0, -3) + "ao";
  if (token.length >= 5 && token.endsWith("ais")) return token.slice(0, -3) + "al";
  return token.length >= 4 && token.endsWith("s") ? token.slice(0, -1) : token;
}

/**
 * A brand as it compares: accent-free, lowercase, nothing but letters and
 * digits. Punctuation is removed rather than turned into a space, because the
 * stores spell one brand differently: Pingo Doce's "L'Or" and Continente's
 * "LOr" are both "lor".
 *
 * The one brand rule for finding candidates and for confirming a match since
 * 22 October 2026 (code review M8). Until then confirming used the name rule,
 * which made "l or" and "lor" two different brands.
 */
export function normalizeBrand(brand: string | null | undefined): string {
  return stripAccents(String(brand ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Overlap of two token sets, 0..1 (Jaccard). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Does a product name contain every word of a search term? Accents, case and
 * punctuation are ignored, and a trailing "s" on a term word is optional, so
 * "acucar mascavado" finds "Açúcar Mascavado", "ovos" finds "Ovo Cozido" and
 * "limao" finds "Limões". Whole words only, so "sal" does not find "salmão".
 * Used by `npm run discover`, which searches our own catalogue.
 */
export function matchesTerm(name: string, term: string): boolean {
  // Portuguese plurals, folded on both sides.
  const words = (t: string) =>
    stripAccents(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).map(foldPlural);
  const inName = new Set(words(name));
  return words(term).every((w) => inName.has(w));
}

const SIZE_TOKEN =
  /\b\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:kg|g|gr|grs|l|lt|ml|cl)\b/gi;
const PACK_TOKEN = /\b(?:pack|emb|embalagem|un|uni|unidades?)\b\.?/gi;

/**
 * Lowercased, accent-free, size- and pack-word-stripped, whitespace-collapsed.
 * The size is removed because it is matched separately and numerically; leaving
 * it in the name would let "1 kg" vs "5 kg" of the same rice score as similar
 * text when they must be treated as different products.
 */
export function normalizeName(name: string): string {
  return stripAccents(name)
    .toLowerCase()
    .replace(SIZE_TOKEN, " ")
    .replace(PACK_TOKEN, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(name: string): Set<string> {
  return new Set(normalizeName(name).split(" ").filter((t) => t.length > 1));
}

/** Jaccard overlap of the two token sets, 0..1. */
export function tokenSimilarity(a: string, b: string): number {
  return jaccard(nameTokens(a), nameTokens(b));
}
