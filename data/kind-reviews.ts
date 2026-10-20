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
  { batch: 4, store: "CONTINENTE", id: "6917657", name: "Noodles Clássico Soba Nissin", kind: "refeicao", why: "Instant soba noodles: ready meals, as at Auchan." },
  { batch: 4, store: "CONTINENTE", id: "6917659", name: "Noodles Chili Soba Nissin", kind: "refeicao", why: "Instant soba noodles: ready meals, as at Auchan." },
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
];
