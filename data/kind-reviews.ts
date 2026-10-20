/**
 * Kinds of food decided in review, by a person or by Claude with a person's
 * approval. The classifier (src/lib/food-types.ts) decides most products from
 * their name; where it is unsure (src/lib/kind-certainty.ts) the products go
 * to a review list (npm run review:kinds), grouped by store, shelf and kind.
 * What the review decides is recorded here, so it is never decided twice.
 *
 *   REVIEWED_GROUPS    a group checked as a whole. Every product the
 *                      classifier puts in it - including products that appear
 *                      there later - counts as certain. `becomes` corrects the
 *                      whole group to another kind.
 *   REVIEWED_PRODUCTS  one product, by its store's id. Wins over everything:
 *                      the kind it should have, or null for no kind.
 *
 * A group is matched on the shelf's last two levels and on the kind and step
 * the classifier gives. If a later rule changes the classifier's answer, the
 * group no longer matches and its products return to the review list - a
 * confirmation never outlives the decision it confirmed.
 *
 * Batch 1, 20 October 2026: the 30 largest groups in kinds shown on the site,
 * 1,148 products, approved by the user as proposed. With it came the kind
 * "tosta", and two rules in src/lib/food-types.ts and data/food-types.ts:
 * "Mini" is never the food, and Yofu, Sojagurte and Cocogurte are Vegurte.
 *
 * Batch 2, 20 October 2026: the next 30 groups, 432 products, approved by the
 * user as proposed, with two kinds assigned only here for now ("bebida-cereais",
 * "sopa-instantanea") and cured pork loins counted as paio. Recorded with
 * \`npm run review:batch -- record\`.
 *
 * Batch 3, 20 October 2026: 30 groups, 290 products, approved as proposed,
 * with the kind "noz-peca" (pecans) as a rule. Its liqueur group had no kind,
 * so its nine products are recorded one by one.
 */

export interface ReviewedGroup {
  batch: number;
  store: string;
  /** the last two levels of the shelf path, as the review list shows them */
  shelf: string;
  /** the kind the classifier gives this group */
  kind: string;
  /** how the classifier decided it */
  step: "head" | "cut" | "shelf";
  /** the kind the whole group should have instead, when it was wrong; null for no kind */
  becomes?: string | null;
}

export interface ReviewedProduct {
  batch: number;
  store: string;
  /** the store's own product id */
  id: string;
  /** the name at review time, for a person reading this file */
  name: string;
  /** the kind it should have; null for no kind */
  kind: string | null;
  why: string;
}

