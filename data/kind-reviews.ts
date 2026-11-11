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
 *
 * Batch 4, 20 October 2026: every remaining uncertain product in kinds shown
 * on the site - 960 products in 422 groups - read, decided and recorded in one
 * pass, as the user asked, without a page to approve first. No new kinds or
 * rules. Groups the classifier decided by head noun are recorded product by
 * product, so a decision cannot reach products nobody reviewed.
 *
 * Batch 5, 22 October 2026: verified products that a store's shelf move would
 * otherwise lose. A group decision is tied to its shelf; when the store moves
 * a product, the decision stays behind (the verified-kinds check, section 18
 * of verify:nightly, is what notices). Recorded here by product instead.
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
  // 4.1. Checked: all 8 are Porco.
  { batch: 4, store: "AUCHAN", shelf: "talho/elaborados", kind: "porco", step: "cut" },
  // 4.2. Checked: all 8 are Iogurte.
  { batch: 4, store: "AUCHAN", shelf: "iogurtes/infantis-e-criança", kind: "iogurte", step: "shelf" },
  // 4.3. Dry pasta and gnocchi: right. Two are instant pasta meals or risotto, two are palm-heart noodles.
  { batch: 4, store: "AUCHAN", shelf: "arroz-e-massa/massa-pré-preparada", kind: "massa", step: "shelf" },
  // 4.4. Checked: all 8 are Pescada.
  { batch: 4, store: "AUCHAN", shelf: "peixe/postas-de-peixe", kind: "pescada", step: "cut" },
  // 4.5. Checked: all 8 are Bacalhau.
  { batch: 4, store: "AUCHAN", shelf: "peixe/bacalhau-e-paloco", kind: "bacalhau", step: "cut" },
  // 4.6. Checked: all 7 are Vaca.
  { batch: 4, store: "PINGO_DOCE", shelf: "Vitela Vitelao e Bovino/Novilho e Bovino", kind: "vaca", step: "cut" },
  // 4.7. Checked: all 7 are Peru.
  { batch: 4, store: "PINGO_DOCE", shelf: "Aves/Peru", kind: "peru", step: "cut" },
  // 4.8. Checked: all 7 are Refeição pronta.
  { batch: 4, store: "PINGO_DOCE", shelf: "Conservas/Refeicoes Enlatadas", kind: "refeicao", step: "shelf" },
  // 4.9. None is spinach: soup-vegetable mixes, lamb's lettuce, turnip greens and chard.
  { batch: 4, store: "CONTINENTE", shelf: "Legumes/Espinafres", kind: "espinafre", step: "shelf", becomes: null },
  // 4.10. Checked: all 7 are Pota.
  { batch: 4, store: "CONTINENTE", shelf: "Polvo e Lula/Pota", kind: "pota", step: "cut" },
  // 4.11. Chouriço: right for the Catalan sausage. Pepperoni and mixed sausage packs are not chouriço.
  { batch: 4, store: "CONTINENTE", shelf: "Enchidos/Chouriço", kind: "chourico", step: "shelf" },
  // 4.12. Checked: all 7 are Porco.
  { batch: 4, store: "CONTINENTE", shelf: "Talho/Pronto a Cozinhar", kind: "porco", step: "cut" },
  // 4.13. Frozen ready meals: right for the ragù and arancini. Five are plant-based meat substitutes, which have no kind.
  { batch: 4, store: "CONTINENTE", shelf: "Congelados/Refeições", kind: "refeicao", step: "shelf" },
  // 4.14. Ready-to-eat risottos, not rice. Two are rice paper, which has no kind.
  { batch: 4, store: "CONTINENTE", shelf: "Arroz, Massa e Farinha/Arroz", kind: "arroz", step: "shelf", becomes: "refeicao" },
  // 4.15. Checked: all 7 are Queijo.
  { batch: 4, store: "AUCHAN", shelf: "queijaria/queijos-internacionais", kind: "queijo", step: "shelf" },
  // 4.16. Risottos and seasoned ready rice, not plain rice. One is konjac rice, which has no kind.
  { batch: 4, store: "AUCHAN", shelf: "arroz-e-massa/arroz", kind: "arroz", step: "shelf", becomes: "refeicao" },
  // 4.17. Checked: all 7 are Frango.
  { batch: 4, store: "AUCHAN", shelf: "talho-e-peixaria/talho", kind: "frango", step: "cut" },
  // 4.18. Checked: all 7 are Pescada.
  { batch: 4, store: "AUCHAN", shelf: "peixe/filetes-de-peixe", kind: "pescada", step: "cut" },
  // 4.19. Checked: all 7 are Salmão.
  { batch: 4, store: "AUCHAN", shelf: "peixe/lombos-de-peixe", kind: "salmao", step: "cut" },
  // 4.20. Raw beef: right. One is minced beef.
  { batch: 4, store: "PINGO_DOCE", shelf: "Vitela Vitelao e Bovino/Novilho e Bovino", kind: "vaca", step: "shelf" },
  // 4.21. Turkey skewers: right. One is minced turkey and one is breaded.
  { batch: 4, store: "PINGO_DOCE", shelf: "Aves/Peru", kind: "peru", step: "shelf" },
  // 4.22. Checked: all 6 are Bacalhau.
  { batch: 4, store: "PINGO_DOCE", shelf: "Bacalhau/Bacalhau Salgado Seco", kind: "bacalhau", step: "cut" },
  // 4.23. All six are soup powders and sachets: Sopas instantâneas, now at all three chains.
  { batch: 4, store: "PINGO_DOCE", shelf: "Sopas e Refeicoes Pre Preparadas/Sopas Instantaneas", kind: "sopa", step: "shelf", becomes: "sopa-instantanea" },
  // 4.24. Checked: all 6 are Frango.
  { batch: 4, store: "CONTINENTE", shelf: "Marcas Continente/Continente Seleção", kind: "frango", step: "cut" },
  // 4.25. Checked: all 6 are Tamboril.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Congelado/Tamboril", kind: "tamboril", step: "cut" },
  // 4.26. Checked: all 6 are Cogumelo.
  { batch: 4, store: "CONTINENTE", shelf: "Legumes/Cogumelos", kind: "cogumelo", step: "cut" },
  // 4.27. Checked: all 6 are Azeite.
  { batch: 4, store: "CONTINENTE", shelf: "Azeite, Óleo e Vinagre/Azeite", kind: "azeite", step: "shelf" },
  // 4.28. Checked: all 6 are Noz.
  { batch: 4, store: "AUCHAN", shelf: "fruta/frutos-secos-e-sementes", kind: "noz", step: "cut" },
  // 4.29. Checked: all 6 are Frango.
  { batch: 4, store: "AUCHAN", shelf: "talho/elaborados", kind: "frango", step: "cut" },
  // 4.30. Checked: all 6 are Vitela.
  { batch: 4, store: "AUCHAN", shelf: "talho/vitela-e-novilho", kind: "vitela", step: "cut" },
  // 4.31. Not ready meals: moamba sauce, a falafel mix and powdered milk.
  { batch: 4, store: "AUCHAN", shelf: "cozinha-africana/preparados-e-refeições-rápidas", kind: "refeicao", step: "shelf", becomes: null },
  // 4.32. Checked: all 6 are Azeite.
  { batch: 4, store: "AUCHAN", shelf: "azeite,-óleo-e-vinagre/azeite-especial-dop-e-bio", kind: "azeite", step: "shelf" },
  // 4.33. Chilli and refried beans: right. Taco shells and meal kits are not meals.
  { batch: 4, store: "AUCHAN", shelf: "cozinha-mexicana/preparados-e-refeições-rápidas", kind: "refeicao", step: "shelf" },
  // 4.34. Fresh pasta: right. The rest of this organic shelf is tempeh, gazpacho and hummus.
  { batch: 4, store: "AUCHAN", shelf: "biológicos-produtos-frescos/massas-frescas-e-culinária", kind: "massa", step: "shelf" },
  // 4.35. Checked: all 6 are Pescada.
  { batch: 4, store: "AUCHAN", shelf: "peixe/medalhões-e-tranches-de-peixe", kind: "pescada", step: "cut" },
  // 4.36. Checked: all 5 are Salmão.
  { batch: 4, store: "CONTINENTE", shelf: "Charcutaria/Salmão Fumado", kind: "salmao", step: "cut" },
  // 4.37. Checked: all 5 are Pato.
  { batch: 4, store: "CONTINENTE", shelf: "Talho/Pato e Coelho", kind: "pato", step: "cut" },
  // 4.38. Cod cuts: right. Three are cod roe.
  { batch: 4, store: "CONTINENTE", shelf: "Bacalhau Congelado/Outros Cortes e Iguarias", kind: "bacalhau", step: "cut" },
  // 4.39. Checked: all 5 are Queijo.
  { batch: 4, store: "CONTINENTE", shelf: "Charcutaria e Queijos/Queijo para Barrar", kind: "queijo", step: "shelf" },
  // 4.40. Grab-and-go meals: right. One is boiled eggs.
  { batch: 4, store: "CONTINENTE", shelf: "Refeições Práticas/Grab&Go", kind: "refeicao", step: "shelf" },
  // 4.41. Breaded hake fillets from the fish-fingers shelf: the kind Filetes panados, not hake.
  { batch: 4, store: "CONTINENTE", shelf: "Congelados/Douradinhos e Filetes", kind: "pescada", step: "cut", becomes: "filete-panado" },
  // 4.42. Checked: all 5 are Pimenta.
  { batch: 4, store: "CONTINENTE", shelf: "Molhos, Temperos e Sal/Especiarias e Ervas Aromáticas", kind: "pimenta", step: "cut" },
  // 4.43. Checked: all 5 are Pato.
  { batch: 4, store: "AUCHAN", shelf: "talho/pato-e-mais-aves", kind: "pato", step: "cut" },
  // 4.44. Checked: all 5 are Bacalhau.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/bacalhau", kind: "bacalhau", step: "cut" },
  // 4.45. Checked: all 5 are Garoupa.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/peixe-fresco", kind: "garoupa", step: "cut" },
  // 4.46. Checked: all 5 are Queijo.
  { batch: 4, store: "AUCHAN", shelf: "queijaria/queijo-ralado-e-para-culinária", kind: "queijo", step: "shelf" },
  // 4.47. Mushroom mixes: right. One mixes mushrooms with asparagus.
  { batch: 4, store: "AUCHAN", shelf: "legumes/cogumelos", kind: "cogumelo", step: "cut" },
  // 4.48. Chicory and cereal blends with a little coffee: Bebidas de cereais, as in batch 2.
  { batch: 4, store: "AUCHAN", shelf: "café,-chá-e-infusão/café-saco,-solúvel-e-cevadas", kind: "cafe", step: "cut", becomes: "bebida-cereais" },
  // 4.49. Not cereal: baklava, custard, rice pudding, kataifi and jelly beans.
  { batch: 4, store: "AUCHAN", shelf: "cozinha-europeia/doces-e-cereais", kind: "cereais", step: "shelf", becomes: null },
  // 4.50. Not yoghurt: smoothie powders and a shaker.
  { batch: 4, store: "AUCHAN", shelf: "iogurtes/líquidos", kind: "iogurte", step: "shelf", becomes: null },
  // 4.51. Checked: all 5 are Vaca.
  { batch: 4, store: "AUCHAN", shelf: "talho-e-peixaria/talho", kind: "vaca", step: "cut" },
  // 4.52. Not tofu: plant-protein powders and a falafel mix.
  { batch: 4, store: "AUCHAN", shelf: "biológicos-alternativas-vegetais/tofu-e-proteínas-vegetais", kind: "tofu", step: "shelf", becomes: null },
  // 4.53. Prawns: right. Carabineiro gets no kind, as elsewhere.
  { batch: 4, store: "AUCHAN", shelf: "marisco-e-moluscos/camarão-e-miolo-de-camarão", kind: "camarao", step: "shelf" },
  // 4.54. Checked: all 5 are Salmão.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/peixe-temperado", kind: "salmao", step: "cut" },
  // 4.55. Checked: all 4 are Atum.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Atum e Salmao​", kind: "atum", step: "cut" },
  // 4.56. Checked: all 4 are Pota.
  { batch: 4, store: "PINGO_DOCE", shelf: "Polvo Lula Pota e Choco/Congelado", kind: "pota", step: "cut" },
  // 4.57. Checked: all 4 are Queijo.
  { batch: 4, store: "PINGO_DOCE", shelf: "Queijos/Queijo Nacional​", kind: "queijo", step: "shelf" },
  // 4.58. Yoghurt pouches: right. Two are fruit purée pouches.
  { batch: 4, store: "PINGO_DOCE", shelf: "Iogurtes/Iogurtes Infantis​", kind: "iogurte", step: "shelf" },
  // 4.59. Checked: all 4 are Salmão.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Fresco/Salmão", kind: "salmao", step: "cut" },
  // 4.60. Checked: all 4 are Amendoim.
  { batch: 4, store: "CONTINENTE", shelf: "Frutos Secos/Amendoins", kind: "amendoim", step: "cut" },
  // 4.61. Checked: all 4 are Amêndoa.
  { batch: 4, store: "CONTINENTE", shelf: "Frutos Secos/Amêndoas", kind: "amendoa", step: "cut" },
  // 4.62. Checked: all 4 are Coelho.
  { batch: 4, store: "CONTINENTE", shelf: "Talho/Pato e Coelho", kind: "coelho", step: "cut" },
  // 4.63. Checked: all 4 are Perca.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Congelado/Outros Peixes", kind: "perca", step: "cut" },
  // 4.64. All four are dates, not figs.
  { batch: 4, store: "CONTINENTE", shelf: "Frutos Secos/Figos e Tâmaras", kind: "figo", step: "shelf", becomes: null },
  // 4.65. Checked: all 4 are Bacon.
  { batch: 4, store: "CONTINENTE", shelf: "Charcutaria e Queijos/Bacon e Fumados", kind: "bacon", step: "shelf" },
  // 4.66. Checked: all 4 are Frango.
  { batch: 4, store: "CONTINENTE", shelf: "Talho/Frango", kind: "frango", step: "cut" },
  // 4.67. Ham and speck: right. Cured pork neck and coppa count as paio, as in batch 2.
  { batch: 4, store: "CONTINENTE", shelf: "Charcutaria e Queijos/Presunto", kind: "presunto", step: "shelf" },
  // 4.68. Not meals: lupin hummus and tzatziki.
  { batch: 4, store: "CONTINENTE", shelf: "Refeições Práticas", kind: "refeicao", step: "shelf", becomes: null },
  // 4.69. Not pizza: piadinas and a pizza base.
  { batch: 4, store: "CONTINENTE", shelf: "Congelados/Pizzas", kind: "pizza", step: "shelf", becomes: null },
  // 4.70. Checked: all 4 are Cereais.
  { batch: 4, store: "CONTINENTE", shelf: "Cereais e Barras/Cereais Linha e Fibra", kind: "cereais", step: "shelf" },
  // 4.71. Checked: all 4 are Coelho.
  { batch: 4, store: "AUCHAN", shelf: "talho/coelho", kind: "coelho", step: "cut" },
  // 4.72. Ham: right. A charcuterie board and bresaola are not.
  { batch: 4, store: "AUCHAN", shelf: "charcutaria/presunto", kind: "presunto", step: "shelf" },
  // 4.73. Checked: all 4 are Anchova.
  { batch: 4, store: "AUCHAN", shelf: "conservas/conservas-especialidades", kind: "anchova", step: "cut" },
  // 4.74. Checked: all 4 are Atum.
  { batch: 4, store: "AUCHAN", shelf: "conservas/atum", kind: "atum", step: "shelf" },
  // 4.76. Skyr: right. Quark is not yoghurt.
  { batch: 4, store: "AUCHAN", shelf: "biológicos-lácteos/iogurtes", kind: "iogurte", step: "shelf" },
  // 4.77. Checked: all 4 are Refeição pronta.
  { batch: 4, store: "AUCHAN", shelf: "cozinha-américa-norte/preparados-e-refeições-rápidas", kind: "refeicao", step: "shelf" },
  // 4.78. Checked: all 4 are Cereais.
  { batch: 4, store: "AUCHAN", shelf: "biológicos-mercearia/cereais-e-pequeno-almoço", kind: "cereais", step: "shelf" },
  // 4.79. Checked: all 4 are Pota.
  { batch: 4, store: "AUCHAN", shelf: "marisco-e-moluscos/polvo,-lulas-e-choco", kind: "pota", step: "cut" },
  // 4.80. The pizza: right. Three are piadinas.
  { batch: 4, store: "AUCHAN", shelf: "refeições-rápidas/pizzas", kind: "pizza", step: "shelf" },
  // 4.81. Coconut yoghurt drinks: Vegurte.
  { batch: 4, store: "PINGO_DOCE", shelf: "Iogurtes/Iogurtes de Base Vegetal​", kind: "iogurte", step: "shelf", becomes: "vegurte" },
  // 4.82. Checked: all 3 are Pato.
  { batch: 4, store: "PINGO_DOCE", shelf: "Aves/Outras Aves", kind: "pato", step: "cut" },
  // 4.83. Checked: all 3 are Bacalhau.
  { batch: 4, store: "PINGO_DOCE", shelf: "Bacalhau/Bacalhau Salgado Seco", kind: "bacalhau", step: "shelf" },
  // 4.84. Checked: all 3 are Dourada.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Dourada e Robalo​", kind: "dourada", step: "cut" },
  // 4.85. Checked: all 3 are Peixe-espada.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Peixe Selvagem", kind: "peixe-espada", step: "cut" },
  // 4.86. Checked: all 3 are Perca.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Peixe Selvagem", kind: "perca", step: "cut" },
  // 4.87. Checked: all 3 are Pão.
  { batch: 4, store: "PINGO_DOCE", shelf: "Pao da Nossa Padaria/Pao Familiar", kind: "pao", step: "shelf" },
  // 4.88. Cheese boards: right. One is a dried cheese snack.
  { batch: 4, store: "PINGO_DOCE", shelf: "Queijos/Snacks de Queijo​", kind: "queijo", step: "shelf" },
  // 4.89. Not yoghurt: two quarks and an energy drink.
  { batch: 4, store: "PINGO_DOCE", shelf: "Iogurtes/Iogurtes Proteicos", kind: "iogurte", step: "shelf", becomes: null },
  // 4.90. Checked: all 3 are Avelã.
  { batch: 4, store: "PINGO_DOCE", shelf: "Batatas Fritas Snacks e Frutos Secos/Frutos Secos e Desidratados", kind: "avela", step: "cut" },
  // 4.91. Instant pasta pots and ramen: ready meals.
  { batch: 4, store: "PINGO_DOCE", shelf: "Sopas e Refeicoes Pre Preparadas/Noodles", kind: "massa", step: "shelf", becomes: "refeicao" },
  // 4.92. Calzone and pinsa: right. One is a filled bread roll.
  { batch: 4, store: "PINGO_DOCE", shelf: "Take Away/Pizzas", kind: "pizza", step: "shelf" },
  // 4.93. Checked: all 3 are Melão.
  { batch: 4, store: "CONTINENTE", shelf: "Frutas/Melão e Melancia", kind: "melao", step: "cut" },
  // 4.94. Limes and lemon pearls, not lemons.
  { batch: 4, store: "CONTINENTE", shelf: "Frutas/Limão e Lima", kind: "limao", step: "shelf", becomes: null },
  // 4.95. Checked: all 3 are Bacalhau.
  { batch: 4, store: "CONTINENTE", shelf: "Peixaria/Bacalhau", kind: "bacalhau", step: "cut" },
  // 4.96. Checked: all 3 are Caju.
  { batch: 4, store: "CONTINENTE", shelf: "Frutos Secos/Cajus", kind: "caju", step: "cut" },
  // 4.97. Checked: all 3 are Maruca.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Congelado/Maruca", kind: "maruca", step: "cut" },
  // 4.98. Checked: all 3 are Tostas e gressinos.
  { batch: 4, store: "CONTINENTE", shelf: "Padaria e Pastelaria/Tostas e Gressinos", kind: "tosta", step: "shelf" },
  // 4.99. Checked: all 3 are Paloco (escamudo).
  { batch: 4, store: "CONTINENTE", shelf: "Bacalhau Congelado/Lombos, Postas e Caldeirada", kind: "paloco", step: "cut" },
  // 4.100. Checked: all 3 are Frango.
  { batch: 4, store: "CONTINENTE", shelf: "Biológicos/Peixaria, Talho e Alternativas", kind: "frango", step: "cut" },
  // 4.101. Checked: all 3 are Atum.
  { batch: 4, store: "CONTINENTE", shelf: "Pronto a Cozinhar/Sushi, Sashimi e Poke", kind: "atum", step: "cut" },
  // 4.102. Checked: all 3 are Bacalhau.
  { batch: 4, store: "CONTINENTE", shelf: "Bacalhau Seco/Lombos, Postas e Caldeirada", kind: "bacalhau", step: "cut" },
  // 4.103. Checked: all 3 are Queijo.
  { batch: 4, store: "CONTINENTE", shelf: "Queijos do Mundo/Espanha", kind: "queijo", step: "shelf" },
  // 4.104. Cheese: right. One is a vegan substitute.
  { batch: 4, store: "CONTINENTE", shelf: "Queijos do Mundo/França", kind: "queijo", step: "shelf" },
  // 4.105. Checked: all 3 are Amêndoa.
  { batch: 4, store: "CONTINENTE", shelf: "Açúcar e Sobremesas/Preparados para Mousses e Bolos", kind: "amendoa", step: "cut" },
  // 4.108. Checked: all 3 are Peru.
  { batch: 4, store: "AUCHAN", shelf: "talho/peru", kind: "peru", step: "shelf" },
  // 4.109. Lasagne sheets: right. Blinis are not pasta.
  { batch: 4, store: "AUCHAN", shelf: "gastronomia/massas-culinárias", kind: "massa", step: "shelf" },
  // 4.110. Checked: all 3 are Pinhão.
  { batch: 4, store: "AUCHAN", shelf: "fruta/frutos-secos-e-sementes", kind: "pinhao", step: "cut" },
  // 4.111. Checked: all 3 are Peru.
  { batch: 4, store: "AUCHAN", shelf: "talho/elaborados", kind: "peru", step: "cut" },
  // 4.112. Checked: all 3 are Borrego.
  { batch: 4, store: "AUCHAN", shelf: "talho/porco", kind: "borrego", step: "cut" },
  // 4.113. Checked: all 3 are Atum.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/peixe-fresco", kind: "atum", step: "cut" },
  // 4.114. Cooked salmon portions, not raw salmon.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/peixe-cozinhado", kind: "salmao", step: "cut", becomes: null },
  // 4.115. Checked: all 3 are Queijo.
  { batch: 4, store: "AUCHAN", shelf: "queijaria/queijo-fatiado-e-barra", kind: "queijo", step: "shelf" },
  // 4.116. Checked: all 3 are Pota.
  { batch: 4, store: "AUCHAN", shelf: "conservas/conservas-especialidades", kind: "pota", step: "cut" },
  // 4.117. Checked: all 3 are Cereais.
  { batch: 4, store: "AUCHAN", shelf: "cereais-e-barras/linha-e-fibra", kind: "cereais", step: "shelf" },
  // 4.118. Cereal and chicory drink powders: Bebidas de cereais.
  { batch: 4, store: "AUCHAN", shelf: "café,-chá-e-infusão/café-saco,-solúvel-e-cevadas", kind: "cereais", step: "cut", becomes: "bebida-cereais" },
  // 4.119. Energy balls and fruit rolls, not cereal.
  { batch: 4, store: "AUCHAN", shelf: "cereais-e-barras/barras-cereais", kind: "cereais", step: "shelf", becomes: null },
  // 4.121. Checked: all 3 are Salmão.
  { batch: 4, store: "AUCHAN", shelf: "peixe/medalhões-e-tranches-de-peixe", kind: "salmao", step: "cut" },
  // 4.122. Checked: all 3 are Pescada.
  { batch: 4, store: "AUCHAN", shelf: "peixe/lombos-de-peixe", kind: "pescada", step: "cut" },
  // 4.123. Checked: all 3 are Mexilhão.
  { batch: 4, store: "AUCHAN", shelf: "marisco-e-moluscos/moluscos", kind: "mexilhao", step: "cut" },
  // 4.124. Checked: all 3 are Frango.
  { batch: 4, store: "AUCHAN", shelf: "carne/frango-e-aves", kind: "frango", step: "cut" },
  // 4.125. Checked: all 3 are Tamboril.
  { batch: 4, store: "AUCHAN", shelf: "peixe/medalhões-e-tranches-de-peixe", kind: "tamboril", step: "cut" },
  // 4.126. Checked: all 3 are Pescada.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/peixe-fresco", kind: "pescada", step: "cut" },
  // 4.127. Checked: all 2 are Garoupa.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Peixe Selvagem", kind: "garoupa", step: "cut" },
  // 4.128. Checked: all 2 are Tamboril.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Peixe Selvagem", kind: "tamboril", step: "cut" },
  // 4.129. Checked: all 2 are Amêijoa.
  { batch: 4, store: "PINGO_DOCE", shelf: "Marisco/Marisco Congelado", kind: "ameijoa", step: "cut" },
  // 4.130. Checked: all 2 are Corvina.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Peixe Selvagem", kind: "corvina", step: "cut" },
  // 4.131. Checked: all 2 are Robalo.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Dourada e Robalo​", kind: "robalo", step: "cut" },
  // 4.132. Checked: all 2 are Paloco (escamudo).
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Pescada", kind: "paloco", step: "cut" },
  // 4.133. Checked: all 2 are Maruca.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Peixe Selvagem", kind: "maruca", step: "cut" },
  // 4.134. Checked: all 2 are Safio (congro).
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Peixe Selvagem", kind: "safio", step: "cut" },
  // 4.135. Checked: all 2 are Tostas e gressinos.
  { batch: 4, store: "PINGO_DOCE", shelf: "Bolachas e Biscoitos/Tostas Gressinos e Croutons", kind: "tosta", step: "shelf" },
  // 4.136. Piadinas, not pizza.
  { batch: 4, store: "PINGO_DOCE", shelf: "Refeicoes e Salgados/Pizzas Congeladas", kind: "pizza", step: "shelf", becomes: null },
  // 4.137. Nut snacks, not cereal.
  { batch: 4, store: "PINGO_DOCE", shelf: "Cereais Barras e Bolsas de Fruta/Barras de Cereais", kind: "cereais", step: "shelf", becomes: null },
  // 4.138. Checked: all 2 are Atum.
  { batch: 4, store: "PINGO_DOCE", shelf: "Conservas/Atum", kind: "atum", step: "shelf" },
  // 4.139. Checked: all 2 are Amendoim.
  { batch: 4, store: "PINGO_DOCE", shelf: "Batatas Fritas Snacks e Frutos Secos/Frutos Secos e Desidratados", kind: "amendoim", step: "cut" },
  // 4.140. Checked: all 2 are Pinhão.
  { batch: 4, store: "PINGO_DOCE", shelf: "Batatas Fritas Snacks e Frutos Secos/Frutos Secos e Desidratados", kind: "pinhao", step: "cut" },
  // 4.141. Checked: all 2 are Azeite.
  { batch: 4, store: "PINGO_DOCE", shelf: "Azeite Oleo e Vinagre/Azeite", kind: "azeite", step: "shelf" },
  // 4.142. Checked: all 2 are Anchova.
  { batch: 4, store: "PINGO_DOCE", shelf: "Conservas/Sardinhas e Outros Peixes", kind: "anchova", step: "cut" },
  // 4.143. Checked: all 2 are Sardinha.
  { batch: 4, store: "PINGO_DOCE", shelf: "Conservas/Sardinhas e Outros Peixes", kind: "sardinha", step: "cut" },
  // 4.144. Roast-chicken take-away menus: ready meals.
  { batch: 4, store: "PINGO_DOCE", shelf: "Take Away/Frango Assado e Churrasco", kind: "frango", step: "shelf", becomes: "refeicao" },
  // 4.145. Checked: all 2 are Peru.
  { batch: 4, store: "CONTINENTE", shelf: "Talho/Peru", kind: "peru", step: "shelf" },
  // 4.146. Checked: all 2 are Frango.
  { batch: 4, store: "CONTINENTE", shelf: "Marcas Continente/Continente", kind: "frango", step: "cut" },
  // 4.147. Checked: all 2 are Robalo.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Congelado/Robalo", kind: "robalo", step: "cut" },
  // 4.148. Checked: all 2 are Melancia.
  { batch: 4, store: "CONTINENTE", shelf: "Frutas/Melão e Melancia", kind: "melancia", step: "cut" },
  // 4.149. Checked: all 2 are Dourada.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Congelado/Dourada", kind: "dourada", step: "cut" },
  // 4.150. Checked: all 2 are Frango.
  { batch: 4, store: "CONTINENTE", shelf: "Clube de Produtores Continente/Carne e Peixe", kind: "frango", step: "cut" },
  // 4.151. Checked: all 2 are Atum.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Congelado/Atum", kind: "atum", step: "cut" },
  // 4.152. Checked: all 2 are Avelã.
  { batch: 4, store: "CONTINENTE", shelf: "Frutos Secos/Avelãs", kind: "avela", step: "cut" },
  // 4.153. Checked: all 2 are Salmão.
  { batch: 4, store: "CONTINENTE", shelf: "Pronto a Cozinhar/Peixe Fresco Embalado", kind: "salmao", step: "cut" },
  // 4.154. Checked: all 2 are Frango.
  { batch: 4, store: "CONTINENTE", shelf: "Talho/Pronto a Cozinhar", kind: "frango", step: "cut" },
  // 4.155. Checked: all 2 are Amêndoa.
  { batch: 4, store: "CONTINENTE", shelf: "Frutas/Frutos Secos, Desidratados e Sementes", kind: "amendoa", step: "cut" },
  // 4.156. Checked: all 2 are Vitela.
  { batch: 4, store: "CONTINENTE", shelf: "Talho/Novilho, Vitela e Vitelão", kind: "vitela", step: "shelf" },
  // 4.157. Checked: all 2 are Garoupa.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Congelado/Outros Peixes", kind: "garoupa", step: "cut" },
  // 4.158. Breaded squid rings: ready meals, as other breaded seafood.
  { batch: 4, store: "CONTINENTE", shelf: "Polvo e Lula/Pota", kind: "pota", step: "shelf", becomes: "refeicao" },
  // 4.159. Checked: all 2 are Peixe-espada.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Congelado/Outros Peixes", kind: "peixe-espada", step: "cut" },
  // 4.160. Checked: all 2 are Morcela.
  { batch: 4, store: "CONTINENTE", shelf: "Enchidos/Morcela", kind: "morcela", step: "shelf" },
  // 4.161. Checked: all 2 are Paloco (escamudo).
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Congelado/Outros Peixes", kind: "paloco", step: "cut" },
  // 4.162. Checked: all 2 are Lula.
  { batch: 4, store: "CONTINENTE", shelf: "Polvo e Lula/Lula", kind: "lula", step: "shelf" },
  // 4.163. Checked: all 2 are Red fish (cantarilho).
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Congelado/Red Fish", kind: "red-fish", step: "cut" },
  // 4.164. Checked: all 2 are Salsicha.
  { batch: 4, store: "CONTINENTE", shelf: "Talho/Pronto a Cozinhar", kind: "salsicha", step: "cut" },
  // 4.165. The focaccia: right. A sweet brioche is not bread.
  { batch: 4, store: "CONTINENTE", shelf: "Padaria e Pastelaria/Pão de Forma e Embalado", kind: "pao", step: "shelf" },
  // 4.166. Checked: all 2 are Raia.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Congelado/Outros Peixes", kind: "raia", step: "cut" },
  // 4.167. Filled bread rolls, not pizza.
  { batch: 4, store: "CONTINENTE", shelf: "Refeições Práticas/Pizzas", kind: "pizza", step: "shelf", becomes: null },
  // 4.168. Checked: all 2 are Queijo.
  { batch: 4, store: "CONTINENTE", shelf: "Queijos do Mundo/Norte e Centro da Europa", kind: "queijo", step: "shelf" },
  // 4.169. Checked: all 2 are Atum.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Fresco/Atum", kind: "atum", step: "cut" },
  // 4.170. Checked: all 2 are Polvo.
  { batch: 4, store: "CONTINENTE", shelf: "Polvo e Lula/Polvo", kind: "polvo", step: "cut" },
  // 4.171. Checked: all 2 are Cabrito.
  { batch: 4, store: "CONTINENTE", shelf: "Talho/Cabrito e Borrego", kind: "cabrito", step: "cut" },
  // 4.172. Checked: all 2 are Camarão.
  { batch: 4, store: "CONTINENTE", shelf: "Pronto a Cozinhar/Preparados e Misturas", kind: "camarao", step: "cut" },
  // 4.173. Meal-replacement drinks, not plant yoghurt.
  { batch: 4, store: "CONTINENTE", shelf: "Iogurtes e Outros Lácteos/Vegegurtes", kind: "vegurte", step: "shelf", becomes: null },
  // 4.174. Vegetable fingers, not chicken nuggets.
  { batch: 4, store: "CONTINENTE", shelf: "Vegetariano e Vegan/Nuggets e Panados", kind: "nugget", step: "shelf", becomes: null },
  // 4.175. Checked: all 2 are Cereais.
  { batch: 4, store: "CONTINENTE", shelf: "Alimentação Infantil/Papas Infantis", kind: "cereais", step: "cut" },
  // 4.176. Checked: all 2 are Molho de alho.
  { batch: 4, store: "CONTINENTE", shelf: "Molhos, Temperos e Sal/Molhos", kind: "molho-alho", step: "shelf" },
  // 4.177. Checked: all 2 are Atum.
  { batch: 4, store: "CONTINENTE", shelf: "Conservas/Atum", kind: "atum", step: "shelf" },
  // 4.178. Checked: all 2 are Cereais.
  { batch: 4, store: "CONTINENTE", shelf: "Cereais e Barras/Cereais Infantis", kind: "cereais", step: "shelf" },
  // 4.183. Vegan cheese substitutes.
  { batch: 4, store: "CONTINENTE", shelf: "Charcutaria e Queijos", kind: "queijo", step: "shelf", becomes: null },
  // 4.184. Checked: all 2 are Dourada.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/peixe-fresco", kind: "dourada", step: "cut" },
  // 4.185. Checked: all 2 are Robalo.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/peixe-fresco", kind: "robalo", step: "cut" },
  // 4.186. Checked: all 2 are Pão.
  { batch: 4, store: "AUCHAN", shelf: "padaria/pão-de-forma-e-embalados", kind: "pao", step: "shelf" },
  // 4.188. Checked: all 2 are Avelã.
  { batch: 4, store: "AUCHAN", shelf: "fruta/frutos-secos-e-sementes", kind: "avela", step: "cut" },
  // 4.189. Checked: all 2 are Perca.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/peixe-fresco", kind: "perca", step: "cut" },
  // 4.190. Checked: all 2 are Peixe-espada.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/peixe-fresco", kind: "peixe-espada", step: "cut" },
  // 4.191. Trout roe, not trout.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/salmão-fumado,-ovas-e-preparados", kind: "truta", step: "cut", becomes: null },
  // 4.192. Checked: all 2 are Borrego.
  { batch: 4, store: "AUCHAN", shelf: "talho/borrego-e-cabrito", kind: "borrego", step: "cut" },
  // 4.193. Checked: all 2 are Salmão.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/salmão-fumado,-ovas-e-preparados", kind: "salmao", step: "cut" },
  // 4.194. Checked: all 2 are Vitela.
  { batch: 4, store: "AUCHAN", shelf: "talho/vitela-e-novilho", kind: "vitela", step: "shelf" },
  // 4.195. Meagre loin: right. A fish head is not sold to eat as fish.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/peixe-fresco", kind: "corvina", step: "cut" },
  // 4.196. Beef of the Minhota breed, not minced meat.
  { batch: 4, store: "AUCHAN", shelf: "talho/vitela-e-novilho", kind: "carne-picada", step: "cut", becomes: "vaca" },
  // 4.197. Checked: all 2 are Iogurte.
  { batch: 4, store: "AUCHAN", shelf: "proteína/iogurtes-proteicos", kind: "iogurte", step: "shelf" },
  // 4.198. Checked: all 2 are Sardinha.
  { batch: 4, store: "AUCHAN", shelf: "conservas/sardinha", kind: "sardinha", step: "cut" },
  // 4.199. Checked: all 2 are Cereais.
  { batch: 4, store: "AUCHAN", shelf: "cereais-e-barras/cereais-criança", kind: "cereais", step: "shelf" },
  // 4.200. Garlic seasonings, not garlic sauce.
  { batch: 4, store: "AUCHAN", shelf: "cozinha-brasileira/molhos-e-temperos", kind: "molho-alho", step: "shelf", becomes: null },
  // 4.201. Checked: all 2 are Refeição pronta.
  { batch: 4, store: "AUCHAN", shelf: "cozinha-europeia/preparados-e-refeições-rápidas", kind: "refeicao", step: "shelf" },
  // 4.202. Checked: all 2 are Amêndoa.
  { batch: 4, store: "AUCHAN", shelf: "frutos-secos-e-sementes/frutos-secos", kind: "amendoa", step: "cut" },
  // 4.203. Checked: all 2 are Avelã.
  { batch: 4, store: "AUCHAN", shelf: "frutos-secos-e-sementes/frutos-secos", kind: "avela", step: "cut" },
  // 4.204. Checked: all 2 are Peru.
  { batch: 4, store: "AUCHAN", shelf: "talho-e-peixaria/talho", kind: "peru", step: "cut" },
  // 4.205. Checked: all 2 are Robalo.
  { batch: 4, store: "AUCHAN", shelf: "peixe/filetes-de-peixe", kind: "robalo", step: "cut" },
  // 4.206. Checked: all 2 are Atum.
  { batch: 4, store: "AUCHAN", shelf: "peixe/postas-de-peixe", kind: "atum", step: "cut" },
  // 4.207. Checked: all 2 are Dourada.
  { batch: 4, store: "AUCHAN", shelf: "peixe/filetes-de-peixe", kind: "dourada", step: "cut" },
  // 4.208. Checked: all 2 are Amêijoa.
  { batch: 4, store: "AUCHAN", shelf: "marisco-e-moluscos/moluscos", kind: "ameijoa", step: "cut" },
  // 4.209. Cod roe.
  { batch: 4, store: "AUCHAN", shelf: "peixe/ovas", kind: "bacalhau", step: "cut", becomes: null },
  // 4.210. Checked: all 2 are Tamboril.
  { batch: 4, store: "AUCHAN", shelf: "peixe/filetes-de-peixe", kind: "tamboril", step: "cut" },
  // 4.211. Checked: all 2 are Peixe-espada.
  { batch: 4, store: "AUCHAN", shelf: "peixe/filetes-de-peixe", kind: "peixe-espada", step: "cut" },
  // 4.212. Checked: all 2 are Raia.
  { batch: 4, store: "AUCHAN", shelf: "peixe/postas-de-peixe", kind: "raia", step: "cut" },
  // 4.213. Checked: all 2 are Salmão.
  { batch: 4, store: "AUCHAN", shelf: "peixe/postas-de-peixe", kind: "salmao", step: "cut" },
  // 4.214. Checked: all 2 are Peixe-espada.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Fresco/Outros Peixes", kind: "peixe-espada", step: "cut" },
  // 4.215. Checked: all 2 are Truta.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/peixe-fresco", kind: "truta", step: "cut" },
  // 4.216. Checked: all 2 are Coelho.
  { batch: 4, store: "PINGO_DOCE", shelf: "Talho/Borrego Cabrito e Coelho​", kind: "coelho", step: "cut" },
  // 4.217. Sweet buns and sliced croissant bread.
  { batch: 4, store: "PINGO_DOCE", shelf: "Pao Embalado/Pao de Forma e Embalado", kind: "pao", step: "shelf", becomes: null },
  // 4.218. Checked: all 2 are Infusão.
  { batch: 4, store: "AUCHAN", shelf: "café,-chá-e-infusão/infusões", kind: "infusao", step: "shelf" },
  // 4.219. Checked: all 1 are Coco.
  { batch: 4, store: "PINGO_DOCE", shelf: "Frutas/Uvas Kiwi e Frutos Tropicais", kind: "coco", step: "cut" },
  // 4.220. Checked: all 1 are Cogumelo.
  { batch: 4, store: "PINGO_DOCE", shelf: "Vegetais/Cogumelos", kind: "cogumelo", step: "cut" },
  // 4.221. Checked: all 1 are Pimento.
  { batch: 4, store: "PINGO_DOCE", shelf: "Vegetais/Tomates Pepinos e Pimentos", kind: "pimento", step: "cut" },
  // 4.222. Checked: all 1 are Tomate.
  { batch: 4, store: "PINGO_DOCE", shelf: "Vegetais/Tomates Pepinos e Pimentos", kind: "tomate", step: "cut" },
  // 4.223. Checked: all 1 are Porco.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe Marisco e Carne/Carne Congelada", kind: "porco", step: "cut" },
  // 4.224. Breaded chicken steaks, as breaded pork.
  { batch: 4, store: "PINGO_DOCE", shelf: "Aves/Frango", kind: "frango", step: "shelf", becomes: "refeicao" },
  // 4.225. Checked: all 1 are Mexilhão.
  { batch: 4, store: "PINGO_DOCE", shelf: "Marisco/Marisco Congelado", kind: "mexilhao", step: "cut" },
  // 4.226. Checked: all 1 are Maruca.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Pescada", kind: "maruca", step: "cut" },
  // 4.227. Checked: all 1 are Red fish (cantarilho).
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Pescada", kind: "red-fish", step: "cut" },
  // 4.228. Checked: all 1 are Pota.
  { batch: 4, store: "PINGO_DOCE", shelf: "Polvo Lula Pota e Choco/Fresco", kind: "pota", step: "cut" },
  // 4.229. Checked: all 1 are Cavala.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Peixe Selvagem", kind: "cavala", step: "cut" },
  // 4.230. Checked: all 1 are Camarão.
  { batch: 4, store: "PINGO_DOCE", shelf: "Marisco/Marisco Vivo e Cozido", kind: "camarao", step: "cut" },
  // 4.231. Checked: all 1 are Raia.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Peixe Selvagem", kind: "raia", step: "cut" },
  // 4.232. Checked: all 1 are Polvo.
  { batch: 4, store: "PINGO_DOCE", shelf: "Polvo Lula Pota e Choco/Congelado", kind: "polvo", step: "cut" },
  // 4.233. Checked: all 1 are Pota.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe Marisco e Carne/Polvo Lulas e Chocos Congelados", kind: "pota", step: "cut" },
  // 4.234. Checked: all 1 are Queijo.
  { batch: 4, store: "PINGO_DOCE", shelf: "Queijos/Queijo Fatiado e Bola​", kind: "queijo", step: "shelf" },
  // 4.235. Checked: all 1 are Chouriço.
  { batch: 4, store: "PINGO_DOCE", shelf: "Charcutaria/Chourico Alheira e Farinheira​", kind: "chourico", step: "cut" },
  // 4.236. Checked: all 1 are Fiambre.
  { batch: 4, store: "PINGO_DOCE", shelf: "Charcutaria/Fiambre Mortadela e Chouricao​", kind: "fiambre", step: "cut" },
  // 4.237. Checked: all 1 are Presunto.
  { batch: 4, store: "PINGO_DOCE", shelf: "Charcutaria/Presunto e Bacon​", kind: "presunto", step: "cut" },
  // 4.238. Checked: all 1 are Salmão.
  { batch: 4, store: "PINGO_DOCE", shelf: "Charcutaria/Salmao Fumado e Especialidades​", kind: "salmao", step: "cut" },
  // 4.239. Quark, not yoghurt.
  { batch: 4, store: "PINGO_DOCE", shelf: "Iogurtes/Iogurtes Gregos​", kind: "iogurte", step: "shelf", becomes: null },
  // 4.240. A squid stew mix, as in batch 2.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe Marisco e Carne/Polvo Lulas e Chocos Congelados", kind: "lula", step: "cut", becomes: "refeicao" },
  // 4.241. Checked: all 1 are Cogumelo.
  { batch: 4, store: "PINGO_DOCE", shelf: "Frutas e Vegetais/Vegetais Congelados", kind: "cogumelo", step: "cut" },
  // 4.242. Checked: all 1 are Aveia.
  { batch: 4, store: "PINGO_DOCE", shelf: "Cereais Barras e Bolsas de Fruta/Muesli e Granola", kind: "aveia", step: "cut" },
  // 4.243. Checked: all 1 are Cereais.
  { batch: 4, store: "PINGO_DOCE", shelf: "Cereais Barras e Bolsas de Fruta/Cereais Infantis e Juvenis", kind: "cereais", step: "cut" },
  // 4.244. Checked: all 1 are Robalo.
  { batch: 4, store: "PINGO_DOCE", shelf: "Conservas/Sardinhas e Outros Peixes", kind: "robalo", step: "cut" },
  // 4.245. Brazil nuts, not chestnuts.
  { batch: 4, store: "PINGO_DOCE", shelf: "Batatas Fritas Snacks e Frutos Secos/Frutos Secos e Desidratados", kind: "castanha", step: "cut", becomes: null },
  // 4.246. Checked: all 1 are Sementes de abóbora.
  { batch: 4, store: "PINGO_DOCE", shelf: "Batatas Fritas Snacks e Frutos Secos/Frutos Secos e Desidratados", kind: "semente-abobora", step: "cut" },
  // 4.247. A seasoning mix.
  { batch: 4, store: "PINGO_DOCE", shelf: "Temperos e Molhos/Especiarias e Ervas Aromaticas", kind: "alho", step: "cut", becomes: null },
  // 4.248. A seasoning mix.
  { batch: 4, store: "PINGO_DOCE", shelf: "Temperos e Molhos/Especiarias e Ervas Aromaticas", kind: "barbecue", step: "shelf", becomes: null },
  // 4.249. A bread mix.
  { batch: 4, store: "PINGO_DOCE", shelf: "Farinha Fermento e Acucar/Farinha Fermento e Pao Ralado", kind: "pao", step: "cut", becomes: null },
  // 4.250. Checked: all 1 are Frango.
  { batch: 4, store: "CONTINENTE", shelf: "Magazine/Menu Semanal Continente Magazine Março", kind: "frango", step: "cut" },
  // 4.251. Checked: all 1 are Melancia.
  { batch: 4, store: "CONTINENTE", shelf: "Frutas/Melancia, Melão e Meloa", kind: "melancia", step: "cut" },
  // 4.252. Checked: all 1 are Frango.
  { batch: 4, store: "CONTINENTE", shelf: "Tudo para o Churrasco/Grelhados Perfeitos", kind: "frango", step: "cut" },
  // 4.253. Checked: all 1 are Frango.
  { batch: 4, store: "CONTINENTE", shelf: "Oportunidades/Tudo para o Churrasco", kind: "frango", step: "cut" },
  // 4.254. Checked: all 1 are Robalo.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Fresco/Robalo", kind: "robalo", step: "cut" },
  // 4.255. Checked: all 1 are Ananás.
  { batch: 4, store: "CONTINENTE", shelf: "Frutas/Frutas Tropicais", kind: "ananas", step: "cut" },
  // 4.256. A turnip, not beetroot.
  { batch: 4, store: "CONTINENTE", shelf: "Legumes/Nabo e Beterraba", kind: "beterraba", step: "shelf", becomes: null },
  // 4.257. Checked: all 1 are Pimento.
  { batch: 4, store: "CONTINENTE", shelf: "Legumes/Pepino e Pimento", kind: "pimento", step: "cut" },
  // 4.258. Checked: all 1 are Vitela.
  { batch: 4, store: "CONTINENTE", shelf: "Talho/Novilho, Vitela e Vitelão", kind: "vitela", step: "cut" },
  // 4.259. Checked: all 1 are Couve.
  { batch: 4, store: "CONTINENTE", shelf: "Legumes/Couve e Brócolo", kind: "couve", step: "cut" },
  // 4.260. Checked: all 1 are Abóbora.
  { batch: 4, store: "CONTINENTE", shelf: "Legumes/Cenoura e Abóbora", kind: "abobora", step: "cut" },
  // 4.261. Checked: all 1 are Frango.
  { batch: 4, store: "CONTINENTE", shelf: "Oportunidades/Feira da Poupança", kind: "frango", step: "cut" },
  // 4.262. Checked: all 1 are Mexilhão.
  { batch: 4, store: "CONTINENTE", shelf: "Marisco Congelado/Miolos de Marisco", kind: "mexilhao", step: "cut" },
  // 4.263. Checked: all 1 are Perca.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Fresco/Pescada", kind: "perca", step: "cut" },
  // 4.264. A soup-vegetable mix.
  { batch: 4, store: "CONTINENTE", shelf: "Legumes/Feijão Verde", kind: "feijao-verde", step: "shelf", becomes: null },
  // 4.265. Checked: all 1 are Amêijoa.
  { batch: 4, store: "CONTINENTE", shelf: "Marisco Congelado/Miolos de Marisco", kind: "ameijoa", step: "cut" },
  // 4.266. Checked: all 1 are Dourada.
  { batch: 4, store: "CONTINENTE", shelf: "Pronto a Cozinhar/Peixe Fresco Embalado", kind: "dourada", step: "cut" },
  // 4.267. Checked: all 1 are Abóbora.
  { batch: 4, store: "CONTINENTE", shelf: "Legumes/Cenoura, Abóbora e Beterraba", kind: "abobora", step: "cut" },
  // 4.268. Checked: all 1 are Pistácio.
  { batch: 4, store: "CONTINENTE", shelf: "Frutos Secos/Pistácios", kind: "pistacio", step: "cut" },
  // 4.269. Macadamia, not walnut.
  { batch: 4, store: "CONTINENTE", shelf: "Frutos Secos/Nozes", kind: "noz", step: "shelf", becomes: null },
  // 4.270. Checked: all 1 are Atum.
  { batch: 4, store: "CONTINENTE", shelf: "Pronto a Cozinhar/Peixe Fresco Embalado", kind: "atum", step: "cut" },
  // 4.271. Brazil nuts, not chestnuts.
  { batch: 4, store: "CONTINENTE", shelf: "Frutos Secos/Outros", kind: "castanha", step: "cut", becomes: null },
  // 4.272. Checked: all 1 are Corvina.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Congelado/Outros Peixes", kind: "corvina", step: "cut" },
  // 4.273. Checked: all 1 are Camarão.
  { batch: 4, store: "CONTINENTE", shelf: "Marisco Congelado/Camarão e Gambão", kind: "camarao", step: "shelf" },
  // 4.274. Checked: all 1 are Coco.
  { batch: 4, store: "CONTINENTE", shelf: "Frutos Secos/Desidratados", kind: "coco", step: "cut" },
  // 4.275. Checked: all 1 are Vaca.
  { batch: 4, store: "CONTINENTE", shelf: "Talho/Pronto a Cozinhar", kind: "vaca", step: "cut" },
  // 4.276. Checked: all 1 are Salmão.
  { batch: 4, store: "CONTINENTE", shelf: "Charcutaria e Queijos/Salmão Fumado", kind: "salmao", step: "cut" },
  // 4.277. Checked: all 1 are Garoupa.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Fresco/Outros Peixes", kind: "garoupa", step: "cut" },
  // 4.278. Checked: all 1 are Bacalhau.
  { batch: 4, store: "CONTINENTE", shelf: "Bacalhau Seco/Desfiado", kind: "bacalhau", step: "shelf" },
  // 4.279. A tuna spread.
  { batch: 4, store: "CONTINENTE", shelf: "Refeições Práticas/Entradas e Salgados", kind: "refeicao", step: "shelf", becomes: null },
  // 4.280. A cheese: its shelf is called "Vaca" (cow's milk), which read as beef.
  { batch: 4, store: "CONTINENTE", shelf: "Queijo Curado/Vaca", kind: "vaca", step: "shelf", becomes: "queijo" },
  // 4.281. Checked: all 1 are Cavala.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Congelado/Outros Peixes", kind: "cavala", step: "cut" },
  // 4.282. Checked: all 1 are Perca.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Congelado/Pescada", kind: "perca", step: "cut" },
  // 4.283. Checked: all 1 are Robalo.
  { batch: 4, store: "CONTINENTE", shelf: "Pronto a Cozinhar/Peixe Fresco Embalado", kind: "robalo", step: "cut" },
  // 4.284. Checked: all 1 are Queijo.
  { batch: 4, store: "CONTINENTE", shelf: "Queijos Frescos/Burrata", kind: "queijo", step: "shelf" },
  // 4.285. A freeze-dried fruit mix.
  { batch: 4, store: "CONTINENTE", shelf: "Frutos Secos/Desidratados", kind: "framboesa", step: "cut", becomes: null },
  // 4.286. A nut mix, not salt.
  { batch: 4, store: "CONTINENTE", shelf: "Frutos Secos/Mix de Frutos", kind: "sal", step: "cut", becomes: null },
  // 4.287. Checked: all 1 are Bacalhau.
  { batch: 4, store: "CONTINENTE", shelf: "Bacalhau Seco/Outros Cortes e Iguarias", kind: "bacalhau", step: "cut" },
  // 4.288. Checked: all 1 are Camarão.
  { batch: 4, store: "CONTINENTE", shelf: "Marisco Fresco/Outros Mariscos Cozidos", kind: "camarao", step: "cut" },
  // 4.289. A squid stew mix.
  { batch: 4, store: "CONTINENTE", shelf: "Pronto a Cozinhar/Preparados e Misturas", kind: "lula", step: "cut", becomes: "refeicao" },
  // 4.290. A cuttlefish stew mix.
  { batch: 4, store: "CONTINENTE", shelf: "Pronto a Cozinhar/Preparados e Misturas", kind: "choco", step: "cut", becomes: "refeicao" },
  // 4.291. Checked: all 1 are Perca.
  { batch: 4, store: "CONTINENTE", shelf: "Peixaria/Peixe Congelado", kind: "perca", step: "cut" },
  // 4.292. A cheese snack kit.
  { batch: 4, store: "CONTINENTE", shelf: "Charcutaria e Queijos/Queijos do Mundo", kind: "queijo", step: "shelf", becomes: null },
  // 4.293. Checked: all 1 are Paloco (escamudo).
  { batch: 4, store: "CONTINENTE", shelf: "Bacalhau Seco/Desfiado", kind: "paloco", step: "cut" },
  // 4.294. Breaded cuttlefish strips.
  { batch: 4, store: "CONTINENTE", shelf: "Polvo e Lula/Choco", kind: "choco", step: "shelf", becomes: "refeicao" },
  // 4.295. Checked: all 1 are Dourada.
  { batch: 4, store: "CONTINENTE", shelf: "Pronto a Cozinhar/Temperados e Marinados", kind: "dourada", step: "cut" },
  // 4.296. A cataplana mix.
  { batch: 4, store: "CONTINENTE", shelf: "Pronto a Cozinhar/Preparados e Misturas", kind: "maruca", step: "cut", becomes: "refeicao" },
  // 4.297. Cured pork jowl, not cheese.
  { batch: 4, store: "CONTINENTE", shelf: "Charcutaria e Queijos/Queijo Curado", kind: "queijo", step: "shelf", becomes: null },
  // 4.298. Trout roe.
  { batch: 4, store: "CONTINENTE", shelf: "Charcutaria/Salmão Fumado", kind: "truta", step: "cut", becomes: null },
  // 4.299. Checked: all 1 are Bífidus.
  { batch: 4, store: "CONTINENTE", shelf: "Iogurtes e Outros Lácteos/Bífidus", kind: "bifidus", step: "shelf" },
  // 4.300. Checked: all 1 are Pimento.
  { batch: 4, store: "CONTINENTE", shelf: "Frutas e Legumes/Misturas de Legumes", kind: "pimento", step: "cut" },
  // 4.301. Checked: all 1 are Cogumelo.
  { batch: 4, store: "CONTINENTE", shelf: "Frutas e Legumes/Misturas de Legumes", kind: "cogumelo", step: "cut" },
  // 4.302. Checked: all 1 are Folhado.
  { batch: 4, store: "CONTINENTE", shelf: "Salgados e Folhados/Folhados", kind: "folhado", step: "shelf" },
  // 4.304. Breaded chicken pieces.
  { batch: 4, store: "CONTINENTE", shelf: "Congelados/Nuggets e Crocantes", kind: "frango", step: "cut", becomes: "nugget" },
  // 4.305. A cordon bleu.
  { batch: 4, store: "CONTINENTE", shelf: "Congelados/Nuggets e Crocantes", kind: "porco", step: "cut", becomes: "refeicao" },
  // 4.306. A frozen fruit snack.
  { batch: 4, store: "CONTINENTE", shelf: "Gelados e Sobremesas/Açaí e Snacks de Frutas", kind: "manga", step: "cut", becomes: null },
  // 4.307. Checked: all 1 are Curgete.
  { batch: 4, store: "CONTINENTE", shelf: "Frutas e Legumes/Legumes", kind: "curgete", step: "cut" },
  // 4.309. Checked: all 1 are Anchova.
  { batch: 4, store: "CONTINENTE", shelf: "Conservas/Sardinha, Cavala, Lulas", kind: "anchova", step: "cut" },
  // 4.310. A seasoning mix.
  { batch: 4, store: "CONTINENTE", shelf: "Molhos, Temperos e Sal/Especiarias e Ervas Aromáticas", kind: "limao", step: "cut", becomes: null },
  // 4.312. Checked: all 1 are Refeição pronta.
  { batch: 4, store: "CONTINENTE", shelf: "Sopas e Refeições/Refeições", kind: "refeicao", step: "shelf" },
  // 4.314. Checked: all 1 are Cereais.
  { batch: 4, store: "CONTINENTE", shelf: "Cereais e Barras/Cereais Infantis", kind: "cereais", step: "cut" },
  // 4.315. A banana-bread mix.
  { batch: 4, store: "CONTINENTE", shelf: "Padaria e Pastelaria/Pão de Forma e Embalado", kind: "banana", step: "cut", becomes: null },
  // 4.316. Checked: all 1 are Cereais.
  { batch: 4, store: "CONTINENTE", shelf: "Cereais e Barras/Flocos e Papas de Aveia", kind: "cereais", step: "cut" },
  // 4.317. A seasoning mix.
  { batch: 4, store: "CONTINENTE", shelf: "Molhos, Temperos e Sal/Especiarias e Ervas Aromáticas", kind: "frango", step: "cut", becomes: null },
  // 4.318. Checked: all 1 are Cereais.
  { batch: 4, store: "CONTINENTE", shelf: "Cereais e Barras/Corn Flakes", kind: "cereais", step: "shelf" },
  // 4.319. Checked: all 1 are Caril.
  { batch: 4, store: "CONTINENTE", shelf: "Molhos, Temperos e Sal/Especiarias e Ervas Aromáticas", kind: "caril", step: "cut" },
  // 4.321. Checked: all 1 are Molho barbecue.
  { batch: 4, store: "CONTINENTE", shelf: "Molhos, Temperos e Sal/Molhos", kind: "barbecue", step: "shelf" },
  // 4.322. A pad thai sauce kit.
  { batch: 4, store: "CONTINENTE", shelf: "Arroz, Massa e Farinha/Noodles", kind: "massa", step: "shelf", becomes: null },
  // 4.324. Malibu, a coconut liqueur, not a plant drink (hidden).
  { batch: 4, store: "CONTINENTE", shelf: "Bebidas Espirituosas/Cocktails", kind: "bebida-vegetal", step: "shelf", becomes: "licor" },
  // 4.327. Checked: all 1 are Tomate.
  { batch: 4, store: "AUCHAN", shelf: "legumes/tomate,-pepino-e-pimentos", kind: "tomate", step: "cut" },
  // 4.328. A pomegranate, not chestnuts.
  { batch: 4, store: "AUCHAN", shelf: "fruta/castanhas,-romãs-e-diospiros", kind: "castanha", step: "shelf", becomes: null },
  // 4.329. Checked: all 1 are Pistácio.
  { batch: 4, store: "AUCHAN", shelf: "fruta/frutos-secos-e-sementes", kind: "pistacio", step: "cut" },
  // 4.330. Lemon pastries.
  { batch: 4, store: "AUCHAN", shelf: "pastelaria/bolos-embalados", kind: "limao", step: "cut", becomes: null },
  // 4.331. Checked: all 1 are Borrego.
  { batch: 4, store: "AUCHAN", shelf: "talho/borrego-e-cabrito", kind: "borrego", step: "shelf" },
  // 4.332. Hake roe.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/salmão-fumado,-ovas-e-preparados", kind: "pescada", step: "cut", becomes: null },
  // 4.333. Checked: all 1 are Pizza.
  { batch: 4, store: "AUCHAN", shelf: "gastronomia/pizzas-refrigeradas", kind: "pizza", step: "shelf" },
  // 4.334. A stuffed pork loin, raw pork as the other rotis.
  { batch: 4, store: "AUCHAN", shelf: "talho/elaborados", kind: "salsa", step: "cut", becomes: "porco" },
  // 4.335. Checked: all 1 are Queijo.
  { batch: 4, store: "AUCHAN", shelf: "queijaria/queijo-ralado-e-para-culinária", kind: "queijo", step: "cut" },
  // 4.336. Checked: all 1 are Cavala.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/salmão-fumado,-ovas-e-preparados", kind: "cavala", step: "cut" },
  // 4.337. Raisins, not grapes.
  { batch: 4, store: "AUCHAN", shelf: "fruta/frutos-secos-e-sementes", kind: "uva", step: "cut", becomes: null },
  // 4.338. Checked: all 1 are Bacon.
  { batch: 4, store: "AUCHAN", shelf: "charcutaria/chouriço,-bacon-e-outros", kind: "bacon", step: "cut" },
  // 4.339. Checked: all 1 are Noz-pecã.
  { batch: 4, store: "AUCHAN", shelf: "fruta/frutos-secos-e-sementes", kind: "noz-peca", step: "cut" },
  // 4.340. Checked: all 1 are Vaca.
  { batch: 4, store: "AUCHAN", shelf: "talho/carnes-certificadas", kind: "vaca", step: "cut" },
  // 4.341. Checked: all 1 are Vaca.
  { batch: 4, store: "AUCHAN", shelf: "talho/porco", kind: "vaca", step: "cut" },
  // 4.342. Checked: all 1 are Paloco (escamudo).
  { batch: 4, store: "AUCHAN", shelf: "peixaria/bacalhau", kind: "paloco", step: "cut" },
  // 4.343. Checked: all 1 are Pregado.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/peixe-fresco", kind: "pregado", step: "cut" },
  // 4.344. Checked: all 1 are Camarão.
  { batch: 4, store: "AUCHAN", shelf: "peixaria/marisco", kind: "camarao", step: "cut" },
  // 4.345. Tinned cod liver.
  { batch: 4, store: "AUCHAN", shelf: "sabores-do-mundo/cozinha-europa-do-leste", kind: "bacalhau", step: "cut", becomes: null },
  // 4.347. A vinaigrette dressing.
  { batch: 4, store: "AUCHAN", shelf: "azeite,-óleo-e-vinagre/vinagre", kind: "vinagre", step: "shelf", becomes: null },
  // 4.350. Checked: all 1 are Pêssego.
  { batch: 4, store: "AUCHAN", shelf: "conservas/fruta-em-conserva", kind: "pessego", step: "cut" },
  // 4.352. A cheese-bread mix.
  { batch: 4, store: "AUCHAN", shelf: "cozinha-brasileira/arroz-farinha-e-massas", kind: "pao", step: "cut", becomes: null },
  // 4.353. Checked: all 1 are Pimenta.
  { batch: 4, store: "AUCHAN", shelf: "sal,-ervas-e-temperos/ervas-e-misturas", kind: "pimenta", step: "cut" },
  // 4.354. Checked: all 1 are Azeite.
  { batch: 4, store: "AUCHAN", shelf: "azeite,-óleo-e-vinagre/azeite-virgem-e-extra-virgem", kind: "azeite", step: "shelf" },
  // 4.355. Checked: all 1 are Molho de alho.
  { batch: 4, store: "AUCHAN", shelf: "cozinha-asiática/molhos-e-temperos", kind: "molho-alho", step: "shelf" },
  // 4.357. Checked: all 1 are Caril.
  { batch: 4, store: "AUCHAN", shelf: "sal,-ervas-e-temperos/ervas-e-misturas", kind: "caril", step: "cut" },
  // 4.358. Checked: all 1 are Refeição pronta.
  { batch: 4, store: "AUCHAN", shelf: "cozinha-brasileira/preparados-e-refeições-rápidas", kind: "refeicao", step: "shelf" },
  // 4.359. Cereal flakes, not apples.
  { batch: 4, store: "AUCHAN", shelf: "cereais-e-barras/flocos-cereais", kind: "maca", step: "cut", becomes: "cereais" },
  // 4.360. Checked: all 1 are Chá.
  { batch: 4, store: "AUCHAN", shelf: "café,-chá-e-infusão/chá-ervas-e-frutos", kind: "cha", step: "shelf" },
  // 4.361. A seasoning mix.
  { batch: 4, store: "AUCHAN", shelf: "sal,-ervas-e-temperos/ervas-e-misturas", kind: "frango", step: "cut", becomes: null },
  // 4.362. A sweet.
  { batch: 4, store: "AUCHAN", shelf: "cozinha-brasileira/doces", kind: "acucar", step: "cut", becomes: null },
  // 4.363. A seasoning mix.
  { batch: 4, store: "AUCHAN", shelf: "sal,-ervas-e-temperos/ervas-e-misturas", kind: "batata", step: "cut", becomes: null },
  // 4.364. Checked: all 1 are Azeite.
  { batch: 4, store: "AUCHAN", shelf: "azeite,-óleo-e-vinagre/azeite", kind: "azeite", step: "shelf" },
  // 4.365. A base for tomato rice.
  { batch: 4, store: "AUCHAN", shelf: "maionese,-ketchup,-mostarda-e-especialidades/molhos-e-cocktail´s", kind: "molho-tomate", step: "shelf", becomes: null },
  // 4.366. A drink powder.
  { batch: 4, store: "AUCHAN", shelf: "cozinha-brasileira/bebidas", kind: "bebida-vegetal", step: "shelf", becomes: null },
  // 4.367. Checked: all 1 are Iogurte.
  { batch: 4, store: "AUCHAN", shelf: "sem-lactose/iogurte-sem-lactose", kind: "iogurte", step: "shelf" },
  // 4.368. Dry cannelloni tubes: pasta, not lasagne.
  { batch: 4, store: "AUCHAN", shelf: "arroz-e-massa/lasanha-e-canelones", kind: "lasanha", step: "shelf", becomes: "massa" },
  // 4.369. Checked: all 1 are Cenoura.
  { batch: 4, store: "AUCHAN", shelf: "conservas/azeitona,-pickles-e-tremoço", kind: "cenoura", step: "cut" },
  // 4.370. Checked: all 1 are Pinhão.
  { batch: 4, store: "AUCHAN", shelf: "frutos-secos-e-sementes/frutos-secos", kind: "pinhao", step: "cut" },
  // 4.371. Dried apricots, not fresh.
  { batch: 4, store: "AUCHAN", shelf: "frutos-secos-e-sementes/frutos-secos", kind: "alperce", step: "cut", becomes: null },
  // 4.372. Pizza bases.
  { batch: 4, store: "AUCHAN", shelf: "preparação-de-refeições/preparados-salgados", kind: "refeicao", step: "shelf", becomes: null },
  // 4.373. Checked: all 1 are Cereais.
  { batch: 4, store: "AUCHAN", shelf: "biológicos-bebé-alimentação-e-higiene/papas-e-cereais", kind: "cereais", step: "shelf" },
  // 4.374. A breakfast mix.
  { batch: 4, store: "AUCHAN", shelf: "biológicos-mercearia/cereais-e-pequeno-almoço", kind: "banana", step: "cut", becomes: null },
  // 4.375. A scone mix.
  { batch: 4, store: "AUCHAN", shelf: "farinha-e-preparados-pão-e-bolos/preparados-pão,-bolos-e-sobremesas", kind: "farinha", step: "cut", becomes: null },
  // 4.376. Checked: all 1 are Cereais.
  { batch: 4, store: "AUCHAN", shelf: "biológicos-mercearia/cereais-e-pequeno-almoço", kind: "cereais", step: "cut" },
  // 4.377. Checked: all 1 are Lagosta.
  { batch: 4, store: "AUCHAN", shelf: "marisco-e-moluscos/sapateira,-lagosta-e-caranguejo", kind: "lagosta", step: "cut" },
  // 4.378. Checked: all 1 are Vaca.
  { batch: 4, store: "AUCHAN", shelf: "carne/novilho", kind: "vaca", step: "cut" },
  // 4.379. Checked: all 1 are Borrego.
  { batch: 4, store: "AUCHAN", shelf: "carne/borrego", kind: "borrego", step: "shelf" },
  // 4.380. Checked: all 1 are Tamboril.
  { batch: 4, store: "AUCHAN", shelf: "peixe/peixe-inteiro", kind: "tamboril", step: "cut" },
  // 4.381. Checked: all 1 are Cavala.
  { batch: 4, store: "AUCHAN", shelf: "peixe/filetes-de-peixe", kind: "cavala", step: "cut" },
  // 4.382. Checked: all 1 are Red fish (cantarilho).
  { batch: 4, store: "AUCHAN", shelf: "peixe/filetes-de-peixe", kind: "red-fish", step: "cut" },
  // 4.383. Checked: all 1 are Perca.
  { batch: 4, store: "AUCHAN", shelf: "peixe/postas-de-peixe", kind: "perca", step: "cut" },
  // 4.384. A fish head.
  { batch: 4, store: "AUCHAN", shelf: "peixe/cabeças-de-peixe", kind: "pescada", step: "cut", becomes: null },
  // 4.385. A mix of broccoli, cauliflower and romanesco.
  { batch: 4, store: "AUCHAN", shelf: "legumes-e-fruta/misturas-de-legumes", kind: "couve", step: "cut", becomes: null },
  // 4.386. Checked: all 1 are Abóbora.
  { batch: 4, store: "AUCHAN", shelf: "legumes-e-fruta/legumes", kind: "abobora", step: "cut" },
  // 4.387. Pizza bases.
  { batch: 4, store: "AUCHAN", shelf: "padaria-e-pastelaria/massas-e-bases", kind: "massa", step: "shelf", becomes: null },
  // 4.388. Checked: all 1 are Atum.
  { batch: 4, store: "AUCHAN", shelf: "peixe/medalhões-e-tranches-de-peixe", kind: "atum", step: "cut" },
  // 4.389. Checked: all 1 are Maruca.
  { batch: 4, store: "AUCHAN", shelf: "peixe/postas-de-peixe", kind: "maruca", step: "cut" },
  // 4.390. Checked: all 1 are Cogumelo.
  { batch: 4, store: "AUCHAN", shelf: "legumes-e-fruta/misturas-de-legumes", kind: "cogumelo", step: "cut" },
  // 4.391. Checked: all 1 are Sopa.
  { batch: 4, store: "AUCHAN", shelf: "refeições-rápidas/sopa", kind: "sopa", step: "shelf" },
  // 4.392. Checked: all 1 are Perca.
  { batch: 4, store: "AUCHAN", shelf: "peixe/lombos-de-peixe", kind: "perca", step: "cut" },
  // 4.393. Checked: all 1 are Vaca.
  { batch: 4, store: "AUCHAN", shelf: "carne/novilho", kind: "vaca", step: "shelf" },
  // 4.394. Checked: all 1 are Corvina.
  { batch: 4, store: "AUCHAN", shelf: "peixe/filetes-de-peixe", kind: "corvina", step: "cut" },
  // 4.395. Checked: all 1 are Salmão.
  { batch: 4, store: "AUCHAN", shelf: "peixe/filetes-de-peixe", kind: "salmao", step: "cut" },
  // 4.397. Checked: all 1 are Paloco (escamudo).
  { batch: 4, store: "AUCHAN", shelf: "peixe/bacalhau-e-paloco", kind: "paloco", step: "cut" },
  // 4.398. Checked: all 1 are Perca.
  { batch: 4, store: "AUCHAN", shelf: "peixe/filetes-de-peixe", kind: "perca", step: "cut" },
  // 4.399. Checked: all 1 are Paloco (escamudo).
  { batch: 4, store: "AUCHAN", shelf: "peixe/lombos-de-peixe", kind: "paloco", step: "cut" },
  // 4.400. Checked: all 1 are Paloco (escamudo).
  { batch: 4, store: "AUCHAN", shelf: "peixe/filetes-de-peixe", kind: "paloco", step: "cut" },
  // 4.401. Checked: all 1 are Dourada.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Fresco/Dourada", kind: "dourada", step: "cut" },
  // 4.402. Checked: all 1 are Perca.
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Fresco/Outros Peixes", kind: "perca", step: "cut" },
  // 4.403. Checked: all 1 are Pescada.
  { batch: 4, store: "CONTINENTE", shelf: "Peixaria/Filetes, Lombos e Postas", kind: "pescada", step: "cut" },
  // 4.404. Checked: all 1 are Atum.
  { batch: 4, store: "CONTINENTE", shelf: "Peixaria/Filetes, Lombos e Postas", kind: "atum", step: "cut" },
  // 4.405. Checked: all 1 are Safio (congro).
  { batch: 4, store: "CONTINENTE", shelf: "Peixe Fresco/Outros Peixes", kind: "safio", step: "cut" },
  // 4.406. An egg flan.
  { batch: 4, store: "AUCHAN", shelf: "lácteos-sem-glúten/iogurtes-sem-glúten", kind: "iogurte", step: "shelf", becomes: null },
  // 4.407. Checked: all 1 are Pimento.
  { batch: 4, store: "CONTINENTE", shelf: "Legumes/Alface, Tomate, Pepino e Pimento", kind: "pimento", step: "cut" },
  // 4.408. Checked: all 1 are Farinha.
  { batch: 4, store: "PINGO_DOCE", shelf: "Farinha Fermento e Acucar/Farinha Fermento e Pao Ralado", kind: "farinha", step: "cut" },
  // 4.409. Checked: all 1 are Peixe-espada.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Pescada", kind: "peixe-espada", step: "cut" },
  // 4.410. Checked: all 1 are Amêndoa.
  { batch: 4, store: "PINGO_DOCE", shelf: "Batatas Fritas Snacks e Frutos Secos/Frutos Secos e Desidratados", kind: "amendoa", step: "cut" },
  // 4.411. Checked: all 1 are Noz.
  { batch: 4, store: "PINGO_DOCE", shelf: "Alternativas Alimentares/Produtos Biologicos", kind: "noz", step: "cut" },
  // 4.412. Biscuits, not lemons (hidden with the sweets).
  { batch: 4, store: "AUCHAN", shelf: "bolachas-e-bolos/bolachas-criança", kind: "limao", step: "cut", becomes: "bolacha" },
  // 4.413. Checked: all 1 are Pescada.
  { batch: 4, store: "PINGO_DOCE", shelf: "Promoções/Poupe Esta Semana", kind: "pescada", step: "cut" },
  // 4.414. An Easter sweets assortment.
  { batch: 4, store: "PINGO_DOCE", shelf: "Páscoa/Amendoas", kind: "amendoa", step: "shelf", becomes: null },
  // 4.415. Checked: all 1 are Porco.
  { batch: 4, store: "PINGO_DOCE", shelf: "Promoções/Poupe Esta Semana", kind: "porco", step: "cut" },
  // 4.416. Checked: all 1 are Pescada.
  { batch: 4, store: "PINGO_DOCE", shelf: "Peixe/Peixe Selvagem", kind: "pescada", step: "cut" },
  // 4.417. A cordon bleu.
  { batch: 4, store: "PINGO_DOCE", shelf: "Talho/Especialidades Picados e Salsichas", kind: "frango", step: "cut", becomes: "refeicao" },
  // 4.418. Checked: all 1 are Café em cápsulas.
  { batch: 4, store: "CONTINENTE", shelf: "Café, Chá e Solúveis/Café em Cápsulas", kind: "cafe-capsula", step: "shelf" },
  // 4.419. Checked: all 1 are Queijo.
  { batch: 4, store: "AUCHAN", shelf: "queijaria/queijo-para-barrar", kind: "queijo", step: "shelf" },
  // 4.420. Breaded fish fillets.
  { batch: 4, store: "AUCHAN", shelf: "peixe/filetes-de-peixe", kind: "farinha", step: "cut", becomes: "filete-panado" },
  // 4.421. Checked: all 1 are Tamboril.
  { batch: 4, store: "AUCHAN", shelf: "peixe/postas-de-peixe", kind: "tamboril", step: "cut" },
  // 4.422. A dairy dessert pouch.
  { batch: 4, store: "PINGO_DOCE", shelf: "Cereais Barras e Bolsas de Fruta/Bolsas de Fruta", kind: "cereais", step: "shelf", becomes: null },
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
  { batch: 4, store: "AUCHAN", id: "760892", name: "MACARRÃO AUCHAN A LA BOLONHESA 142G", kind: "refeicao", why: "an instant pasta meal and a risotto" },
  { batch: 4, store: "AUCHAN", id: "3644019", name: "RISOTO AUCHAN COM COGUMELOS 175G", kind: "refeicao", why: "an instant pasta meal and a risotto" },
  { batch: 4, store: "AUCHAN", id: "3651692", name: "LINGUINE DE PALMITO PALMINI 338G", kind: null, why: "palm-heart noodles, not pasta" },
  { batch: 4, store: "AUCHAN", id: "3651587", name: "CABELO ANJO PALMINI PALMITO 338G", kind: null, why: "palm-heart noodles, not pasta" },
  { batch: 4, store: "CONTINENTE", id: "8284433", name: "Pepperoni em Rodelas Continente", kind: null, why: "pepperoni" },
  { batch: 4, store: "CONTINENTE", id: "8897465", name: "Pepperoni Napoles Picante Continente Seleção", kind: null, why: "pepperoni" },
  { batch: 4, store: "CONTINENTE", id: "7931936", name: "Misto de Enchidos para Arroz Serrano Continente", kind: null, why: "mixed sausage packs" },
  { batch: 4, store: "CONTINENTE", id: "7931977", name: "Misto de Enchidos para Rancho Continente", kind: null, why: "mixed sausage packs" },
  { batch: 4, store: "CONTINENTE", id: "8915104", name: "Misto de Enchidos Churrasco Continente", kind: null, why: "mixed sausage packs" },
  { batch: 4, store: "CONTINENTE", id: "7931976", name: "Misto de Enchidos para Feijoada Serrana Continente", kind: null, why: "mixed sausage packs" },
  { batch: 4, store: "CONTINENTE", id: "7017345", name: "Especialidade de Cebola Roxa e Alecrim Vegan Linda McCartney's", kind: null, why: "plant-based meat substitutes" },
  { batch: 4, store: "CONTINENTE", id: "6814053", name: "Especialidade de Soja Vegan Linda McCartney's", kind: null, why: "plant-based meat substitutes" },
  { batch: 4, store: "CONTINENTE", id: "7978723", name: "Preparado Picado Vegetal Heura", kind: null, why: "plant-based meat substitutes" },
  { batch: 4, store: "CONTINENTE", id: "7594146", name: "Preparado Picado Vegan Linda McCartney's", kind: null, why: "plant-based meat substitutes" },
  { batch: 4, store: "CONTINENTE", id: "7049538", name: "Soja aos Pedaços Marinada Heura", kind: null, why: "plant-based meat substitutes" },
  { batch: 4, store: "CONTINENTE", id: "6123575", name: "Folha de Arroz Blue Dragon", kind: null, why: "rice paper" },
  { batch: 4, store: "CONTINENTE", id: "7336356", name: "Folha de Arroz", kind: null, why: "rice paper" },
  { batch: 4, store: "AUCHAN", id: "3654038", name: "KONJAC KETO CHEF ARROZ BIO 270G", kind: null, why: "konjac rice" },
  { batch: 4, store: "PINGO_DOCE", id: "821453", name: "Preparado de Carne Picada de Novilho Biológico Embalado", kind: "carne-picada", why: "minced beef" },
  { batch: 4, store: "PINGO_DOCE", id: "633840", name: "Preparado de Carne Picada de Peru Embalado", kind: "carne-picada", why: "minced turkey" },
  { batch: 4, store: "PINGO_DOCE", id: "921769", name: "Bifes de Peru Panados", kind: "refeicao", why: "breaded turkey steaks" },
  { batch: 4, store: "AUCHAN", id: "2165115", name: "BARQUETAS OLD EL PASO TRIGO 193G", kind: null, why: "taco shells and meal kits" },
  { batch: 4, store: "AUCHAN", id: "2242115", name: "MINI BARQUITAS OLD EL PASO MEXICANAS TRIGO 145G", kind: null, why: "taco shells and meal kits" },
  { batch: 4, store: "AUCHAN", id: "198481", name: "TACO OLD EL PASO KIT 308G", kind: null, why: "taco shells and meal kits" },
  { batch: 4, store: "AUCHAN", id: "384148", name: "FAJITAS OLD EL PASO KIT 500G", kind: null, why: "taco shells and meal kits" },
  { batch: 4, store: "AUCHAN", id: "3029370", name: "TEMPEH SEARA BIO 250G", kind: null, why: "tempeh" },
  { batch: 4, store: "AUCHAN", id: "3459572", name: "GASPACHO FRESCO CANA NATURE BIO 1L", kind: "sopa", why: "gazpacho" },
  { batch: 4, store: "AUCHAN", id: "3304432", name: "HUMMUS SANTA TERESA BIO 180G", kind: null, why: "hummus" },
  { batch: 4, store: "AUCHAN", id: "3425081", name: "HUMMUS BIO VERDE COENTROS E GENGIBRE BIO 150G", kind: null, why: "hummus" },
  { batch: 4, store: "CONTINENTE", id: "8619867", name: "Ovas de Bacalhau Congeladas Riberalves", kind: null, why: "cod roe" },
  { batch: 4, store: "CONTINENTE", id: "7799798", name: "Ovas de Bacalhau Higienizadas Congeladas Frip", kind: null, why: "cod roe" },
  { batch: 4, store: "CONTINENTE", id: "8116809", name: "Ovas de Bacalhau Congeladas Riberalves", kind: null, why: "cod roe" },
  { batch: 4, store: "CONTINENTE", id: "7295696", name: "Ovos Cozidos Continente", kind: null, why: "boiled eggs" },
  { batch: 4, store: "AUCHAN", id: "3705231", name: "MISTURA DE COGUMELO MARRON LAMINADO E ESPARGO 200 G", kind: null, why: "mushrooms with asparagus" },
  { batch: 4, store: "AUCHAN", id: "634544", name: "CARABINEIRO MOÇAMBIQUE 8/12 CONGELADO KG", kind: null, why: "carabineiro" },
  { batch: 4, store: "PINGO_DOCE", id: "1011750", name: "Dose de Fruta Maçã, Banana, Laranja e Ananás Kids +3 Anos", kind: "fruta-saqueta", why: "fruit purée pouches" },
  { batch: 4, store: "PINGO_DOCE", id: "985619", name: "Dose de Fruta Maçã, Banana, Laranja e Ananás Kids +3 Anos", kind: "fruta-saqueta", why: "fruit purée pouches" },
  { batch: 4, store: "CONTINENTE", id: "7599265", name: "Cachaço de Porco Fatiado Bísaro", kind: "paio", why: "cured pork neck" },
  { batch: 4, store: "CONTINENTE", id: "7640142", name: "Coppa Stagionata Fatiado Levoni", kind: "paio", why: "cured pork neck" },
  { batch: 4, store: "AUCHAN", id: "3682982", name: "TABUA DE CHARCUTARIA ARGAL CHAROLA 330 G", kind: null, why: "a charcuterie board" },
  { batch: 4, store: "AUCHAN", id: "3944904", name: "BRESAOLA BERETTA ITALIANA 70G", kind: null, why: "bresaola, cured beef" },
  { batch: 4, store: "AUCHAN", id: "14622", name: "MASSINHAS MILANEZA PEVIDE 250G", kind: "massa", why: "Soup pasta, as the same products at Continente." },
  { batch: 4, store: "AUCHAN", id: "14621", name: "MASSINHAS MILANEZA BAGOS 250G", kind: "massa", why: "Soup pasta, as the same products at Continente." },
  { batch: 4, store: "AUCHAN", id: "5895", name: "MASSINHAS NACIONAL ARGOLINHAS 250G", kind: "massa", why: "Soup pasta, as the same products at Continente." },
  { batch: 4, store: "AUCHAN", id: "15745", name: "MASSINHAS NACIONAL PONTINHA 250G", kind: "massa", why: "Soup pasta, as the same products at Continente." },
  { batch: 4, store: "AUCHAN", id: "3988160", name: "QUARK ANDECHSER NATURAL 250G", kind: null, why: "quark" },
  { batch: 4, store: "AUCHAN", id: "3988162", name: "QUARK BIO ANDECHSER FRAMBOESA 150G", kind: null, why: "quark" },
  { batch: 4, store: "AUCHAN", id: "3988163", name: "QUARK BIO ANDECHSER PÊSSEGO MANGA MARACUJÁ 150G", kind: null, why: "quark" },
  { batch: 4, store: "AUCHAN", id: "4037817", name: "PIADINA RISTORANTE PROSCIUTTO 280G", kind: null, why: "piadinas" },
  { batch: 4, store: "AUCHAN", id: "4037818", name: "PIADINA RISTORANTE QUATTRO FORMAGGI 280G", kind: null, why: "piadinas" },
  { batch: 4, store: "AUCHAN", id: "4037815", name: "PIADINA RISTORANTE DIAVOLA 280G", kind: null, why: "piadinas" },
  { batch: 4, store: "PINGO_DOCE", id: "1006719", name: "Snack de Queijo Crunchy Intensidade 1", kind: null, why: "a dried cheese snack" },
  { batch: 4, store: "PINGO_DOCE", id: "983981", name: "Rosca de Bacon e Queijo", kind: null, why: "a filled bread roll" },
  { batch: 4, store: "CONTINENTE", id: "7744595", name: "Bloco Sabor a Camembert Violife", kind: null, why: "a vegan cheese substitute" },
  { batch: 4, store: "CONTINENTE", id: "7971877", name: "Lunch Bowl Bulgur Bonduelle", kind: "refeicao", why: "Lunch bowls, ready meals as at Auchan." },
  { batch: 4, store: "CONTINENTE", id: "8366220", name: "Lunch Bowl Espelta Bonduelle", kind: "refeicao", why: "Lunch bowls, ready meals as at Auchan." },
  { batch: 4, store: "CONTINENTE", id: "8366314", name: "Lunch Bowl Quinoa Bonduelle", kind: "refeicao", why: "Lunch bowls, ready meals as at Auchan." },
  { batch: 4, store: "CONTINENTE", id: "2837405", name: "Ice Tea Pêssego Lipton", kind: "refrigerante", why: "Ice tea, a soft drink (hidden from the site with the drinks)." },
  { batch: 4, store: "CONTINENTE", id: "2837399", name: "Ice Tea Limão Lipton", kind: "refrigerante", why: "Ice tea, a soft drink (hidden from the site with the drinks)." },
  { batch: 4, store: "CONTINENTE", id: "2837401", name: "Ice Tea Manga Lipton", kind: "refrigerante", why: "Ice tea, a soft drink (hidden from the site with the drinks)." },
  { batch: 4, store: "AUCHAN", id: "1121152", name: "MINI BLINIS LABEYRIE 168G", kind: null, why: "blinis" },
  { batch: 4, store: "AUCHAN", id: "3801451", name: "BEBIDA ESPIRITUOSA BACARDI LIMÓN 0.70L", kind: "rum", why: "a flavoured rum" },
  { batch: 4, store: "AUCHAN", id: "38507", name: "BEBIDA ESPIRITUOSA CONSTANTINO 0.70L", kind: "aguardente", why: "a brandy" },
  { batch: 4, store: "AUCHAN", id: "3904069", name: "BEBIDA ESPIRITUOSA BEEFEATER SEM ÁLCOOL 0.70L", kind: null, why: "Spirits with no kind: a flavoured rum, a brandy, and an alcohol-free gin." },
  { batch: 4, store: "CONTINENTE", id: "8017740", name: "Brioche Entrançado La Fournée Dorée", kind: null, why: "a sweet brioche" },
  { batch: 4, store: "CONTINENTE", id: "6537478", name: "Papas de Aveia, Maçã e Canela Origens Bio", kind: "cereais", why: "Oat porridges, cereal as at Auchan." },
  { batch: 4, store: "CONTINENTE", id: "6537482", name: "Papas de Aveia, Banana e Cacau Origens Bio", kind: "cereais", why: "Oat porridges, cereal as at Auchan." },
  { batch: 4, store: "CONTINENTE", id: "6917657", name: "Noodles Clássico Soba Nissin", kind: "massa", why: "Instant soba noodles: pasta, in the instant-noodles group (the owner, 11 November 2026; was a ready meal in batch 4)." },
  { batch: 4, store: "CONTINENTE", id: "6917659", name: "Noodles Chili Soba Nissin", kind: "massa", why: "Instant soba noodles: pasta, in the instant-noodles group (the owner, 11 November 2026; was a ready meal in batch 4)." },
  { batch: 4, store: "CONTINENTE", id: "6917609", name: "Vallegre Moscatel Galego Douro Vinho Branco", kind: "vinho", why: "Moscatel wines (hidden from the site with the drinks)." },
  { batch: 4, store: "CONTINENTE", id: "4754267", name: "Adega de Pegões Moscatel de Setúbal", kind: "vinho", why: "Moscatel wines (hidden from the site with the drinks)." },
  { batch: 4, store: "CONTINENTE", id: "7496231", name: "Abuelo Añejo Rum", kind: "rum", why: "Rums (hidden from the site with the drinks)." },
  { batch: 4, store: "CONTINENTE", id: "2262030", name: "Havana Club 7 Anos Rum", kind: "rum", why: "Rums (hidden from the site with the drinks)." },
  { batch: 4, store: "AUCHAN", id: "1136885", name: "PEITO DE FRANGO FORNO LENHA CAMPOFRIO FATIAS FINAS 120G", kind: "fiambre", why: "Sliced chicken and turkey ham, fiambre as at Continente." },
  { batch: 4, store: "AUCHAN", id: "1136882", name: "PEITO DE PERÚ FORNO LENHA CAMPOFRIO FATIAS FINAS 120G", kind: "fiambre", why: "Sliced chicken and turkey ham, fiambre as at Continente." },
  { batch: 4, store: "AUCHAN", id: "4042362", name: "CABEÇA DE CORVINA KG", kind: null, why: "a fish head" },
  { batch: 4, store: "CONTINENTE", id: "7207956", name: "Falafel Iglo Green Cuisine", kind: "refeicao", why: "Falafel, a ready meal as elsewhere." },
  { batch: 4, store: "CONTINENTE", id: "8428835", name: "Chili sem Carne Bonduelle", kind: "refeicao", why: "A vegetable chilli." },
  { batch: 4, store: "CONTINENTE", id: "8580397", name: "Preparado de Arroz de Tomate Guloso", kind: null, why: "A base for tomato rice." },
  { batch: 4, store: "CONTINENTE", id: "8428809", name: "Caril de Lentilhas Bonduelle", kind: "refeicao", why: "A lentil curry." },
  { batch: 4, store: "CONTINENTE", id: "8915930", name: "Pasta Ramen Blue Dragon", kind: null, why: "A ramen paste." },
  { batch: 4, store: "CONTINENTE", id: "6923051", name: "Ginger Beer Premium Fever Tree", kind: "refrigerante", why: "Ginger beer, a soft drink (hidden)." },
  { batch: 4, store: "CONTINENTE", id: "7794057", name: "Martini Rossini Cocktail", kind: null, why: "A ready cocktail." },
  { batch: 4, store: "CONTINENTE", id: "7695759", name: "Cantares de Portugal Licor de Bolacha Maria", kind: "licor", why: "A liqueur (hidden)." },
  { batch: 4, store: "AUCHAN", id: "3288152", name: "SALADAS DE FRUTAS FERBAR EM CALDA 840G", kind: null, why: "Fruit salad in syrup." },
  { batch: 4, store: "AUCHAN", id: "2483101", name: "WOK NOODLES MILANEZA MASSAS 250G", kind: "massa", why: "Wok noodles, pasta as at Continente." },
  { batch: 4, store: "AUCHAN", id: "1159135", name: "LEITE REINA CREME COM BOLACHA 4X125G", kind: "mousse", why: "A dessert, as at Continente (hidden with the sweets)." },
  { batch: 4, store: "AUCHAN", id: "3574510", name: "GOIABADA PREDILECTA 250G", kind: null, why: "Guava paste." },
  { batch: 4, store: "AUCHAN", id: "3860732", name: "GOIABADA PREDILECTA TURMA DA MÓNICA 30G", kind: null, why: "Guava paste." },
  { batch: 4, store: "AUCHAN", id: "3927180", name: "PAPPARDELLE IGLO BOLONHESA 300G", kind: "refeicao", why: "A ready pasta dish, as at Continente." },
  { batch: 5, store: "AUCHAN", id: "997170", name: "RISOTTO RISO GALLO 4 QUEIJOS 175G", kind: "refeicao", why: "A ready risotto (group 4.16), moved by Auchan to arroz-e-massa/massas-especialidades on 22 October 2026." },
  // 27 October 2026, approved by the user: verified kinds that Auchan's move of
  // these products to new shelves on 26 October had changed (the nightly's
  // verified-kinds check caught them).
  { batch: 6, store: "AUCHAN", id: "3195459", name: "MIX PROTEÍNAS VEGETAIS SHINE CACAU BIO 250G", kind: null, why: "A protein powder, not a meal; moved to 'refeições e proteína' on 26 October 2026." },
  { batch: 6, store: "AUCHAN", id: "3195461", name: "MIX PROTEÍNAS VEGETAIS SHINE BANANA BIO 250G", kind: null, why: "A protein powder, not a meal; moved to 'refeições e proteína' on 26 October 2026." },
  { batch: 6, store: "AUCHAN", id: "3705241", name: "PROTEÍNA DE CÂNHAMO PRÓVIDA 250G", kind: null, why: "A protein powder, not a meal; moved to 'refeições e proteína' on 26 October 2026." },
  { batch: 6, store: "AUCHAN", id: "3773033", name: "PROTEINA CANHAMO SHINE 100GR", kind: null, why: "A protein powder, not a meal; moved to 'refeições e proteína' on 26 October 2026." },
  { batch: 6, store: "AUCHAN", id: "1178113", name: "PASTÉIS DELAVIUDA DE GEMA 300G", kind: "bolo", why: "Egg-yolk pastries, a cake as verified; moved to the chocolates shelf on 26 October 2026." },
  // 30 October 2026: shelf moves on the night of 30 October that the
  // verified-kinds check caught; each keeps the kind it was verified with.
  { batch: 7, store: "AUCHAN", id: "3685068", name: "CALENDARIO ADVENTO BIO CUPPER 24 SAQUETAS", kind: "infusao", why: "A tea advent calendar, infusão as verified; moved to the organic 'chá e infusões' shelf, which names two kinds, on 30 October 2026." },
  { batch: 7, store: "AUCHAN", id: "3815095", name: "CALENDÁRIO ADVENTO ENGLISH TEA VERMELHO 25 SAQUETAS", kind: "infusao", why: "As 3685068, the same move." },
  { batch: 7, store: "CONTINENTE", id: "8404056", name: "Pasta de Atum Snock", kind: null, why: "A tuna spread, not a meal, as verified; back on sale on 30 October 2026 on the 'Grab&Go' ready-meals shelf." },
  // 6 November 2026: Auchan moved 139 products between shelves that night, and
  // 15 changed kind. The verified-kinds check caught the first two; the fruit
  // strips were found reading the rest.
  { batch: 8, store: "AUCHAN", id: "3361299", name: "CHILI NOBRE BOVINO 420G", kind: "refeicao", why: "A ready meal, as verified; moved to the speciality tins shelf on 6 November 2026." },
  { batch: 8, store: "AUCHAN", id: "3723973", name: "CASSOULET AUCHAN BIO 340G", kind: "refeicao", why: "As 3361299, the same move." },
  { batch: 8, store: "AUCHAN", id: "2471239", name: "TIRAS NATURE ADDICTS FRUTA MORANGO 35G", kind: null, why: "A sweet fruit strip, not strawberries; moved to the gums shelf on 6 November 2026, where the shelf no longer keeps it out of the fruit." },
  { batch: 8, store: "AUCHAN", id: "2472468", name: "TIRAS NATURE ADDICTS FRUTA FRAMBOESA 35G", kind: null, why: "As the strawberry strip: a sweet, not raspberries." },
  // 9 November 2026: the AI trial of that day read every row of the site; these
  // are the products it found under the wrong kind, each checked against our
  // data (and the store's page where marked) and approved by the owner.
  { batch: 9, store: "CONTINENTE", id: "4076639", name: "Preparado para Sopa Portuguesa Continente", kind: null, why: "A soup-vegetable mix, compared with Portuguese cabbage." },
  { batch: 9, store: "AUCHAN", id: "3730249", name: "ERVILHAS AUCHAN COM CENOURAS 850(530)G", kind: null, why: "Peas with carrots, compared with plain tinned peas." },
  { batch: 9, store: "AUCHAN", id: "1113853", name: "MILHO CIMARROM POP CORN 400G", kind: "pipoca", why: "Popcorn maize, on Auchan's snacks shelf, compared with canjica maize." },
  { batch: 9, store: "CONTINENTE", id: "8198937", name: "Tomate Frito Continente", kind: "molho-tomate", why: "A tomato sauce (215 g), among fresh tomatoes." },
  { batch: 9, store: "CONTINENTE", id: "8911034", name: "Tomate Frito Continente", kind: "molho-tomate", why: "As 8198937, another size." },
  { batch: 9, store: "AUCHAN", id: "3496613", name: "QUEIJO PROTEIN+ AUCHAN FRESCO BATIDO NATURAL 500G", kind: null, why: "A whipped protein cheese (quark), on Auchan's protein-yoghurt shelf, compared with fresh cheese." },
  { batch: 9, store: "AUCHAN", id: "3425542", name: "TORTILHAS MISTER FREED BARBECUE 135G", kind: null, why: "Tortilla chips, a snack, not tortillas; Continente's same product has no kind." },
  { batch: 9, store: "AUCHAN", id: "2112001", name: "TOSTA RICA CUETERA 570G", kind: "bolacha", why: "A children's biscuit, on both stores' biscuit shelves; Continente's same product is a biscuit already." },
  { batch: 9, store: "CONTINENTE", id: "8885525", name: "Granola Bites Cacau sem Glúten sem Adição de Açúcar Continente Equilíbrio", kind: null, why: "A 50 g snack, compared with 375 g of muesli." },
  { batch: 9, store: "PINGO_DOCE", id: "1010209", name: "Papa de Aveia com Chocolate Branco e Coco", kind: null, why: "A porridge mix (sports-nutrition shelf), the cheapest chocolate cereal at 2.29 EUR/kg." },
  { batch: 9, store: "CONTINENTE", id: "7798984", name: "Cuscuz Tradicional sem Glúten Sinhá", kind: "farinha", why: "Brazilian maize flour for cuscuz, on Continente's flour shelf, not couscous." },
  { batch: 9, store: "CONTINENTE", id: "7212172", name: "Mix Pimentas com Sal Grosso Moinho Continente", kind: null, why: "A pepper-and-salt mix, compared with pure pepper at half its price per kilo." },
  { batch: 9, store: "AUCHAN", id: "2007566", name: "MOLHO DOM DUARTE VINHA D'ALHO 200G", kind: null, why: "A vinha d'alho marinade, not a garlic sauce." },
  // The trial's follow-ups, approved by the owner on 9 November 2026.
  { batch: 9, store: "AUCHAN", id: "3858781", name: "QUEIJO OVELHA AHUYENTALOBOS E PRESUNTO IBÉRICO KG", kind: null, why: "Sheep's cheese sold together with Iberian ham, at 9.99 EUR/kg; it became Auchan's cheapest sheep's cheese." },
  { batch: 9, store: "PINGO_DOCE", id: "1007481", name: "Chá Verde com Hortelã e Lima", kind: "refrigerante", why: "A bottled iced tea, 1 l (Pingo Doce's iced-tea shelf), among dry teas; ice teas are soft drinks, as batch 4's Lipton." },
  { batch: 9, store: "PINGO_DOCE", id: "858978", name: "Chá Verde com Hortelã e Lima", kind: "refrigerante", why: "As 1007481." },
  { batch: 9, store: "CONTINENTE", id: "8771872", name: "Chá Verde Hortelã e Lima Lipton", kind: "refrigerante", why: "A bottled iced tea, 1 l (Continente's iced-tea shelf)." },
  { batch: 9, store: "CONTINENTE", id: "8771945", name: "Chá Verde Citrus Lipton", kind: "refrigerante", why: "As 8771872." },
  { batch: 9, store: "CONTINENTE", id: "8772006", name: "Chá Verde Morango Lipton", kind: "refrigerante", why: "As 8771872, 2 l." },
  { batch: 9, store: "AUCHAN", id: "4042531", name: "CHÁ MATTE LEÃO LIMAO (SDR) 15L", kind: "refrigerante", why: "A bottled mate tea, 1.5 l (Brazilian drinks shelf)." },
  { batch: 9, store: "AUCHAN", id: "4042527", name: "CHÁ MATTE LEÃO ORIGINAL (SDR) 1.5 L", kind: "refrigerante", why: "As 4042531." },
  { batch: 9, store: "PINGO_DOCE", id: "985736", name: "Chá Fermentado Biológico de Framboesa", kind: null, why: "A bottled kombucha (0.3 l), as batch 9's Captain Kombucha." },
  { batch: 9, store: "PINGO_DOCE", id: "985737", name: "Chá Fermentado Biológico de Gengibre", kind: null, why: "As 985736." },
  { batch: 9, store: "AUCHAN", id: "3913031", name: "MOLHO PASSATA TOMATE GULOSO 210G", kind: "polpa-tomate", why: "Passata (tomato pulp, on Auchan's pulp shelf), the cheapest tomato sauce." },
  { batch: 9, store: "AUCHAN", id: "3904417", name: "MOLHO AUCHAN BASE DE TOMATE COM LEGUMES 420 G", kind: null, why: "A Mexican-cooking sauce base, compared with a tomato and basil sauce." },
  { batch: 9, store: "AUCHAN", id: "2143003", name: "CAFÉ DELTA MISTURA CEREAIS E CAFÉ SOLÚVEL 200G", kind: "bebida-cereais", why: "A cereal and coffee mix, compared with pure instant coffee." },
  { batch: 9, store: "PINGO_DOCE", id: "1009205", name: "Chá 0% Açúcar de Framboesa", kind: null, why: "A bottled kombucha (Captain Kombucha, 1 l), among dry teas." },
  { batch: 9, store: "PINGO_DOCE", id: "647128", name: "Douradinhos de Frango Congelados", kind: "nugget", why: "Chicken fingers (on Pingo Doce's nuggets shelf), among fish fingers." },
  { batch: 9, store: "PINGO_DOCE", id: "945057", name: "Douradinhos de Frango Congelados", kind: "nugget", why: "As 647128, another pack." },
  { batch: 9, store: "AUCHAN", id: "3723825", name: "RAVIOLI AUCHAN 6 LEGUMES E MOLHO TOMATE 400G", kind: "refeicao", why: "A ravioli ready meal in tomato sauce (Auchan's ready-meals shelf), compared with fresh filled pasta." },
  { batch: 9, store: "CONTINENTE", id: "7180150", name: "Batata Steakhouse Continente", kind: "batata-pre-frita", why: "Frozen fries, filed as boiling potatoes." },
  { batch: 9, store: "PINGO_DOCE", id: "1003932", name: "Batata Original Crinckle", kind: "batata-pre-frita", why: "McCain frozen fries, filed as boiling potatoes." },
  { batch: 9, store: "AUCHAN", id: "246177", name: "CARNE P/PICADINHO BOVINO KG", kind: "vaca", why: "Diced beef for stewing (picadinho), compared with minced beef; its cut is set below." },
  // Their siblings, which took their place in the rows once they left (found
  // measuring the changes on a copy of the 9 November night).
  { batch: 9, store: "PINGO_DOCE", id: "1009203", name: "Chá 0% Açúcar de Gengibre", kind: null, why: "A Captain Kombucha drink, as 1009205." },
  { batch: 9, store: "PINGO_DOCE", id: "1009201", name: "Chá Biológico de Gengibre", kind: null, why: "A Captain Kombucha drink, as 1009205." },
  { batch: 9, store: "PINGO_DOCE", id: "1009138", name: "Chá Biológico de Gengibre", kind: null, why: "A Captain Kombucha drink, as 1009205." },
  { batch: 9, store: "PINGO_DOCE", id: "1009202", name: "Chá Biológico Original", kind: null, why: "A Captain Kombucha drink, as 1009205." },
  { batch: 9, store: "PINGO_DOCE", id: "1009206", name: "Chá Fermentado de Framboesa", kind: null, why: "A Captain Kombucha drink, as 1009205." },
  { batch: 9, store: "PINGO_DOCE", id: "1009200", name: "Chá Biológico de Framboesa", kind: null, why: "A Captain Kombucha drink, as 1009205." },
  { batch: 9, store: "CONTINENTE", id: "8885527", name: "Granola Bites Manteiga de Amendoim sem Glúten sem Adição de Açúcar Continente Equilíbrio", kind: null, why: "A 50 g snack, as 8885525." },
  { batch: 9, store: "CONTINENTE", id: "8885528", name: "Granola Bites Maçã e Canela sem Glúten sem Adição de Açúcar Continente Equilíbrio", kind: null, why: "A 50 g snack, as 8885525." },
  { batch: 9, store: "AUCHAN", id: "3680119", name: "RAVIOLI AUCHAN RECHEADOS COM CARNE 400G", kind: "refeicao", why: "Another ravioli ready meal on Auchan's ready-meals shelf, as 3723825." },
  // Batch 10, 10 November 2026: the products whose kind was uncertain in kinds
  // the site shows (npm run review:kinds) - decided weakly by a shelf or a cut
  // word, or without a kind while the same barcode has one elsewhere. One kind
  // per barcode, so the same product is the same kind at every store; earlier
  // hand-verified kinds (data/kind-gold.json) kept where they apply.
  { batch: 10, store: "AUCHAN", id: "1005136", name: "DIRECTO AO FORNO MAGGI ENTRECOSTO 30G", kind: null, why: "A seasoning for the oven." },
  { batch: 10, store: "AUCHAN", id: "1027270", name: "POLPA TOMATE TRITURADO GULOSO 500G", kind: "tomate", why: "Crushed tomato; the same at Auchan becomes tomato too. Same barcode as Continente 4695123." },
  { batch: 10, store: "AUCHAN", id: "1033595", name: "CÁPSULAS DOLCE GUSTO NESQUIK 16UN", kind: null, why: "Chocolate or tea capsules, not coffee." },
  { batch: 10, store: "AUCHAN", id: "1034430", name: "SOPA KNORR CREME MARISCO 72G", kind: "sopa-instantanea", why: "Dried soup mix (Knorr), as the other store has it." },
  { batch: 10, store: "AUCHAN", id: "1035830", name: "FUBA DE MILHO NACIONAL 1KG", kind: "farinha", why: "Maize flour (fubá, flocão)." },
  { batch: 10, store: "AUCHAN", id: "1036806", name: "MISTURA RICORÉ SOLÚVEL COM CAFÉ 260G", kind: "bebida-cereais", why: "A cereal coffee substitute. Same barcode as Continente 4737793." },
  { batch: 10, store: "AUCHAN", id: "1039028", name: "AMENDOINS MATUTANO SAL E MEL 150G", kind: "amendoim", why: "Roasted peanuts." },
  { batch: 10, store: "AUCHAN", id: "1075453", name: "DANACOL DANONE LÍQUIDO MORANGO 12X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 4865289." },
  { batch: 10, store: "AUCHAN", id: "1082133", name: "SOPA KNORR GOURMET COGUMELOS 61G", kind: "sopa-instantanea", why: "Dried soup mix (Knorr), as the other store has it." },
  { batch: 10, store: "AUCHAN", id: "1093253", name: "MOLHO PASSATA GULOSO C/MANJERICAO E OREGÃOS 210G", kind: "molho-tomate", why: "A seasoned passata, a tomato sauce." },
  { batch: 10, store: "AUCHAN", id: "1095583", name: "FLOCOS NESTUM 5 CEREAIS COM CEREAIS INTEGRAIS 250G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 4947901." },
  { batch: 10, store: "AUCHAN", id: "1099468", name: "PROBIÓTICO ACTIMEL MORANGO 6X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 4951933." },
  { batch: 10, store: "AUCHAN", id: "1099473", name: "PROBIÓTICO ACTIMEL TUTTI 6X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 4951989." },
  { batch: 10, store: "AUCHAN", id: "1099489", name: "PROBIÓTICO ACTIMEL NATURAL 0% 6X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 4951998." },
  { batch: 10, store: "AUCHAN", id: "1099492", name: "PROBIÓTICO ACTIMEL MORANGO 12X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 4956521." },
  { batch: 10, store: "AUCHAN", id: "1103133", name: "FLOCOS NESTUM MEL COM CEREAIS INTEGRAIS 250G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 4961652." },
  { batch: 10, store: "AUCHAN", id: "1127712", name: "PREPARADO CONDI EM PÓ PARA CREME CUSTARD 500G", kind: null, why: "Custard powder, sago, an infant cereal or tapioca, not flour." },
  { batch: 10, store: "AUCHAN", id: "1136808", name: "SOPA KNORR ECONÓMICA DE MARISCO 60G", kind: "sopa-instantanea", why: "Dried soup mix (Knorr), as the other store has it." },
  { batch: 10, store: "AUCHAN", id: "1136889", name: "PEITO DE PERÚ FORNO LENHA CAMPOFRIO FATIAS 120G", kind: "fiambre", why: "Sliced turkey or chicken breast (fiambre)." },
  { batch: 10, store: "AUCHAN", id: "1136892", name: "PEITO DE FRANGO FORNO LENHA CAMPOFRIO FATIAS 120G", kind: "fiambre", why: "Sliced turkey or chicken breast (fiambre)." },
  { batch: 10, store: "AUCHAN", id: "1141216", name: "CÁPSULAS DOLCE GUSTO CHÁ VERDE MARRAKESH 16UN", kind: null, why: "Chocolate or tea capsules, not coffee." },
  { batch: 10, store: "AUCHAN", id: "1162140", name: "ESPECIARIAS MARGÃO SEGREDOS ALHO E ERVAS AROMÁTICAS 40G", kind: null, why: "A seasoning mix, not garlic." },
  { batch: 10, store: "AUCHAN", id: "1184200", name: "SNACK FRUUT MAÇÃ VERDE INTENSO SEM AÇÚCAR 60G", kind: null, why: "Dried apple snack, not apples." },
  { batch: 10, store: "AUCHAN", id: "1186579", name: "SNACK FRUUT MAÇA VERMELHO DOCE SEM AÇÚCAR 60G", kind: null, why: "Dried apple snack, not apples." },
  { batch: 10, store: "AUCHAN", id: "1191188", name: "IOGURTE DANONINO PETIT MORANGO 6X50G", kind: "iogurte", why: "Children's petit-suisse, as the other store has them: compared with yoghurts, not cheese. Same barcode as Continente 4377808." },
  { batch: 10, store: "AUCHAN", id: "1197408", name: "SNACK MAÇÃ FRUUT COM CANELA SEM AÇUCAR 60 G", kind: null, why: "Dried apple snack, not apples." },
  { batch: 10, store: "AUCHAN", id: "14599", name: "MACARRONETE MILANEZA RISCADO GE 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "14634", name: "COTOVELOS MILANEZA GROSSOS RISCADOS 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "15542", name: "PEPINOS HENGSTENBERG 330(185)G", kind: "pepino", why: "Gherkins. Same barcode as Continente 2004579." },
  { batch: 10, store: "AUCHAN", id: "15678", name: "MACARRONETE NACIONAL 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "15683", name: "MACARRÃO NACIONAL RISCADO 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "15762", name: "MASSINHAS CUSCUS NACIONAL PISELLINI 250G", kind: "cuscuz", why: "As its name says." },
  { batch: 10, store: "AUCHAN", id: "2111699", name: "FUBÁ YOKI MIMOSO 500G", kind: "farinha", why: "Maize flour (fubá, flocão)." },
  { batch: 10, store: "AUCHAN", id: "2118797", name: "MOLHO MUTTI DE TOMATE PARA PIZZA 400G", kind: "molho-tomate", why: "Mutti pizza sauce, as Auchan has it. Same barcode as Continente 4049455." },
  { batch: 10, store: "AUCHAN", id: "2130745", name: "FARELO CEM PORCENTO AVEIA 400G", kind: "cereais", why: "Oat or barley flakes. Same barcode as Continente 5418196." },
  { batch: 10, store: "AUCHAN", id: "2130843", name: "SEMENTES CEM PORCENTO ABÓBORA 150G", kind: "semente-abobora", why: "As its name says." },
  { batch: 10, store: "AUCHAN", id: "2133208", name: "MOLHO HEINZ KETCHUP REDUÇÃO SAL E AÇÚCAR 550G", kind: "ketchup", why: "Ketchup." },
  { batch: 10, store: "AUCHAN", id: "2139023", name: "LEITE APTAMIL JÚNIOR 1L", kind: null, why: "A flavoured milk drink or growing-up milk, not milk. Same barcode as Continente 4953629." },
  { batch: 10, store: "AUCHAN", id: "2143557", name: "ARGOLAS PESCANOVA DO MAR 400G", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "AUCHAN", id: "2151301", name: "IOGURTE ACTIVIA BIFIDUS CREMOSO LIMA E LIMÃO 4X120G", kind: "bifidus", why: "Activia bifidus, as Continente has it." },
  { batch: 10, store: "AUCHAN", id: "2172418", name: "MILLET CEM PORCENTO MILHO PAINÇO 500G", kind: null, why: "Konjac noodles or millet grain, not wheat pasta." },
  { batch: 10, store: "AUCHAN", id: "2194177", name: "SOPA BLUE DRAGON MISO 92.5G", kind: "sopa-instantanea", why: "Instant miso soup. Same barcode as Continente 5615869." },
  { batch: 10, store: "AUCHAN", id: "2201583", name: "CÁPSULAS DELTA Q CAFÉ PURE CEVADA 10UN", kind: null, why: "Barley capsules, not coffee. Same barcode as Continente 5637232." },
  { batch: 10, store: "AUCHAN", id: "2205992", name: "PROBIÓTICO ACTIMEL MORANGO 0% 6X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 5709291." },
  { batch: 10, store: "AUCHAN", id: "2215810", name: "EMPANADILHA VEGGIS DE COGUMELOS 2X165G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 5948645." },
  { batch: 10, store: "AUCHAN", id: "2222216", name: "CHÁ CEM PORCENTO HIBISCO 10 SAQUETAS", kind: "infusao", why: "Herbal infusions. Same barcode as Continente 5779749." },
  { batch: 10, store: "AUCHAN", id: "2224550", name: "LEITE CACAOLAT 0% MEIO GORDO COM STEVIA 1L", kind: null, why: "A flavoured milk drink or growing-up milk, not milk. Same barcode as Continente 7181969." },
  { batch: 10, store: "AUCHAN", id: "2226276", name: "ESPIRAIS MILANEZA WOK 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "2230218", name: "IOGURTE ACTIVIA BIFIDUS AVEIA E NOZES 4X120G", kind: "bifidus", why: "Activia bifidus, as Continente has it." },
  { batch: 10, store: "AUCHAN", id: "2294695", name: "CEREAIS NESTUM BOLACHA MARIA 250G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 5907390." },
  { batch: 10, store: "AUCHAN", id: "2295922", name: "SALSICHAS TOFU NOBRE FRASCO 5 UN 360(200)G", kind: "salsicha", why: "Tofu sausages. Same barcode as Continente 8220728." },
  { batch: 10, store: "AUCHAN", id: "2440941", name: "CONSERVA VALFRUTTA TOMATE PASSATA BIO 700ML", kind: "polpa-tomate", why: "Passata." },
  { batch: 10, store: "AUCHAN", id: "2440943", name: "FLOCOS CEM PORCENTO AVEIA CROCANTES COM MEL 400G", kind: "cereais", why: "Oat or barley flakes. Same barcode as Continente 5822138." },
  { batch: 10, store: "AUCHAN", id: "2484363", name: "PIMENTA MARGÃO DO CHEF 34G", kind: "pimenta", why: "A pepper mix. Same barcode as Continente 7141380." },
  { batch: 10, store: "AUCHAN", id: "2484409", name: "PIRIPIRI PALADIN SACANA AI AI 75ML", kind: "piri-piri", why: "Piri-piri sauce." },
  { batch: 10, store: "AUCHAN", id: "2627400", name: "CÁPSULAS DOLCE GUSTO CHOCOCCINO 8UN", kind: null, why: "Chocolate or tea capsules, not coffee." },
  { batch: 10, store: "AUCHAN", id: "2690175", name: "PASTA KNORR POT TOMATE E MOZARELA 72G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 6447738." },
  { batch: 10, store: "AUCHAN", id: "2697517", name: "MACARRONETE NACIONAL MASSA COM VEGETAIS 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "2699470", name: "CARNE VAPZA SECA DESFIADA COZIDA AO VAPOR SEM GLÚTEN 400G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 8669045." },
  { batch: 10, store: "AUCHAN", id: "2708824", name: "MIOLO GAMBÃO PESCANOVA 20-40 200G", kind: "camarao", why: "As its name says. Same barcode as Continente 6536239." },
  { batch: 10, store: "AUCHAN", id: "2734787", name: "MISTURA DELTA SOLÚVEL CEREAIS E FIBRA 200G", kind: "bebida-cereais", why: "A cereal coffee substitute. Same barcode as Continente 6557350." },
  { batch: 10, store: "AUCHAN", id: "2739529", name: "VEGGIE BOWL IGLO GREEN CUISINE QUINOA E ABÓBORA 350G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 6588552." },
  { batch: 10, store: "AUCHAN", id: "2739543", name: "VEGGIE BOWL IGLO GREEN CUISINE SARRACENO E BRÓCOLOS 350G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 6588553." },
  { batch: 10, store: "AUCHAN", id: "2747488", name: "FARINHA PENSAL CACAU 250G", kind: null, why: "Custard powder, sago, an infant cereal or tapioca, not flour. Same barcode as Continente 6593381." },
  { batch: 10, store: "AUCHAN", id: "2798241", name: "DANACOL DANONE LÍQUIDO AVEIA 6X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 6691001." },
  { batch: 10, store: "AUCHAN", id: "2899186", name: "MOLHO KIKKOMAN YAKITORI 250ML", kind: null, why: "Yakitori or ponzu sauce, not soy sauce." },
  { batch: 10, store: "AUCHAN", id: "2933378", name: "MACARRÃO MILANEZA INTEGRAL AVEIA 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "2939029", name: "ATUM MUXAMA FICOLUME 110 G", kind: null, why: "Cured tuna loin (muxama), a deli product. Same barcode as Continente 6917858." },
  { batch: 10, store: "AUCHAN", id: "2966921", name: "SNACK FRUUT MAÇÃ AMENDOIM SEM AÇÚCAR 40G", kind: null, why: "Dried apple snack, not apples." },
  { batch: 10, store: "AUCHAN", id: "2966923", name: "SNACK FRUUT MAÇÃ CÔCO AMÊNDOA SEM AÇÚCAR 30G", kind: null, why: "Dried apple snack, not apples." },
  { batch: 10, store: "AUCHAN", id: "2999349", name: "BEBIDA PEDRAS COM GÁS MARACUJÁ 4X0.25L", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water." },
  { batch: 10, store: "AUCHAN", id: "3005604", name: "IOGURTE YOPRO LÍQUIDO BAUNILHA COOKIES 300G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 6892400." },
  { batch: 10, store: "AUCHAN", id: "3006247", name: "IOGURTE YOPRO LÍQUIDO MORANGO E FRAMBOESA 300G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 6892594." },
  { batch: 10, store: "AUCHAN", id: "3018044", name: "FLOCOS NESTUM ZERO ESPELTA E AVEIA 250G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 6909794." },
  { batch: 10, store: "AUCHAN", id: "3018062", name: "FLOCOS NESTUM ZERO MEL 250G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 6909669." },
  { batch: 10, store: "AUCHAN", id: "3024454", name: "SOBA NISSIN CUP GALINHA YAKITORI 89G", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026). Same barcode as Continente 6917671." },
  { batch: 10, store: "AUCHAN", id: "3024463", name: "SOBA NISSIN CUP CLÁSSICO 90G", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026). Same barcode as Continente 6917660." },
  { batch: 10, store: "AUCHAN", id: "3024488", name: "DEMAE RAMEN NISSIN GALINHA 100G", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026). Same barcode as Continente 6917654." },
  { batch: 10, store: "AUCHAN", id: "3024495", name: "SOBA NISSIN CUP TERIYAKI 90G", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026). Same barcode as Continente 6917664." },
  { batch: 10, store: "AUCHAN", id: "3046846", name: "FLOCOS NESTUM ZERO ARROZ 250G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 6957306." },
  { batch: 10, store: "AUCHAN", id: "3048088", name: "TORTILLAS OLD EL PASO INTEGRAIS 350G", kind: "tortilha", why: "As its name says." },
  { batch: 10, store: "AUCHAN", id: "3053822", name: "PÃO LE PAIN DES FLEURS FLORES CACAU SEM GLÚTEN BIO 160G", kind: "tosta", why: "Toasts. Same barcode as Continente 5979826." },
  { batch: 10, store: "AUCHAN", id: "3056983", name: "REFEIÇÃO GARDEN GOURMET NUGGETS VEGETARIANOS 200G", kind: "nugget", why: "Vegetarian nuggets, as Continente has them." },
  { batch: 10, store: "AUCHAN", id: "3057262", name: "REFEIÇÃO GARDEN GOURMET HAMBURGUER VEGETAIS CLÁSSICO 150G", kind: "hamburguer", why: "Vegetable burger, as Continente has it." },
  { batch: 10, store: "AUCHAN", id: "3057280", name: "REFEIÇÃO GARDEN GOURMET ALMÔNDEGAS VEGETARIANAS 200G", kind: "almondega", why: "Vegetarian meatballs, as Continente has them." },
  { batch: 10, store: "AUCHAN", id: "3063448", name: "DANACOL DANONE LÍQUIDO NOZ 6X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 6993198." },
  { batch: 10, store: "AUCHAN", id: "3098840", name: "SOLUVEL DELTA CHICORIA E CAFÉ LATA 250G", kind: "bebida-cereais", why: "A cereal coffee substitute. Same barcode as Continente 7067804." },
  { batch: 10, store: "AUCHAN", id: "3124402", name: "VEGGIE BOWL IGLO GREEN CUISINE COUSCOUS E EDAMAME 350G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 7090521." },
  { batch: 10, store: "AUCHAN", id: "3170586", name: "BEBIDA COM GÁS PEDRAS TANGERINA 4X0.25L", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water." },
  { batch: 10, store: "AUCHAN", id: "3199732", name: "TEMPERO KNORR 1-2-3 SABORES BOLONHESA 4UN", kind: null, why: "A seasoning kit, not stock." },
  { batch: 10, store: "AUCHAN", id: "3205130", name: "BEBIDA FRIZE COM GÁS MARACUJÁ 4X0.25L", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water." },
  { batch: 10, store: "AUCHAN", id: "3207073", name: "PREPARADOS YOKI SAGU 500G", kind: null, why: "Custard powder, sago, an infant cereal or tapioca, not flour." },
  { batch: 10, store: "AUCHAN", id: "3209068", name: "IOGURTE YOPRO MIRTILO 160G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7182224." },
  { batch: 10, store: "AUCHAN", id: "3209069", name: "IOGURTE YOPRO BAUNILHA 160G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7182219." },
  { batch: 10, store: "AUCHAN", id: "3209072", name: "IOGURTE YOPRO MANTEIGA AMENDOIM E BANANA 160G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7182223." },
  { batch: 10, store: "AUCHAN", id: "3234373", name: "TEMPERO KNORR 1-2-3 CHILI COM CARNE 33G", kind: null, why: "A seasoning kit, not stock." },
  { batch: 10, store: "AUCHAN", id: "3250149", name: "IOGURTE ACTIVIA BIFIDUS FRUTOS SILVESTRES 0% 8X115G", kind: "bifidus", why: "Activia bifidus, as Continente has it." },
  { batch: 10, store: "AUCHAN", id: "3257080", name: "SALSICHAS TOFU NOBRE VEGALIA LATA 8 UN 350(160)G", kind: "salsicha", why: "Tofu sausages. Same barcode as Continente 7298540." },
  { batch: 10, store: "AUCHAN", id: "3263363", name: "MIOLO CAMARÃO PESCANOVA PANADO 300G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 7239338." },
  { batch: 10, store: "AUCHAN", id: "3286642", name: "CUSCUZ TREVIJANO MARROQUINO VEGAN 300G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 7004285." },
  { batch: 10, store: "AUCHAN", id: "3286643", name: "CUSCUZ TREVIJANO MEDITERRÂNEO VEGAN 300G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 7004287." },
  { batch: 10, store: "AUCHAN", id: "3297032", name: "CONDIMENTO SHARWOOD'S 102G", kind: "caril", why: "As its name says." },
  { batch: 10, store: "AUCHAN", id: "3297055", name: "GRANOLA PROZIS PROTEICA FRUTOS BOSQUE 250G", kind: "cereais", why: "A protein granola, as the one at Auchan was verified (kind-gold). Same barcode as Continente 7424570." },
  { batch: 10, store: "AUCHAN", id: "3297128", name: "GRANOLA PROZIS PROTEICA CHOCOLATE E AVELÃS 275G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 7380483." },
  { batch: 10, store: "AUCHAN", id: "3303821", name: "FARFALLE DE CECCO 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "3303822", name: "PENNE DE CECCO RIGATE 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "3303826", name: "PASTA ORIENTAL MAGGI XXL FRANGO 185G", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026). Same barcode as Continente 7371056." },
  { batch: 10, store: "AUCHAN", id: "3308608", name: "IOGURTE YOPRO LÍQUIDO MANGA 300G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7383016." },
  { batch: 10, store: "AUCHAN", id: "3308626", name: "IOGURTE YOPRO LÍQUIDO CÔCO 300G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7383018." },
  { batch: 10, store: "AUCHAN", id: "3308861", name: "TOSTAS SALUTEM CRISP BREAD QUEIJO TOMATE 130G", kind: "tosta", why: "Crispbread." },
  { batch: 10, store: "AUCHAN", id: "3325632", name: "PIRI-PIRI AROMA D`MINAS PIMENTA BODE VERMELHA 75G", kind: null, why: "Cayenne or chilli pepper, not black pepper." },
  { batch: 10, store: "AUCHAN", id: "3328939", name: "FILETES IGLO DE PEIXE C/TOMATE E MOZZARELLA MSC 3 UN.300G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 7409959." },
  { batch: 10, store: "AUCHAN", id: "3328940", name: "FILETES IGLO DE PEIXE COM ESPINAFRES MSC 3UN 300G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 7409960." },
  { batch: 10, store: "AUCHAN", id: "3339848", name: "PÃO RALADO PANKO KIKKOMAN JAPONÊS 227G", kind: "pao-ralado", why: "Panko breadcrumbs." },
  { batch: 10, store: "AUCHAN", id: "3341309", name: "IOGURTE ACTIVIA BIFIDUS LÍQUIDO FRUTOS SILVESTRES 000% 8X155G", kind: "bifidus", why: "Activia bifidus, as Continente has it." },
  { batch: 10, store: "AUCHAN", id: "3341312", name: "IOGURTE ACTIVIA BIFIDUS LÍQUIDO CEREAIS PACK PROMOCIONAL 8X155G", kind: "bifidus", why: "Activia bifidus, as Continente has it." },
  { batch: 10, store: "AUCHAN", id: "3359485", name: "FLOCOS NESTUM CEREAIS MEL CEREAIS INTEGRAIS 600G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 7426276." },
  { batch: 10, store: "AUCHAN", id: "3361295", name: "POT KNORR PURÉ BACON E CEBOLA 51G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 7363515." },
  { batch: 10, store: "AUCHAN", id: "3365386", name: "CAPELLINI SPEZZATI LA MOLISANA 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "3365412", name: "MOINHO MARGÃO PIMENTA CAYENNE 29G", kind: null, why: "Cayenne or chilli pepper, not black pepper." },
  { batch: 10, store: "AUCHAN", id: "3365427", name: "IOGURTE ACTIVIA BIFIDUS AVEIA NOZES 8X115G", kind: "bifidus", why: "Activia bifidus, as Continente has it." },
  { batch: 10, store: "AUCHAN", id: "3366326", name: "FLOR BANANEIRA NATURES CHARM VEGAN 510G", kind: "refeicao", why: "A ready meal or a vegan alternative." },
  { batch: 10, store: "AUCHAN", id: "3366327", name: "ALTERNATIVA VEGAN ÁS VIEIRAS NATURES CHARM 425G", kind: "refeicao", why: "A ready meal or a vegan alternative." },
  { batch: 10, store: "AUCHAN", id: "3366329", name: "ALTERNATIVA VEGAN NATURES CHARM CALAMARES 425G", kind: "refeicao", why: "A ready meal or a vegan alternative." },
  { batch: 10, store: "AUCHAN", id: "3368891", name: "FARINHA DE MILHO SINHÁ FLOCÃO 400G", kind: "farinha", why: "Maize flour (fubá, flocão). Same barcode as Continente 7798957." },
  { batch: 10, store: "AUCHAN", id: "3370577", name: "DANACOL DANONE TROPICAL 12X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7458547." },
  { batch: 10, store: "AUCHAN", id: "3373668", name: "FARINHA BEIJUBOM TAPIOCA 500G", kind: null, why: "Custard powder, sago, an infant cereal or tapioca, not flour. Same barcode as Continente 8670165." },
  { batch: 10, store: "AUCHAN", id: "3374969", name: "PROTEIN MUESLI PROZIS CHOCOLATE 400G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 7461729." },
  { batch: 10, store: "AUCHAN", id: "3403737", name: "BEBIDA CEREAIS DELTA CHICÓRIA CEVADA E CAFÉ 200G", kind: "bebida-cereais", why: "A cereal coffee substitute. Same barcode as Continente 7405533." },
  { batch: 10, store: "AUCHAN", id: "3404551", name: "BACALHAU À BRÁS RIBERALVES 240G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 7578233." },
  { batch: 10, store: "AUCHAN", id: "3420850", name: "PROBIÓTICO ACTIMEL NATURAL 0% 12X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7497341." },
  { batch: 10, store: "AUCHAN", id: "3421688", name: "ARGOLAS PESCANOVA DO MAR 1", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "AUCHAN", id: "3425553", name: "TORTILHAS MISTER FREED ABACATE 135G", kind: null, why: "Tortilla chips, a snack. Same barcode as Continente 7430427." },
  { batch: 10, store: "AUCHAN", id: "3425555", name: "TORTILHAS MISTER FREED QUEIJO 135G", kind: null, why: "Tortilla chips, a snack. Same barcode as Continente 7430426." },
  { batch: 10, store: "AUCHAN", id: "3427023", name: "DEMAE RAMEN NISSIN MISO 100G", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026). Same barcode as Continente 7803475." },
  { batch: 10, store: "AUCHAN", id: "3431264", name: "TABUA DE QUEIJO SANTIAGO SABORES MISTURA 3X90G", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 7527068." },
  { batch: 10, store: "AUCHAN", id: "3431269", name: "TABUA DE QUEIJOS SANTIAGO CLÁSSICOS 3X90GR", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 7527067." },
  { batch: 10, store: "AUCHAN", id: "3433085", name: "IOGURTE BIFIDUS ACTIVIA CHIA AMENDOA 0% 4X120G", kind: "bifidus", why: "Activia bifidus, as Continente has it." },
  { batch: 10, store: "AUCHAN", id: "3449745", name: "FLOCOS CEREAIS NESTUM MEL 600 G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 7554421." },
  { batch: 10, store: "AUCHAN", id: "3474247", name: "FRUTAS ORIGENS BIO MIRTILOS 300G", kind: "mirtilo", why: "Frozen blueberries." },
  { batch: 10, store: "AUCHAN", id: "3481150", name: "BEBIDA C/GÁS FRIZE ANANÁS 4X0.25L", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water." },
  { batch: 10, store: "AUCHAN", id: "3500085", name: "MACARRÃO MILANEZA MEZZE MANICHE RIGATE 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "3503438", name: "IOGURTE LIQUIDO YOPRO PESSEGO MARAGUJÁ 300G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7591767." },
  { batch: 10, store: "AUCHAN", id: "3503460", name: "IOGURTE LIQUIDO YOPRO STRACCIATELLA 300G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7591765." },
  { batch: 10, store: "AUCHAN", id: "3509277", name: "DEMAE RAMEN NISSIN CARIL JAPONÊS 100G", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026). Same barcode as Continente 7621550." },
  { batch: 10, store: "AUCHAN", id: "3521993", name: "MOLHOS DE TOMATE BARILLA ARRABBIATA 400G", kind: "molho-tomate", why: "Tomato sauce. Same barcode as Continente 7636421." },
  { batch: 10, store: "AUCHAN", id: "3524581", name: "IOGURTE YOPRO SÓLIDO MORANGO 160G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7646228." },
  { batch: 10, store: "AUCHAN", id: "3528527", name: "CALDEIRADA BACALHAU RIBERALVES MSC 700G", kind: "bacalhau", why: "Cod stew; the same product at Continente was verified as cod (kind-gold)." },
  { batch: 10, store: "AUCHAN", id: "3546708", name: "TABUA DE QUEIJOS SANTIAGO SELEÇÃO CUNHAS 250G", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 7679951." },
  { batch: 10, store: "AUCHAN", id: "3552276", name: "CACHAÇO DE PORCO BÍSARO 70G", kind: "paio", why: "Cured pork neck." },
  { batch: 10, store: "AUCHAN", id: "3553560", name: "IOGURTE BIFIDUS ACTIVIA CEREAIS 8 X115G", kind: "bifidus", why: "Activia bifidus, as Continente has it." },
  { batch: 10, store: "AUCHAN", id: "3555801", name: "LOMBOS RIBERALVES 4M CURA UNIDOSE MSC 240G", kind: "bacalhau", why: "Cod loins." },
  { batch: 10, store: "AUCHAN", id: "3570803", name: "MOLHO ZERO PROZIS KETCHUP 355G", kind: "ketchup", why: "Ketchup." },
  { batch: 10, store: "AUCHAN", id: "3573832", name: "FARFALLE CASA LOSITO 250G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "3600600", name: "FEIJÃO-VERDE BONDUELLE BIO 530G", kind: "feijao-verde", why: "Green beans in a jar. Same barcode as Continente 7739862." },
  { batch: 10, store: "AUCHAN", id: "36065", name: "CEREAIS NESTUM MEL 300G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 2004805." },
  { batch: 10, store: "AUCHAN", id: "3606623", name: "PREPARADO MAÇA E CANELA PRISCA KG", kind: null, why: "An apple-and-cinnamon preparation on the cheese shelf, not a cheese." },
  { batch: 10, store: "AUCHAN", id: "3614223", name: "IOGURTE LIQUIDO YOPRO MIRTILO 300G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7760402." },
  { batch: 10, store: "AUCHAN", id: "3617133", name: "GNOCCHI DE CECCO SEM GLÚTEN 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "3617138", name: "TORTIGLIONI DE CECCO SEM GLÚTEN 400G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "3624591", name: "IOGURTE LINDAHLS STRACCIATELLA PROTEINA 160G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7760300." },
  { batch: 10, store: "AUCHAN", id: "3624599", name: "IOGURTE SÓLIDO LINDAHLS FRAMBOESA 160G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7760299." },
  { batch: 10, store: "AUCHAN", id: "3624631", name: "IOGURTE SÓLIDO LINDAHLS LIMÃO COOKIES 160G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7760400." },
  { batch: 10, store: "AUCHAN", id: "3624723", name: "IOGURTE SÓLIDO LINDAHLS MORANGO LIMA 160G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7760399." },
  { batch: 10, store: "AUCHAN", id: "3624796", name: "IOGURTE SÓLIDO LINDAHLS PÊSSEGO MARACUJA 160G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7760398." },
  { batch: 10, store: "AUCHAN", id: "3629624", name: "IOGURTE LIQUIDO LINDAHLS MELANCIA LIMÃO 330ML", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7771359." },
  { batch: 10, store: "AUCHAN", id: "3629632", name: "IOGURTE LIQUIDO LINDAHLS MORANGO 330ML", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7771362." },
  { batch: 10, store: "AUCHAN", id: "3630289", name: "FLOCOS CEREAIS NESTUM ZERO CHOCOLATE 250G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 7775145." },
  { batch: 10, store: "AUCHAN", id: "3632973", name: "FETTUCCINE DELVERDE NIDO INTEGRAL BIO 250GR", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "3633072", name: "CAFÉ MOÍDO DELTA MISTURA PENINSULAR 220 G", kind: "bebida-cereais", why: "A cereal-and-coffee blend; Continente shelves it with cereal drinks. Same barcode as Continente 7790027." },
  { batch: 10, store: "AUCHAN", id: "3633076", name: "CAFÉ MOÍDO DELTA MISTURA IBÉRICA 220 G", kind: "bebida-cereais", why: "A cereal-and-coffee blend; Continente shelves it with cereal drinks. Same barcode as Continente 7790029." },
  { batch: 10, store: "AUCHAN", id: "36391", name: "MISTURA TOFINA SOLÚVEL COM CAFÉ 200G", kind: "bebida-cereais", why: "A cereal coffee substitute. Same barcode as Continente 2004718." },
  { batch: 10, store: "AUCHAN", id: "36396", name: "MISTURA SOLÚVEL PENSAL BRASA SEM CAFÉ 200G", kind: "bebida-cereais", why: "A cereal coffee substitute. Same barcode as Continente 2004021." },
  { batch: 10, store: "AUCHAN", id: "3641362", name: "PÃO TORRADO GREFUSA AZEITONAS E ALECRIM 110GR", kind: "tosta", why: "Toasts. Same barcode as Continente 7837642." },
  { batch: 10, store: "AUCHAN", id: "3641364", name: "PÃO TORRADO GREFUSA TOMATE & OREGÃOS 110 G", kind: "tosta", why: "Toasts. Same barcode as Continente 7837645." },
  { batch: 10, store: "AUCHAN", id: "3645944", name: "MOLHOS DE TOMATE GULOSO BOLONHESA 350G", kind: "molho-tomate", why: "Tomato sauce. Same barcode as Continente 7721907." },
  { batch: 10, store: "AUCHAN", id: "3647314", name: "IOGURTE INFANTIL DANONINO MAXI MORANGO 4X100G", kind: "iogurte", why: "Children's petit-suisse, as the other store has them: compared with yoghurts, not cheese. Same barcode as Continente 5025117." },
  { batch: 10, store: "AUCHAN", id: "3654041", name: "KONJAC KETO CHEF FETTUCCINE BIO 270G", kind: null, why: "Konjac noodles or millet grain, not wheat pasta." },
  { batch: 10, store: "AUCHAN", id: "3654043", name: "KONJAC KETO CHEF TAGLIATELLE BIO 270G", kind: null, why: "Konjac noodles or millet grain, not wheat pasta." },
  { batch: 10, store: "AUCHAN", id: "3665933", name: "CREME LÁCTEO MATINAL MAGRO SEM LACTOSE 200 G", kind: null, why: "A dairy spread, not butter." },
  { batch: 10, store: "AUCHAN", id: "3668589", name: "MOLHO NATA MIMOSA P/ CARNE 200ML", kind: null, why: "A cream sauce, not cooking cream." },
  { batch: 10, store: "AUCHAN", id: "3668592", name: "MOLHO NATA MIMOSA P/MASSAS 200ML", kind: null, why: "A cream sauce, not cooking cream." },
  { batch: 10, store: "AUCHAN", id: "3669797", name: "PENNE RIGATE AUCHAN À MESA EM ITÁLIA 500 G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "3669806", name: "LINGUINE AUCHAN À MESA EM ITÁLIA 500 G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "3669807", name: "PIPE RIGATE AUCHAN À MESA EM ITÁLIA 500 G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "3670476", name: "DANACOL DANONE AVEIA 0% 12X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 7856308." },
  { batch: 10, store: "AUCHAN", id: "3670531", name: "IOGURTE BIFIDUS ACTIVIA CEREAIS 00% 4X115G", kind: "bifidus", why: "Activia bifidus, as Continente has it." },
  { batch: 10, store: "AUCHAN", id: "3678413", name: "TABUA DE QUEIJOS MISTURA PAIVA 3X80G", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 7779516." },
  { batch: 10, store: "AUCHAN", id: "3678604", name: "QUEIJO VACA HERDADE DA MAIA 2X110G", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 7969619." },
  { batch: 10, store: "AUCHAN", id: "3678929", name: "TÁBUA DE QUEIJO PAIVA VACA COM ESPECIARIAS 3X80G", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 7779515." },
  { batch: 10, store: "AUCHAN", id: "36798", name: "FUBA DE MILHO ESPIGA 500G", kind: "farinha", why: "Maize flour (fubá, flocão)." },
  { batch: 10, store: "AUCHAN", id: "3679924", name: "MOLHOS BASE DE TOMATE BARILLA ROSSO 200G", kind: "pesto", why: "Pesto rosso. Same barcode as Continente 7775184." },
  { batch: 10, store: "AUCHAN", id: "3689594", name: "TAGLIATELLE IGLO COM COGUMELOS 300G", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "AUCHAN", id: "3700061", name: "IOGURTE SEM LACTOSE MIMOSA PROBIOTICO FRAMBOESA AMENDOA E SEMENTES 4X115G", kind: "iogurte", why: "Mimosa probiotic yoghurt: yoghurt at both stores (the owner, 11 November 2026; it had been verified as bifidus at Continente)." },
  { batch: 10, store: "AUCHAN", id: "3703562", name: "COTOVELINHOS AUCHAN À MESA EM FRANÇA 250G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "3704633", name: "PENNE AUCHAN BIO 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "3705240", name: "FLOCOS DE CEVADA SEARA BIO 400 G", kind: "cereais", why: "Oat or barley flakes. Same barcode as Continente 2963819." },
  { batch: 10, store: "AUCHAN", id: "3706717", name: "TEMPERO MAGGI SUCULENTO FORNO BBQ 32G", kind: null, why: "A seasoning mix, not a barbecue sauce." },
  { batch: 10, store: "AUCHAN", id: "3720266", name: "BACALHAU COM NATAS RIBERALVES 300G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 7991184." },
  { batch: 10, store: "AUCHAN", id: "3722370", name: "QUEIJO CREME VEGETAL PHILADELPHIA 145G", kind: null, why: "A vegan spread. Same barcode as Continente 7801615." },
  { batch: 10, store: "AUCHAN", id: "3740873", name: "IOGURTE LIQUIDO YOPRO BANANA 300G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 8005064." },
  { batch: 10, store: "AUCHAN", id: "3741212", name: "SNACK FRUUT MAÇÃ SABOR MORANGO 20GR", kind: null, why: "Dried apple snack, not apples." },
  { batch: 10, store: "AUCHAN", id: "3742830", name: "CARIL ZWERGENWIESE TIKKA MASSALA BIO 370 G", kind: "refeicao", why: "A ready meal or a vegan alternative." },
  { batch: 10, store: "AUCHAN", id: "3742832", name: "CHILLI ZWERGENWIESE SEM CARNE 370G", kind: "refeicao", why: "A ready meal or a vegan alternative." },
  { batch: 10, store: "AUCHAN", id: "3753803", name: "BEBIDA C/ GÁS FRIZE LARANJA 4X0.25L", kind: "agua-sabor", why: "Orange-flavoured sparkling water, not plain water. Same barcode as Continente 8019930." },
  { batch: 10, store: "AUCHAN", id: "3761119", name: "IOGURTE PROTEINA LIQUIDO DANONE MORANGO 270G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 8041386." },
  { batch: 10, store: "AUCHAN", id: "3761253", name: "IOGURTE BIFIDUS ACTIVIA MORANGO KIWI 000% 8X155G", kind: "bifidus", why: "Activia bifidus, as Continente has it." },
  { batch: 10, store: "AUCHAN", id: "3778646", name: "LASANHA NACIONAL S/ OVO 250G", kind: "massa", why: "Lasagne sheets. Same barcode as Continente 8124256." },
  { batch: 10, store: "AUCHAN", id: "3778650", name: "BOLONHESA AUCHAN VERY VEGGIE VEGAN EM FRASCO 315G", kind: "refeicao", why: "A ready meal or a vegan alternative." },
  { batch: 10, store: "AUCHAN", id: "3780316", name: "IOGURTE INFANTIL YOCO SUISSINHO MORANGO 6X50G", kind: "iogurte", why: "Children's petit-suisse, as the other store has them: compared with yoghurts, not cheese. Same barcode as Continente 8090611." },
  { batch: 10, store: "AUCHAN", id: "3785756", name: "PEITO DE PERU IZIDORO FATIAS FINAS 120G+30G", kind: "fiambre", why: "Sliced turkey or chicken breast (fiambre)." },
  { batch: 10, store: "AUCHAN", id: "3785757", name: "PEITO DE FRANGO FAT. IZIDORO FORNO A LENHA 110G+30G", kind: "fiambre", why: "Sliced turkey or chicken breast (fiambre)." },
  { batch: 10, store: "AUCHAN", id: "3785856", name: "PEITO PERU DE PERU FF IZIDORO FORNO A LENHA 110G+30G", kind: "fiambre", why: "Sliced turkey or chicken breast (fiambre)." },
  { batch: 10, store: "AUCHAN", id: "3793275", name: "IOGURTE INFANTIL YOCO MORANGO PERA E ALPERCE 6X50G", kind: "iogurte", why: "Children's petit-suisse, as the other store has them: compared with yoghurts, not cheese. Same barcode as Continente 8090612." },
  { batch: 10, store: "AUCHAN", id: "3796284", name: "FLOCOS CEREAIS NESTUM PROTEÍNA CEREAIS 250 G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 8052438." },
  { batch: 10, store: "AUCHAN", id: "3796285", name: "FLOCOS CEREAIS NESTUM PROTEÍNA MORANGO 250 G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 8052401." },
  { batch: 10, store: "AUCHAN", id: "3798485", name: "HEURA HAMBURGUER VEGETARIANO 200G", kind: "hamburguer", why: "As its name says." },
  { batch: 10, store: "AUCHAN", id: "3800196", name: "LEITE PASTEURIZADO NESTLÉ NESQUIK SHAKE 180ML", kind: null, why: "A flavoured milk drink or growing-up milk, not milk. Same barcode as Continente 6191880." },
  { batch: 10, store: "AUCHAN", id: "3802663", name: "CHILI AUCHAN BIO SEM CARNE 340G", kind: "refeicao", why: "A ready meal or a vegan alternative." },
  { batch: 10, store: "AUCHAN", id: "3802726", name: "TABUA QUEIJO SANTIAGO CUNHAS ALAVÃO UN", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 8126880." },
  { batch: 10, store: "AUCHAN", id: "3810347", name: "REFEIÇÃO GARDEN GOURMET VEGGIE BALLS 200G", kind: "almondega", why: "Vegetarian meatballs, as Continente has them." },
  { batch: 10, store: "AUCHAN", id: "3811664", name: "PROBIOTICO ACTIMEL MULTIFRUTAS LARANJA 6X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 8154443." },
  { batch: 10, store: "AUCHAN", id: "3812529", name: "IOGURTE INFANTIL ACTIMEL NATURAL NAS 6X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 8154429." },
  { batch: 10, store: "AUCHAN", id: "3822120", name: "IOGURTE PROTEINA YOPRO MIRTILO 4X120G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 8174349." },
  { batch: 10, store: "AUCHAN", id: "3822123", name: "IOGURTE PROTEINA YOPRO BAUNILHA 4X120G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 8174334." },
  { batch: 10, store: "AUCHAN", id: "3830232", name: "GNOCCHI BARILLA GNOCCHI 500GR", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "3857266", name: "PEITO FRANGO +PROTEINA BIENSTAR 130G", kind: "fiambre", why: "Sliced turkey or chicken breast (fiambre)." },
  { batch: 10, store: "AUCHAN", id: "3857594", name: "SOBA CUP NISSIN CHILLI 92G", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026). Same barcode as Continente 7803489." },
  { batch: 10, store: "AUCHAN", id: "3865894", name: "CAPPUCCINO NESCAFÉ MOCHA 8X17G", kind: null, why: "Cappuccino mix in sticks, not coffee." },
  { batch: 10, store: "AUCHAN", id: "3873203", name: "CESTO C/3 QUEIJOS MONTIQUEIJO 3X90G", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 5465212." },
  { batch: 10, store: "AUCHAN", id: "3873386", name: "CHÁ INFUSÃO CEM PORCENTO CAMOMILA BIO 13G", kind: "infusao", why: "Herbal infusions. Same barcode as Continente 6581744." },
  { batch: 10, store: "AUCHAN", id: "3873389", name: "CHÁ INFUSÃO CEM PORCENTO DETOX BIO 13G", kind: "infusao", why: "Herbal infusions. Same barcode as Continente 6582007." },
  { batch: 10, store: "AUCHAN", id: "3877457", name: "IOGURTE LINDAHLS ANANAS COCO 160G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 8391026." },
  { batch: 10, store: "AUCHAN", id: "3884561", name: "ESPELTA PUFF BIO SEARA 150G", kind: "cereais", why: "Oat or barley flakes. Same barcode as Continente 6858086." },
  { batch: 10, store: "AUCHAN", id: "3901002", name: "IOGURTE YOPRO MORANGO 4X120G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 8447873." },
  { batch: 10, store: "AUCHAN", id: "3901004", name: "IOGURTE YOPRO STRACIATELLA 120GX4", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 8447953." },
  { batch: 10, store: "AUCHAN", id: "3901005", name: "IOGURTE PROTEINA YOPRO STRACIATELLA 450G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 8447961." },
  { batch: 10, store: "AUCHAN", id: "3901018", name: "IOGURTE BIFIDUS ACTIVIA FR SILVESTRES CEREAIS 4X115G", kind: "bifidus", why: "Activia bifidus, as Continente has it." },
  { batch: 10, store: "AUCHAN", id: "3911751", name: "RODELAS DE PESCADA CONGELADAS 500 GR", kind: "pescada", why: "Hake medallions. Same barcode as Continente 7822657." },
  { batch: 10, store: "AUCHAN", id: "3913033", name: "MOLHO PASSATA TOMATE GULOSO CEBOLA E ALHO 210G", kind: "molho-tomate", why: "A seasoned passata (onion and garlic), as Auchan has it. Same barcode as Continente 7721962." },
  { batch: 10, store: "AUCHAN", id: "3913986", name: "KIT INDIANO BUTTER CHICKEN C/ARROZ 351 G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 8485309." },
  { batch: 10, store: "AUCHAN", id: "3914213", name: "KIT SPAGHETTI CARBONARA 357 G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 8485273." },
  { batch: 10, store: "AUCHAN", id: "3924610", name: "BEBIDA C/ GÁS PEDRAS ANANÁS TP 4X0.25L", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water." },
  { batch: 10, store: "AUCHAN", id: "3924754", name: "MAIONAISE HELLMANN'S ALHO ASSADO 250G", kind: "maionese", why: "Garlic mayonnaise (Hellmann's)." },
  { batch: 10, store: "AUCHAN", id: "3926010", name: "TAGINE DE GRÃO BICO BONDUELLE 400G", kind: "refeicao", why: "Chickpeas in a tagine sauce, a ready dish. Same barcode as Continente 8428825." },
  { batch: 10, store: "AUCHAN", id: "3938242", name: "TÁBUA QUEIJOS S.JORGE DOP 4 CURAS 240G", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 7829329." },
  { batch: 10, store: "AUCHAN", id: "3939261", name: "IOGURTE PROTEINA YOPRO NATURAL 450G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 8591076." },
  { batch: 10, store: "AUCHAN", id: "3942663", name: "CAPUCCINO DELTA INTENSO EM STICK 125G", kind: null, why: "Cappuccino mix in sticks, not coffee." },
  { batch: 10, store: "AUCHAN", id: "3942668", name: "CAPUCCINO DELTA CLASSICO EM STICK 140G", kind: null, why: "Cappuccino mix in sticks, not coffee." },
  { batch: 10, store: "AUCHAN", id: "3943971", name: "CREME DE COGUMELOS SABORES AUCHAN 400 G", kind: "sopa", why: "Ready soup." },
  { batch: 10, store: "AUCHAN", id: "3944959", name: "CACHAÇO PORCO SABORES AUCHAN AMEIXA E AMÊNDOA COM ARROZ ÁRABE 300 G", kind: "refeicao", why: "A ready meal or a vegan alternative." },
  { batch: 10, store: "AUCHAN", id: "3960162", name: "IOGURTE SÓLIDO NESTLÉ KEFIR NATURAL 375G", kind: "kefir", why: "Kefir. Same barcode as Continente 8614463." },
  { batch: 10, store: "AUCHAN", id: "3970757", name: "FLOCOS CEREAIS NESTUM PROTEÍNA CACAU 250G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 8660056." },
  { batch: 10, store: "AUCHAN", id: "3971888", name: "LUNCH BOWL BONDUELLE MEXICAN STYLE 250G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 8650092." },
  { batch: 10, store: "AUCHAN", id: "397375", name: "CAVALINHAS MANNA TOMATE 120(90)G", kind: "cavala", why: "As its name says." },
  { batch: 10, store: "AUCHAN", id: "3986025", name: "PIZZAS TRADICIONAL DR.OETKER BASES COM TOMATE 2 UNIDS", kind: null, why: "A pizza base. Same barcode as Continente 8604474." },
  { batch: 10, store: "AUCHAN", id: "3986145", name: "CHÁ CHIMARRÃO LEÃO VACUO 1KG", kind: "cha", why: "As its name says. Same barcode as Continente 8766338." },
  { batch: 10, store: "AUCHAN", id: "3987715", name: "LUNCH BOWL BONDUELLE ORIENTAL 250G", kind: "refeicao", why: "A ready meal. Same barcode as Continente 8650126." },
  { batch: 10, store: "AUCHAN", id: "3987861", name: "PAPAS ARROZ PROZIS COOKIE 750GR", kind: "cereais", why: "Prozis rice porridge, as the one at Auchan was verified (kind-gold). Same barcode as Continente 8844570." },
  { batch: 10, store: "AUCHAN", id: "3994318", name: "IOGURTE INFANTIL ACTIMEL MORANGO 14X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 8716856." },
  { batch: 10, store: "AUCHAN", id: "3998320", name: "ALTERÚSTICA FATIAS ALTERVEGO ENCHIDO VEGGIE 80G", kind: null, why: "A plant-based deli slice." },
  { batch: 10, store: "AUCHAN", id: "3998784", name: "ALTERDELA FATIAS ALTERVEGO 90G", kind: "mortadela", why: "Plant-based mortadella." },
  { batch: 10, store: "AUCHAN", id: "4000786", name: "BEBIDA COM GÁS PEDRAS AÇAÍ TP 4X0.25L", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water." },
  { batch: 10, store: "AUCHAN", id: "4001638", name: "FLOCOS NESTUM ZERO ARROZ E AVEIA COM MAÇÃ 250G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 8780721." },
  { batch: 10, store: "AUCHAN", id: "4001683", name: "SOLÚVEL DELTA SUPER BLEND ENERGIA 200G", kind: "bebida-cereais", why: "Delta Super Blend soluble drinks, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 8718589." },
  { batch: 10, store: "AUCHAN", id: "4001685", name: "SOLÚVEL DELTA SUPER BLEND PROTEINA 200G", kind: "bebida-cereais", why: "Delta Super Blend soluble drinks, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 8718607." },
  { batch: 10, store: "AUCHAN", id: "4001688", name: "SOLÚVEL DELTA SUPER BLEND IMUNIDADE 200G", kind: "bebida-cereais", why: "Delta Super Blend soluble drinks, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 8718617." },
  { batch: 10, store: "AUCHAN", id: "4011144", name: "BEBIDAS COM GÁS PEDRAS ANANÁS PET 1L (SDR)", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water." },
  { batch: 10, store: "AUCHAN", id: "4012713", name: "ÁGUA DE COCO THAI COCO PURO 1L", kind: null, why: "Coconut water, a drink, not a plant milk." },
  { batch: 10, store: "AUCHAN", id: "4013693", name: "REFEIÇÃO YFOOD FRAMBOESA 500G", kind: "batido", why: "A meal-replacement shake, as the other store has it." },
  { batch: 10, store: "AUCHAN", id: "4013694", name: "REFEIÇÃO YFOOD CAFÉ 500G", kind: "batido", why: "A meal-replacement shake, as the other store has it." },
  { batch: 10, store: "AUCHAN", id: "4013695", name: "REFEIÇÃO YFOOD CHOCOLATE 500G", kind: "batido", why: "A meal-replacement shake, as the other store has it." },
  { batch: 10, store: "AUCHAN", id: "4021588", name: "BEBIDA LUSO FRUTA MAÇÃ 4X1L (SDR)", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water." },
  { batch: 10, store: "AUCHAN", id: "4022195", name: "MOLHO PONZU KIKKOMAN LIMÃO 150ML", kind: null, why: "Yakitori or ponzu sauce, not soy sauce." },
  { batch: 10, store: "AUCHAN", id: "4022502", name: "AGUA C/GAS SAN PELLEGRINO S/SABOR PET 1L (SDR)", kind: "agua", why: "Plain sparkling mineral water. Same barcode as Continente 8772218." },
  { batch: 10, store: "AUCHAN", id: "4022957", name: "POT NOODLE KNORR FUSION DONER KEBAB 80GR", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026)." },
  { batch: 10, store: "AUCHAN", id: "4025171", name: "IOGURTE DANONINO PETIT MORANGO E BANANA 12X50G", kind: "iogurte", why: "Children's petit-suisse, as the other store has them: compared with yoghurts, not cheese. Same barcode as Continente 8858065." },
  { batch: 10, store: "AUCHAN", id: "4025550", name: "SWEETIES SWEE FRAMBOESA E PISTÁCHIO 140G", kind: null, why: "Frozen raspberries coated in pistachio, a snack. Same barcode as Continente 8859250." },
  { batch: 10, store: "AUCHAN", id: "4034647", name: "FLOCOS CEREAIS NESTUM ZERO MEL 550G", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold). Same barcode as Continente 8780722." },
  { batch: 10, store: "AUCHAN", id: "4044225", name: "PENNE INTEGRAL REGGIA NUTRI BIO 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "4044597", name: "TAGLIATELLI RUMMO Nº107 500GR", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "4059275", name: "LEITE AGROS E MOCHILA 20X200ML", kind: null, why: "A flavoured milk drink or growing-up milk, not milk. Same barcode as Continente 8940690." },
  { batch: 10, store: "AUCHAN", id: "4059625", name: "IOGURTE KEFIR SÓLIDO NESTLÉ NATURAL 4X125G", kind: "kefir", why: "Kefir. Same barcode as Continente 8926385." },
  { batch: 10, store: "AUCHAN", id: "4059635", name: "NATAS UHT PARMALAT CREME DE LEITE 200ML", kind: "nata", why: "Cooking cream. Same barcode as Continente 8909818." },
  { batch: 10, store: "AUCHAN", id: "4062249", name: "BEBIDAS CAFÉ STARBUCKS PROTEINA CARAMELO E AVELÃ 330ML", kind: null, why: "A coffee milk drink, not a plant milk. Same barcode as Continente 8296662." },
  { batch: 10, store: "AUCHAN", id: "4062519", name: "BEBIDA CAFÉ STARBUCKS FRAPUCCINO COOKIES & CREAM 250ML", kind: null, why: "A flavoured milk drink or growing-up milk, not milk." },
  { batch: 10, store: "AUCHAN", id: "4062949", name: "VEGGIES & FUSILLI BONDUELLE 557G", kind: "refeicao", why: "Frozen pasta with vegetables, a ready meal." },
  { batch: 10, store: "AUCHAN", id: "4062956", name: "VEGGIES & PENNE   BONDUELLE 557G", kind: "refeicao", why: "Frozen pasta with vegetables, a ready meal." },
  { batch: 10, store: "AUCHAN", id: "4064776", name: "FOCACCIA DULCESOL COM ALECRIM 210G", kind: "pao", why: "Focaccia, a bread." },
  { batch: 10, store: "AUCHAN", id: "4071288", name: "CÁPSULAS SISTEMA NEO DOLCE GUSTO HOT CHOCOLATE 12 CAPS", kind: null, why: "Chocolate or tea capsules, not coffee." },
  { batch: 10, store: "AUCHAN", id: "4071606", name: "POSTA DE GAROUPA AUCHAN CONGELADA HIGIENIZADA KG", kind: "garoupa", why: "As its name says." },
  { batch: 10, store: "AUCHAN", id: "4072139", name: "PEITO FRANGO SEM ADITIVOS ELPOZO 120G", kind: "fiambre", why: "Sliced turkey or chicken breast (fiambre)." },
  { batch: 10, store: "AUCHAN", id: "4075976", name: "CAPPUCCINO DELTA MOCHA STICK 8X18G (144G)", kind: null, why: "Cappuccino mix in sticks, not coffee." },
  { batch: 10, store: "AUCHAN", id: "4075977", name: "PREPARADO DELTA CHOCOLATE QUENTE AVELÃ 300G", kind: "achocolatado", why: "A soluble chocolate drink powder, as the other store has it. Same barcode as Continente 8973267." },
  { batch: 10, store: "AUCHAN", id: "4077626", name: "IOGURTE DANONINO -30% AÇUCAR MORANGO BANANA E PESSEGO 6X50G", kind: "iogurte", why: "Children's petit-suisse, as the other store has them: compared with yoghurts, not cheese. Same barcode as Continente 8983312." },
  { batch: 10, store: "AUCHAN", id: "4078604", name: "ÁGUA DE COCO VIETCOCO 1L", kind: null, why: "Coconut water, a drink, not a plant milk." },
  { batch: 10, store: "AUCHAN", id: "4078757", name: "DANACOL DANONE LIQUIDO FRUT SILVESTRES 6X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 8983101." },
  { batch: 10, store: "AUCHAN", id: "4078774", name: "PROBIOTICO ACTIMEL MORANGO ROMÃ 6X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 8985440." },
  { batch: 10, store: "AUCHAN", id: "4081829", name: "PÃO RALADO MIYATA 200G", kind: "pao-ralado", why: "Panko breadcrumbs." },
  { batch: 10, store: "AUCHAN", id: "41607", name: "PETIT NESQUIK 6X60G", kind: "iogurte", why: "Children's petit-suisse, as the other store has them: compared with yoghurts, not cheese. Same barcode as Continente 2298035." },
  { batch: 10, store: "AUCHAN", id: "428041", name: "FLOCOS SALUTEM CEVADA INTEGRAIS TOSTADOS 250G", kind: "cereais", why: "Oat or barley flakes. Same barcode as Continente 2611866." },
  { batch: 10, store: "AUCHAN", id: "446519", name: "PAU DE CANELA MARGÃO ESPECIAL PARA CAFÉ 120G", kind: "canela", why: "As its name says." },
  { batch: 10, store: "AUCHAN", id: "523363", name: "MACARRÃO MILANEZA GRAND RIGATONI 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "523368", name: "MACARRONETE MILANEZA GRAND PEN RIGA 500G", kind: "massa", why: "Dry pasta." },
  { batch: 10, store: "AUCHAN", id: "567838", name: "MINI FOLHADOS LES 3 TOQUES 12 66G", kind: "folhado", why: "As its name says. Same barcode as Continente 7618383." },
  { batch: 10, store: "AUCHAN", id: "600961", name: "PÃO WASA CROCANTE ORIGINAL COM FARINHA CENTEIO 275G", kind: "tosta", why: "Crispbread and toasted bread slices, as the other store has them." },
  { batch: 10, store: "AUCHAN", id: "631314", name: "CHÁ CEM PORCENTO Nº5 EMAGRESS PLUS 10 SAQUETAS", kind: "infusao", why: "Herbal infusions. Same barcode as Continente 4273571." },
  { batch: 10, store: "AUCHAN", id: "631316", name: "CHÁ CEM PORCENTO Nº6 SEM BARRIGA 10 SAQUETAS", kind: "infusao", why: "Herbal infusions. Same barcode as Continente 4273558." },
  { batch: 10, store: "AUCHAN", id: "634015", name: "TRIGO YOKI PARA KIBE 500G", kind: null, why: "Wheat for kibbeh." },
  { batch: 10, store: "AUCHAN", id: "708308", name: "DANACOL DANONE LÍQUIDO NATURAL 6X100G", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls). Same barcode as Continente 3073598." },
  { batch: 10, store: "AUCHAN", id: "732161", name: "CHÁ TETLEY TILIA 10 SAQUETAS", kind: "infusao", why: "Herbal infusions. Same barcode as Continente 3646753." },
  { batch: 10, store: "AUCHAN", id: "771266", name: "CHÁ FORMA+ REGULAX 10 SAQUETAS", kind: "infusao", why: "Herbal infusions. Same barcode as Continente 4613225." },
  { batch: 10, store: "AUCHAN", id: "783859", name: "BEBIDA COM GÁS FRIZE GROSELHA 4X0.25L", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water." },
  { batch: 10, store: "AUCHAN", id: "865031", name: "DELICIAS PESCANOVA COM FORMA DE LAGOSTA 255G", kind: "delicias-do-mar", why: "As its name says." },
  { batch: 10, store: "AUCHAN", id: "911648", name: "TORTILHAS ZANUY DE MILHO COM SABOR MEXICANO 200G", kind: null, why: "Tortilla chips, a snack. Same barcode as Continente 4304010." },
  { batch: 10, store: "AUCHAN", id: "917061", name: "AMENDOINS MATUTANO NO FORNO 200G", kind: "amendoim", why: "Roasted peanuts." },
  { batch: 10, store: "AUCHAN", id: "985565", name: "SAL CASA PONTINHA TEMPERO PARA CHURRASCO 180G", kind: null, why: "A seasoning with salt, not salt. Same barcode as Continente 4507739." },
  { batch: 10, store: "AUCHAN", id: "985599", name: "SAL CASA PONTINHA TEMPERO PARA CARNE 180G", kind: null, why: "A seasoning with salt, not salt. Same barcode as Continente 4507615." },
  { batch: 10, store: "CONTINENTE", id: "2003320", name: "Massa Macarronete Penne Riscado Milaneza", kind: "massa", why: "Dry pasta. Same barcode as Auchan 14599." },
  { batch: 10, store: "CONTINENTE", id: "2003321", name: "Massa Cotovelos Grandes Riscados Milaneza", kind: "massa", why: "Dry pasta. Same barcode as Auchan 14634." },
  { batch: 10, store: "CONTINENTE", id: "2003952", name: "Couscous Nacional", kind: "cuscuz", why: "As its name says. Same barcode as Auchan 15762." },
  { batch: 10, store: "CONTINENTE", id: "2003973", name: "Massa Macarrão Riscado Nacional", kind: "massa", why: "Dry pasta. Same barcode as Auchan 15683." },
  { batch: 10, store: "CONTINENTE", id: "2003977", name: "Massa Macarronete Riscado Nacional", kind: "massa", why: "Dry pasta. Same barcode as Auchan 15678." },
  { batch: 10, store: "CONTINENTE", id: "2004021", name: "Bebida de Cereais Cevada, Chicória e Centeio Pensal Brasa", kind: "bebida-cereais", why: "A cereal coffee substitute." },
  { batch: 10, store: "CONTINENTE", id: "2004430", name: "Farinha de Milho Espiga", kind: "farinha", why: "Maize flour (fubá, flocão). Same barcode as Auchan 36798." },
  { batch: 10, store: "CONTINENTE", id: "2004579", name: "Cornichons Hengstenberg", kind: "pepino", why: "Gherkins." },
  { batch: 10, store: "CONTINENTE", id: "2004718", name: "Bebida Cereais Cevada e Chicória com Café Tofina", kind: "bebida-cereais", why: "A cereal coffee substitute." },
  { batch: 10, store: "CONTINENTE", id: "2004805", name: "Nestum Mel Flocos Cereais +3A", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "2084071", name: "Cavala Inteira em Tomate Manná", kind: "cavala", why: "As its name says. Same barcode as Auchan 397375." },
  { batch: 10, store: "CONTINENTE", id: "2235444", name: "Café Solúvel Gold Mocha Nescafé", kind: null, why: "Cappuccino mix in sticks, not coffee. Same barcode as Auchan 3865894." },
  { batch: 10, store: "CONTINENTE", id: "2298035", name: "Queijinho Chocolate Infantil Nesquik", kind: "iogurte", why: "Children's petit-suisse, as the other store has them: compared with yoghurts, not cheese." },
  { batch: 10, store: "CONTINENTE", id: "2611866", name: "Flocos Cevada Integral Tostados Salutem", kind: "cereais", why: "Oat or barley flakes." },
  { batch: 10, store: "CONTINENTE", id: "2665104", name: "Massa Macarrão Grande Riscado Milaneza", kind: "massa", why: "Dry pasta. Same barcode as Auchan 523363." },
  { batch: 10, store: "CONTINENTE", id: "2665109", name: "Massa Macarronete Penne Grande Riscado Milaneza", kind: "massa", why: "Dry pasta. Same barcode as Auchan 523368." },
  { batch: 10, store: "CONTINENTE", id: "2963819", name: "Flocos Cevada Seara", kind: "cereais", why: "Oat or barley flakes." },
  { batch: 10, store: "CONTINENTE", id: "3073598", name: "Reduz Colesterol Líquido Natural Danacol Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "3646753", name: "Infusão Tília Saquetas Tetley", kind: "infusao", why: "Herbal infusions." },
  { batch: 10, store: "CONTINENTE", id: "3802134", name: "Preparado para Sopa Juliana Continente", kind: null, why: "A vegetable mix for soup, not cabbage." },
  { batch: 10, store: "CONTINENTE", id: "3815053", name: "Água com Gás Groselha Frize", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water. Same barcode as Auchan 783859." },
  { batch: 10, store: "CONTINENTE", id: "3869325", name: "Cápsulas de Chocolate Quente Chococino Nescafé Dolce Gusto", kind: null, why: "Chocolate or tea capsules, not coffee. Same barcode as Auchan 2627400." },
  { batch: 10, store: "CONTINENTE", id: "3897404", name: "Delícias do Mar em Forma de Lagosta Ultracongeladas Pescanova", kind: "delicias-do-mar", why: "As its name says. Same barcode as Auchan 865031." },
  { batch: 10, store: "CONTINENTE", id: "4049455", name: "Tomate para Pizza Mutti", kind: "molho-tomate", why: "Mutti pizza sauce, as Auchan has it." },
  { batch: 10, store: "CONTINENTE", id: "4117681", name: "Ketchup com Redução de Sal Top Down Heinz", kind: "ketchup", why: "Ketchup. Same barcode as Auchan 2133208." },
  { batch: 10, store: "CONTINENTE", id: "4273558", name: "Infusão Nº6 sem Barriga Saquetas Cem Porcento", kind: "infusao", why: "Herbal infusions." },
  { batch: 10, store: "CONTINENTE", id: "4273571", name: "Infusão Nº5 Emagress Plus Saquetas Cem Porcento", kind: "infusao", why: "Herbal infusions." },
  { batch: 10, store: "CONTINENTE", id: "4273616", name: "Sementes de Abóbora Cem Porcento", kind: "semente-abobora", why: "As its name says. Same barcode as Auchan 2130843." },
  { batch: 10, store: "CONTINENTE", id: "4297831", name: "Amendoim no Forno Matutano", kind: "amendoim", why: "Roasted peanuts. Same barcode as Auchan 917061." },
  { batch: 10, store: "CONTINENTE", id: "4304010", name: "Snacks de Tortilha Milho Sabor Mexicano Zanuy", kind: null, why: "Tortilla chips, a snack." },
  { batch: 10, store: "CONTINENTE", id: "4377808", name: "Queijinho Polpa Morango Infantil Danonino Danone", kind: "iogurte", why: "Children's petit-suisse, as the other store has them: compared with yoghurts, not cheese." },
  { batch: 10, store: "CONTINENTE", id: "4507615", name: "Tempero com Sal para Carne Casa Pontinha", kind: null, why: "A seasoning with salt, not salt." },
  { batch: 10, store: "CONTINENTE", id: "4507739", name: "Tempero com Sal para Churrasco Casa Pontinha", kind: null, why: "A seasoning with salt, not salt." },
  { batch: 10, store: "CONTINENTE", id: "4540435", name: "Cápsulas de Achocolatado Nesquik Nescafé Dolce Gusto", kind: null, why: "Chocolate or tea capsules, not coffee. Same barcode as Auchan 1033595." },
  { batch: 10, store: "CONTINENTE", id: "4586032", name: "Molho Suculento Entrecosto no Forno com Alho e Pimentão Doce em Saqueta Maggi", kind: null, why: "A seasoning for the oven. Same barcode as Auchan 1005136." },
  { batch: 10, store: "CONTINENTE", id: "4613225", name: "Infusão Regulax Saquetas Forma+", kind: "infusao", why: "Herbal infusions." },
  { batch: 10, store: "CONTINENTE", id: "4695123", name: "Tomate Triturado Guloso", kind: "tomate", why: "Crushed tomato; the same at Auchan becomes tomato too." },
  { batch: 10, store: "CONTINENTE", id: "4706912", name: "Creme de Marisco Knorr", kind: "sopa-instantanea", why: "Dried soup mix (Knorr), as the other store has it. Same barcode as Auchan 1034430." },
  { batch: 10, store: "CONTINENTE", id: "4714200", name: "Amendoim Tostado com Sal e Mel Matutano", kind: "amendoim", why: "Roasted peanuts. Same barcode as Auchan 1039028." },
  { batch: 10, store: "CONTINENTE", id: "4725995", name: "Barrinhas de Pescada Ómega 3 Pescanova", kind: "douradinho", why: "Fish fingers and similar." },
  { batch: 10, store: "CONTINENTE", id: "4737793", name: "Bebida Cereais Chicória com Café Ricoré", kind: "bebida-cereais", why: "A cereal coffee substitute." },
  { batch: 10, store: "CONTINENTE", id: "4865289", name: "Reduz Colesterol Líquido Morango Danacol Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "4879485", name: "Creme de Cogumelos Selvagens Gourmet Knorr", kind: "sopa-instantanea", why: "Dried soup mix (Knorr), as the other store has it. Same barcode as Auchan 1082133." },
  { batch: 10, store: "CONTINENTE", id: "4902612", name: "Passata de Tomate com Manjerição e Oregãos Guloso", kind: "molho-tomate", why: "A seasoned passata, a tomato sauce. Same barcode as Auchan 1093253." },
  { batch: 10, store: "CONTINENTE", id: "4947901", name: "Nestum 5 Cereais com Cereais Integrais +3A", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "4951933", name: "Defesas Líquido Morango Actimel Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "4951989", name: "Defesas Líquido Tutti Frutti Actimel Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "4951998", name: "Defesas Líquido Magro Natural Actimel Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "4953629", name: "Leite de Crescimento Júnior 1-3A Aptamil", kind: null, why: "A flavoured milk drink or growing-up milk, not milk." },
  { batch: 10, store: "CONTINENTE", id: "4956521", name: "Defesas Líquido Morango Actimel Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "4961652", name: "Nestum Mel com Cereais Integrais +3A", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "4988569", name: "Farinha para Creme Custard Baunilha Condi", kind: null, why: "Custard powder, sago, an infant cereal or tapioca, not flour. Same barcode as Auchan 1127712." },
  { batch: 10, store: "CONTINENTE", id: "4997140", name: "Farinha Fuba de Milho Nacional", kind: "farinha", why: "Maize flour (fubá, flocão). Same barcode as Auchan 1035830." },
  { batch: 10, store: "CONTINENTE", id: "5009656", name: "Boqueirão em Azeite Virgem Extra Lorea", kind: "anchova", why: "Anchovies in olive oil." },
  { batch: 10, store: "CONTINENTE", id: "5020771", name: "Argolas do Mar Ultracongeladas Pescanova", kind: "refeicao", why: "A ready meal. Same barcode as Auchan 2143557." },
  { batch: 10, store: "CONTINENTE", id: "5025117", name: "Queijinho Polpa Morango Maxi Infantil Danonino Danone", kind: "iogurte", why: "Children's petit-suisse, as the other store has them: compared with yoghurts, not cheese." },
  { batch: 10, store: "CONTINENTE", id: "5031522", name: "Fiambre de Peito de Peru Forno de Lenha Fatiado Campofrio", kind: "fiambre", why: "Sliced turkey or chicken breast (fiambre). Same barcode as Auchan 1136889." },
  { batch: 10, store: "CONTINENTE", id: "5031534", name: "Fiambre de Peito de Frango Forno de Lenha Fatiado Campofrio", kind: "fiambre", why: "Sliced turkey or chicken breast (fiambre). Same barcode as Auchan 1136892." },
  { batch: 10, store: "CONTINENTE", id: "5038755", name: "Creme de Marisco Knorr", kind: "sopa-instantanea", why: "Dried soup mix (Knorr), as the other store has it. Same barcode as Auchan 1136808." },
  { batch: 10, store: "CONTINENTE", id: "5047856", name: "Cápsulas de Chá Marrakech Tea Nescafé Dolce Gusto", kind: null, why: "Chocolate or tea capsules, not coffee. Same barcode as Auchan 1141216." },
  { batch: 10, store: "CONTINENTE", id: "5048524", name: "Molho Suculento Frango no Forno Barbecue em Saqueta Maggi", kind: null, why: "A seasoning mix, not a barbecue sauce. Same barcode as Auchan 3706717." },
  { batch: 10, store: "CONTINENTE", id: "5125256", name: "Alho e Ervas Aromáticas em Frasco Margão", kind: null, why: "A seasoning mix, not garlic. Same barcode as Auchan 1162140." },
  { batch: 10, store: "CONTINENTE", id: "5129565", name: "Maçã Verde Desidratada Fruut", kind: null, why: "Dried apple snack, not apples. Same barcode as Auchan 1184200." },
  { batch: 10, store: "CONTINENTE", id: "5129567", name: "Maçã Vermelha Desidratada Fruut", kind: null, why: "Dried apple snack, not apples. Same barcode as Auchan 1186579." },
  { batch: 10, store: "CONTINENTE", id: "5302685", name: "Maçã Vermelha Desidratada Sabor a Canela Fruut", kind: null, why: "Dried apple snack, not apples. Same barcode as Auchan 1197408." },
  { batch: 10, store: "CONTINENTE", id: "5418196", name: "Farelo de Aveia Cem Porcento", kind: "cereais", why: "Oat or barley flakes." },
  { batch: 10, store: "CONTINENTE", id: "5465212", name: "Cesto de 3 Queijos Curados Montiqueijo", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "5615869", name: "Sopa Miso Instantânea Blue Dragon", kind: "sopa-instantanea", why: "Instant miso soup." },
  { batch: 10, store: "CONTINENTE", id: "5637232", name: "Cápsulas de Cevada Cereais Pure Delta Q", kind: null, why: "Barley capsules, not coffee." },
  { batch: 10, store: "CONTINENTE", id: "5702425", name: "Nabiça Continente", kind: null, why: "Turnip greens (nabiça), not cabbage." },
  { batch: 10, store: "CONTINENTE", id: "5709291", name: "Defesas Líquido Magro Morango Actimel Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "5719935", name: "Bimi", kind: null, why: "Bimi (tenderstem broccoli), compared with ordinary cabbage." },
  { batch: 10, store: "CONTINENTE", id: "5779749", name: "Infusão Hibisco Saquetas Cem Porcento", kind: "infusao", why: "Herbal infusions." },
  { batch: 10, store: "CONTINENTE", id: "5804735", name: "Massa Espirais Wok Milaneza", kind: "massa", why: "Dry pasta. Same barcode as Auchan 2226276." },
  { batch: 10, store: "CONTINENTE", id: "5809237", name: "Bifidus Pedaços Aveia e Noz Activia Danone", kind: "bifidus", why: "Activia bifidus, as Continente has it. Same barcode as Auchan 2230218." },
  { batch: 10, store: "CONTINENTE", id: "5818170", name: "Polpa Tomate Passata Valfrutta", kind: "polpa-tomate", why: "Passata. Same barcode as Auchan 2440941." },
  { batch: 10, store: "CONTINENTE", id: "5822138", name: "Flocos Aveia com Mel Cem Porcento", kind: "cereais", why: "Oat or barley flakes." },
  { batch: 10, store: "CONTINENTE", id: "5893654", name: "Barrinhas de Salmão sem Glúten Pescanova", kind: "douradinho", why: "Fish fingers and similar." },
  { batch: 10, store: "CONTINENTE", id: "5907390", name: "Nestum Bolacha Maria +3A", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "5948645", name: "Empanadilha Cogumelos Veggis", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "5979826", name: "Tostas de Cacau Biológicas sem Glúten Le Pain Fleurs", kind: "tosta", why: "Toasts." },
  { batch: 10, store: "CONTINENTE", id: "6191880", name: "Leite Meio Gordo com Chocolate Shake Nesquik", kind: null, why: "A flavoured milk drink or growing-up milk, not milk." },
  { batch: 10, store: "CONTINENTE", id: "6242486", name: "Molho Piri-Piri Sacana Ai-Ai Paladin", kind: "piri-piri", why: "Piri-piri sauce. Same barcode as Auchan 2484409." },
  { batch: 10, store: "CONTINENTE", id: "6284505", name: "Massa Tagliatelle Rummo", kind: "massa", why: "Dry pasta. Same barcode as Auchan 4044597." },
  { batch: 10, store: "CONTINENTE", id: "6404017", name: "Bifidus Cremoso Lima e Limão Activia Danone", kind: "bifidus", why: "Activia bifidus, as Continente has it. Same barcode as Auchan 2151301." },
  { batch: 10, store: "CONTINENTE", id: "6404094", name: "Caril em Pó Picante Sharwood's", kind: "caril", why: "As its name says. Same barcode as Auchan 3297032." },
  { batch: 10, store: "CONTINENTE", id: "6447738", name: "Pasta Tomate e Mozzarella Pot Knorr", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "6536239", name: "Miolo de Gambão 20/40 Ultracongelado Pescanova", kind: "camarao", why: "As its name says." },
  { batch: 10, store: "CONTINENTE", id: "6545213", name: "Massa Macarrão Penne Integral com Aveia Milaneza", kind: "massa", why: "Dry pasta. Same barcode as Auchan 2933378." },
  { batch: 10, store: "CONTINENTE", id: "6557350", name: "Bebida Cereais e Fibra Solúvel Delta", kind: "bebida-cereais", why: "A cereal coffee substitute." },
  { batch: 10, store: "CONTINENTE", id: "6581744", name: "Infusão Camomila Saquetas Cem Porcento", kind: "infusao", why: "Herbal infusions." },
  { batch: 10, store: "CONTINENTE", id: "6582007", name: "Infusão Detox Saquetas Cem Porcento", kind: "infusao", why: "Herbal infusions." },
  { batch: 10, store: "CONTINENTE", id: "6588552", name: "Veggie Bowls de Quinoa e Abóbora Iglo Green Cuisine", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "6588553", name: "Veggie Bowls de Trigo Sarraceno Iglo Green Cuisine", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "6593381", name: "Papa Infantil Farinha com Cacau e Alfarroba +3A Pensal", kind: null, why: "Custard powder, sago, an infant cereal or tapioca, not flour." },
  { batch: 10, store: "CONTINENTE", id: "6691001", name: "Reduz Colesterol Líquido Aveia Danacol Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "6841388", name: "Maçã Desidratada e Amendoim Fruut", kind: null, why: "Dried apple snack, not apples. Same barcode as Auchan 2966921." },
  { batch: 10, store: "CONTINENTE", id: "6841391", name: "Maçã, Amêndoas e Coco Desidratado Fruut", kind: null, why: "Dried apple snack, not apples. Same barcode as Auchan 2966923." },
  { batch: 10, store: "CONTINENTE", id: "6858086", name: "Espelta Expandida Seara", kind: "cereais", why: "Oat or barley flakes." },
  { batch: 10, store: "CONTINENTE", id: "6890297", name: "Água com Gás Maracujá Pedras Salgadas", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water. Same barcode as Auchan 2999349." },
  { batch: 10, store: "CONTINENTE", id: "6892400", name: "Proteína Líquida Baunilha Bolacha Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "6892594", name: "Proteína Líquida Morango e Framboesa Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "6909669", name: "Nestum Mel Zero +3A", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "6909794", name: "Nestum Espelta e Aveia Zero +3A", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "6917654", name: "Noodles Demae Ramen Galinha Nissin", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026)." },
  { batch: 10, store: "CONTINENTE", id: "6917660", name: "Noodles Clássico Soba Cup Nissin", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026)." },
  { batch: 10, store: "CONTINENTE", id: "6917664", name: "Noodles Teriyaki Soba Pot Nissin", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026)." },
  { batch: 10, store: "CONTINENTE", id: "6917671", name: "Noodles Yakitori Galinha Soba Cup Nissin", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026)." },
  { batch: 10, store: "CONTINENTE", id: "6917858", name: "Muxama de Atum Ficolumé", kind: null, why: "Cured tuna loin (muxama), a deli product." },
  { batch: 10, store: "CONTINENTE", id: "6957306", name: "Nestum Arroz Zero +3A sem Glúten", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "6993198", name: "Reduz Colesterol Líquido Noz Danacol Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7004285", name: "Couscous Marroquino sem Sal Adicionado Trevijano", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "7004287", name: "Couscous Mediterrâneo sem Sal Adicionado Trevijano", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "7011629", name: "Nuggets Proteína Vegetal Garden Gourmet", kind: "nugget", why: "Vegetarian nuggets, as Continente has them. Same barcode as Auchan 3056983." },
  { batch: 10, store: "CONTINENTE", id: "7011814", name: "Hambúrguer Clássico de Proteína Vegetal Garden Gourmet", kind: "hamburguer", why: "Vegetable burger, as Continente has it. Same barcode as Auchan 3057262." },
  { batch: 10, store: "CONTINENTE", id: "7011815", name: "Almôndegas Proteína Vegetal Garden Gourmet", kind: "almondega", why: "Vegetarian meatballs, as Continente has them. Same barcode as Auchan 3057280." },
  { batch: 10, store: "CONTINENTE", id: "7058413", name: "Canela em Pau em Frasco Margão", kind: "canela", why: "As its name says. Same barcode as Auchan 446519." },
  { batch: 10, store: "CONTINENTE", id: "7067804", name: "Bebida Solúvel Chicória e Café Delta", kind: "bebida-cereais", why: "A cereal coffee substitute." },
  { batch: 10, store: "CONTINENTE", id: "7069757", name: "Pescoços de Frango Continente", kind: "frango", why: "As its name says." },
  { batch: 10, store: "CONTINENTE", id: "7069759", name: "Corações de Frango Continente", kind: "frango", why: "As its name says." },
  { batch: 10, store: "CONTINENTE", id: "7072281", name: "Esparregado Cozinha Continente", kind: "refeicao", why: "A ready meal (Cozinha Continente)." },
  { batch: 10, store: "CONTINENTE", id: "7090521", name: "Veggie Bowls de Couscous Iglo Green Cuisine", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "7099670", name: "Água com Gás Tangerina Pedras Salgadas", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water. Same barcode as Auchan 3170586." },
  { batch: 10, store: "CONTINENTE", id: "7141380", name: "Moinho Pimentas do Chefe em Frasco Margão", kind: "pimenta", why: "A pepper mix." },
  { batch: 10, store: "CONTINENTE", id: "7146478", name: "Água com Gás Maracujá Frize", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water. Same barcode as Auchan 3205130." },
  { batch: 10, store: "CONTINENTE", id: "7162649", name: "Fiambre Peito de Peru Forno a Lenha Izidoro", kind: "fiambre", why: "Sliced turkey or chicken breast (fiambre). Same barcode as Auchan 3785856." },
  { batch: 10, store: "CONTINENTE", id: "7162650", name: "Fiambre Peito de Frango Forno a Lenha Izidoro", kind: "fiambre", why: "Sliced turkey or chicken breast (fiambre). Same barcode as Auchan 3785757." },
  { batch: 10, store: "CONTINENTE", id: "7164232", name: "Caldo para Esparguete à Bolonhesa em Saqueta Knorr", kind: null, why: "A seasoning kit, not stock. Same barcode as Auchan 3199732." },
  { batch: 10, store: "CONTINENTE", id: "7181969", name: "Leite Achocolatado sem Açúcar Cacaolat", kind: null, why: "A flavoured milk drink or growing-up milk, not milk." },
  { batch: 10, store: "CONTINENTE", id: "7182219", name: "Proteína Baunilha Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7182223", name: "Proteína Manteiga de Amendoim e Banana Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7182224", name: "Proteína Mirtilo Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7198182", name: "Strogonoff de Peru com Cogumelos e Arroz Cozinha Continente", kind: "refeicao", why: "Turkey stroganoff with rice, a ready meal." },
  { batch: 10, store: "CONTINENTE", id: "7239017", name: "Caldo de Chili com Carne em Saqueta Knorr", kind: null, why: "A seasoning kit, not stock. Same barcode as Auchan 3234373." },
  { batch: 10, store: "CONTINENTE", id: "7239338", name: "Miolo de Camarão Panado Ultracongelado Pescanova", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "7268349", name: "Bolachas Originais Wasa", kind: "tosta", why: "Crispbread and toasted bread slices, as the other store has them. Same barcode as Auchan 600961." },
  { batch: 10, store: "CONTINENTE", id: "7285962", name: "Farinha de Mandioca Sagu sem Glúten Yoki", kind: null, why: "Custard powder, sago, an infant cereal or tapioca, not flour. Same barcode as Auchan 3207073." },
  { batch: 10, store: "CONTINENTE", id: "7286806", name: "Farinha de Mandioca Fubá sem Glúten Yoki", kind: "farinha", why: "Maize flour (fubá, flocão). Same barcode as Auchan 2111699." },
  { batch: 10, store: "CONTINENTE", id: "7286819", name: "Farinha de Trigo para Kibe Yoki", kind: null, why: "Wheat for kibbeh. Same barcode as Auchan 634015." },
  { batch: 10, store: "CONTINENTE", id: "7298540", name: "Especialidade de Tofu Lata 8 un sem Glúten Nobre Vegalia", kind: "salsicha", why: "Tofu sausages." },
  { batch: 10, store: "CONTINENTE", id: "7304955", name: "Bifidus Cremoso Magro Frutos Silvestres Activia Danone", kind: "bifidus", why: "Activia bifidus, as Continente has it. Same barcode as Auchan 3250149." },
  { batch: 10, store: "CONTINENTE", id: "7340543", name: "Argolas do Mar Ultracongeladas Pescanova", kind: "refeicao", why: "A ready meal. Same barcode as Auchan 3421688." },
  { batch: 10, store: "CONTINENTE", id: "7363515", name: "Puré de Batata Cebola e Bacon Pot Knorr", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "7371056", name: "Noodles Pasta Oriental Fusion XXL Frango Maggi", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026)." },
  { batch: 10, store: "CONTINENTE", id: "7377384", name: "Preparado para Creme de Couve Flor e Cenoura Continente", kind: null, why: "A vegetable mix for soup, not cabbage." },
  { batch: 10, store: "CONTINENTE", id: "7380483", name: "Granola Proteína Chocolate e Avelãs Prozis", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "7382990", name: "Bolacha Crisp Bread Queijo,Tomate e Alho Salutem", kind: "tosta", why: "Crispbread. Same barcode as Auchan 3308861." },
  { batch: 10, store: "CONTINENTE", id: "7383016", name: "Proteína Líquida Manga Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7383018", name: "Proteína Líquida Coco Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7403557", name: "Porções de Bacalhau MSC Fresco", kind: "bacalhau", why: "Fresh cod portions." },
  { batch: 10, store: "CONTINENTE", id: "7404775", name: "Barrinhas de Pescada sem Glúten Pescanova", kind: "douradinho", why: "Fish fingers and similar." },
  { batch: 10, store: "CONTINENTE", id: "7405533", name: "Bebida Cereais Chicória com Café Delta", kind: "bebida-cereais", why: "A cereal coffee substitute." },
  { batch: 10, store: "CONTINENTE", id: "7409959", name: "Filetes Recheados Tomate & Mozzarella Iglo", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "7409960", name: "Filetes Recheados Espinafres Iglo", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "7411370", name: "Bifidus Líquido Cereais Integrais Activia Danone", kind: "bifidus", why: "Activia bifidus, as Continente has it. Same barcode as Auchan 3341312." },
  { batch: 10, store: "CONTINENTE", id: "7411371", name: "Bifidus Líquido Triplo 0% Frutos Silvestres sem Lactose Activia Danone", kind: "bifidus", why: "Activia bifidus, as Continente has it. Same barcode as Auchan 3341309." },
  { batch: 10, store: "CONTINENTE", id: "7411504", name: "Farinha Panko Kikkoman", kind: "pao-ralado", why: "Panko breadcrumbs. Same barcode as Auchan 3339848." },
  { batch: 10, store: "CONTINENTE", id: "7421259", name: "Pimenta Cayenne com Moinho em Frasco Margão", kind: null, why: "Cayenne or chilli pepper, not black pepper. Same barcode as Auchan 3365412." },
  { batch: 10, store: "CONTINENTE", id: "7424570", name: "Granola Proteica Frutos do Bosque Prozis", kind: "cereais", why: "A protein granola, as the one at Auchan was verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "7424590", name: "Caldo Verde Pack Poupança Continente", kind: "couve", why: "Shredded cabbage for caldo verde." },
  { batch: 10, store: "CONTINENTE", id: "7426276", name: "Nestum Mel e Cereais Integrais +3A", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "7430426", name: "Snacks Tortilha Chips Queijo Mister Free'd", kind: null, why: "Tortilla chips, a snack." },
  { batch: 10, store: "CONTINENTE", id: "7430427", name: "Snacks Tortilha Chips Abacate Mister Free'd", kind: null, why: "Tortilla chips, a snack." },
  { batch: 10, store: "CONTINENTE", id: "7458547", name: "Reduz Colesterol Líquido Frutos Exóticos Danacol Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7461729", name: "Muesli Proteína Chocolate Prozis", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "7475399", name: "Rabos de Pescada Fresca", kind: "pescada", why: "Fresh hake tails." },
  { batch: 10, store: "CONTINENTE", id: "7479987", name: "Bagels Clássico New York Bakery", kind: "pao", why: "Bagels." },
  { batch: 10, store: "CONTINENTE", id: "7479990", name: "Bagels Sementes New York Bakery", kind: "pao", why: "Bagels." },
  { batch: 10, store: "CONTINENTE", id: "7481162", name: "Lombos de Bacalhau 4 Meses de Cura MSC Congelado Riberalves", kind: "bacalhau", why: "Cod loins. Same barcode as Auchan 3555801." },
  { batch: 10, store: "CONTINENTE", id: "7497341", name: "Defesas Líquido Magro Natural Actimel Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7522377", name: "Bifidus Pedaços Magro Chia e Amêndoa Activia Danone", kind: "bifidus", why: "Activia bifidus, as Continente has it. Same barcode as Auchan 3433085." },
  { batch: 10, store: "CONTINENTE", id: "7527067", name: "Tábua Clássica 3 Queijos Santiago", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "7527068", name: "Tábua de Sabores 3 Queijos Santiago", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "7546554", name: "Água com Gás Ananás Frize", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water. Same barcode as Auchan 3481150." },
  { batch: 10, store: "CONTINENTE", id: "7554421", name: "Nestum Mel Flocos Cereais +3A", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "7578233", name: "Bacalhau à Brás Riberalves", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "7591765", name: "Proteína Líquida Stracciatella Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7591767", name: "Proteína Líquida Pêssego e Maracujá Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7594144", name: "Mirtilos Origens Bio", kind: "mirtilo", why: "Frozen blueberries. Same barcode as Auchan 3474247." },
  { batch: 10, store: "CONTINENTE", id: "7609578", name: "Bifidus Pedaços Aveia e Noz Activia Danone", kind: "bifidus", why: "Activia bifidus, as Continente has it. Same barcode as Auchan 3365427." },
  { batch: 10, store: "CONTINENTE", id: "7614615", name: "Filetes de Red Fish Descongelado", kind: "red-fish", why: "Redfish fillets." },
  { batch: 10, store: "CONTINENTE", id: "7618383", name: "Mini Vol-au-vent 3 Toques", kind: "folhado", why: "As its name says." },
  { batch: 10, store: "CONTINENTE", id: "7621550", name: "Noodles Demae Ramen Caril Japonês Nissin", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026)." },
  { batch: 10, store: "CONTINENTE", id: "7624295", name: "Bebida com Leite Frappuccino Starbucks", kind: null, why: "A flavoured milk drink or growing-up milk, not milk. Same barcode as Auchan 4062519." },
  { batch: 10, store: "CONTINENTE", id: "7636421", name: "Molho Arrabbiata Barilla", kind: "molho-tomate", why: "Tomato sauce." },
  { batch: 10, store: "CONTINENTE", id: "7646228", name: "Proteína Morango Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7646271", name: "Tiras de Frango Panado Pescanova", kind: "nugget", why: "Breaded chicken strips." },
  { batch: 10, store: "CONTINENTE", id: "7648620", name: "Caldeirada de Bacalhau MSC Congelado Riberalves", kind: "bacalhau", why: "Cod stew; the same product at Continente was verified as cod (kind-gold). Same barcode as Auchan 3528527." },
  { batch: 10, store: "CONTINENTE", id: "7649329", name: "Bifidus Fibra Pedaços Cereais Activia Danone", kind: "bifidus", why: "Activia bifidus, as Continente has it. Same barcode as Auchan 3553560." },
  { batch: 10, store: "CONTINENTE", id: "7679951", name: "Tábua Seleção 3 Queijos Santiago", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "7706617", name: "Lombo de Porco com Molho Cozinha Continente", kind: "refeicao", why: "A cooked pork dish (Cozinha Continente), a ready meal." },
  { batch: 10, store: "CONTINENTE", id: "7721576", name: "Bacalhau Espiritual Cozinha Continente", kind: "refeicao", why: "A ready meal (Cozinha Continente)." },
  { batch: 10, store: "CONTINENTE", id: "7721679", name: "Tesourinhos de Peixe Capitão Iglo", kind: "douradinho", why: "Fish fingers and similar." },
  { batch: 10, store: "CONTINENTE", id: "7721907", name: "Molho Bolonhesa Guloso", kind: "molho-tomate", why: "Tomato sauce." },
  { batch: 10, store: "CONTINENTE", id: "7721962", name: "Passata de Tomate, Cebola e Alho Guloso", kind: "molho-tomate", why: "A seasoned passata (onion and garlic), as Auchan has it." },
  { batch: 10, store: "CONTINENTE", id: "7739862", name: "Feijão Verde Extra Fino Bonduelle", kind: "feijao-verde", why: "Green beans in a jar." },
  { batch: 10, store: "CONTINENTE", id: "7760299", name: "Proteína Framboesa Lindahls", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7760300", name: "Proteína Stracciatella Lindahls", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7760398", name: "Proteína Pêssego e Maracujá Lindahls", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7760399", name: "Proteína Morango e Lima Lindahls", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7760400", name: "Proteína Limão e Cookies Lindahls", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7760402", name: "Proteína Líquida Mirtilo Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7771359", name: "Proteína Líquida Melancia e Limão Lindahls", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7771362", name: "Proteína Líquida Morango Lindahls", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7775145", name: "Nestum Chocolate Zero +3A", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "7775184", name: "Molho Pesto Rosso Barilla", kind: "pesto", why: "Pesto rosso." },
  { batch: 10, store: "CONTINENTE", id: "7776451", name: "Massa Mezze Maniche Rigate Milaneza", kind: "massa", why: "Dry pasta. Same barcode as Auchan 3500085." },
  { batch: 10, store: "CONTINENTE", id: "7779515", name: "Tábua de Queijos de Vaca Especiarias Paiva", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "7779516", name: "Tábua de Queijos de Vaca, Ovelha e Cabra Paiva", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "7790027", name: "Bebida Cereais Cevada e Chicória com Café Mistura Peninsular Torrada Moída Delta", kind: "bebida-cereais", why: "A cereal-and-coffee blend; Continente shelves it with cereal drinks." },
  { batch: 10, store: "CONTINENTE", id: "7790029", name: "Bebida Cereais Cevada e Chicória com Café Mistura Ibérica Torrada Moída Delta", kind: "bebida-cereais", why: "A cereal-and-coffee blend; Continente shelves it with cereal drinks." },
  { batch: 10, store: "CONTINENTE", id: "7798957", name: "Flocão de Milho Sinhá", kind: "farinha", why: "Maize flour (fubá, flocão)." },
  { batch: 10, store: "CONTINENTE", id: "7801615", name: "Creme para Barrar Vegan Philadelphia", kind: null, why: "A vegan spread." },
  { batch: 10, store: "CONTINENTE", id: "7803475", name: "Noodles Demae Ramen Miso Nissin", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026)." },
  { batch: 10, store: "CONTINENTE", id: "7803489", name: "Noodles Chilli Soba Cup Nissin", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026)." },
  { batch: 10, store: "CONTINENTE", id: "7805851", name: "Bifes de Frango Panados Segredos d'Aldeia", kind: null, why: "Breaded chicken steaks, compared with raw chicken breast." },
  { batch: 10, store: "CONTINENTE", id: "7822657", name: "Redondos de Pescada da Argentina Ultracongelados", kind: "pescada", why: "Hake medallions." },
  { batch: 10, store: "CONTINENTE", id: "7829329", name: "Tábua de Queijos DOP 4 Curas São Jorge", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "7837642", name: "Tostas com Azeitona e Alecrim Snatt's", kind: "tosta", why: "Toasts." },
  { batch: 10, store: "CONTINENTE", id: "7837645", name: "Tostas de Tomate e Ervas Finas Snatt's", kind: "tosta", why: "Toasts." },
  { batch: 10, store: "CONTINENTE", id: "7843136", name: "Manteiga Magra sem Lactose Matinal", kind: null, why: "A dairy spread, not butter. Same barcode as Auchan 3665933." },
  { batch: 10, store: "CONTINENTE", id: "7853437", name: "Natas para Carne Mimosa", kind: null, why: "A cream sauce, not cooking cream. Same barcode as Auchan 3668589." },
  { batch: 10, store: "CONTINENTE", id: "7853460", name: "Natas para Massas Mimosa", kind: null, why: "A cream sauce, not cooking cream. Same barcode as Auchan 3668592." },
  { batch: 10, store: "CONTINENTE", id: "7856308", name: "Reduz Colesterol Líquido Aveia Danacol Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "7857323", name: "Bifidus Pedaços Magro Cereais Activia Danone", kind: "bifidus", why: "Activia bifidus, as Continente has it. Same barcode as Auchan 3670531." },
  { batch: 10, store: "CONTINENTE", id: "7889333", name: "Probiótico Magro Framboesa, Amêndoa e Sementes de Linhaça sem Lactose Mimosa", kind: "iogurte", why: "Mimosa probiotic yoghurt: yoghurt at both stores (the owner, 11 November 2026; it had been verified as bifidus at Continente). Same barcode as Auchan 3700061." },
  { batch: 10, store: "CONTINENTE", id: "7929409", name: "Peskitos de Pescada sem Glúten Pescanova", kind: "douradinho", why: "Fish fingers and similar." },
  { batch: 10, store: "CONTINENTE", id: "7943479", name: "Pescadinos de Pescada Panada sem Glúten Pescanova", kind: "douradinho", why: "Fish fingers and similar." },
  { batch: 10, store: "CONTINENTE", id: "7943897", name: "Tagliatelle Cogumelos Iglo", kind: "refeicao", why: "A ready meal. Same barcode as Auchan 3689594." },
  { batch: 10, store: "CONTINENTE", id: "7945201", name: "Maçã Vermelha Desidratada Sabor a Morango Fruut", kind: null, why: "Dried apple snack, not apples. Same barcode as Auchan 3741212." },
  { batch: 10, store: "CONTINENTE", id: "7969619", name: "Cesto de Queijos de Vaca Curados Herdade da Maia", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "7983938", name: "Bochechas de Porco com Puré Cozinha Continente", kind: "refeicao", why: "A ready meal (Cozinha Continente)." },
  { batch: 10, store: "CONTINENTE", id: "7991184", name: "Bacalhau com Natas Riberalves", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "7993764", name: "Lombos de Bacalhau MSC Fresco Continente", kind: "bacalhau", why: "Fresh cod loins." },
  { batch: 10, store: "CONTINENTE", id: "8005064", name: "Proteína Líquida Banana Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "8019930", name: "Água com Gás Laranja Frize", kind: "agua-sabor", why: "Orange-flavoured sparkling water, not plain water." },
  { batch: 10, store: "CONTINENTE", id: "8021781", name: "Molho de Soja Yakitori Kikkoman", kind: null, why: "Yakitori or ponzu sauce, not soy sauce. Same barcode as Auchan 2899186." },
  { batch: 10, store: "CONTINENTE", id: "8041386", name: "Proteína Líquida Morango Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "8048706", name: "Bifidus Líquido Triplo 0% Morango e Kiwi sem Lactose Activia Danone", kind: "bifidus", why: "Activia bifidus, as Continente has it. Same barcode as Auchan 3761253." },
  { batch: 10, store: "CONTINENTE", id: "8052401", name: "Nestum Morango Proteína", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "8052438", name: "Nestum Cereais Proteína", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "8067726", name: "Lombo de Porco com Molho para 4 Pessoas Cozinha Continente", kind: "refeicao", why: "A cooked pork dish (Cozinha Continente), a ready meal." },
  { batch: 10, store: "CONTINENTE", id: "8069977", name: "Barrinhas de Pescada sem Glúten Pescanova", kind: "douradinho", why: "Fish fingers and similar." },
  { batch: 10, store: "CONTINENTE", id: "8090611", name: "Queijinho Morango Suissinho Infantil Yoco", kind: "iogurte", why: "Children's petit-suisse, as the other store has them: compared with yoghurts, not cheese." },
  { batch: 10, store: "CONTINENTE", id: "8090612", name: "Queijinho Morango e Banana, Maçã e Pera, Pêssego e Alperce Suissinho Infantil Yoco", kind: "iogurte", why: "Children's petit-suisse, as the other store has them: compared with yoghurts, not cheese." },
  { batch: 10, store: "CONTINENTE", id: "8090664", name: "Fiambre de Peito de Peru Fatias Finas Izidoro", kind: "fiambre", why: "Sliced turkey or chicken breast (fiambre). Same barcode as Auchan 3785756." },
  { batch: 10, store: "CONTINENTE", id: "8118231", name: "Tiras Casca de Laranja Cristalizada Continente", kind: null, why: "Candied orange peel, not oranges." },
  { batch: 10, store: "CONTINENTE", id: "8123626", name: "Hambúrguer de Proteína Vegetal Heura", kind: "hamburguer", why: "As its name says. Same barcode as Auchan 3798485." },
  { batch: 10, store: "CONTINENTE", id: "8124256", name: "Massa Lasanha Nacional", kind: "massa", why: "Lasagne sheets." },
  { batch: 10, store: "CONTINENTE", id: "8126880", name: "Tábua de Queijos de Vaca Curados Alavão", kind: "queijo", why: "A cheese board, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "8154429", name: "Defesas Líquido Natural Infantil Actimel Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "8154443", name: "Defesas Líquido Laranja e Multifrutas Tripla Ação Actimel Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "8170036", name: "Almôndegas de Proteína Vegetal Garden Gourmet", kind: "almondega", why: "Vegetarian meatballs, as Continente has them. Same barcode as Auchan 3810347." },
  { batch: 10, store: "CONTINENTE", id: "8174334", name: "Proteína Baunilha Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "8174349", name: "Proteína Mirtilo Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "8175606", name: "Feijoada de Camarão Cozinha Continente", kind: "refeicao", why: "A ready dish with prawns, not prawns." },
  { batch: 10, store: "CONTINENTE", id: "8175617", name: "Feijoada de Camarão para 6 Pessoas Cozinha Continente", kind: "refeicao", why: "A ready dish with prawns, not prawns." },
  { batch: 10, store: "CONTINENTE", id: "8220728", name: "Especialidade de Tofu Frasco Nobre Vegalia", kind: "salsicha", why: "Tofu sausages." },
  { batch: 10, store: "CONTINENTE", id: "8296662", name: "Leite com Café e Caramelo com Proteína Starbucks", kind: null, why: "A coffee milk drink, not a plant milk." },
  { batch: 10, store: "CONTINENTE", id: "8366454", name: "Água com Gás Ananás Pedras Salgadas", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water. Same barcode as Auchan 3924610." },
  { batch: 10, store: "CONTINENTE", id: "8370846", name: "Cheesecake de Frutos Silvestres Cozinha Continente", kind: null, why: "A dessert (quindim, cheesecake), not a meal." },
  { batch: 10, store: "CONTINENTE", id: "8391026", name: "Proteína Ananás e Coco Lindahls", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "8414723", name: "Feijoada à Transmontana com Arroz Branco Cozinha Continente", kind: "refeicao", why: "A ready meal (feijoada with rice), not rice." },
  { batch: 10, store: "CONTINENTE", id: "8415025", name: "Wrap Trigo Integral Old El Paso", kind: "tortilha", why: "As its name says. Same barcode as Auchan 3048088." },
  { batch: 10, store: "CONTINENTE", id: "8428654", name: "Ovas de Bacalhau Cozidas Continente", kind: null, why: "Cooked cod roe, not cod." },
  { batch: 10, store: "CONTINENTE", id: "8428825", name: "Grão de Bico estilo Tagine Bonduelle", kind: "refeicao", why: "Chickpeas in a tagine sauce, a ready dish." },
  { batch: 10, store: "CONTINENTE", id: "8447163", name: "Bifidus Fibra Pedaços Cereais e Frutos Silvestres Activia Danone", kind: "bifidus", why: "Activia bifidus, as Continente has it. Same barcode as Auchan 3901018." },
  { batch: 10, store: "CONTINENTE", id: "8447873", name: "Proteína Morango Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "8447953", name: "Proteína Stracciatella Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "8447961", name: "Proteína Stracciatella Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "8448094", name: "Feijoada Brasileira com Arroz Branco Cozinha Continente", kind: "refeicao", why: "A ready meal (feijoada with rice), not rice." },
  { batch: 10, store: "CONTINENTE", id: "8470440", name: "Pedaços de Ananás em Caldo de Sumo Natural Continente", kind: "ananas", why: "Pineapple pieces in juice, a tin." },
  { batch: 10, store: "CONTINENTE", id: "8479528", name: "Ovas de Pescada Cozidas Continente", kind: null, why: "Cooked hake roe, not hake." },
  { batch: 10, store: "CONTINENTE", id: "8484721", name: "Filetes de Sardinha Congelada", kind: "sardinha", why: "Frozen sardine fillets." },
  { batch: 10, store: "CONTINENTE", id: "8485120", name: "Molho Alho Assado Hellmann's", kind: "maionese", why: "Garlic mayonnaise (Hellmann's). Same barcode as Auchan 3924754." },
  { batch: 10, store: "CONTINENTE", id: "8485273", name: "Kit Spaghetti Carbonara Rana", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "8485309", name: "Kit Butter Chicken com Arroz Rana", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "8504858", name: "Migas de Couve Portuguesa Cozinha Continente", kind: "refeicao", why: "A ready meal (Cozinha Continente)." },
  { batch: 10, store: "CONTINENTE", id: "8508510", name: "Moqueca de Camarão à Baiana com Arroz Branco Cozinha Continente", kind: "refeicao", why: "A ready dish with prawns, not prawns." },
  { batch: 10, store: "CONTINENTE", id: "8526628", name: "Miolo de Camarão Vannamei com Molho Bulhão Pato Boreal Artik", kind: "refeicao", why: "A ready dish with prawns, not prawns." },
  { batch: 10, store: "CONTINENTE", id: "8591076", name: "Proteína Natural Yopro Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "8596944", name: "Tenders de Peixe Fish and Chips Iglo", kind: "filete-panado", why: "As its name says." },
  { batch: 10, store: "CONTINENTE", id: "8596947", name: "Filetes de Peixe Iglo", kind: "filete-panado", why: "As its name says." },
  { batch: 10, store: "CONTINENTE", id: "8600126", name: "Café Cappuccino Intenso Stick Delta", kind: null, why: "Cappuccino mix in sticks, not coffee. Same barcode as Auchan 3942663." },
  { batch: 10, store: "CONTINENTE", id: "8600129", name: "Café Cappuccino Clássico Stick Delta", kind: null, why: "Cappuccino mix in sticks, not coffee. Same barcode as Auchan 3942668." },
  { batch: 10, store: "CONTINENTE", id: "8604474", name: "Base de Pizza Tradizionale Dr. Oetker", kind: null, why: "A pizza base." },
  { batch: 10, store: "CONTINENTE", id: "8614463", name: "Kefir Natural Nestlé   ", kind: "kefir", why: "Kefir." },
  { batch: 10, store: "CONTINENTE", id: "8650092", name: "Lunch Bowl Estilo Mexicano Bonduelle", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "8650126", name: "Lunch Bowl Estilo Oriental Bonduelle", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "8660056", name: "Nestum Cacau Proteína", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "8669045", name: "Carne Desfiada Sabor a Carne Vapza", kind: "refeicao", why: "A ready meal." },
  { batch: 10, store: "CONTINENTE", id: "8670165", name: "Tapioca Pronta Hidratada BeijuBom", kind: null, why: "Custard powder, sago, an infant cereal or tapioca, not flour." },
  { batch: 10, store: "CONTINENTE", id: "8674226", name: "Tiras de Bacon Monells", kind: "bacon", why: "Bacon strips." },
  { batch: 10, store: "CONTINENTE", id: "8676426", name: "Fusilli Courgete e Queijo Bonduelle", kind: "refeicao", why: "Frozen pasta with vegetables, a ready meal. Same barcode as Auchan 4062949." },
  { batch: 10, store: "CONTINENTE", id: "8676427", name: "Massa Penne com Curgete e Tomate Bonduelle", kind: "refeicao", why: "Frozen pasta with vegetables, a ready meal. Same barcode as Auchan 4062956." },
  { batch: 10, store: "CONTINENTE", id: "8708334", name: "Floretes de Brócolo Campotec", kind: "brocolo", why: "Broccoli florets." },
  { batch: 10, store: "CONTINENTE", id: "8716856", name: "Defesas Líquido Morango Kids Actimel Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "8718589", name: "Café Solúvel com Potássio, Magnésio, Extrato de Chá Verde, Canela e Cafeína Super Blends Delta", kind: "bebida-cereais", why: "Delta Super Blend soluble drinks, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "8718607", name: "Café Solúvel com Proteína Whey, Cacau e Canela Super Blends Delta", kind: "bebida-cereais", why: "Delta Super Blend soluble drinks, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "8718617", name: "Café Solúvel com Zinco Vitamina C, Cacau e Inulina Super Blends Delta", kind: "bebida-cereais", why: "Delta Super Blend soluble drinks, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "8757009", name: "Água com Gás Açaí Pedras Salgadas", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water. Same barcode as Auchan 4000786." },
  { batch: 10, store: "CONTINENTE", id: "8757665", name: "Creme de Couve Flor Cozinha Continente Equilíbrio", kind: "sopa", why: "Ready soup." },
  { batch: 10, store: "CONTINENTE", id: "8766338", name: "Erva-Mate Chimarrão Nativa Leão", kind: "cha", why: "As its name says." },
  { batch: 10, store: "CONTINENTE", id: "8772218", name: "Água com Gás S. Pellegrino", kind: "agua", why: "Plain sparkling mineral water." },
  { batch: 10, store: "CONTINENTE", id: "8773205", name: "Água sem Gás Maçã Luso Fruta", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water. Same barcode as Auchan 4021588." },
  { batch: 10, store: "CONTINENTE", id: "8780721", name: "Nestum Zero Maçã e Arroz", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "8780722", name: "Nestum Mel Zero +3A", kind: "cereais", why: "Nestum flakes or a protein granola, as the same products at Auchan were verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "8783033", name: "Batido Chocolate Refeição Completa Yfood", kind: "batido", why: "A meal-replacement shake, as the other store has it. Same barcode as Auchan 4013695." },
  { batch: 10, store: "CONTINENTE", id: "8783034", name: "Batido Framboesa Refeição Completa Yfood", kind: "batido", why: "A meal-replacement shake, as the other store has it. Same barcode as Auchan 4013693." },
  { batch: 10, store: "CONTINENTE", id: "8783435", name: "Batido Café Refeição Completa Yfood", kind: "batido", why: "A meal-replacement shake, as the other store has it. Same barcode as Auchan 4013694." },
  { batch: 10, store: "CONTINENTE", id: "8785105", name: "Linguiça Vegan Proteína de Ervilha AlterVego", kind: null, why: "A plant-based deli slice. Same barcode as Auchan 3998320." },
  { batch: 10, store: "CONTINENTE", id: "8785119", name: "Fatias Vegetais Estilo Mortadela AlterVego", kind: "mortadela", why: "Plant-based mortadella. Same barcode as Auchan 3998784." },
  { batch: 10, store: "CONTINENTE", id: "8786378", name: "Bifanas de Porco Cozinha Continente", kind: "refeicao", why: "A cooked pork dish (Cozinha Continente), a ready meal." },
  { batch: 10, store: "CONTINENTE", id: "8791223", name: "Água com Gás Ananás Pedras Salgadas", kind: "agua-sabor", why: "Flavoured sparkling water; the other store had it as plain water. Same barcode as Auchan 4011144." },
  { batch: 10, store: "CONTINENTE", id: "8795837", name: "Filetes Red Fish Boreal Artik", kind: "red-fish", why: "Redfish fillets." },
  { batch: 10, store: "CONTINENTE", id: "8838799", name: "Pimenta Bode Vermelha Aroma D'Minas", kind: null, why: "Cayenne or chilli pepper, not black pepper. Same barcode as Auchan 3325632." },
  { batch: 10, store: "CONTINENTE", id: "8844570", name: "Papas de Arroz Prozis", kind: "cereais", why: "Prozis rice porridge, as the one at Auchan was verified (kind-gold)." },
  { batch: 10, store: "CONTINENTE", id: "8858065", name: "Queijinho Polpa Morango e Banana Infantil Pack Danonino Danone", kind: "iogurte", why: "Children's petit-suisse, as the other store has them: compared with yoghurts, not cheese." },
  { batch: 10, store: "CONTINENTE", id: "8859250", name: "Framboesas Cobertas com Pistácio Swee", kind: null, why: "Frozen raspberries coated in pistachio, a snack." },
  { batch: 10, store: "CONTINENTE", id: "8870930", name: "Noodles Fusion Doner Kebab Knorr", kind: "massa", why: "Instant noodles, now under pasta (the owner, 11 November 2026). Same barcode as Auchan 4022957." },
  { batch: 10, store: "CONTINENTE", id: "8888459", name: "Fiambre de Peito de Frango Fatiado + Proteína Elpozo", kind: "fiambre", why: "Sliced turkey or chicken breast (fiambre). Same barcode as Auchan 3857266." },
  { batch: 10, store: "CONTINENTE", id: "8889503", name: "Farinha Panko Miyata", kind: "pao-ralado", why: "Panko breadcrumbs. Same barcode as Auchan 4081829." },
  { batch: 10, store: "CONTINENTE", id: "8907181", name: "Molho de Soja Ponzu com Limão Kikkoman", kind: null, why: "Yakitori or ponzu sauce, not soy sauce. Same barcode as Auchan 4022195." },
  { batch: 10, store: "CONTINENTE", id: "8909638", name: "Fiambre de Peito de Frango Fatiado Sem Aditivos Elpozo", kind: "fiambre", why: "Sliced turkey or chicken breast (fiambre). Same barcode as Auchan 4072139." },
  { batch: 10, store: "CONTINENTE", id: "8909818", name: "Creme de Leite Parmalat", kind: "nata", why: "Cooking cream." },
  { batch: 10, store: "CONTINENTE", id: "8926385", name: "Kefir Natural Nestlé   ", kind: "kefir", why: "Kefir." },
  { batch: 10, store: "CONTINENTE", id: "8940690", name: "Leite com Chocolate Agros com Oferta Mochila", kind: null, why: "A flavoured milk drink or growing-up milk, not milk." },
  { batch: 10, store: "CONTINENTE", id: "8951763", name: "Ketchup Zero Prozis", kind: "ketchup", why: "Ketchup. Same barcode as Auchan 3570803." },
  { batch: 10, store: "CONTINENTE", id: "8954733", name: "Posta de Pregado Continente", kind: "pregado", why: "Turbot steak." },
  { batch: 10, store: "CONTINENTE", id: "8967367", name: "Filete de Salmão com Alho, Limão e Ervas Continente", kind: null, why: "Salmon fillet with garlic, lemon and herbs (marinated), compared with plain salmon." },
  { batch: 10, store: "CONTINENTE", id: "8973253", name: "Café Cappuccino Mocha Stick Delta", kind: null, why: "Cappuccino mix in sticks, not coffee. Same barcode as Auchan 4075976." },
  { batch: 10, store: "CONTINENTE", id: "8973267", name: "Bebida de Chocolate e Avelã Solúvel Delta", kind: "achocolatado", why: "A soluble chocolate drink powder, as the other store has it." },
  { batch: 10, store: "CONTINENTE", id: "8978367", name: "Cápsulas de Chocolate Nescafé Dolce Gusto Neo", kind: null, why: "Chocolate or tea capsules, not coffee. Same barcode as Auchan 4071288." },
  { batch: 10, store: "CONTINENTE", id: "8983101", name: "Reduz Colesterol Líquido Frutos Silvestres Danacol Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "8983312", name: "Queijinho Polpa Morango Banana Pêssego Infantil Danonino Danone", kind: "iogurte", why: "Children's petit-suisse, as the other store has them: compared with yoghurts, not cheese." },
  { batch: 10, store: "CONTINENTE", id: "8985440", name: "Defesas Líquido Morango e Romã Actimel Danone", kind: "iogurte", why: "Drinkable or protein yoghurt (Actimel, Danacol, Yopro, Lindahls)." },
  { batch: 10, store: "CONTINENTE", id: "8997266", name: "Bacalhau com Natas e Camarão Cozinha Continente", kind: "refeicao", why: "A ready meal (Cozinha Continente)." },
  { batch: 10, store: "CONTINENTE", id: "8997271", name: "Tiborna de Bacalhau Cozinha Continente", kind: "refeicao", why: "A ready meal (Cozinha Continente)." },
  { batch: 10, store: "CONTINENTE", id: "8997320", name: "Lombo de Porco com Maçã e Batata Cozinha Continente", kind: "refeicao", why: "A ready meal (Cozinha Continente)." },
  { batch: 10, store: "CONTINENTE", id: "8997435", name: "Moqueca de Camarão Cozinha Continente", kind: "refeicao", why: "A ready meal (Cozinha Continente)." },
  { batch: 10, store: "CONTINENTE", id: "8997438", name: "Fricassé de Camarão Cozinha Continente", kind: "refeicao", why: "A ready meal (Cozinha Continente)." },
  { batch: 10, store: "CONTINENTE", id: "8997472", name: "Quindim Cozinha Continente", kind: null, why: "A dessert (quindim, cheesecake), not a meal." },
  { batch: 10, store: "CONTINENTE", id: "8997538", name: "Caldo Verde Cozinha Continente", kind: "sopa", why: "A ready soup (caldo verde, cream of carrot or mushroom)." },
  { batch: 10, store: "CONTINENTE", id: "8997540", name: "Creme de Cogumelos Cozinha Continente", kind: "sopa", why: "A ready soup (caldo verde, cream of carrot or mushroom)." },
  { batch: 10, store: "CONTINENTE", id: "8997547", name: "Creme de Cenoura Cozinha Continente", kind: "sopa", why: "A ready soup (caldo verde, cream of carrot or mushroom)." },
  { batch: 10, store: "CONTINENTE", id: "8997552", name: "Pernas de Pato a Baixa Temperatura Cozinha Continente", kind: "refeicao", why: "A ready meal (Cozinha Continente)." },
  { batch: 10, store: "CONTINENTE", id: "9013828", name: "Bolinha de Carne 100% Bovino Cozinha Continente", kind: "refeicao", why: "A ready meal (Cozinha Continente)." },
  { batch: 10, store: "CONTINENTE", id: "9013849", name: "Coxinha de Frango com Queijo à Brasileira Cozinha Continente ", kind: "refeicao", why: "A ready meal (Cozinha Continente)." },
  { batch: 10, store: "CONTINENTE", id: "9015078", name: "Tártaro de Atum Fumado Martiko", kind: null, why: "Smoked tuna tartare, a deli product, compared with fresh and tinned tuna." },
  { batch: 10, store: "CONTINENTE", id: "9021372", name: "Pernil sem Couro Metades Cozinha Continente", kind: "refeicao", why: "A ready meal (Cozinha Continente)." },
  { batch: 10, store: "PINGO_DOCE", id: "1000749", name: "Quejo de Ovelha Fumado", kind: "queijo", why: "Smoked sheep cheese." },
  { batch: 10, store: "PINGO_DOCE", id: "59877", name: "Posta de Pargo Capatão Fresco", kind: "pargo", why: "Pargo capatão steak." },
  { batch: 10, store: "PINGO_DOCE", id: "985037", name: "Filete de Red Fish Descongelado", kind: "red-fish", why: "Redfish fillets." },
  // Batch 11, 11 November 2026 (the owner): instant noodles are pasta, in their
  // own group ("Noodles instantâneos", data/food-tree.ts) - the Nissin, Knorr,
  // Koala and Naked Noodle ones that sat in ready meals or had no kind.
  { batch: 11, store: "AUCHAN", id: "3024453", name: "SOBA NISSIN NOODLES CHILI 111G", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "AUCHAN", id: "3024460", name: "CUP NISSIN NOODLES GALINHA 63G", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "AUCHAN", id: "3024461", name: "CUP NISSIN NOODLES CAMARÃO 63G", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "AUCHAN", id: "3024490", name: "DEMAE RAMEN NISSIN VITELA 100G", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "AUCHAN", id: "3024452", name: "CUP NISSIN NOODLES VITELA 64G", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "AUCHAN", id: "3024774", name: "SOBA NISSIN NOODLES CLÁSSICO 109G", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "AUCHAN", id: "3024493", name: "SOBA NISSIN NOODLES TERIYAKI 110G", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "AUCHAN", id: "3037769", name: "THAI SWEET CHILI NAKED NOODLE 78G", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "AUCHAN", id: "3010087", name: "CHINESE CHOW MEIN NAKED NOODLE 78G", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "AUCHAN", id: "3037771", name: "SINGAPORE CURRY NAKED NOODLE 78G", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "AUCHAN", id: "3010092", name: "THAI GREEN CURRY NAKED NOODLE 78G", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "AUCHAN", id: "4065064", name: "POT NOODLES KNORR FUSION BURRITO 89G", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "CONTINENTE", id: "7377408", name: "Noodles Galinha Asia Pot Knorr", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "CONTINENTE", id: "8083508", name: "Noodles Vegetais Pot Knorr", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "CONTINENTE", id: "7836848", name: "Noodles Carne Asia Pot Knorr", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "CONTINENTE", id: "8997539", name: "Noodles Camarão Picante Pot Koala", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "CONTINENTE", id: "6939210", name: "Noodles Carne Pot Koala", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
  { batch: 11, store: "CONTINENTE", id: "6939206", name: "Noodles de Galinha Pot Koala", kind: "massa", why: "Instant noodles with their flavour sachet: pasta, in the instant-noodles group (the owner, 11 November 2026)." },
];

/**
 * A product's place inside its kind - the cut or variety (sub-kind) and the
 * labels - decided in review, where the name cannot say it. Applied after the
 * tree's own rules (data/food-tree.ts), product by product, by the nightly step
 * that writes kinds. `subKind` replaces the tree's; the labels are added to or
 * taken from the tree's.
 */
export interface ReviewedTreePlace {
  batch: number;
  store: string;
  /** the store's own product id */
  id: string;
  /** the name at review time, for a person reading this file */
  name: string;
  subKind?: string | null;
  addLabels?: string[];
  removeLabels?: string[];
  why: string;
}

export const REVIEWED_TREE: ReviewedTreePlace[] = [
  // 9 November 2026, the AI trial (see batch 9 above).
  { batch: 9, store: "CONTINENTE", id: "7463615", name: "Alperce Extra Os Originais", addLabels: ["seco"], why: "Dried apricots (Continente's dried-fruit shelf), compared with fresh ones; the name does not say dried." },
  { batch: 9, store: "AUCHAN", id: "3676688", name: "FIGO COM FARINHA AUCHAN 500 G", addLabels: ["seco"], why: "Dried figs, filed as fresh." },
  { batch: 9, store: "CONTINENTE", id: "7261918", name: "Figo Preto Frusel", addLabels: ["seco"], why: "Dried figs (Continente's dried-fruit shelf), filed as fresh." },
  { batch: 9, store: "CONTINENTE", id: "7820035", name: "Milho Amarelo para Canjica Sinhá", removeLabels: ["lata"], why: "Dry maize for canjica; Continente's tinned-goods shelf made it a tin." },
  { batch: 9, store: "CONTINENTE", id: "7798984", name: "Cuscuz Tradicional sem Glúten Sinhá", subKind: "milho", why: "Maize flour (flocão); its name does not say maize." },
  { batch: 9, store: "AUCHAN", id: "25730", name: "FERMENTO E LEVEDURAS ROYAL LATA 113G", subKind: "po", why: "Baking powder; \"leveduras\" in the name made it baker's yeast." },
  { batch: 9, store: "AUCHAN", id: "1177967", name: "FERMENTO SCHAR SEM GLÚTEN 2X10G", subKind: "padeiro", why: "Baker's yeast: its page gives \"Saccharomyces cerevisiae\"; it was compared with baking powder." },
  { batch: 9, store: "PINGO_DOCE", id: "989996", name: "Chouriço Preto Quiaios", subKind: "sangue", why: "Quiaios \"chouriço preto\" is a blood sausage, compared with meat chouriços." },
  { batch: 9, store: "AUCHAN", id: "246177", name: "CARNE P/PICADINHO BOVINO KG", subKind: "estufar", why: "Diced beef for stewing." },
  { batch: 9, store: "PINGO_DOCE", id: "1003931", name: "Filetes de Pescada Argentina sem Pele", addLabels: ["congelado"], why: "Pescanova's frozen fillets (900 g), filed as fresh: neither the name nor the shelf says frozen." },
  { batch: 9, store: "PINGO_DOCE", id: "1010025", name: "Chouriço Ibérico", addLabels: ["fatiado"], why: "A 75 g sliced pack (46.53 EUR/kg), compared with whole chouriços." },
  { batch: 9, store: "AUCHAN", id: "292541", name: "NOZES KG", addLabels: ["casca"], why: "Walnuts in the shell: its page describes it as \"NOZ COM CASCA\"; compared with shelled kernels." },
  { batch: 9, store: "AUCHAN", id: "1080314", name: "TOMATE SECO PONTI 280G", addLabels: ["lata"], why: "Sun-dried tomatoes in oil, a 280 g jar (the same product is \"em Óleo\" at Continente), compared with dry ones in a bag." },
  { batch: 9, store: "PINGO_DOCE", id: "708391", name: "Tomate Seco", addLabels: ["lata"], why: "As Auchan's 1080314: Ponti's 280 g jar in oil." },
  { batch: 9, store: "AUCHAN", id: "3035265", name: "BANANA RODELAS AUCHAN 200 G", addLabels: ["seco"], why: "Dried banana slices (Auchan's dried-fruit shelf); it became the cheapest own-brand fresh banana once the Madeira banana left that row." },
  { batch: 9, store: "CONTINENTE", id: "8112018", name: "Banana às Rodelas Continente", addLabels: ["seco"], why: "Dried banana slices (Continente's dried-fruit shelf), as Auchan's 3035265." },
  // The trial's follow-ups, approved by the owner on 9 November 2026.
  { batch: 9, store: "AUCHAN", id: "800891", name: "NOZ DO ALENTEJO AUCHAN COLLECTION CULTIVAMOS O BOM 500 G", addLabels: ["casca"], why: "Whole walnuts in a net bag (the page's photo, opened 9 Nov 2026), at 6.98 EUR/kg among shelled walnuts; as Continente's 'Noz com Casca Alentejo Os Originais' 500 g." },
];
