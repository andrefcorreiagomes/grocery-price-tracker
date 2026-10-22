/**
 * The words the kind classifier (src/lib/food-types.ts) reads, apart from the
 * kinds themselves (data/food-types.ts).
 *
 * Moved here from the classifier's code on 22 October 2026 (code review M15),
 * unchanged, so that they can be read and changed as data, beside the kinds.
 * Giving every product a kind will add to them. All are matched on names and
 * shelves made lowercase and accent-free: "refeicoes", not "Refeições".
 */

/** Words that lead a name but say nothing about what the food IS. */
export const NAME_STOPWORDS = [
  "de", "da", "do", "das", "dos", "e", "com", "sem", "em", "para", "a", "o", "as", "os",
  "bio", "biologico", "biologica", "selecao", "seleccao", "especial", "nacional",
  "fresco", "fresca", "embalada", "embalado", "granel", "pack", "kg", "gr", "un",
  "congelado", "congelada", "ultracongelado", "ultracongelada",
  // "Mini Rissóis de Carne" are rissóis: a size is never the food. Approved in
  // review batch 1, 20 October 2026.
  "mini",
];

/**
 * Words after which the read past a cut word stops: packing and fillings.
 * "Filetes de Anchova em Óleo" is not cooking oil, "Filetes Recheados com
 * Tomate" is not tomato. 17 October 2026.
 */
export const SCAN_STOPS = ["azeite", "oleo", "recheado", "escabeche", "proteina"];

/**
 * From this word on comes the sauce the product is in, not the product:
 * "Pernil Assado com Molho de Cerveja" is not beer, and "Bifes de Soja Molho
 * Tomate" is not tomato sauce.
 */
export const SAUCE_WORD = "molho";

/**
 * Shelves of PREPARED food: cold cuts, ready meals, savoury snacks, take-away.
 * A cut word there does not lead to the raw animal - "Peito de Frango Fatias
 * Finas" on a cold-cuts shelf is chicken ham, "Caldeirada de Bacalhau" on a
 * ready-meals shelf is a fish stew, "Pataniscas" are fritters. The hand check
 * of 20 October 2026 found 10 of 102 cut-word decisions wrong, nearly all of
 * them this. Read on the whole shelf path.
 */
export const PREPARED_SHELF =
  /charcutaria|fiambre|refeic|refeicoes|salgados|petiscos|take.away|gastronomia|preparados.de.peixe|frango assado/;

/**
 * Smoked salmon sits among the cold cuts but is still salmon, kept apart by its
 * "fumado" label.
 */
export const NOT_PREPARED_SHELF = /salmao fumado/;

/** Coated or dipped: "Pedaços de Ananás Cobertos com Chocolate" is a dessert. */
export const COATED = /\bcobert[oa]s?\b|\bpanad[oa]s?\b/;

/**
 * Cooking words: "Entrecosto de Porco com Molho Barbecue Slow Cooked" is a
 * cooked dish, not raw pork. "Para assar" and "para fritar" (raw, for roasting
 * or frying) do not match, and neither does "grelhada": "Grelhada Mista de
 * Porco" is a raw mixed-grill pack. 20 October 2026.
 */
export const COOKED = /slow.?cook|\bcozinhad[oa]s?\b|\bassad[oa]s?\b|\bfrit[oa]s?\b|\bconfitad[oa]s?\b/;

/** The cut words that name a mixture rather than a part of one food. */
export const MIX_WORDS = ["mix", "mistura"];

/** General words that make a mix a mixture: "Mix Frutas", "Mistura Ervas". */
export const GENERIC_MIX = ["fruta", "fruto", "legume", "erva", "cereal", "especiaria", "tempero", "pequeno", "salada"];

/**
 * On a snack shelf a cut word leads nowhere real: "Tiras de Fruta Morango" is a
 * fruit-leather snack, not strawberries. Read on the product's own shelf, the
 * leaf; "Snacks de Chocolate" says what the snacks are, so it is not one.
 */
export const SNACK_SHELF = /\bsnacks?\b|aperitivo/;
export const NOT_SNACK_SHELF = /snacks? de\b/;
/** Names that are snacks whatever the shelf. */
export const SNACK_NAME = /\btiras de fruta\b/;

/**
 * Shelf words meaning "and others": the shelf holds more than the food it
 * names. "Especialidades" alone or after "e" ("Queijos e Especialidades") is
 * open; "massas-especialidades", the shelf Auchan moved its specialty pastas to
 * on 22 October 2026, names pasta - and three verified pastas lost their kind.
 */
export const OPEN_SHELF = /(?:^|\be[\s-]+)especialidades\b|\b(outros|outras|mais|diversos|diversas|variados|aperitivos?|sobremesas?)\b/;

/**
 * Snacks, tropical fruit and flavoured drinks are open sets too: the hand check
 * of 20 October 2026 found pork scratchings on a "snacks e pipocas" shelf filed
 * as popcorn, and a quince on "banana e frutos tropicais" filed as banana.
 * "Snacks de Chocolate" is not open - it says what the snacks are - so
 * "snacks" counts only when no "de" follows. (A crème liégeois on "gelatinas e
 * sobremesas" filed as jelly is why "sobremesas" is in OPEN_SHELF.)
 */
export const OPEN_SHELF_UNLESS_CHOCOLATES = /\b(tropica(?:l|is)|aromatizad[oa]s?)\b|\bsnacks?\b(?![\s-]+de\b)/;

/**
 * The one exception, from the data: Auchan's "bombons-e-snacks" holds
 * chocolate bars and boxes of chocolates (Kit Kat, Kinder, Lindt - 204
 * products), so "snacks" beside "bombons" is not open.
 */
export const CHOCOLATES_SHELF = /\bbombo/;