export const REVIEWED_GROUPS: ReviewedGroup[] = [
  // 1. Mostly toasts, mini-toasts, crispbread and breadsticks, which are not bread and were never compared with Pingo Doce's and Continente's identical produ...
  { batch: 1, store: "AUCHAN", shelf: "tostas-e-pão-embalado/tostas,-mini-tostas-e-gressinos", kind: "tosta", step: "shelf" },
  // 2. All 70 are granola or muesli.
  { batch: 1, store: "CONTINENTE", shelf: "Cereais e Barras/Muesli e Granola", kind: "cereais", step: "shelf" },
  // 3. All 65 are plant-based yoghurts, of soya or coconut. We already have a kind for these, Vegurte; filed as yoghurt they would be compared with dairy yog...
  { batch: 1, store: "AUCHAN", shelf: "iogurtes/soja-e-vegetais", kind: "iogurte", step: "shelf", becomes: "vegurte" },
  // 4. Tinned and packaged ready meals: right. Nine products on this shelf are not meals.
  { batch: 1, store: "AUCHAN", shelf: "refeições,-sopas-e-puré/refeições-pré-preparadas", kind: "refeicao", step: "shelf" },
  // 5. All 64 are raw pork cuts, including liver, ears and tail.
  { batch: 1, store: "CONTINENTE", shelf: "Talho/Porco", kind: "porco", step: "cut" },
  // 6. Frozen ready food. Right as Ready meal for the dishes, but 21 products have a more precise kind we already compare, and 8 plant-based meat substitutes...
  { batch: 1, store: "AUCHAN", shelf: "refeições-rápidas/refeições-prontas", kind: "refeicao", step: "shelf" },
  // 7. Frozen savoury snacks: right as Ready meal. Seven are named "Mini ..." and are rissóis, croquetes, cod cakes, empadas and folhados, which have kinds o...
  { batch: 1, store: "AUCHAN", shelf: "refeições-rápidas/salgados-e-petiscos", kind: "refeicao", step: "shelf" },
  // 8. All 53 are granola or oat porridge.
  { batch: 1, store: "AUCHAN", shelf: "cereais-e-barras/granolas-e-papas", kind: "cereais", step: "shelf" },
  // 9. All 47 are raw pork cuts.
  { batch: 1, store: "AUCHAN", shelf: "talho/porco", kind: "porco", step: "cut" },
  // 10. All 46 are raw beef cuts, including carpaccio and stroganoff strips.
  { batch: 1, store: "AUCHAN", shelf: "talho/vitela-e-novilho", kind: "vaca", step: "cut" },
  // 11. All 44 are raw chicken, including giblets and feet.
  { batch: 1, store: "AUCHAN", shelf: "talho/frango-e-galinha", kind: "frango", step: "cut" },
  // 12. All 41 are frozen salt-cod portions. Here "caldeirada" means cod pieces for a stew, not a cooked dish.
  { batch: 1, store: "CONTINENTE", shelf: "Bacalhau Congelado/Lombos, Postas e Caldeirada", kind: "bacalhau", step: "cut" },
  // 13. All 34 are raw pork, including a stuffed roast and stroganoff strips.
  { batch: 1, store: "PINGO_DOCE", shelf: "Talho/Porco", kind: "porco", step: "cut" },
  // 14. All 33 are granola or muesli.
  { batch: 1, store: "PINGO_DOCE", shelf: "Cereais Barras e Bolsas de Fruta/Muesli e Granola", kind: "cereais", step: "shelf" },
  // 15. Take-away ready meals: right. Four are not.
  { batch: 1, store: "AUCHAN", shelf: "gastronomia/refeições-prontas", kind: "refeicao", step: "shelf" },
  // 16. All 28 are frozen hake.
  { batch: 1, store: "CONTINENTE", shelf: "Peixe Congelado/Pescada", kind: "pescada", step: "cut" },
  // 17. Instant noodles, ramen and rice cakes: right as Ready meal. One is a kit of ingredients.
  { batch: 1, store: "AUCHAN", shelf: "cozinha-asiática/preparados-e-refeições-rápidas", kind: "refeicao", step: "shelf" },
  // 18. All 26 are raw beef cuts.
  { batch: 1, store: "CONTINENTE", shelf: "Talho/Novilho, Vitela e Vitelão", kind: "vaca", step: "cut" },
  // 19. Raw beef cuts: right. One product on the beef shelf is pork.
  { batch: 1, store: "AUCHAN", shelf: "talho/vitela-e-novilho", kind: "vaca", step: "shelf" },
  // 20. All 24 are tinned tuna fillets.
  { batch: 1, store: "AUCHAN", shelf: "conservas/atum", kind: "atum", step: "cut" },
  // 21. All 23 are oat flakes.
  { batch: 1, store: "CONTINENTE", shelf: "Cereais e Barras/Flocos e Papas de Aveia", kind: "aveia", step: "cut" },
  // 22. Coxinhas, gyozas, cod fritters, samosas, squid rings: savoury snacks, not puff pastry (Folhado). Auchan's identical products are Ready meal, so these ...
  { batch: 1, store: "CONTINENTE", shelf: "Salgados e Folhados/Salgados", kind: "folhado", step: "shelf", becomes: "refeicao" },
  // 23. All 20 are raw chicken.
  { batch: 1, store: "PINGO_DOCE", shelf: "Aves/Frango", kind: "frango", step: "cut" },
  // 24. All 20 are soups: gazpacho, vegetable creams, caldo verde.
  { batch: 1, store: "AUCHAN", shelf: "gastronomia/sopas-e-preparados-para-sopa", kind: "sopa", step: "shelf" },
  // 25. Tinned mackerel fillets: right. One tin is roe.
  { batch: 1, store: "AUCHAN", shelf: "conservas/conservas-especialidades", kind: "cavala", step: "cut" },
  // 26. Hake: right. One is cooked roe.
  { batch: 1, store: "PINGO_DOCE", shelf: "Peixe/Pescada", kind: "pescada", step: "cut" },
  // 27. All 19 are fresh bread: rolls, loaves, focaccia.
  { batch: 1, store: "CONTINENTE", shelf: "Padaria e Pastelaria/Pão do Dia e Broa", kind: "pao", step: "shelf" },
  // 28. Breaded chicken pieces and nuggets: right. Six are something else.
  { batch: 1, store: "CONTINENTE", shelf: "Congelados/Nuggets e Crocantes", kind: "nugget", step: "shelf" },
  // 29. All 19 are drinkable yoghurts (Actimel, Danacol).
  { batch: 1, store: "AUCHAN", shelf: "iogurtes/defesa-e-colesterol", kind: "iogurte", step: "shelf" },
  // 30. Cereal flakes, bran and whole grains: right. Two are not.
  { batch: 1, store: "AUCHAN", shelf: "cereais-e-barras/flocos-cereais", kind: "cereais", step: "shelf" },
  // 2.1. Dry pasta, soup pasta, lasagne sheets and gnocchi: right. Three are konjac noodles with no wheat, sold as a low-carbohydrate substitute.
  { batch: 2, store: "CONTINENTE", shelf: "Arroz, Massa e Farinha/Massa", kind: "massa", step: "shelf" },
  // 2.2. All 18 are fresh bread rolls and loaves baked in store.
  { batch: 2, store: "AUCHAN", shelf: "padaria/pão-fresco-e-broa", kind: "pao", step: "shelf" },
  // 2.3. All 17 are raw veal cuts, including stroganoff strips and stew meat.
  { batch: 2, store: "PINGO_DOCE", shelf: "Vitela Vitelao e Bovino/Vitela e Vitelao​", kind: "vitela", step: "cut" },
  // 2.4. All 17 are salmon fillets, loins and steaks, fresh and frozen.
  { batch: 2, store: "PINGO_DOCE", shelf: "Peixe/Atum e Salmao​", kind: "salmao", step: "cut" },
  // 2.5. Fresh and frozen ready meals: right. One is a dessert.
  { batch: 2, store: "PINGO_DOCE", shelf: "Refeicoes e Salgados/Comida Fresca   Refeicoes Congeladas", kind: "refeicao", step: "shelf" },
  // 2.6. All 17 are frozen salmon.
  { batch: 2, store: "CONTINENTE", shelf: "Peixe Congelado/Salmão", kind: "salmao", step: "cut" },
  // 2.7. All 17 are tinned tuna fillets.
  { batch: 2, store: "CONTINENTE", shelf: "Conservas/Atum", kind: "atum", step: "cut" },
  // 2.8. All 16 are raw turkey.
  { batch: 2, store: "CONTINENTE", shelf: "Talho/Peru", kind: "peru", step: "cut" },
  // 2.9. All 16 are almonds, plain, roasted, sliced or ground; flavoured ones are still almonds.
  { batch: 2, store: "AUCHAN", shelf: "fruta/frutos-secos-e-sementes", kind: "amendoa", step: "cut" },
  // 2.10. All 16 are fresh pasta, filled pasta and gnocchi.
  { batch: 2, store: "AUCHAN", shelf: "gastronomia/massas-frescas", kind: "massa", step: "shelf" },
  // 2.11. All 16 are oat flakes.
  { batch: 2, store: "AUCHAN", shelf: "cereais-e-barras/flocos-cereais", kind: "aveia", step: "cut" },
  // 2.12. All 15 are Nestum cereal flakes.
  { batch: 2, store: "PINGO_DOCE", shelf: "Cereais Barras e Bolsas de Fruta/Cereais Infantis e Juvenis", kind: "cereais", step: "shelf" },
  // 2.13. All 15 are oat flakes.
  { batch: 2, store: "PINGO_DOCE", shelf: "Cereais Barras e Bolsas de Fruta/Cereais Linha e Fibra", kind: "aveia", step: "cut" },
  // 2.14. All 15 are raw turkey, including giblets.
  { batch: 2, store: "AUCHAN", shelf: "talho/peru", kind: "peru", step: "cut" },
  // 2.15. All 14 are shelled prawns.
  { batch: 2, store: "CONTINENTE", shelf: "Marisco Congelado/Miolos de Marisco", kind: "camarao", step: "cut" },
  // 2.16. All 14 are cereal flakes.
  { batch: 2, store: "AUCHAN", shelf: "cereais-e-barras/flocos-cereais", kind: "cereais", step: "cut" },
  // 2.17. None of these is plain coffee. Eight are barley, chicory and cereal drinks, a coffee substitute sold at all three chains: proposed as a new kind. Six ...
  { batch: 2, store: "AUCHAN", shelf: "café,-chá-e-infusão/café-saco,-solúvel-e-cevadas", kind: "cafe", step: "shelf", becomes: "bebida-cereais" },
  // 2.18. All 13 are frozen salt cod.
  { batch: 2, store: "PINGO_DOCE", shelf: "Bacalhau/Bacalhau Congelado", kind: "bacalhau", step: "cut" },
  // 2.19. All 13 are raw chicken, including liver and gizzards.
  { batch: 2, store: "CONTINENTE", shelf: "Continente/Peixaria e Talho", kind: "frango", step: "cut" },
  // 2.20. Fresh pasta, plain and filled: right. Three are ready dishes.
  { batch: 2, store: "CONTINENTE", shelf: "Refeições Práticas/Massas", kind: "massa", step: "shelf" },
  // 2.21. All 13 are shelled prawns.
  { batch: 2, store: "AUCHAN", shelf: "marisco-e-moluscos/camarão-e-miolo-de-camarão", kind: "camarao", step: "cut" },
  // 2.22. Raw veal: right. Three are minced-meat preparations, which have their own kind, and three are stuffed meat rolls.
  { batch: 2, store: "PINGO_DOCE", shelf: "Vitela Vitelao e Bovino/Vitela e Vitelao​", kind: "vitela", step: "shelf" },
  // 2.23. Not one is yoghurt: these are milkshakes, protein shakes and meal-replacement drinks. They get no kind.
  { batch: 2, store: "PINGO_DOCE", shelf: "Iogurtes/Iogurtes Liquidos​", kind: "iogurte", step: "shelf", becomes: null },
  // 2.24. Frozen ready meals: right. Two are not meals.
  { batch: 2, store: "PINGO_DOCE", shelf: "Refeicoes e Salgados/Refeicoes Congeladas", kind: "refeicao", step: "shelf" },
  // 2.25. Raw beef cuts: right. Three are minced beef and one is a stuffed meat roll.
  { batch: 2, store: "CONTINENTE", shelf: "Talho/Novilho, Vitela e Vitelão", kind: "vaca", step: "shelf" },
  // 2.26. All 12 are raw pork, mostly offal and less common cuts.
  { batch: 2, store: "CONTINENTE", shelf: "Talho/Porco", kind: "porco", step: "shelf" },
  // 2.27. Paio and cured pork loins (copita, painho, coppa), which Continente shelves together: right. Three are mixed tapas packs.
  { batch: 2, store: "CONTINENTE", shelf: "Enchidos/Paio", kind: "paio", step: "shelf" },
  // 2.28. Soup powders and sachets (Knorr, Quick Soup), not ready soup: proposed as a new kind. One is a ramen soup concentrate, which gets no kind.
  { batch: 2, store: "CONTINENTE", shelf: "Molhos, Temperos e Sal/Preparados de Sopas", kind: "sopa", step: "shelf", becomes: "sopa-instantanea" },
  // 2.29. Tinned ready meals: right. Two are not meals.
  { batch: 2, store: "CONTINENTE", shelf: "Conservas/Refeições", kind: "refeicao", step: "shelf" },
  // 2.30. All 12 are raw pork, mostly offal and roasting cuts.
  { batch: 2, store: "AUCHAN", shelf: "talho/porco", kind: "porco", step: "shelf" },
  // 3.1. All 12 are corn flakes and muesli.
  { batch: 3, store: "AUCHAN", shelf: "cereais-e-barras/corn-flakes-e-muesli", kind: "cereais", step: "shelf" },
  // 3.2. All 11 are raw lamb.
  { batch: 3, store: "PINGO_DOCE", shelf: "Talho/Borrego Cabrito e Coelho​", kind: "borrego", step: "cut" },
  // 3.3. All 11 are ready soups: gazpacho, vegetable creams, caldo verde.
  { batch: 3, store: "CONTINENTE", shelf: "Refeições Práticas/Sopas", kind: "sopa", step: "shelf" },
  // 3.4. All 11 are small sheep's cheeses (merendeiras).
  { batch: 3, store: "CONTINENTE", shelf: "Queijo Curado/Ovelha", kind: "queijo", step: "shelf" },
  // 3.5. All 11 are tinned mackerel fillets.
  { batch: 3, store: "CONTINENTE", shelf: "Conservas/Sardinha, Cavala, Lulas", kind: "cavala", step: "cut" },
  // 3.6. All 11 are fresh salmon.
  { batch: 3, store: "AUCHAN", shelf: "peixaria/peixe-fresco", kind: "salmao", step: "cut" },
  // 3.7. All 11 are breakfast cereals, granola and muesli, several with added protein.
  { batch: 3, store: "AUCHAN", shelf: "preparação-de-refeições/cereais-de-pequeno-almoço", kind: "cereais", step: "shelf" },
  // 3.8. All 10 are raw Angus beef.
  { batch: 3, store: "PINGO_DOCE", shelf: "Vitela Vitelao e Bovino/Angus", kind: "vaca", step: "cut" },
  // 3.9. All 10 are shelled prawns.
  { batch: 3, store: "PINGO_DOCE", shelf: "Marisco/Marisco Congelado", kind: "camarao", step: "cut" },
  // 3.10. All 10 are tinned tuna fillets.
  { batch: 3, store: "PINGO_DOCE", shelf: "Conservas/Atum", kind: "atum", step: "cut" },
  // 3.11. All 10 are tinned mackerel fillets.
  { batch: 3, store: "PINGO_DOCE", shelf: "Conservas/Sardinhas e Outros Peixes", kind: "cavala", step: "cut" },
  // 3.12. Oat preparations, protein granola and muesli: right as cereal. Three are not cereal.
  { batch: 3, store: "PINGO_DOCE", shelf: "Nutricao Desportiva/Cereais e Preparados", kind: "cereais", step: "shelf" },
  // 3.13. Plant-based meat substitutes (Heura, Garden Gourmet, soy steaks), which have no kind, as decided in earlier batches. The falafel and a vegetable chill...
  { batch: 3, store: "CONTINENTE", shelf: "Refeições Práticas/Vegetariano", kind: "refeicao", step: "shelf", becomes: null },
  // 3.14. None is plain coffee: instant cappuccino and mocha mixes, and two liquid espresso concentrates. They get no kind, as the cappuccino mixes did in batch...
  { batch: 3, store: "CONTINENTE", shelf: "Café, Chá e Solúveis/Café Solúvel", kind: "cafe", step: "shelf", becomes: null },
  // 3.15. Raw chicken, including necks, hearts and chicken for cabidela: right. Two are breaded.
  { batch: 3, store: "AUCHAN", shelf: "talho/frango-e-galinha", kind: "frango", step: "shelf" },
  // 3.16. All 10 are dry long pasta: spaghetti, aletria, meada.
  { batch: 3, store: "AUCHAN", shelf: "arroz-e-massa/esparguete,-aletria-e-meadas", kind: "massa", step: "shelf" },
  // 3.17. None is plain coffee: instant cappuccino, galão and mocha mixes. They get no kind, as in batch 2.
  { batch: 3, store: "PINGO_DOCE", shelf: "Café, Chá e Achocolatados/Cafe Soluvel e Descafeinado", kind: "cafe", step: "shelf", becomes: null },
  // 3.18. All 9 are breakfast cereals and flakes.
  { batch: 3, store: "PINGO_DOCE", shelf: "Cereais Barras e Bolsas de Fruta/Cereais Linha e Fibra", kind: "cereais", step: "shelf" },
  // 3.19. Walnuts: right. Two are pecans, proposed as a kind of their own.
  { batch: 3, store: "PINGO_DOCE", shelf: "Batatas Fritas Snacks e Frutos Secos/Frutos Secos e Desidratados", kind: "noz", step: "cut" },
  // 3.20. All 9 are raw lamb.
  { batch: 3, store: "CONTINENTE", shelf: "Talho/Cabrito e Borrego", kind: "borrego", step: "cut" },
  // 3.21. Ready pasta dishes, a risotto and mac and cheese, not plain pasta: filed as Ready meal.
  { batch: 3, store: "CONTINENTE", shelf: "Refeições/Massas e Gnocchis", kind: "massa", step: "shelf", becomes: "refeicao" },
  // 3.23. All 9 are cheese boards of Portuguese cheeses.
  { batch: 3, store: "AUCHAN", shelf: "queijaria/queijos-portugueses", kind: "queijo", step: "shelf" },
  // 3.24. Ready soups in cartons and bottles: right. Six are soup powders and sachets, which became a kind of their own in batch 2.
  { batch: 3, store: "AUCHAN", shelf: "refeições,-sopas-e-puré/sopas-em-pó-e-pré-preparadas", kind: "sopa", step: "shelf" },
  // 3.25. All 9 are dry pasta, including pasta made from peas, chickpeas and rice.
  { batch: 3, store: "AUCHAN", shelf: "massa,-arroz,-quinoa-e-puré/massa", kind: "massa", step: "shelf" },
  // 3.26. All 9 are frozen raw pork.
  { batch: 3, store: "AUCHAN", shelf: "carne/porco", kind: "porco", step: "cut" },
  // 3.27. Raw pork (skewers, trotters, fondue): right. Two are prepared.
  { batch: 3, store: "PINGO_DOCE", shelf: "Talho/Porco", kind: "porco", step: "shelf" },
  // 3.28. All 8 are bread rolls.
  { batch: 3, store: "PINGO_DOCE", shelf: "Pao da Nossa Padaria/Pao Pequeno", kind: "pao", step: "shelf" },
  // 3.29. Walnuts: right. Two are pecans.
  { batch: 3, store: "CONTINENTE", shelf: "Frutos Secos/Nozes", kind: "noz", step: "cut" },
  // 3.30. All 8 are raw chicken.
  { batch: 3, store: "CONTINENTE", shelf: "Talho/Frango e Peru", kind: "frango", step: "cut" },
];

