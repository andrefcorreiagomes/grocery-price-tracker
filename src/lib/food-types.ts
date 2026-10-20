import { CUT_WORDS, FOOD_TYPES, type FoodType } from "../../data/food-types";
import { CATEGORIES } from "../../data/food-tree";
import { isFoodSection } from "./store-sections";
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
  // "Mini Rissóis de Carne" are rissóis: a size is never the food. Approved in
  // review batch 1, 20 October 2026.
  "mini",
]);

const CUT_SET = new Set(CUT_WORDS);

/** Words after which the read past a cut word stops: packing and fillings. */
const SCAN_STOPS = new Set(["azeite", "oleo", "recheado", "escabeche", "proteina"]);

/**
 * Shelves of PREPARED food: cold cuts, ready meals, savoury snacks, take-away.
 * A cut word there does not lead to the raw animal - "Peito de Frango Fatias
 * Finas" on a cold-cuts shelf is chicken ham, "Caldeirada de Bacalhau" on a
 * ready-meals shelf is a fish stew, "Pataniscas" are fritters. The hand check
 * of 20 October 2026 found 10 of 102 cut-word decisions wrong, nearly all of
 * them this. Read on the product's own shelf and the one above, as in step 3.
 */
const PREPARED_SHELF =
  /charcutaria|fiambre|refeic|refeicoes|salgados|petiscos|take.away|gastronomia|preparados.de.peixe|frango assado/;

/** Coated or dipped: "Pedaços de Ananás Cobertos com Chocolate" is a dessert. */
const COATED = /\bcobert[oa]s?\b|\bpanad[oa]s?\b/;

/**
 * Cooking words: "Entrecosto de Porco com Molho Barbecue Slow Cooked" is a
 * cooked dish, not raw pork. "Para assar" and "para fritar" (raw, for roasting
 * or frying) do not match, and neither does "grelhada": "Grelhada Mista de
 * Porco" is a raw mixed-grill pack. 20 October 2026.
 */
const COOKED = /slow.?cook|\bcozinhad[oa]s?\b|\bassad[oa]s?\b|\bfrit[oa]s?\b|\bconfitad[oa]s?\b/;

/** The cut words that name a mixture rather than a part of one food. */
const MIX_WORDS = new Set(["mix", "mistura"]);

/** General words that make a mix a mixture: "Mix Frutas", "Mistura Ervas". */
const GENERIC_MIX = new Set(["fruta", "fruto", "legume", "erva", "cereal", "especiaria", "tempero", "pequeno", "salada"]);

/**
 * What a cut word may still lead to on a prepared-food shelf: the cold cuts and
 * ready meals themselves - the "Charcutaria" and "Refeições prontas" categories
 * of the food tree. "Cubos de Fiambre" is fiambre; "Feijoada de Cogumelos" on a
 * ready-meals shelf is not mushrooms.
 */
const PREPARED_KINDS = new Set(
  CATEGORIES.filter((c) => c.id === "charcutaria" || c.id === "refeicoes").flatMap((c) => c.kinds)
);

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
  // pães -> pão. Without it "paes" lost only its s and became "pae", so "PÃES
  // GARCIA CACETE" was not bread.
  if (token.length >= 4 && token.endsWith("aes")) return token.slice(0, -3) + "ao";
  if (token.length >= 5 && token.endsWith("ais")) return token.slice(0, -3) + "al";
  return token.length >= 4 && token.endsWith("s") ? token.slice(0, -1) : token;
}

/**
 * Is this product in a food section of its store? Decided by
 * data/store-sections.ts; re-exported so existing imports keep working.
 */
export { isFoodSection };

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

/**
 * First type claiming `head` whose require/exclude rules accept `name`.
 *
 * The rules read the NAME only, even when a shelf is deciding. Letting the
 * shelf's words count as evidence was tried: "aromas, fermento e corantes"
 * then satisfied fermento's own require, and filed every vanilla essence and
 * food colouring on that shelf as baking powder.
 */
function resolve(head: string, name: string, fromShelf = false): FoodType | null {
  const candidates = BY_HEAD.get(head);
  if (!candidates) return null;
  for (const type of candidates) {
    // A shelf may not decide a kind that must say so in its own name.
    if (fromShelf && type.nameOnly) continue;
    if (type.require && !type.require.test(name)) continue;
    if (type.exclude && type.exclude.test(name)) continue;
    return type;
  }
  return null;
}

/** Shelf words meaning "and others": the shelf holds more than the food it names. */
// Snacks, appetisers, desserts, tropical fruit and flavoured drinks are open
// sets too: the hand check of 20 October 2026 found pork scratchings on a
// "snacks e pipocas" shelf filed as popcorn, a quince on "banana e frutos
// tropicais" filed as banana, and a crème liégeois on "gelatinas e
// sobremesas" filed as jelly. "Snacks de Chocolate" is not open - it says
// what the snacks are - so "snacks" counts only when no "de" follows.
const OPEN_SHELF =
  /\b(especialidades|outros|outras|mais|diversos|diversas|variados|aperitivos?|sobremesas?|tropica(?:l|is)|aromatizad[oa]s?)\b|\bsnacks?\b(?![\s-]+de\b)/;

