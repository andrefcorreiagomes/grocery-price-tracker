import {
  CUT_WORDS,
  FOOD_SECTIONS,
  FOOD_TYPES,
  NON_FOOD_SECTIONS,
  type FoodType,
} from "../../data/food-types";
import { HOUSE_LABELS } from "./candidates";
import { normalizeName, stripAccents } from "./matching";

/**
 * Deciding what KIND of food a product is, so "where are potatoes cheapest" has
 * an answer.
 *
 * Store categories cannot answer it - all three chains file potatoes on a shelf
 * that also holds sweet potatoes, onions and garlic - and the product name can,
 * because the head noun of a Portuguese grocery name is almost always the food:
 * "Batata Vermelha Continente", "BATATA BRANCA LAVADA KG".
 *
 * Pure and I/O-free, like matching.ts and candidates.ts, so the judgement calls
 * are testable without a database.
 */

/** Words that lead a name but say nothing about what the food IS. */
const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "com", "sem", "em", "para", "a", "o", "as", "os",
  "bio", "biologico", "biologica", "selecao", "seleccao", "especial", "nacional",
  "fresco", "fresca", "embalada", "embalado", "granel", "pack", "kg", "gr", "un",
  "congelado", "congelada", "ultracongelado", "ultracongelada",
]);

const CUT_SET = new Set(CUT_WORDS);

/** Head word to the type that claims it. Several types can share a head. */
const BY_HEAD = new Map<string, FoodType[]>();
for (const type of FOOD_TYPES) {
  for (const head of type.heads) {
    const bucket = BY_HEAD.get(head);
    if (bucket) bucket.push(type);
    else BY_HEAD.set(head, [type]);
  }
}

export const FOOD_TYPE_BY_ID = new Map(FOOD_TYPES.map((t) => [t.id, t]));

/**
 * Portuguese plurals are overwhelmingly a trailing "s", and the stores disagree
 * about number for the same product. Mirrors the folding in candidates.ts, with
 * the two irregular endings that matter here.
 */
export function foldPlural(token: string): string {
  if (token.length >= 5 && token.endsWith("oes")) return token.slice(0, -3) + "ao";
  if (token.length >= 5 && token.endsWith("ais")) return token.slice(0, -3) + "al";
  return token.length >= 4 && token.endsWith("s") ? token.slice(0, -1) : token;
}

/**
 * Is this product in a food section of its store?
 *
 * Continente and Auchan publish a clean food/non-food split at the top level, so
 * they are allow-listed. Pingo Doce publishes a flat shelf name instead - about
 * 67 of them, nearly all food - so it is deny-listed. Allow-listing it lost more
 * than half its catalogue and read its entire drinks section as zero.
 */
export function isFoodSection(store: string, categoryPath: string | null): boolean {
  const top = (categoryPath ?? "").split(/[/>]/)[0].trim();
  if (!top) return false;

  const deny = NON_FOOD_SECTIONS[store];
  if (deny) return !deny.some((s) => s.toLowerCase() === top.toLowerCase());

  const allow = FOOD_SECTIONS[store];
  if (!allow) return false;
  const flat = stripAccents(top).toLowerCase();
  return allow.some((s) => stripAccents(s).toLowerCase() === flat);
}

/** The name's meaningful tokens, chain labels stripped, plurals folded. */
export function nameTokensForType(name: string, store: string): string[] {
  let normalized = normalizeName(name);
  for (const label of HOUSE_LABELS[store] ?? []) {
    normalized = normalized.split(label).join(" ");
  }
  return normalized
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map(foldPlural);
}

/** First type claiming `head` whose require/exclude rules accept `name`. */
function resolve(head: string, name: string): FoodType | null {
  const candidates = BY_HEAD.get(head);
  if (!candidates) return null;
  for (const type of candidates) {
    if (type.require && !type.require.test(name)) continue;
    if (type.exclude && type.exclude.test(name)) continue;
    return type;
  }
  return null;
}

/** Words of a category path, accent-free and split on punctuation and hyphens. */
function categoryTokens(segment: string): string[] {
  return stripAccents(segment)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map(foldPlural);
}

/**
 * What kind of food is this? Returns a FoodType id, or null when nothing is
 * recognised - which is a large slice of the catalogue, and must stay honest
 * rather than be forced into a bucket.
 *
 * A chain of three attempts, most trustworthy first:
 *
 *   1. the HEAD NOUN is a food type       "Queijo Fresco de Vaca"  -> queijo
 *   2. a LATER WORD of the name is        "Peito de Frango"        -> frango
 *                                         "Miolo de Amêndoa"       -> amendoa
 *                                         "Quinta do Carmo ... Vinho Branco"
 *                                                                  -> vinho
 *   3. the CATEGORY PATH says so          "Cápsulas Dolce Gusto"   -> cafe
 *                                         (filed under .../Café em Cápsulas)
 *
 * Step 1 must come first, and that is the whole reason this is ordered rather
 * than a single scan. Measured over 10,076 meat and fish products, 144 head
 * words are followed by an animal - but the commonest are `queijo` (152, "Queijo
 * Fresco de Vaca"), `fiambre`, `salsicha`, `arroz` and `pizza`, all genuine food
 * types that merely NAME an animal. Scanning first would file cheese as beef.
 *
 * Step 2 subsumes the cut-word problem without needing a list of cuts: the head
 * of "Peito de Frango" is not a food type, so the scan continues to `frango`. It
 * also rescues the two cases a cut list would never have covered - nut kernels
 * ("Miolo de Noz") and wine estates ("Herdade dos Grous ... Vinho Rosé").
 *
 * Each candidate is still tested against its own require/exclude rules, which is
 * what stops "Puré de Batata" being scanned into `batata`.
 */
export function classifyFoodType(
  name: string,
  store: string,
  categoryPath: string | null
): string | null {
  if (!isFoodSection(store, categoryPath)) return null;

  const tokens = nameTokensForType(name, store);
  const plain = stripAccents(name).toLowerCase();

  // 1. the head noun is itself a food type
  if (tokens.length > 0) {
    const direct = resolve(tokens[0], plain);
    if (direct) return direct.id;
  }

  // 2. the head is a CUT or a kernel: read past it to what it is a cut OF.
  // Gated on CUT_WORDS rather than scanning every name, because an ungated scan
  // matches flavours and ingredients instead of the product: measured, it filed
  // "Bebida Vegetal de Aveia sem Açúcar" as `acucar` (the name says WITHOUT
  // sugar), "Cookie Double Chocolate" as `chocolate`, and "Chausson de Maçã" as
  // `maca`. A cut word is a promise that what follows is the actual food.
  if (CUT_SET.has(tokens[0])) {
    for (const token of tokens.slice(1)) {
      const later = resolve(token, plain);
      if (later) return later.id;
    }
  }

  // 3. the store's own category says so. Read LEAF FIRST, because the leaf is
  // the most specific: "Café, Chá e Infusão/Café em Cápsulas" must answer café,
  // and reading the broader segment first could answer chá instead.
  const segments = (categoryPath ?? "").split(/[/>]/).map((s) => s.trim()).filter(Boolean);
  for (const segment of segments.reverse()) {
    for (const token of categoryTokens(segment)) {
      const viaCategory = resolve(token, plain);
      if (viaCategory) return viaCategory.id;
    }
  }

  return null;
}