export const REVIEWED_PRODUCTS: ReviewedProduct[] = [
  { batch: 1, store: "AUCHAN", id: "482533", name: "MAXI BIMBO BURGUER 4UN 300G", kind: "pao", why: "burger buns, hot-dog rolls and bagels are bread" },
  { batch: 1, store: "AUCHAN", id: "71653", name: "SUPER BIMBO HOT-DOG 4UN 320G", kind: "pao", why: "burger buns, hot-dog rolls and bagels are bread" },
  { batch: 1, store: "AUCHAN", id: "3402196", name: "BAGELS BIMBO CLÁSSICO 4 UN", kind: "pao", why: "burger buns, hot-dog rolls and bagels are bread" },
  { batch: 1, store: "AUCHAN", id: "3402198", name: "BAGELS BIMBO SEMENTES 4 UN", kind: "pao", why: "burger buns, hot-dog rolls and bagels are bread" },
  { batch: 1, store: "AUCHAN", id: "787177", name: "CROUTONS AUCHAN COM ALHO 100G", kind: null, why: "croutons" },
  { batch: 1, store: "AUCHAN", id: "787179", name: "CROUTONS AUCHAN COM AZEITE E SAL 100G", kind: null, why: "croutons" },
  { batch: 1, store: "AUCHAN", id: "900379", name: "CROUTONS PICAGRILL TOSTADOS COM ALHO E SALSA 75G", kind: null, why: "croutons" },
  { batch: 1, store: "AUCHAN", id: "900376", name: "CROUTONS PICAGRILL TOSTADOS COM TOMATE E OREGÃOS 75G", kind: null, why: "croutons" },
  { batch: 1, store: "AUCHAN", id: "511987", name: "CROUTONS PICAGRILL 75G", kind: null, why: "croutons" },
  { batch: 1, store: "AUCHAN", id: "2491955", name: "BASES PIZZA SCHAR SEM GLÚTEN E SEM LACTOSE 2UN 300G", kind: null, why: "pizza bases" },
  { batch: 1, store: "AUCHAN", id: "3361581", name: "BASE PARA PIZZA AUCHAN SEM GLÚTEN 450G", kind: null, why: "pizza bases" },
  { batch: 1, store: "AUCHAN", id: "3903589", name: "PIADINA LA FINESTRA SULCIELO COM FARINHA ESPELTA BIO 200G", kind: null, why: "piadinas (flatbreads)" },
  { batch: 1, store: "AUCHAN", id: "4013525", name: "PIADINA MISSION TRIGO 360G", kind: null, why: "piadinas (flatbreads)" },
  { batch: 1, store: "AUCHAN", id: "3792862", name: "FOLHADOS COM MANTEIGA AUCHAN TOMATE AZEITONAS E OREGÃOS 100G", kind: null, why: "savoury puff pastries" },
  { batch: 1, store: "AUCHAN", id: "3792866", name: "MINIFOLHADOS AUCHAN QUEIJO EMMENTAL 125G", kind: null, why: "savoury puff pastries" },
  { batch: 1, store: "AUCHAN", id: "3198689", name: "TEMPEROS KNORR 123 LASANHA 52G", kind: null, why: "a seasoning for lasagne" },
  { batch: 1, store: "AUCHAN", id: "4046603", name: "PREPARADO PANQUECAS MOLINO ROSSETTO BIO SEM GLÚTEN 250G", kind: null, why: "pancake and pizza mixes" },
  { batch: 1, store: "AUCHAN", id: "4046572", name: "PREPARADO PIZZA MOLINO ROSSETTO BIO 500G", kind: null, why: "pancake and pizza mixes" },
  { batch: 1, store: "AUCHAN", id: "3694986", name: "FAVAS EXTRAFINAS AUCHAN EM AZEITE 330 (220) G", kind: null, why: "tinned broad beans" },
  { batch: 1, store: "AUCHAN", id: "99039", name: "MERENDA DE CARNE IZIDORO 175G", kind: null, why: "a meat spread" },
  { batch: 1, store: "AUCHAN", id: "3450772", name: "JACA GOVINDA CUBOS BIO 200G", kind: null, why: "jackfruit, a meat substitute" },
  { batch: 1, store: "AUCHAN", id: "3485782", name: "JACA ORGANIC FOR FRIENDS BIO 350G", kind: null, why: "jackfruit, a meat substitute" },
  { batch: 1, store: "AUCHAN", id: "3485785", name: "JACA ORGANIC FOR FRIENDS DESFIADA BIO 350G", kind: null, why: "jackfruit, a meat substitute" },
  { batch: 1, store: "AUCHAN", id: "3694946", name: "BRÓCULOS AUCHAN COZIDO 380G", kind: null, why: "cooked broccoli in a jar" },
  { batch: 1, store: "AUCHAN", id: "2499906", name: "BARRINHAS PESCANOVA SALMÃO SEM GLÚTEN 300 G", kind: "douradinho", why: "fish fingers (barrinhas, tesourinhos, peskitos)" },
  { batch: 1, store: "AUCHAN", id: "3308815", name: "BARRINHAS PESCANOVA PESCADA SEM GLUTÉN 300G", kind: "douradinho", why: "fish fingers (barrinhas, tesourinhos, peskitos)" },
  { batch: 1, store: "AUCHAN", id: "1040746", name: "BARRINHAS PESCANOVA OMEGA 3 450G", kind: "douradinho", why: "fish fingers (barrinhas, tesourinhos, peskitos)" },
  { batch: 1, store: "AUCHAN", id: "3774910", name: "BARRINHAS PESCANOVA PESCADA PANADA S/GLUTEN 1.2KG", kind: "douradinho", why: "fish fingers (barrinhas, tesourinhos, peskitos)" },
  { batch: 1, store: "AUCHAN", id: "3555192", name: "TESOURINHOS DE PEIXE IGLO (10 UNID) 300G", kind: "douradinho", why: "fish fingers (barrinhas, tesourinhos, peskitos)" },
  { batch: 1, store: "AUCHAN", id: "3685165", name: "PESKITOS PESCANOVA PESCADA PANADA SEM GLÚTEN 1KG", kind: "douradinho", why: "fish fingers (barrinhas, tesourinhos, peskitos)" },
  { batch: 1, store: "AUCHAN", id: "3677303", name: "PESCADINOS PESCANOVA PESCADA SEM GLUTEN 800G", kind: "douradinho", why: "fish fingers (barrinhas, tesourinhos, peskitos)" },
  { batch: 1, store: "AUCHAN", id: "3961133", name: "PEIXE PANADO IGLO COBERTURA DE CORNFAKES 256G", kind: "filete-panado", why: "breaded fish fillets" },
  { batch: 1, store: "AUCHAN", id: "3926957", name: "PEIXE PANADO IGLO COM POLME CROCANTE 240G", kind: "filete-panado", why: "breaded fish fillets" },
  { batch: 1, store: "AUCHAN", id: "3961136", name: "PEIXE PANADO IGLO CROCANTES PACK FAMILIAR 600G", kind: "filete-panado", why: "breaded fish fillets" },
  { batch: 1, store: "AUCHAN", id: "3535482", name: "MIMOS PESCANOVA PANADA ALHO E SALSA 360G", kind: "filete-panado", why: "breaded fish fillets" },
  { batch: 1, store: "AUCHAN", id: "3222301", name: "FILETES PESCANOVA DE PESCADA COM ALHO E SALSA 400G", kind: "filete-panado", why: "breaded fish fillets" },
  { batch: 1, store: "AUCHAN", id: "1075075", name: "PANADINHOS IGLO FRANGO 4UN 200G", kind: "nugget", why: "breaded chicken pieces and strips" },
  { batch: 1, store: "AUCHAN", id: "960829", name: "CROCANTES IGLO FRANGO COM PARMESÃO 200G", kind: "nugget", why: "breaded chicken pieces and strips" },
  { batch: 1, store: "AUCHAN", id: "3573973", name: "TIRAS PESCANOVA FRANGO PANADO 1KG", kind: "nugget", why: "breaded chicken pieces and strips" },
  { batch: 1, store: "AUCHAN", id: "1013570", name: "CROCANTES IGLO FRANGO CORDON BLEU 200G", kind: "nugget", why: "breaded chicken pieces and strips" },
  { batch: 1, store: "AUCHAN", id: "1008973", name: "CROCANTES IGLO FRANGO 180G", kind: "nugget", why: "breaded chicken pieces and strips" },
  { batch: 1, store: "AUCHAN", id: "2602408", name: "PANADOS DE FRANGO POLEGAR 3UN 150G", kind: "nugget", why: "breaded chicken pieces and strips" },
  { batch: 1, store: "AUCHAN", id: "3902507", name: "TIRAS DE FRANGO AUCHAN PANADAS ULTRACONGELADAS 600G", kind: "nugget", why: "breaded chicken pieces and strips" },
  { batch: 1, store: "AUCHAN", id: "4007580", name: "CROCANTE FRANGO RECHEADO IGLO ALHO E SALSA 204G", kind: "nugget", why: "breaded chicken pieces and strips" },
  { batch: 1, store: "AUCHAN", id: "4007577", name: "CROCANTES FRANGO RECHEADOS IGLO TOMATE E MANJERICÃO 204G", kind: "nugget", why: "breaded chicken pieces and strips" },
  { batch: 1, store: "AUCHAN", id: "3285928", name: "PICADA BEYOND MEAT VEGETAL 250G", kind: null, why: "plant-based mince, burgers and nuggets" },
  { batch: 1, store: "AUCHAN", id: "3099975", name: "BOCADOS HEURA ORIGINAIS VEGETARIANOS 180G", kind: null, why: "plant-based mince, burgers and nuggets" },
  { batch: 1, store: "AUCHAN", id: "3640888", name: "PICADA HEURA VEGETAL 300G", kind: null, why: "plant-based mince, burgers and nuggets" },
  { batch: 1, store: "AUCHAN", id: "3449076", name: "PREPARADO LINDA MCCARTNEY VEGAN PICADO 500G", kind: null, why: "plant-based mince, burgers and nuggets" },
  { batch: 1, store: "AUCHAN", id: "3803410", name: "VEGAN BURGUER AUCHAN VERY VEGGIE 4UN 320G", kind: null, why: "plant-based mince, burgers and nuggets" },
  { batch: 1, store: "AUCHAN", id: "3803411", name: "VEGAN CHICKPEA BURGER AUCHAN VERY VEGGIE GRÃO-DE-BICO 4UN 320G", kind: null, why: "plant-based mince, burgers and nuggets" },
  { batch: 1, store: "AUCHAN", id: "3803409", name: "VEGAN NUGGETS AUCHAN VERY VEGGIE 10UN 280G", kind: null, why: "plant-based mince, burgers and nuggets" },
  { batch: 1, store: "AUCHAN", id: "3244432", name: "MAXI BURGER LINDA MCCARTNEY VEGAN 2UN 227G", kind: null, why: "plant-based mince, burgers and nuggets" },
  { batch: 1, store: "AUCHAN", id: "3373271", name: "MINI RISSÓIS DE CARNE AUCHAN PARA FORNO 28UN 600G", kind: "rissol", why: "mini rissóis" },
  { batch: 1, store: "AUCHAN", id: "3373276", name: "MINI RISSÓIS DE CAMARÃO AUCHAN PARA FORNO 28UN 600G", kind: "rissol", why: "mini rissóis" },
  { batch: 1, store: "AUCHAN", id: "3373278", name: "MINI CROQUETES CARNE AUCHAN PARA FORNO 28UN 600G", kind: "croquete", why: "mini croquetes" },
  { batch: 1, store: "AUCHAN", id: "3591718", name: "MINI CROQUETES MAHESO PRESUNTO 400G", kind: "croquete", why: "mini croquetes" },
  { batch: 1, store: "AUCHAN", id: "3373277", name: "MINI PASTÉIS BACALHAU AUCHAN PARA FORNO 28UN 600G", kind: "pastel-bacalhau", why: "mini cod cakes" },
  { batch: 1, store: "AUCHAN", id: "1176748", name: "MINI EMPADAS COZINHA PRONTA FRANGO 560G", kind: "empada", why: "mini empadas" },
  { batch: 1, store: "AUCHAN", id: "1125773", name: "MINI FOLHADOS SALSICHAS AUCHAN COM MOLHO MOSTARDA 20UN 350G", kind: "folhado", why: "mini sausage folhados" },
  { batch: 1, store: "AUCHAN", id: "1067128", name: "OVO COZIDO DOVO 4UN", kind: null, why: "boiled eggs" },
  { batch: 1, store: "AUCHAN", id: "2143626", name: "BIQUEIRÃO LOREA EM AZEITE EXTRA ECOLÓGICO 90G", kind: "anchova", why: "\"Biqueirão\" in olive oil is anchovy" },
  { batch: 1, store: "AUCHAN", id: "3700996", name: "JACKFRUIT GENJACK ORIGINAL 226G", kind: null, why: "jackfruit, a meat substitute" },
  { batch: 1, store: "AUCHAN", id: "3701035", name: "JACKFRUIT GENJACK BBQ 226G", kind: null, why: "jackfruit, a meat substitute" },
  { batch: 1, store: "AUCHAN", id: "3929033", name: "SUSHI KIT SAITAKU 361G", kind: null, why: "a sushi kit" },
  { batch: 1, store: "AUCHAN", id: "3986638", name: "COSTELA DE PORCO AUCHAN KG", kind: "porco", why: "Costela de Porco is a pork rib" },
  { batch: 1, store: "AUCHAN", id: "1169481", name: "OVAS CAVALA CAMPOS SANTOS EM AZEITE 120(90)G", kind: null, why: "mackerel roe" },
  { batch: 1, store: "PINGO_DOCE", id: "957937", name: "Ovas de Pescada Cozidas", kind: null, why: "hake roe" },
  { batch: 1, store: "CONTINENTE", id: "5742334", name: "Tiras de Pota Panadas Pescanova", kind: "refeicao", why: "breaded squid strips" },
  { batch: 1, store: "CONTINENTE", id: "7502169", name: "Chicken Wings Southern Fried Iglo Take Away", kind: "refeicao", why: "cooked chicken wings" },
  { batch: 1, store: "CONTINENTE", id: "8545379", name: "Chicken Wings Continente", kind: "refeicao", why: "cooked chicken wings" },
  { batch: 1, store: "CONTINENTE", id: "8389922", name: "Chicken Wings Barbecue Iglo Take Away", kind: "refeicao", why: "cooked chicken wings" },
  { batch: 1, store: "CONTINENTE", id: "8009596", name: "Nachos Queijo Triângulos Pickers McCain", kind: null, why: "nachos" },
  { batch: 1, store: "CONTINENTE", id: "8109684", name: "Crocante Cordon Bleu Vegan Valsoia", kind: null, why: "a vegan cordon bleu" },
  { batch: 1, store: "AUCHAN", id: "1096295", name: "LEVEDURA SALUTEM CERVEJA EM PÓ 150G", kind: null, why: "brewer's yeast" },
  { batch: 1, store: "AUCHAN", id: "2932599", name: "AVEIA CEM PORCENTO MAIS PROTEICA INSTANTÂNEA 500G", kind: "aveia", why: "instant oats are oat flakes" },
  { batch: 2, store: "CONTINENTE", id: "8623380", name: "Tagliatelle Zero Carbs Keto Chef", kind: null, why: "konjac (shirataki) noodles, not pasta" },
  { batch: 2, store: "CONTINENTE", id: "7802846", name: "Shirataki Udon Miyata", kind: null, why: "konjac (shirataki) noodles, not pasta" },
  { batch: 2, store: "CONTINENTE", id: "7802824", name: "Shirataki Esparguete Miyata", kind: null, why: "konjac (shirataki) noodles, not pasta" },
  { batch: 2, store: "PINGO_DOCE", id: "1002962", name: "Marquise de Chocolate da Avó Ninhas", kind: null, why: "a chocolate dessert" },
  { batch: 2, store: "AUCHAN", id: "627592", name: "CAPPUCINO NESCAFÉ 10X14G", kind: null, why: "instant cappuccino mixes" },
  { batch: 2, store: "AUCHAN", id: "2155515", name: "CAPPUCCINO NESCAFÉ CARAMELO 136G", kind: null, why: "instant cappuccino mixes" },
  { batch: 2, store: "AUCHAN", id: "3290840", name: "CAPPUCCINO AUCHAN 250G", kind: null, why: "instant cappuccino mixes" },
  { batch: 2, store: "AUCHAN", id: "573459", name: "CAPPUCCINO NESCAFÉ INTENSO 10X12.5G", kind: null, why: "instant cappuccino mixes" },
  { batch: 2, store: "AUCHAN", id: "613119", name: "SOLUVEIS NESCAFÉ CAPPUCCINO DESCAFEINADO 10UN", kind: null, why: "instant cappuccino mixes" },
  { batch: 2, store: "AUCHAN", id: "2704554", name: "CAPPUCCINO DELTA 10X14G", kind: null, why: "instant cappuccino mixes" },
  { batch: 2, store: "CONTINENTE", id: "7722654", name: "Canelloni Espinafres e Ricotta Continente", kind: "refeicao", why: "a cannelloni dish, a pasta kit with sauce, a risotto" },
  { batch: 2, store: "CONTINENTE", id: "8485351", name: "Kit Pappardelle com Ragú Toscano Rana", kind: "refeicao", why: "a cannelloni dish, a pasta kit with sauce, a risotto" },
  { batch: 2, store: "CONTINENTE", id: "8503805", name: "Risotto de Cogumelos Argarl", kind: "refeicao", why: "a cannelloni dish, a pasta kit with sauce, a risotto" },
  { batch: 2, store: "PINGO_DOCE", id: "622075", name: "Preparado de Carne Picada de Vitelão", kind: "carne-picada", why: "minced veal" },
  { batch: 2, store: "PINGO_DOCE", id: "253998", name: "Preparado de Carne Picada de Vitela", kind: "carne-picada", why: "minced veal" },
  { batch: 2, store: "PINGO_DOCE", id: "907821", name: "Preparado de Carne Picada de Vitelão Embalado", kind: "carne-picada", why: "minced veal" },
  { batch: 2, store: "PINGO_DOCE", id: "856758", name: "Rolo de Carne de Vitelão com Farinheira e Espinafres", kind: null, why: "stuffed meat rolls" },
  { batch: 2, store: "PINGO_DOCE", id: "622065", name: "Rolo de Carne de Vitelão com Queijo e Fiambre", kind: null, why: "stuffed meat rolls" },
  { batch: 2, store: "PINGO_DOCE", id: "699577", name: "Rolo de Carne de Vitelão Folhado com Queijo", kind: null, why: "stuffed meat rolls" },
  { batch: 2, store: "PINGO_DOCE", id: "918759", name: "Burgers de Proteína Vegetal", kind: null, why: "plant-based burgers" },
  { batch: 2, store: "PINGO_DOCE", id: "874748", name: "Preparado de Marisco Congelado", kind: null, why: "a raw seafood mix" },
  { batch: 2, store: "CONTINENTE", id: "7430620", name: "Preparado de Carne Picada de Bovino Continente", kind: "carne-picada", why: "minced beef" },
  { batch: 2, store: "CONTINENTE", id: "7723930", name: "Preparado de Carne Picada de Bovino Angus Continente Seleção", kind: "carne-picada", why: "minced beef" },
  { batch: 2, store: "CONTINENTE", id: "5603614", name: "Preparado de Carne Picada de Bovino Carnalentejana DOP Continente", kind: "carne-picada", why: "minced beef" },
  { batch: 2, store: "CONTINENTE", id: "7298016", name: "Rolo de Carne de Novilho com Queijo e Fiambre Continente Seleção", kind: null, why: "a stuffed meat roll" },
  { batch: 2, store: "CONTINENTE", id: "5130196", name: "Tapas de Salpicão e Paio Continente", kind: null, why: "tapas assortments" },
  { batch: 2, store: "CONTINENTE", id: "8513272", name: "Tapas de Lombo e Cachaço Casa do Monte", kind: null, why: "tapas assortments" },
  { batch: 2, store: "CONTINENTE", id: "8914825", name: "Tapas Paio do Lombo e Paio Continente", kind: null, why: "tapas assortments" },
  { batch: 2, store: "CONTINENTE", id: "7825881", name: "Base Concentrada Sopa Ramen Kikkoman", kind: null, why: "a ramen soup concentrate" },
  { batch: 2, store: "CONTINENTE", id: "8667541", name: "Mandioquinha Cozida no Vapor Vapza", kind: null, why: "cooked cassava" },
  { batch: 2, store: "CONTINENTE", id: "8623213", name: "Peito de Frango ao Natural Continente Equilíbrio", kind: null, why: "tinned chicken breast" },
  { batch: 3, store: "PINGO_DOCE", id: "928239", name: "Proteína de Ervilha Vegan Sabor a Chocolate", kind: null, why: "plant protein powders" },
  { batch: 3, store: "PINGO_DOCE", id: "987739", name: "Proteína Vegan Choco", kind: null, why: "plant protein powders" },
  { batch: 3, store: "PINGO_DOCE", id: "991424", name: "Preparado para Panquecas Pepitas de Chocolate", kind: null, why: "a pancake mix" },
  { batch: 3, store: "CONTINENTE", id: "7253922", name: "Falafel de Proteína Vegetal Garden Gourmet", kind: "refeicao", why: "a falafel and a vegetable chilli" },
  { batch: 3, store: "CONTINENTE", id: "6244386", name: "Chilli Vegetal Veg In", kind: "refeicao", why: "a falafel and a vegetable chilli" },
  { batch: 3, store: "AUCHAN", id: "3792419", name: "PANADOS FRANGO LUSIAVES 300G", kind: "nugget", why: "breaded chicken pieces" },
  { batch: 3, store: "AUCHAN", id: "1111398", name: "PANADO DE PERÚ KG", kind: null, why: "breaded turkey" },
  { batch: 3, store: "PINGO_DOCE", id: "985690", name: "Miolo Noz Pecan", kind: "noz-peca", why: "pecans" },
  { batch: 3, store: "PINGO_DOCE", id: "875747", name: "Miolo de Noz Pecan", kind: "noz-peca", why: "pecans" },
  { batch: 3, store: "CONTINENTE", id: "7678539", name: "Carolans Salted Caramel Licor", kind: "licor", why: "All 9 are liqueurs, which the classifier left without a kind because their names start with a brand. Liqueur is a kind already (hidden from the site with the other drinks); recorded one by one, since a group without a kind cannot be matched as a group." },
  { batch: 3, store: "CONTINENTE", id: "2050134", name: "Carolans Licor de Whisky", kind: "licor", why: "All 9 are liqueurs, which the classifier left without a kind because their names start with a brand. Liqueur is a kind already (hidden from the site with the other drinks); recorded one by one, since a group without a kind cannot be matched as a group." },
  { batch: 3, store: "CONTINENTE", id: "2050858", name: "Albergaria Licor de Anis Escarchado", kind: "licor", why: "All 9 are liqueurs, which the classifier left without a kind because their names start with a brand. Liqueur is a kind already (hidden from the site with the other drinks); recorded one by one, since a group without a kind cannot be matched as a group." },
  { batch: 3, store: "CONTINENTE", id: "7827115", name: "Amarguinha Creme Licor", kind: "licor", why: "All 9 are liqueurs, which the classifier left without a kind because their names start with a brand. Liqueur is a kind already (hidden from the site with the other drinks); recorded one by one, since a group without a kind cannot be matched as a group." },
  { batch: 3, store: "CONTINENTE", id: "8637818", name: "Baileys Licor Chocolate", kind: "licor", why: "All 9 are liqueurs, which the classifier left without a kind because their names start with a brand. Liqueur is a kind already (hidden from the site with the other drinks); recorded one by one, since a group without a kind cannot be matched as a group." },
  { batch: 3, store: "CONTINENTE", id: "8171685", name: "Macieira Cream Licor", kind: "licor", why: "All 9 are liqueurs, which the classifier left without a kind because their names start with a brand. Liqueur is a kind already (hidden from the site with the other drinks); recorded one by one, since a group without a kind cannot be matched as a group." },
  { batch: 3, store: "CONTINENTE", id: "7769781", name: "Cantares de Portugal Licor de Pastel de Nata", kind: "licor", why: "All 9 are liqueurs, which the classifier left without a kind because their names start with a brand. Liqueur is a kind already (hidden from the site with the other drinks); recorded one by one, since a group without a kind cannot be matched as a group." },
  { batch: 3, store: "CONTINENTE", id: "8627229", name: "Macieira Cream Chocolate e Pistachio Licor", kind: "licor", why: "All 9 are liqueurs, which the classifier left without a kind because their names start with a brand. Liqueur is a kind already (hidden from the site with the other drinks); recorded one by one, since a group without a kind cannot be matched as a group." },
  { batch: 3, store: "CONTINENTE", id: "7404727", name: "Albergaria Licor Ponche", kind: "licor", why: "All 9 are liqueurs, which the classifier left without a kind because their names start with a brand. Liqueur is a kind already (hidden from the site with the other drinks); recorded one by one, since a group without a kind cannot be matched as a group." },
  { batch: 3, store: "AUCHAN", id: "3830967", name: "CREME DE MARISCO AUCHAN 72G", kind: "sopa-instantanea", why: "soup powders and sachets" },
  { batch: 3, store: "AUCHAN", id: "3853595", name: "CREME BROCULOS GOURMET KNORR 50GR", kind: "sopa-instantanea", why: "soup powders and sachets" },
  { batch: 3, store: "AUCHAN", id: "3853588", name: "CREME DE ABOBORA GOURMET KNORR 50GR", kind: "sopa-instantanea", why: "soup powders and sachets" },
  { batch: 3, store: "AUCHAN", id: "4013588", name: "QUICK SOUP KNORR COGUMELOS 54GR", kind: "sopa-instantanea", why: "soup powders and sachets" },
  { batch: 3, store: "AUCHAN", id: "4013589", name: "QUICK SOUP KNORR ESPARGOS 39GR", kind: "sopa-instantanea", why: "soup powders and sachets" },
  { batch: 3, store: "AUCHAN", id: "4013585", name: "QUICK SOUP KNORR TOMATE 60GR", kind: "sopa-instantanea", why: "soup powders and sachets" },
  { batch: 3, store: "PINGO_DOCE", id: "922108", name: "Rolo de Carne de Porco com Queijo e Fiambre", kind: null, why: "a stuffed meat roll" },
  { batch: 3, store: "PINGO_DOCE", id: "697446", name: "Bifinhos do Lombo de Porco Panados", kind: "refeicao", why: "breaded pork cutlets" },
  { batch: 3, store: "CONTINENTE", id: "8119457", name: "Miolo de Noz Pecan Continente", kind: "noz-peca", why: "pecans" },
  { batch: 3, store: "CONTINENTE", id: "8630646", name: "Miolo de Noz Pecan Frutorra", kind: "noz-peca", why: "pecans" },
];