/**
 * Does this shelf name an open set? One exception, from the data: Auchan's
 * "bombons-e-snacks" holds chocolate bars and boxes of chocolates (Kit Kat,
 * Kinder, Lindt - 204 products), so "snacks" beside "bombons" is not open.
 */
function isOpenShelf(segment: string): boolean {
  const s = stripAccents(segment).toLowerCase();
  if (/\bbombo/.test(s) && !/\b(especialidades|outros|outras|mais|diversos|diversas|variados|aperitivos?|sobremesas?)\b/.test(s)) {
    return false;
  }
  return OPEN_SHELF.test(s);
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
  return explainFoodType(name, store, categoryPath).id;
}

/**
 * Which of the three steps decided - the head noun, a word read past a cut, or
 * the shelf - or why nothing did. The same decision as classifyFoodType; the
 * step is what a certainty score starts from, since the three are not equally
 * trustworthy.
 */
export type FoodTypeStep = "head" | "cut" | "shelf";
export type FoodTypeExplanation =
  | { id: string; step: FoodTypeStep }
  | { id: null; step: null; why: "not a food section" | "shelf names several foods" | "open shelf" | "a mix of several foods" | "prepared or cooked" | "nothing recognised" };

export function explainFoodType(
  name: string,
  store: string,
  categoryPath: string | null
): FoodTypeExplanation {
  if (!isFoodSection(store, categoryPath)) return { id: null, step: null, why: "not a food section" };

  const tokens = nameTokensForType(name, store);
  const plain = stripAccents(name).toLowerCase();

  // 1. the head noun is itself a food type
  if (tokens.length > 0) {
    const direct = resolve(tokens[0], plain);
    if (direct) return { id: direct.id, step: "head" };
  }

  // 2. the head is a CUT or a kernel: read past it to what it is a cut OF.
  // Gated on CUT_WORDS rather than scanning every name, because an ungated scan
  // matches flavours and ingredients instead of the product: measured, it filed
  // "Bebida Vegetal de Aveia sem Açúcar" as `acucar` (the name says WITHOUT
  // sugar), "Cookie Double Chocolate" as `chocolate`, and "Chausson de Maçã" as
  // `maca`. A cut word is a promise that what follows is the actual food.
  const shelf = stripAccents(categoryPath ?? "").toLowerCase();
  const leaf = shelf.split(/[/>]/).pop() ?? "";
  // Cold cuts, ready meals and cooked dishes are not the raw meat or fish their
  // name starts from. Read on the whole path: "Charcutaria e Queijos/Enchidos/
  // Paio" puts the cold-cuts word three levels up. Smoked salmon sits among the
  // cold cuts but is still salmon, kept apart by its "fumado" label.
  const prepared =
    (PREPARED_SHELF.test(shelf) && !/salmao fumado/.test(shelf)) || COOKED.test(plain);
  // On a snack shelf a cut word leads nowhere real: "Tiras de Fruta Morango"
  // is a fruit-leather snack, not strawberries.
  const snackShelf =
    (/\bsnacks?\b|aperitivo/.test(leaf) && !/snacks? de\b/.test(leaf)) || /\btiras de fruta\b/.test(plain);
  // "Mix de Frutos Secos sem Sal" is not salt: a word after "sem" (without) is
  // never the food. "sem" itself is a stopword, so it is read off the name.
  const without = new Set([...plain.matchAll(/\bsem ([a-z]+)/g)].map((m) => foldPlural(m[1])));
  // A mix lists its foods with "e" or commas: "Mix Framboesa e Mirtilo". Without
  // a list it names one food, described: "Mistura de Pimentas em Grão" is
  // pepper (not chickpeas, "grão"), "Mix Salsichas Frescas de Porco" sausages.
  const isMix = MIX_WORDS.has(tokens[0]) && /,|\be\b/.test(plain);
  // A cooking word refuses raw kinds whichever step would give them: "Piano de
  // Bovino Slow Cooked" on a beef shelf is not raw beef. 20 October 2026.
  let refused = COOKED.test(plain);
  // "Mix Frutas ...", "Mix Pequeno Almoço ...": a mix named by a general word
  // is a mixture whatever follows, list or not.
  if (MIX_WORDS.has(tokens[0]) && GENERIC_MIX.has(tokens[1] ?? "")) {
    return { id: null, step: null, why: "a mix of several foods" };
  }
  if (CUT_SET.has(tokens[0]) && !snackShelf && !COATED.test(plain)) {
    const found = new Set<string>();
    for (const token of tokens.slice(1)) {
      // What follows these is the packing or the filling, not the food:
      // "Filetes de Anchova em Óleo" is not cooking oil, "Filetes Recheados
      // com Tomate" is not tomato. 17 October 2026.
      if (SCAN_STOPS.has(token)) break;
      if (without.has(token)) continue;
      // From "molho" on comes the sauce the product is in, not the product:
      // "Pernil Assado com Molho de Cerveja" is not beer, and "Bifes de Soja
      // Molho Tomate" is not tomato sauce.
      if (token === "molho") break;
      const later = resolve(token, plain);
      if (later) {
        // On a prepared shelf, or with a cooking word, only a cold cut or a
        // ready meal is this product. The shelf may still decide, but only a
        // cold cut or a ready meal (step 3): cured loin on the "Paio" shelf is
        // paio, cod fritters on a snacks shelf a ready meal, and slow-cooked
        // ribs on "Talho/Porco" are not raw pork.
        if (prepared && !PREPARED_KINDS.has(later.id)) {
          refused = true;
          break;
        }
        if (!isMix) return { id: later.id, step: "cut" };
        found.add(later.id);
      }
    }
    // A mix is one food only when everything it names is the same food: "Mix
    // Tomate Cherry" is tomato, "Mistura de Cajus, Avelãs e Amendoins" is not
    // cashews. The hand check of a fresh sample, 20 October 2026, found half
    // the cut-word mistakes were mixes taking their first ingredient.
    if (isMix && found.size === 1) return { id: [...found][0], step: "cut" };
    if (isMix && found.size > 1) return { id: null, step: null, why: "a mix of several foods" };
  }

  // 3. the store's own category says so. Read LEAF FIRST, because the leaf is
  // the most specific: "Café, Chá e Infusão/Café em Cápsulas" must answer café,
  // and reading the broader segment first could answer chá instead.
  //
  // The first segment that names ANY food decides, and it decides only if it
  // names exactly one. A shelf naming several says what is NEAR the product,
  // not what it is: this used to take the first food named, and measured over
  // the catalogue that filed 2,271 products from 125 such shelves - bananas as
  // maçã ("Banana, Maçã e Pera"), farfalle as arroz ("arroz-e-massa"), mashed
  // potato as arroz ("Arroz, Massa e Farinha/Puré"), oregano as sal. Nor does
  // an undecided shelf hand over to its parent, which is broader still: that
  // filed grated coconut as açúcar through "Açúcar e Sobremesas". Undecided is
  // the honest answer; the names the old rule got right are claimed by name in
  // data/food-types.ts instead.
  //
  // How many foods a shelf names is a property of the SHELF, so it is counted
  // from the shelf's words alone, before this product's own rules are applied.
  // Counting after them made "Café, Chá e Achocolatados" look like a tea-only
  // shelf to any product café's rules had turned away, and filed galão
  // capsules as chá. Words claimed by the same food types count once: "Café em
  // Cápsulas" names one food in two words.
  //
  // Only the product's OWN shelf and the one directly above it are read. A
  // shelf further up is broad enough to name a neighbour rather than the
  // product: Pingo Doce files fuet and cured loin under "Charcutaria e
  // Queijos/Charcutaria/Outros Enchidos", and the top segment named cheese;
  // dried apricots sit under "Batatas Fritas, Snacks e Frutos Secos/Frutos
  // Secos e Desidratados", and the segment above named potatoes. Measured
  // 17 October 2026.
  const segments = (categoryPath ?? "").split(/[/>]/).map((s) => s.trim()).filter(Boolean);
  for (const segment of segments.slice(-2).reverse()) {
    const foods = new Map<string, string>(); // claimants -> the word that names them
    for (const token of categoryTokens(segment)) {
      const claimants = BY_HEAD.get(token);
      if (!claimants) continue;
      // Words whose claimants overlap name one food: "pão" is claimed by both
      // pão and pão ralado, "broa" by pão alone, and "Pão do Dia e Broa" is one
      // bread shelf, not two foods. 20 October 2026.
      const ids = claimants.map((t) => t.id);
      const same = [...foods.keys()].find((k) => k.split(",").some((id) => ids.includes(id)));
      if (same) {
        const merged = [...new Set([...same.split(","), ...ids])].join(",");
        const word = foods.get(same)!;
        foods.delete(same);
        foods.set(merged, word);
      } else {
        foods.set(ids.join(","), token);
      }
    }
    if (foods.size > 1) return { id: null, step: null, why: "shelf names several foods" };
    // An "and others" shelf naming no food at all stops here too, rather than
    // handing over to the shelf above: foie gras and a charcuterie board on
    // "Charcutaria e Queijos/Tábuas e Aperitivos" were filed as cheese through
    // the parent. 20 October 2026.
    if (foods.size === 0 && isOpenShelf(segment)) {
      return { id: null, step: null, why: "open shelf" };
    }
    // A shelf that says "and others" names an open set, which is several foods
    // too: Pingo Doce's "Salmão Fumado e Especialidades" filed hummus, tzatziki
    // and a pork platter as salmão, and Auchan's "pato-e-mais-aves" filed quail
    // as duck.
    if (foods.size === 1 && isOpenShelf(segment)) {
      return { id: null, step: null, why: "open shelf" };
    }
    if (foods.size === 1) {
      const id = resolve([...foods.values()][0], plain, true)?.id ?? null;
      if (id && refused && !PREPARED_KINDS.has(id)) return { id: null, step: null, why: "prepared or cooked" };
      return id ? { id, step: "shelf" } : { id: null, step: null, why: "nothing recognised" };
    }
  }

  return { id: null, step: null, why: "nothing recognised" };
}
