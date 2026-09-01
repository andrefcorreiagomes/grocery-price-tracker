/**
 * The app's menu headings, and how a kind of food gets proposed for one.
 *
 * A food type is what a shopper has in mind - "batata", "queijo". A CATEGORY is
 * the heading it lives under in the app's menu. The catalogue knows the first
 * and nothing about the second, which is why Carne and Fruta today hold only
 * the 275 hand-picked products and none of the 44,000 catalogue ones.
 *
 * Curated data, like `data/food-types.ts` - the judgement lives in one readable
 * place. What is NOT here is the decision itself: that is stored per food type
 * in `FoodTypeCategory` and made through /admin/categorias, because filing 166
 * foods is a job for whoever runs the site rather than a code change.
 */

/**
 * The headings, in menu order.
 *
 * The first five already exist in the app; the rest are new and were forced by
 * the catalogue. Measured across 177 food types, Pingo Doce's departments
 * include Congelados (13 food types), Padaria e Pastelaria (5), Espirituosas
 * (6), Cervejas (2), Vinhos (2) and Águas e Sumos (4) - none of which had
 * anywhere to go under the original five.
 */
export const MENU_CATEGORIES = [
  "Fruta",
  "Legumes",
  "Carne",
  "Peixe",
  "Laticínios",
  "Charcutaria",
  "Padaria",
  "Mercearia",
  "Congelados",
  "Bebidas",
  "Refeições",
  "Outros",
] as const;

export type MenuCategory = (typeof MENU_CATEGORIES)[number];

/**
 * Pingo Doce's department to a menu heading.
 *
 * Pingo Doce is the source because its departments are by far the cleanest of
 * the three: 174 of 177 food types have one, and they name real shop counters -
 * Talho, Peixaria, Padaria. Continente and Auchan publish a top level so broad
 * that it is useless here: "Frescos" holds meat, fish, fruit and cheese alike,
 * and only 50 of 177 food types have a dominant section under it.
 *
 * A PROPOSAL, never an answer. Two departments in particular cannot be resolved
 * from the department alone and are marked below.
 */
export const DEPARTMENT_TO_CATEGORY: Record<string, MenuCategory> = {
  Talho: "Carne",
  Peixaria: "Peixe",
  // Splits between Fruta and Legumes, which the department does not
  // distinguish - a tomato and an apple sit in the same aisle. Proposed as
  // Fruta and expected to be corrected for about half of its 21 food types.
  "Frutas e Vegetais": "Fruta",
  // Splits between Charcutaria and Laticínios for the same reason: ham and
  // cheese share a counter. Proposed as Charcutaria.
  "Charcutaria e Queijos": "Charcutaria",
  "Iogurtes e Sobremesas": "Laticínios",
  "Leite e Bebidas Vegetais": "Laticínios",
  "Manteiga, Margarina e Natas": "Laticínios",
  Ovos: "Laticínios",
  "Padaria e Pastelaria": "Padaria",
  "Bolachas, Cereais e Guloseimas": "Mercearia",
  Mercearia: "Mercearia",
  "Café, Chá e Achocolatados": "Mercearia",
  "Alternativas Alimentares": "Mercearia",
  Congelados: "Congelados",
  "Take Away": "Refeições",
  Vinhos: "Bebidas",
  "Cervejas e Sidras": "Bebidas",
  Espirituosas: "Bebidas",
  "Águas, Sumos e Refrigerantes": "Bebidas",
};

/** The fallback when a food type has no Pingo Doce department at all - 3 of 177. */
export const UNPLACED: MenuCategory = "Outros";
