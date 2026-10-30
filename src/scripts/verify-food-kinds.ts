import { classifyFoodType, isFoodSection } from "../lib/food-types";
import { sectionKey, sectionOf } from "../lib/store-sections";
import { keepInCatalogue } from "../lib/catalogue-filter";
import { capsuleCountFromName, eggCountFromName, eggCountFromUnitPrice, itemCount } from "../lib/egg-count";
import { categoryOf, labelsOf, laterCategoryOf, subKindOf, treeProblems } from "../lib/food-tree";
import { FOOD_TYPES } from "../../data/food-types";
import { LeftOutTally, SectionTally, compareSections, sectionProblems } from "../scrapers/crawl/section-watch";
import { parseCategoryPaths } from "../scrapers/crawl/continente-categories";
import { auchanTileSize, parseSize, reconcileTileSize, SOLD_PER_KG } from "../lib/sizes";
import { classifyCandidate, qualifierMismatch, type Candidate } from "../lib/matching";
import { foldPlural, matchesTerm } from "../lib/text";
import { productTokens } from "../lib/candidates";
import { enrichment } from "../scrapers/crawl/persist";
import { nameFromUrl } from "../scrapers/crawl/pingodoce-sitemap";
import { correctedSize, implausiblePodSize, parseShownUnitPrice, pricedPerUnit, sizeFromUnitPrice } from "../scrapers/page-size";
import { cheapestPerStore, comparable, unitsFor, type ComparableProduct } from "../lib/comparison";
import { promotionOf } from "../lib/promotion";
import { isStoreError, STORE_ERRORS, storeErrorStatus } from "../../data/store-errors";

/**
 * Checks of the kinds of food: the classifier, the stores' food sections, the
 * real-food list, the split kinds and the food tree.
 *
 * Moved out of verify-matching.ts on 22 October 2026, which had grown to 2,100
 * lines on several subjects (code review M13). Unchanged, except that each
 * failure is now counted once: there, each part's failures were added to the
 * total twice.
 */

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
}

export function verifyFoodKinds(): number {
  failures = 0;
  verifyFoodTypes();
  verifyStoreSections();
  verifyRealFoodList();
  verifySplitKinds();
  verifyFoodTree();
  return failures;
}

/**
 * Food-type classification and the free size backfill. Pure - no database, no
 * network - because these are judgement calls and the point is that they can be
 * checked without either.
 */
function verifyFoodTypes(): number {
  const before = failures;
  console.log("\n  food types: classification");

  // Continente and Auchan file potatoes under a food top-level; Pingo Doce's
  // path is a flat shelf name, which is why its rule is inverted.
  const CONT = "Frescos/Legumes/Batata, Batata Doce e Mandioca";
  const AUCH = "produtos-frescos/legumes/batatas,-alho-e-cebola";
  const PING = "Frutas e Vegetais/Batatas, Cebolas e Alhos";

  const is = (name: string, store: string, path: string, want: string | null) =>
    check(
      `${name.slice(0, 38).padEnd(38)} -> ${String(want)}`,
      classifyFoodType(name, store, path) === want,
      `got ${String(classifyFoodType(name, store, path))}`
    );

  // batata, in all three stores and all three name shapes
  is("Batata Vermelha Continente", "CONTINENTE", CONT, "batata");
  is("BATATA BRANCA LAVADA KG", "AUCHAN", AUCH, "batata");
  is("Batata para Cozer e Assar Embalada", "PINGO_DOCE", PING, "batata");

  // ...and the three foods that share the word but are not it
  is("Batata Doce Polpa Laranja", "CONTINENTE", CONT, "batata-doce");
  is("Batatas Fritas Lisas", "CONTINENTE", "Mercearia/Snacks", null);
  is("Puré de Batata Flocos", "CONTINENTE", "Mercearia/Puré", null);

  console.log("\n  food types: the ordering rule (food type beats cut word)");
  // These are the cases that bite. A cut word must never win over a real food
  // type, or "Queijo Fresco de Vaca" is filed as beef.
  is("Queijo Fresco de Vaca", "CONTINENTE", "Laticínios e Ovos/Queijo", "queijo");
  is("Fiambre de Peito de Peru", "CONTINENTE", "Frescos/Charcutaria", "fiambre");
  is("Salsicha de Frango Brasitas", "PINGO_DOCE", "Talho", "salsicha");
  is("Arroz de Pato Congelado", "AUCHAN", "congelados", "arroz");
  // ...and where the head IS a cut, it resolves to the animal behind it
  is("Peito de Frango Embalado", "PINGO_DOCE", "Talho", "frango");
  is("Lombo de Porco", "PINGO_DOCE", "Talho", "porco");
  is("Lombo de Atum Descongelado", "PINGO_DOCE", "Peixaria", "atum");
  is("Miolo de Camarão 40/60 Congelado", "CONTINENTE", "Congelados", "camarao");
  is("Coxa de Frango", "AUCHAN", "produtos-frescos", "frango");

  console.log("\n  food types: the fallback chain");
  // "miolo" is the kernel of anything, not just shellfish - 86 of its 134
  // products are nuts, and a cut-word list restricted to animals lost them all.
  is("Miolo de Amêndoa com Pele Continente", "CONTINENTE", "Mercearia", "amendoa");
  is("Miolo de Noz Metades", "CONTINENTE", "Mercearia", "noz");
  is("Miolo de Avelã Torrada", "CONTINENTE", "Mercearia", "avela");
  // Wine estates: the head is the estate, the food is later in the name.
  is("Quinta do Carmo Alentejano Vinho Branco", "CONTINENTE", "Bebidas e Garrafeira/Vinhos", "vinho");
  is("Herdade dos Grous Alentejo Vinho Rosé", "CONTINENTE", "Bebidas e Garrafeira/Vinhos", "vinho");
  // Category fallback: nothing in this name says coffee, but the shelf does.
  is("Cápsulas Dolce Gusto Espresso Napoli", "PINGO_DOCE", "Mercearia/Café, Chá e Bebidas Solúveis/Café em Cápsulas", "cafe-capsula");
  check(
    "capsules are coffee capsules, compared per capsule since 18 October 2026",
    classifyFoodType("Cápsulas Compatíveis 16un", "PINGO_DOCE",
      "Mercearia/Café, Chá e Bebidas Solúveis/Café em Cápsulas") === "cafe-capsula"
  );

  // A shelf that names several foods says what is NEAR a product, not what it
  // is. Taking the first food named filed 2,271 products wrongly.
  console.log("\n  food types: shelves that name several foods");
  is("Puré de Batata Knorr", "CONTINENTE", "Mercearia/Arroz, Massa e Farinha/Puré", null);
  // (Nectarines have their own kind since 17 October 2026; flat peaches do not.)
  is("Paraguaio Continente", "CONTINENTE", "Frescos/Frutas/Pêssego, Ameixa e Kiwi", null);
  is("LAÇOS (FARFALLE) AUCHAN 500G", "AUCHAN", "alimentação/mercearia/arroz-e-massa", null);
  // ...and an undecided shelf does not hand over to its broader parent.
  is("Coco Ralado Continente", "CONTINENTE", "Mercearia/Açúcar e Sobremesas/Preparados para Mousses e Bolos", null);
  // How many foods a shelf names is decided by the shelf alone: after café's
  // rules turned a product away, this shelf used to look like a tea shelf.
  check(
    "a shelf naming coffee and tea is not a tea shelf for whatever coffee rejects",
    classifyFoodType("Cápsulas de Achocolatado Dolce Gusto Nesquik", "PINGO_DOCE",
      "Café, Chá e Achocolatados/Capsulas de Cafe") !== "cha"
  );

  // What the old shelf rule got right is now claimed by name.
  console.log("\n  food types: claimed by name instead of by shelf");
  const cafeShelf = "alimentação/mercearia/café,-chá-e-infusão/cápsula-dolce-gusto-e-compatíveis";
  is("CÁPSULAS DOLCE GUSTO BUONDI 64 UN", "AUCHAN", cafeShelf, "cafe-capsula");
  is("CÁPSULAS TORRIÉ CAFÉ COM LEITE SOLÚVEL DOLCE GUSTO 16UN", "AUCHAN", cafeShelf, "cafe-capsula");
  is("Cápsulas de Galão", "PINGO_DOCE", "Café, Chá e Achocolatados/Capsulas de Cafe", "cafe-capsula");
  check("capsules of something else are not coffee",
    classifyFoodType("CÁPSULAS TASSIMO MILKA 8UN", "AUCHAN", cafeShelf) !== "cafe");
  check("nor are Nesquik capsules, even on a coffee shelf",
    classifyFoodType("Cápsulas de Achocolatado Dolce Gusto Nesquik", "PINGO_DOCE",
      "Café, Chá e Achocolatados/Capsulas de Cafe") !== "cafe");
  // "pastilha" is a coffee pod and also a lozenge; "açafrão" contains "caf".
  const sweets = "Mercearia/Chocolate, Gomas e Rebuçados/Gomas, Pastilhas e Rebuçados";
  check("coffee-flavoured sweets are not coffee",
    classifyFoodType("Rebuçados de Café Mini sem Glúten Villa", "CONTINENTE", sweets) !== "cafe");
  check("nor is saffron gum, though açafrão contains caf",
    classifyFoodType("Pastilhas Elásticas de Gengibre e Açafrão True Gum", "CONTINENTE", sweets) !== "cafe");
  is("Pastilhas Delta Café Platinum 16un", "AUCHAN",
    "alimentação/mercearia/café,-chá-e-infusão/café-de-máquina,-grão-e-pastilhas", "cafe-capsula");
  check("roasted barley is not coffee, though Delta also sells coffee",
    classifyFoodType("CEVADA DELTA TORRADA MOÍDA 220 G", "AUCHAN",
      "alimentação/mercearia/café,-chá-e-infusão/café-saco,-solúvel-e-cevadas") !== "cafe");
  is("TABLETE LINDT EXCELLENCE 70% 100G", "AUCHAN", "alimentação/mercearia/chocolates-e-achocolatados", "chocolate");
  is("Chouriça Tradicional Prisca", "CONTINENTE", "Frescos/Charcutaria/Chouriço e Morcela", "chourico");

  // Five foods whose cheapest product was not that food (17 October 2026).
  const codShelf = "Frescos/Peixaria/Bacalhau";
  check("pollock on the cod shelf is not cod",
    classifyFoodType("Paloco do Pacífico Desfiado Seco Continente", "CONTINENTE", codShelf) !== "bacalhau");
  check("nor are cod heads, the cheapest 'cod' at EUR 5.99/kg",
    classifyFoodType("Caras de Bacalhau Seco Continente", "CONTINENTE", codShelf) !== "bacalhau");
  check("nor tongues and cheeks",
    classifyFoodType("Línguas de Bacalhau Ultracongelado Lugrade", "CONTINENTE", codShelf) !== "bacalhau" &&
    classifyFoodType("BOCHECHAS BACALHAU RIBERALVES 400G", "AUCHAN", "congelados/peixe/bacalhau-e-paloco") !== "bacalhau");
  check("and a cod head on the general fish shelf is not 'other fish' either",
    classifyFoodType("BACALHAU CABEÇA KG", "AUCHAN", "produtos-frescos/peixaria/peixe-fresco") === null);
  is("Lombos de Bacalhau Graúdo Continente", "CONTINENTE", codShelf, "bacalhau");
  // Undecided since pollock got a kind of its own (20 October 2026): this shelf
  // now names two foods. Three pollock products on it were filed as cod before.
  is("LOMBOS RIBERALVES 4M CURA UNIDOSE MSC 240G", "AUCHAN", "congelados/peixe/bacalhau-e-paloco", null);
  is("PALOCO RIBERALVES PACIFICO DESFIADO MSC 400G", "AUCHAN", "congelados/peixe/bacalhau-e-paloco", "paloco");
  const smoked = "Frescos/Charcutaria/Bacon e Fumados";
  check("a smoked ham hock on the bacon shelf is not bacon",
    classifyFoodType("Pernil Fumado Primor", "CONTINENTE", smoked) !== "bacon");
  is("Bacon Fumado Fatiado Continente", "CONTINENTE", smoked, "bacon");
  is("Barriga Fumada Forno a Lenha Prisca", "CONTINENTE", smoked, "bacon");
  is("PANCETTA AUCHAN 12 FATIAS 100G", "AUCHAN", "produtos-frescos/charcutaria/chouriço,-bacon-e-fumados", "bacon");
  const spices = "Mercearia/Molhos, Temperos e Sal/Especiarias e Ervas";
  is("Caril em Frasco Continente", "CONTINENTE", spices, "caril");
  check("a curry dish is not the spice",
    classifyFoodType("Caril de Lentilhas Bonduelle", "CONTINENTE", "Mercearia/Conservas/Cogumelos, Milho, Ervilha") !== "caril");
  check("nor is paprika on the curry shelf",
    classifyFoodType("COLORAU-PIMENTÃO AUCHAN DOCE 100G", "AUCHAN", "alimentação/mercearia/sal,-ervas-e-temperos/caril-e-especiarias") !== "caril");
  check("nor a curry paste, cheaper per kilo than the powder",
    classifyFoodType("CARIL SHARWOOD'S PASTA SUAVE 295G", "AUCHAN", "alimentação/sabores-do-mundo/cozinha-indiana") !== "caril");
  check("and a shrimp curry meal is not 'other fish'",
    classifyFoodType("Caril Thai de Camarão O Passe", "CONTINENTE", "Congelados/Refeições/Peixe") === null);
  const easter = "Páscoa/Amendoas";
  check("chocolate almonds are not almonds",
    classifyFoodType("Amêndoas de Chocolate Negro", "PINGO_DOCE", easter) !== "amendoa");
  check("nor are sugared almonds, and they are not chocolate either",
    classifyFoodType("Amêndoas Tipo Francês Bem Me Quer", "CONTINENTE", "Mercearia/Chocolate, Gomas e Rebuçados/Chocolates") === null);
  check("nor sugared pine nuts that reached the almond shelf",
    classifyFoodType("Confeitos de Pinhão", "PINGO_DOCE", easter) !== "amendoa");
  is("Amêndoa com Pele Continente", "CONTINENTE", "Frescos/Frutas/Frutos Secos, Desidratados e Sementes", "amendoa");
  is("Amêndoas com Mel e Sal Marinho", "PINGO_DOCE", "Mercearia/Batatas Fritas Snacks e Frutos Secos", "amendoa");
  check("chocolate hazelnuts are not hazelnuts",
    classifyFoodType("Avelãs Cobertas com Chocolate de Leite", "PINGO_DOCE", easter) !== "avela");
  is("Miolo de Avelã Torrada Continente", "CONTINENTE", "Frescos/Frutas/Frutos Secos, Desidratados e Sementes", "avela");

  // Powders are not chocolate bars, and a two-food shelf must not appear by accident.
  const chocShelf = "alimentação/mercearia/chocolates-e-achocolatados/achocolatados";
  is("ACHOCOLATADO NESQUIK SACO 1KG", "AUCHAN", chocShelf, "achocolatado");
  is("Bebida de Chocolate Solúvel Cola Cao", "CONTINENTE", "Mercearia/Café, Chá e Solúveis/Chocolate Solúvel", "achocolatado");
  is("Cacau Magro em Pó Continente Equilíbrio", "CONTINENTE", "Mercearia/Açúcar e Sobremesas/Cacau e Chocolates de Culinária", "cacau");
  is("PREPARADO LACASA CHOCOLATE QUENTE 350G", "AUCHAN", "alimentação/mercearia/chocolates-e-achocolatados/achocolatados", "achocolatado");
  check("a bakery pastry is not chocolate",
    classifyFoodType("Supremas de Chocolate Da Nossa Pastelaria", "CONTINENTE", "Mercearia/Chocolate, Gomas e Rebuçados/Chocolates") !== "chocolate");
  is("Barrinhas de Chocolate Kinder", "PINGO_DOCE", "Bolachas, Cereais e Guloseimas/Chocolates e Guloseimas/Tabletes de Chocolate", "chocolate");
  is("CHOCOLATE NEGRO AUCHAN 70% CACAU E COM BAIXO TEOR DE AÇÚCAR 100G", "AUCHAN",
    "alimentação/mercearia/chocolates-e-achocolatados/tablete-de-chocolate", "chocolate");
  // Ready meals are dishes, not the ingredients on the same shelf.
  const quick = "alimentação/sabores-do-mundo/cozinha-brasileira/preparados-e-refeições-rápidas";
  check("cornmeal is not a ready meal", classifyFoodType("FUBÁ MIMOSO DA TERRINHA 1KG", "AUCHAN", quick) !== "refeicao");
  check("nor is plain tofu",
    classifyFoodType("Tofu Natural Joya", "CONTINENTE", "Frescos/Refeições Práticas/Vegetariano") !== "refeicao");
  is("BOLONHESA SEITAN NOBRE VEGALIA 420G", "AUCHAN",
    "alimentação/mercearia/refeições,-sopas-e-puré/refeições-pré-preparadas", "refeicao");

  // Same brand and size, different product: the matcher must not confirm these.
  check("lactose-free milk is not regular milk",
    qualifierMismatch("Leite UHT Meio Gordo Mimosa", "LEITE MIMOSA UHT ESPECIAL 0% LACTOSE MEIO GORDO 6X1L") === "lactose");
  check("nor organic against regular",
    qualifierMismatch("Massa Fusilli Rummo", "MASSA RUMMO FUSILLI BIO 500G") === "bio");
  check("but the same words in another order are the same product",
    qualifierMismatch("Leite UHT Meio Gordo Mimosa", "LEITE MIMOSA UHT MEIO GORDO 1L") === null);
  is("PÃES GARCIA CACETE SEM GLÚTEN 5X80G", "AUCHAN", "alimentação/padaria-e-pastelaria", "pao");

  check("a name ending in a weight range is sold by the kilo",
    SOLD_PER_KG.test("SALMÃO FRESCO INTEIRO 2KG A 3KG") && SOLD_PER_KG.test("ROBALO GRANDE 800G A 1KG"),
    "a fish graded 2-3 kg, priced per kilo - not a 2 kg pack");
  check("a size written into the end of a word is not", !SOLD_PER_KG.test("ARROZ AGULHA 1KG"));
  check("a shelf saying 'and specialities' does not make hummus salmon",
    classifyFoodType("Hummus", "PINGO_DOCE",
      "Charcutaria e Queijos/Charcutaria/Salmao Fumado e Especialidades") !== "salmao");
  is("Salmão Fumado Norueguês", "PINGO_DOCE",
    "Charcutaria e Queijos/Charcutaria/Salmao Fumado e Especialidades", "salmao");
  check("a salmon head is not salmon", classifyFoodType("CABEÇA SALMÃO KG", "AUCHAN",
    "produtos-frescos/peixaria/peixe-fresco") !== "salmao");
  check("nor 'other fish'", classifyFoodType("SALMÃO CABEÇA 2KG A 3KG", "AUCHAN",
    "produtos-frescos/peixaria/peixe-fresco") !== "peixe");
  is("Salmão Inteiro Fresco", "PINGO_DOCE", "Peixaria/Peixe/Atum e Salmao", "salmao");
  check("quail is not duck, though Auchan shelves it with duck",
    classifyFoodType("CODORNIZ EXTRA AUCHAN CULTIVAMOS O BOM KG", "AUCHAN",
      "produtos-frescos/talho/pato-e-mais-aves") !== "pato");
  is("Pato Inteiro com Miúdos Embalado", "PINGO_DOCE", "Talho/Aves", "pato");
  check("línguas de gato are not cinnamon, even with Auchan's brand in the middle",
    classifyFoodType("LÍNGUAS AUCHAN DE GATO CROCANTE CANELA LIMÃO 200G", "AUCHAN",
      "alimentação/mercearia/bolachas-e-bolos") !== "canela");
  is("CANELA MOÍDA MARGÃO 40G", "AUCHAN", "alimentação/mercearia/sal,-ervas-e-temperos", "canela");

  // These two rules held invisible control characters where `\b` belonged, and
  // matched nothing until that was noticed.
  console.log("\n  food types: rules that used to match nothing");
  check("ovos moles are a sweet, not eggs",
    classifyFoodType("Ovos Moles de Aveiro", "CONTINENTE", "Frescos/Padaria e Pastelaria/Doçaria Regional") !== "ovo");
  check("a dish with a sauce is not sauce",
    classifyFoodType("Pernil Assado com Molho de Cerveja", "PINGO_DOCE", "Congelados/Refeicoes e Salgados") !== "molho");
  check("nor is it the sauce's ingredient",
    classifyFoodType("Pernil Assado com Molho de Cerveja", "PINGO_DOCE", "Congelados/Refeicoes e Salgados") !== "cerveja",
    "roast pork in beer sauce is not beer");
  // The scan must not override an exclude: pure de batata is not a potato.
  is("Puré de Batata Flocos Continente", "CONTINENTE", "Mercearia", null);

  // The hand check of a 408-product sample, 20 October 2026: each mistake it
  // found, and each everyday food it found without a kind.
  console.log("\n  food types: the hand check of 20 October 2026");
  const jams = "Mercearia/Compotas Mel e Cremes de Barrar/Compotas e Doces";
  is("Doce de Abóbora com Amêndoa", "PINGO_DOCE", jams, null);
  is("Mel de Rosmaninho", "PINGO_DOCE", jams, "mel");
  is("Coelhos de Chocolate", "PINGO_DOCE", "Páscoa/Chocolates e Bombons", "chocolate");
  is("Azeite de Dende Integral Kidendê", "CONTINENTE", "Mercearia/Azeite, Óleo e Vinagre/Azeite", null);
  is("Milho para Pipocas Continente", "CONTINENTE", "Mercearia/Batatas Fritas e Aperitivos/Pipocas", "pipoca");
  is("Grão Vasco Dão Vinho Tinto", "CONTINENTE", "Bebidas e Garrafeira/Vinhos/Vinho Tinto", "vinho");
  is("LEITE REINA CREME COM BOLACHA 4X125G", "AUCHAN", "alimentação/produtos-lácteos/gelatinas-e-sobremesas/sobremesas-tradicionais", null);
  // cut words on prepared-food shelves
  is("PEITO FRANGO IZIDORO FATIAS FINAS 120G+30G", "AUCHAN", "produtos-frescos/charcutaria/fiambre-de-peru-e-frango", null);
  is("PATANISCAS DE BACALHAU RIBERALVES FORNO (5 UNID) 300G", "AUCHAN", "congelados/refeições-rápidas/salgados-e-petiscos", "refeicao");
  is("CALDEIRADA BACALHAU RIBERALVES MSC 700G", "AUCHAN", "congelados/peixe/preparados-de-peixe", null);
  is("Pernas de Frango Assado", "PINGO_DOCE", "Take Away/Frango Assado e Churrasco", null);
  is("Pedaços de Ananás Cobertos com Chocolate Branco e Coco", "PINGO_DOCE", "Congelados/Gelados e Sobremesas/Gelados Barra Sandwich e Bites", "gelado");
  is("MIX PROTEÍNAS VEGETAIS SHINE BANANA BIO 250G", "AUCHAN", "biológicos-e-alternativas/biológicos/biológicos-alternativas-vegetais/tofu-e-proteínas-vegetais", "tofu");
  is("Foie Gras de Pato Continente Seleção", "CONTINENTE", "Mercearia/Conservas/Patês", null);
  // ...but the raw cuts and smoked salmon are untouched
  is("Bifinhos do Lombo de Porco Finíssimos Continente", "CONTINENTE", "Talho/Porco", "porco");
  is("Lombo de Salmão Fumado Noruega Ubago", "CONTINENTE", "Frescos/Charcutaria/Salmão Fumado", "salmao");
  // shelves that hold "and other things"
  is("MARMELO KG", "AUCHAN", "produtos-frescos/fruta/banana-e-frutos-tropicais", null);
  is("TORRESMOS TI MARIA 60G", "AUCHAN", "alimentação/mercearia/batatas-fritas-e-aperitivos-snacks/aperitivos,-snacks-e-pipocas", null);
  is("CREME LIÉGEOIS AUCHAN CHOCOLATE E NATA 4X115G", "AUCHAN", "alimentação/produtos-lácteos/gelatinas-e-sobremesas/sobremesas-tradicionais", null);
  is("Foie Gras de Pato Capdevila", "CONTINENTE", "Charcutaria e Queijos/Tábuas e Aperitivos", null);
  is("Snack de Chocolate Twix Pack 3", "PINGO_DOCE", "Bolachas, Cereais e Guloseimas/Chocolates e Guloseimas/Snacks de Chocolate", "chocolate");
  is("SNACK CHOCOLATE KINDER BUENO WHITE 2X5 195 G", "AUCHAN", "alimentação/mercearia/chocolates-e-achocolatados/bombons-e-snacks", "chocolate");
  // everyday foods that had no kind
  const grains = "Mercearia/Arroz, Massa e Farinha/Couscous, Quinoa, Bulgur e Outros";
  is("Couscous Milaneza", "CONTINENTE", grains, "cuscuz");
  is("Mistura Express para Couscous Margão", "CONTINENTE", "Mercearia/Molhos, Temperos e Sal/Especiarias e Ervas Aromáticas", null);
  is("Cominhos Moídos", "PINGO_DOCE", "Mercearia/Temperos e Molhos/Especiarias e Ervas Aromaticas", "cominho");
  is("Oregãos Secos", "PINGO_DOCE", "Frutas e Vegetais/Ervas Aromaticas Frescas", "oregao");
  is("QUIABOS KG", "AUCHAN", "produtos-frescos/legumes/mais-legumes", "quiabo");
  is("Paloco do Pacífico Desfiado Congelado", "PINGO_DOCE", "Peixaria/Bacalhau/Bacalhau Congelado", "paloco");
  is("Filetes de Anchova em Azeite", "PINGO_DOCE", "Mercearia/Conservas/Sardinhas e Outros Peixes", "anchova");
  is("Fuet Extra Continente", "CONTINENTE", "Charcutaria e Queijos/Enchidos/Fuet", "fuet");
  is("PÃO RALADO AUCHAN 240G", "AUCHAN", "alimentação/mercearia/tostas-e-pão-embalado/tostas,-mini-tostas-e-gressinos", "pao-ralado");
  is("Leite Condensado Magro", "PINGO_DOCE", "Mercearia/Sobremesas/Leite Condensado e de Coco", "leite-condensado");
  is("Leite de Coco para Culinária", "PINGO_DOCE", "Mercearia/Sobremesas/Leite Condensado e de Coco", "leite-coco");
  // a coconut yoghurt, decided by its yoghurt shelf - not coconut milk
  is("LEITE COCO FERMENTADO MIMOSA LIQUIDO MORANGO 4X151ML", "AUCHAN", "alimentação/produtos-lácteos/iogurtes/soja-e-vegetais", "iogurte");
  is("ARANDOS SECOS AUCHAN 150 G", "AUCHAN", "produtos-frescos/fruta/frutos-secos-e-sementes", "arando");
  is("Batatas Pré-Fritas Palitos", "PINGO_DOCE", "Congelados/Refeicoes e Salgados/Batatas e Pure", "batata-pre-frita");
  is("Batata para Fritar Embalada", "PINGO_DOCE", "Frutas e Vegetais/Vegetais/Batatas", null);

  // The hand check of a second, fresh sample, 20 October 2026.
  console.log("\n  food types: the second hand check, 20 October 2026");
  const nuts = "Mercearia/Batatas Fritas Snacks e Frutos Secos/Frutos Secos e Desidratados";
  is("Mistura Cajus, Avelãs e Amendoins Torrados", "PINGO_DOCE", nuts, null);
  is("Mix de Frutos Secos Torrados sem Sal", "PINGO_DOCE", nuts, null);
  is("Mix Framboesa e Mirtilo Continente", "CONTINENTE", "Frutas e Legumes/Frutas/Morango e Frutos Vermelhos", null);
  is("Mix Tomate Cherry", "PINGO_DOCE", "Frutas e Vegetais/Vegetais/Tomates Pepinos e Pimentos", "tomate");
  is("Mistura de Pimentas em Grão em Saqueta Margão", "CONTINENTE", "Mercearia/Molhos, Temperos e Sal/Especiarias e Ervas Aromáticas", "pimenta");
  is("Mix Salsichas Frescas de Porco Sabor Lusitano Continente", "CONTINENTE", "Talho/Pronto a Cozinhar", "salsicha");
  is("Entrecosto de Porco com Molho Barbecue Slow Cooked", "PINGO_DOCE", "Talho/Porco", null);
  is("Lombo de Porco Preto Fatiado Continente Seleção", "CONTINENTE", "Charcutaria e Queijos/Enchidos/Paio", "paio");
  is("Cubos de Fiambre", "PINGO_DOCE", "Charcutaria e Queijos/Charcutaria/Fiambre Mortadela e Chouricao", "fiambre");
  is("Feijoada de Cogumelos Brasil", "PINGO_DOCE", "Mercearia/Conservas/Refeicoes Enlatadas", "refeicao");
  is("TIRAS NATURE ADDICTS FRUTA MORANGO 35G", "AUCHAN", "alimentação/mercearia/batatas-fritas-e-aperitivos-snacks/aperitivos,-snacks-e-pipocas", null);
  is("BIFES CEM PORCENTO SOJA MOLHO TOMATE 25OG", "AUCHAN", "biológicos-e-alternativas/alimentação-vegetariana", null);
  is("MOLHO KIKKOMAN SOJA 1L", "AUCHAN", "alimentação/sabores-do-mundo/cozinha-asiática/molhos-e-temperos", "molho-soja");
  is("Massa de Alho", "PINGO_DOCE", "Mercearia/Temperos e Molhos/Outros Molhos e Temperos", null);
  // tomato paste is neither fresh tomato nor pulp: no kind yet
  is("TOMATE DUPLO CONCENTRADO MUTTI TUBO 130G", "AUCHAN", "alimentação/mercearia/polpas,-caldos-e-temperos/polpa-tomate", null);
  is("PÃO LÓ OVAR IGP 500 GR", "AUCHAN", "produtos-frescos/pastelaria/bolos-embalados", "bolo");
  is("Cebola Frita Crocante", "PINGO_DOCE", "Mercearia/Temperos e Molhos/Especiarias e Ervas Aromaticas", null);
  is("AMEIXA D? ELVAS FRASCO 500G", "AUCHAN", "alimentação/mercearia/cremes,-compotas-e-mel/compotas", null);
  is("Paio York Fatiado", "PINGO_DOCE", "Charcutaria e Queijos/Charcutaria/Outros Enchidos e Fumeiro", null);
  is("Petinga em Azeite Alva", "CONTINENTE", "Mercearia/Conservas/Sardinha, Cavala, Lulas", "sardinha");
  is("Gengibre Moído em Frasco Margão", "CONTINENTE", "Mercearia/Molhos, Temperos e Sal/Especiarias e Ervas Aromáticas", "gengibre-po");
  is("Gengibre Continente", "CONTINENTE", "Frutas e Legumes/Legumes", "gengibre");

  // The third hand check, 20 October 2026.
  console.log("\n  food types: the third hand check, 20 October 2026");
  const crabs = "Peixaria/Marisco Congelado/Sapateira e Lagosta";
  is("Lagosta Congelada", "CONTINENTE", crabs, "lagosta");
  is("LAVAGANTE GRANDE 600/800 CONGELADO KG", "AUCHAN", "congelados/marisco-e-moluscos/sapateira,-lagosta-e-caranguejo", "lavagante");
  is("Lagosta Vinho Verde Branco", "CONTINENTE", "Bebidas e Garrafeira/Vinhos/Vinho Branco", "vinho");
  is("Carabineiro de Moçambique Congelado", "CONTINENTE", crabs, null);
  is("Caixa Madeira 1 Garrafa", "CONTINENTE", "Bebidas e Garrafeira/Vinhos/Acessórios de Vinho", null);
  is("Piano de Bovino com Sal e Pimenta Slow Cooked", "PINGO_DOCE", "Talho/Vitela Vitelao e Bovino/Novilho e Bovino", null);
  is("CREME BALSÂMICO CRISTAL FRUTOS VERMELHOS 250ML", "AUCHAN", "alimentação/mercearia/azeite,-óleo-e-vinagre/vinagre", null);
  is("Manteiga de Amendoim Cremosa", "PINGO_DOCE", "Mercearia/Compotas Mel e Cremes de Barrar/Cremes de Barrar", null);
  is("Manteiga com Sal Primor", "CONTINENTE", "Laticínios e Ovos/Manteigas e Cremes/Manteigas", "manteiga");
  is("MISTURA ERVAS SALADAS MARGÃO SAQUETA 30G", "AUCHAN", "alimentação/mercearia/sal,-ervas-e-temperos/ervas-e-misturas", null);
  is("MIX SALICORNIA QAMPO P/ CARNE 50 G", "AUCHAN", "alimentação/mercearia/sal,-ervas-e-temperos/ervas-e-misturas", null);
  is("TIRAS DE FRUTA BOB SNAIL MAÇÃ E MORANGO 84 G", "AUCHAN", "alimentação/mercearia/cereais-e-barras/barras-cereais", null);
  is("MIX FRUTAS AGROAGUIAR BANANA AÇAÍFRT VERMELHOS 300G", "AUCHAN", "congelados/legumes-e-fruta/fruta", null);
  is("MIX PEQUENO ALMOÇO SHINE KIDS MAÇÃ BIO 300G", "AUCHAN", "biológicos-e-alternativas/biológicos/biológicos-mercearia/cereais-e-pequeno-almoço", null);
  is("Canjinha de Frango do Campo Continente Seleção", "CONTINENTE", "Marcas/Marcas Continente/Continente Seleção", "sopa");
  is("Mix para Panquecas Proteicas", "PINGO_DOCE", "Mercearia/Farinha Fermento e Acucar/Farinha Fermento e Pao Ralado", null);
  is("Mistura Torrada Moída de Cereais Peninsular", "PINGO_DOCE", "Café, Chá e Achocolatados/Bebidas de Cereais", null);
  is("Grelhada Mista de Porco Continente", "CONTINENTE", "Talho/Porco", "porco");

  console.log("\n  food types: sections and honesty");
  check(
    "a matching head in a NON-food section is rejected",
    classifyFoodType("Batata Vermelha", "CONTINENTE", "Casa e Jardim") === null
  );
  check(
    "Pingo Doce drinks are food (the bug that read its whole drinks aisle as zero)",
    isFoodSection("PINGO_DOCE", "Águas, Sumos e Refrigerantes/Aguas") &&
      isFoodSection("PINGO_DOCE", "Vinhos/Vinho Tinto") &&
      isFoodSection("PINGO_DOCE", "Café, Chá e Achocolatados/Capsulas de Cafe")
  );
  // Paths are department-first since the sitemap crawler; a bare shelf name is
  // no section the decisions file knows, so it is left out and reported.
  check(
    "a section the decisions file does not mention is not food",
    !isFoodSection("PINGO_DOCE", "Vinho Tinto") && !isFoodSection("CONTINENTE", "undefined")
  );
  check(
    "Pingo Doce non-food is still excluded",
    !isFoodSection("PINGO_DOCE", "Casa e Eletrodomésticos") &&
      !isFoodSection("PINGO_DOCE", "Sacos e Sacos de Compras")
  );
  check(
    "an unrecognised head returns null rather than a guess",
    classifyFoodType("Zurblatt Fantástico 500g", "CONTINENTE", "Mercearia") === null
  );

  console.log("\n  food types: free size extraction");
  const size = (name: string) => parseSize(name);
  check("a pack size in the name is read", size("BATATA VERMELHA AUCHAN 3 KG")?.total === 3);
  check("grams fold to kg", Math.abs((size("BOLACHA MARIA 200G")?.total ?? 0) - 0.2) < 1e-9);
  check("a multipack multiplies out", size("LEITE UHT AGROS MEIO GORDO 6X1L")?.total === 6);
  check("no size in the name is null, not a guess", size("Batata Vermelha") === null);

  // Auchan leaves the decimal point out of volumes, so the first digit is the
  // whole part. Read literally these became 198 L, 300 L and 600 L, and a size
  // that is too large makes the price per kilo too small - which sorts it
  // straight to the top of every "cheapest" ranking.
  console.log("\n  food types: Auchan's two size notations");
  const near = (got: number | undefined, want: number) => Math.abs((got ?? -1) - want) < 1e-9;
  check(
    "a three-digit volume has an implied decimal point",
    near(size("CERVEJA SEM ALCOOL SUPER BOCK PILSENER 0.0% 6X033L")?.total, 1.98),
    "6 x 0.33 L = 1.98 L, not 198 L"
  );
  check("and again at half a litre", near(size("AGUA C/ GAS VIMEIRO 6X050L (SDR)")?.total, 3));
  check(
    "and where the whole part is not zero",
    near(size("AGUA S/GAS VIMEIRO ORIGINAL 4X150L (SDR)")?.total, 6),
    "4 x 1.50 L = 6 L, not 600 L"
  );
  check("a plain litre value is untouched", size("SUMO LARANJA 2L")?.total === 2);
  check("and so are grams, where 500 is genuinely 500", near(size("BOLACHA 500G")?.total, 0.5));

  // A weight GRADE is not a size. Auchan grades fish in grams but labels it kg.
  check(
    "a weight range is unknown, not the larger number",
    size("TRUTA SALMONADA 800/1600 KG") === null,
    "we do not know what one fish weighs, so we must not claim to"
  );
  check("another grade, same answer", size("DOURADA FRESCA INTEIRA 400/600 KG") === null);
  check(
    "a slash that is not a range still parses",
    near(size("LEITE UHT M/GORDO GRESSO 1L")?.total, 1),
    "M/GORDO is meio gordo, not a range"
  );

  // The two-digit form of the same notation cannot be decoded: 6X33L is 0.33 L
  // cans while 4X15L is 1.5 L bottles, and nothing in the string tells them
  // apart. Refusing to answer beats being right half the time.
  check("an undecodable volume is unknown, not a guess", size("REFRIGERANTE 7UP LATA 6X33L") === null);
  check("and the other reading of it too", size("AGUA SERRA DA ESTRELA 4X15L") === null);
  check("a calibre where a size goes is unknown", size("CHOURICAO PROBAR T/80 KG") === null);
  check(
    "a model number is not a size",
    size("BOLO CAKE DESIGN PRODUÇÃO PRÓPRIA Nº20 KG") === null,
    "design number 20, sold by the kilo - not a 20 kg cake"
  );
  check("nor with a dot", size("BOLO CAKE DESIGN N.º 7 KG") === null);
  check("a real size beside a model number survives", near(size("VELA Nº5 BOLO 500G")?.total, 0.5));
  check("a 10 L garrafao still parses", near(size("AGUA GARRAFAO 10L")?.total, 10));
  check("a fraction of a centilitre is litres written wrongly",
    near(size("SUPER SMOOTHIE INNOCENT ANTIOX 0.75CL (SDR)")?.total, 0.75), "0.75 L, not 7.5 ml");
  check("whole centilitres are still centilitres", near(size("REFRIGERANTE LATA 33CL")?.total, 0.33));
  // An added amount is in the pack the shopper pays for; reading only the first
  // made these 18-33% dearer per kilo than they are.
  check("an added amount is part of the pack",
    near(size("FIAMBRE DA PERNA EXTRA IZIDORO FATIAS FINAS 120G+30G")?.total, 0.15), "150 g, not 120 g");
  check("with GRATIS after it too", near(size("MEL GRANJA SAN FRANCISCO 850G+150G GRÁTIS")?.total, 1));
  check("and in litres", near(size("REFRIGERANTES COM GÁS FANTA LARANJA 1.5L+0.5L GRÁTIS (SDR)")?.total, 2));
  check("an added amount in another dimension is ignored", near(size("GELADO 500ML+100G")?.total, 0.5));
  check("a plus with no amount changes nothing", near(size("BOLACHAS 200G + OFERTA")?.total, 0.2));
  check("a minimum weight is unknown, not a pack", size("POLVO GRANDE CONGELADO (+6 KG)") === null,
    "an octopus over 6 kg, priced per kilo - not EUR 2.83/kg");
  check("a zero-led two-digit litre is unknown", size("REFRIGERANTES COM GÁS PEPSI ZERO 1+05L OFERTA") === null,
    "1 L + 0.5 L, not 5 L");
  check("a kilo grade with one unit is unknown", size("POLVO CONGELADO (4 A 5 KG)") === null, "graded 4-5 kg, not a 5 kg pack");
  check("and is sold by the kilo", SOLD_PER_KG.test("POLVO NACIONAL AUCHAN CONGELADO (3 A 4 KG)"));
  check("a gram range is still a net weight", near(size("PÊSSEGO FERBAR METADES 810 A 860G")?.total, 0.86));
  check("and an age is not an amount", near(size("BEBIDA LACTEA NESTLÉ BOLACHA MARIA CRESCIMENTO 3+ 1L")?.total, 1));

  // Auchan's figure against the name: the figure decides only where it helps.
  const rec = (total: number, unit: "kg" | "l", name: string) => reconcileTileSize({ total, unit }, name);
  check("an impossible figure loses to the name", rec(399, "kg", "LASANHA IGLO BOLONHESA 300G") === undefined,
    "the first version priced this lasagna at EUR 0.01/kg");
  check("a believable figure fills a name with no size", rec(0.15, "kg", "QUEIJO FRESCO AUCHAN")?.packageSize === 0.15);
  check("but an impossible one does not", rec(150, "kg", "QUEIJO FRESCO AUCHAN") === undefined);
  check("a close figure confirms the name's exact size",
    near(rec(0.274, "kg", "GELADO SNICKERS 6X48G")?.packageSize ?? undefined, 0.288));
  check("a whole multiple is a pack count the name reader missed",
    near(rec(0.15, "kg", "CHOCOLATE SNICKERS SNACK 3 PACK 50G")?.packageSize ?? undefined, 0.15));
  check("ten times is Auchan's per-100 g error, not a pack of ten",
    rec(0.601, "kg", "GEL MYPROTEIN HYROX LIMO/FRAMBOE 60G") === undefined, "60 g, not 601 g");
  check("a whole multiple without a multipack sign is Auchan's error",
    rec(1, "kg", "SALSICHA BEYOND MEAT VEGETAL 200G") === undefined, "200 g, not a kilo");
  check("as is one the name reader had already counted",
    rec(1, "kg", "QUINOA TIPIAK BRANCA EXPRESS 2X100G") === undefined, "2 x 100 g, not a kilo");
  check("a missed '4*100G' is a pack count",
    near(rec(0.4, "kg", "HAMBURGUERES DE SUINO ISENTO DE GLUTEN AUCHAN 4*100G")?.packageSize ?? undefined, 0.4));
  check("and so is 'LEVE 4 PAGUE 3'",
    near(rec(1, "l", "VINHO ROSE MATEUS LEVE 4 PAGUE 3 0.25L")?.packageSize ?? undefined, 1));
  check("any other disagreement leaves the name in charge",
    rec(0.1, "kg", "RÚCULA SELVAGEM VITACRESS 75 G") === undefined);
  check("kilos against litres leaves the name in charge", rec(0.4, "l", "MOLHO BARILLA BASILICO 400G") === undefined);

  // `npm run discover` searches our own catalogue by these rules.
  console.log("\n  discovery: searching the catalogue by words");
  check("accents and case are ignored", matchesTerm("Açúcar Mascavado Continente", "acucar mascavado"));
  check("plurals meet singulars, both ways", matchesTerm("Ovo Cozido", "ovos") && matchesTerm("Ovos Classe M", "ovo"));
  check("including Portuguese plurals", matchesTerm("Limões Bio", "limao") && matchesTerm("Pães de Leite", "pao"));
  check("whole words only: sal does not find salmão", !matchesTerm("Salmão Fumado", "sal"));
  check("every word must be present", !matchesTerm("Iogurte Grego", "iogurte natural"));

  // One rule for plurals and one for brands, wherever names are compared
  // (code review M8, 22 October 2026).
  console.log("\n  one plural rule and one brand rule for every comparison");
  check("plurals fold to the singular, irregular endings included",
    ["limoes", "paes", "naturais", "bifes", "sal"].map(foldPlural).join() === "limao,pao,natural,bife,sal");
  const toks = (name: string, store: string) => [...productTokens(name, store)].sort().join(" ");
  check("candidates fold \"Limões\" and \"Limão\" alike, as the classifier does",
    toks("Limões Bio", "AUCHAN") === toks("Limão Bio", "PINGO_DOCE"), `${toks("Limões Bio", "AUCHAN")} / ${toks("Limão Bio", "PINGO_DOCE")}`);
  const cafe = (brand: string): Candidate => ({ name: "Café Cápsulas Lungo 10 un", brand, size: parseSize("52 g"), unitPrice: 60 });
  const spelled = classifyCandidate(cafe("L'Or"), cafe("LOr"));
  const same = classifyCandidate(cafe("LOr"), cafe("LOr"));
  check("\"L'Or\" and \"LOr\" are one brand when a match is confirmed", spelled.rung === same.rung && spelled.reason === same.reason,
    `${spelled.rung} (${spelled.reason}) against ${same.rung}`);
  check("and different brands are still different", classifyCandidate(cafe("L'Or"), cafe("Delta")).rung !== same.rung);
  // A 36 g dried-fish snack is not cod or squid to cook (22 October 2026).
  const shelf = "alimentação/sabores-do-mundo/cozinha-europa-do-leste";
  check("Ikroff's dried-fish snacks get no fish kind, while dried cod still does",
    classifyFoodType("BACALHAU SECO IKROFF BACALHAU 36G", "AUCHAN", shelf) === null &&
    classifyFoodType("POTA SECA IKROFF 36G", "AUCHAN", shelf) === null &&
    classifyFoodType("Bacalhau Graúdo 1ª Noruega Seco", "CONTINENTE", "Peixaria/Bacalhau Seco/Inteiro") === "bacalhau");

  // Products whose store publishes impossible data (data/store-errors.ts).
  console.log("\n  known store errors: kept out of comparisons, not deleted");
  const crackers: ComparableProduct = {
    storeProductId: "988950", store: "PINGO_DOCE", name: "Bolachas Crackers Sabor a Tomate",
    brand: "Gran Pavesi", price: 3.99, packageSize: 3.36, unit: "kg",
  };
  check("a listed product is recognised", isStoreError("PINGO_DOCE", "988950"));
  check("and only that one", !isStoreError("CONTINENTE", "988950") && !isStoreError("PINGO_DOCE", "988951"));
  check("a listed product cannot compete, however complete its data looks",
    !comparable(crackers, "bolacha"), "Pingo Doce's own label says 3.36 kg");
  check("the same data under another id still can", comparable({ ...crackers, storeProductId: "1" }, "bolacha"));
  check("a store whose only product is listed reads 'size unknown', not 'not sold'",
    cheapestPerStore([crackers], "bolacha").get("PINGO_DOCE")?.kind === "no-size",
    "it does sell biscuits");
  const entry = STORE_ERRORS.find((e) => e.storeProductId === "988950")!;
  check("the store's size unchanged: nothing to do yet",
    storeErrorStatus(entry, { packageSize: 3.36, unit: "kg", delisted: false }).kind === "unchanged");
  check("a rounding wobble is not a change (0.751 against 0.75 kg)",
    storeErrorStatus(entry, { packageSize: 3.364, unit: "kg", delisted: false }).kind === "unchanged");
  const fixed = storeErrorStatus(entry, { packageSize: 0.336, unit: "kg", delisted: false });
  check("the store's size changed: look again now, not in 30 days",
    fixed.kind === "changed" && fixed.was === "3.36 kg" && fixed.now === "0.336 kg");
  check("the size removed altogether also counts as a change",
    storeErrorStatus(entry, { packageSize: null, unit: null, delisted: false }).kind === "changed");
  check("a delisted or missing product is reported as gone",
    storeErrorStatus(entry, { packageSize: 3.36, unit: "kg", delisted: true }).kind === "gone" &&
      storeErrorStatus(entry, null).kind === "gone");
  check("every entry is dated, evidenced and unique",
    STORE_ERRORS.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.checkedOn) && e.evidence.length > 0 && e.problem.length > 0) &&
      new Set(STORE_ERRORS.map((e) => `${e.store}:${e.storeProductId}`)).size === STORE_ERRORS.length);

  // Auchan's own per-unit figure on its listing tiles. Prices and figures as
  // they appeared on three live listings, 4 October 2026.
  console.log("\n  Auchan listing tiles: the store's own per-unit figure");
  const tile = (price: number, figure: string, name: string) => auchanTileSize(price, figure, name);
  check("a per-kilo figure gives the pack size, whatever the name says",
    near(tile(1.29, "8.6 €/Kg", "LINGUIÇA CORRENTE POLEGAR PICANTE KG")?.packageSize ?? undefined, 0.15),
    "EUR 1.29 at 8.60/kg is a 150 g pack, not a kilo");
  check("and it is marked as the store's own figure",
    tile(1.29, "8.6 €/Kg", "LINGUIÇA CORRENTE POLEGAR PICANTE KG")?.sizeSource === "listing");
  check("a per-litre figure gives litres", tile(1.99, "1.33 €/L", "SUMO LARANJA 1.5L")?.unit === "l");
  check("a name the figure confirms keeps its exact size",
    near(tile(3.99, "19.23 €/Kg", "SNACK DE CHOCOLATE KIT KAT 5X41.5G")?.packageSize ?? undefined, 0.2075),
    "207.5 g, not the 208 g a rounded figure gives");
  check("a name the figure contradicts is overruled",
    near(tile(3.29, "21.93 €/Kg", "CHOCOLATE SNICKERS SNACK 3 PACK 50G")?.packageSize ?? undefined, 0.15),
    "three 50 g bars: the name reader saw only 50 g");
  check("a tiny expensive pack keeps its precision",
    near(tile(2.99, "9966.67 €/Kg", "ACAFRAO MOIDO 0.3 G")?.packageSize ?? undefined, 0.0003));
  check("a per-item figure that differs from the price: the price is per kilo",
    tile(4.49, "8.98 €/un", "PATO INTEIRO COM MIUDOS QUINTA DA MARINHA KG")?.packageSize === 1,
    "a whole duck at EUR 4.49/kg, EUR 8.98 the bird");
  const quail = tile(1.25, "1.25 €/un", "CODORNIZ EXTRA AUCHAN CULTIVAMOS O BOM KG");
  check("a per-item figure equal to the price is unknown, deliberately",
    quail !== undefined && quail.packageSize === null && quail.sizeSource === "listing",
    "per bird or one-kilo bird: the tile cannot say, and the KG rule must not guess");
  check("a per-item figure says nothing about a name that is not sold by the kilo",
    tile(2.49, "0.21 €/un", "OVOS CLASSE M AUCHAN 12UN") === undefined,
    "the price of one egg must not make a box of twelve 'per kilo'");
  check("a figure without a unit settles nothing", tile(19.99, "2.00 €", "GUANCIALE MONTARAZ PORCO PRETO KG") === undefined);

  // Saving: a size from a tile must not touch the barcode or the page-read mark.
  const fromTile = enrichment({ packageSize: 0.15, unit: "kg", sizeSource: "listing" });
  check("a tile's size does not erase a barcode", !("ean" in fromTile) && !("eanNormalized" in fromTile));
  check("nor claim a product page was read", !("enrichedAt" in fromTile));
  check("and records where the size came from", fromTile.sizeSource === "listing");
  const fromPage = enrichment({ ean: null, packageSize: 0.5, unit: "kg" });
  check("a product page still writes both, as before",
    "ean" in fromPage && "enrichedAt" in fromPage && fromPage.sizeSource === "page");
  check("a listing that knows nothing writes nothing", Object.keys(enrichment({})).length === 0);

  // A bottle with no size label: the price over the per-litre figure under it.
  // Strings as they appear on live Continente pages (17 October 2026).
  console.log("\n  page sizes: worked out from the price per litre");
  const fromUnit = (text: string, price: number) => sizeFromUnitPrice(text, price);
  check("a wine at 4,99 with 6,65 per litre is a 0.75 L bottle",
    fromUnit("6,65€/lt", 4.99)?.total === 0.75 && fromUnit("6,65€/lt", 4.99)?.unit === "l");
  check("a cheap wine still rounds to 0.75, not 0.749", fromUnit("4,39€/lt", 3.29)?.total === 0.75);
  check("a half bottle stays 0.375", fromUnit("15,71€/lt", 5.89)?.total === 0.375);
  check("a spirit is 0.7 L", fromUnit("19,27€/lt", 13.49)?.total === 0.7);
  check("a per-kilo figure gives kilos", fromUnit("9,95€/kg", 1.99)?.total === 0.2 && fromUnit("9,95€/kg", 1.99)?.unit === "kg");
  check("a price per capsule is not a size", fromUnit("0,31€/un", 19.99) === null);
  check("nor is a per-litre figure labelled per unit", fromUnit("61,32€/un", 45.99) === null);
  check("and no figure means no size", fromUnit("", 18.68) === null);
  // The store's displayed unit price, saved as shown, in each store's format.
  const shown = (t: string) => JSON.stringify(parseShownUnitPrice(t));
  check("Continente's per-litre line is read", shown("6,65€/lt") === '{"value":6.65,"unit":"l"}');
  check("and its per-capsule line too", shown("0,31€/un") === '{"value":0.31,"unit":"un"}');
  check("Pingo Doce's figure after the size", shown("0.1 Kg | 13,9 €/Kg") === '{"value":13.9,"unit":"kg"}');
  check("Auchan's tile figure, with a decimal point", shown("8.6 €/Kg") === '{"value":8.6,"unit":"kg"}');
  check("a plain price is not a unit price", parseShownUnitPrice("4,99€") === null);

  // Goods sold by weight: the headline price is already per kilo, and the size
  // label is what one item weighs. Strings as they appear on live pages
  // (3 October 2026).
  console.log("\n  page sizes: a price that is already per kilo");
  check("Continente's per-kilo headline is recognised",
    pricedPerUnit("2,49€/kg 7,35€/un", 2.49) === "kg", "a whole chicken, emb. 2,95 kg (aprox.)");
  check("so is Pingo Doce's, promotion text and all",
    pricedPerUnit("10,99 €/Kg Price reduced from 12,99 €/Kg to", 10.99) === "kg", "a whole salmon, label 4.2 Kg");
  check("a pack price is not per kilo, whatever the second line says",
    pricedPerUnit("1,99€ 9,95€/kg", 1.99) === null);
  check("nor is a plain promotion", pricedPerUnit("3,79 € Price reduced from 4,99 € to", 3.79) === null);
  check("a per-kilo figure that is not THIS price does not count",
    pricedPerUnit("4,99€/kg", 2.49) === null, "another product's price must never answer for this one");
  check("no price, no verdict", pricedPerUnit("2,49€/kg", null) === null);
  check("a per-kilo price makes the size exactly 1",
    correctedSize("Frango Inteiro", { total: 2.95, unit: "kg" }, "kg")?.total === 1,
    "EUR 2.49/kg, not 2.49 / 2.95 = EUR 0.84/kg");

  console.log("\n  page sizes: capsules counted as kilos or litres");
  check("ten capsules labelled 10 Kg are not 10 kg",
    correctedSize("Cápsulas de Café Nespresso Baunilha", { total: 10, unit: "kg" }, null) === null);
  check("nor is an intensity read as litres",
    implausiblePodSize("Cápsulas de Café Fortissimo Int 10 L'Or", 10, "l"));
  check("a real capsule weight survives",
    correctedSize("Cápsulas de Café Expresso", { total: 0.052, unit: "kg" }, null)?.total === 0.052);
  check("and a 10 kg sack of something that is not a capsule is left alone",
    correctedSize("Batata Branca Saco", { total: 10, unit: "kg" }, null)?.total === 10);
  check("and a 5 kg sack of rice", near(size("ARROZ AGULHA 5 KG")?.total, 5));

  // Portuguese writes thousands with a dot, and Auchan leaves it in front of a
  // small unit, where it reads as a decimal point.
  console.log("\n  food types: a thousands dot before a small unit");
  check("1.200 GR is 1200 grams", near(size("MARISCADA COZIDA UNIDADE 1.200 GR")?.total, 1.2));
  check("0.375G is 375 grams", near(size("RATATOUILLE BONDUELLE 0.375G")?.total, 0.375));
  check("0.250ML is 250 millilitres", near(size("KOMBUCHA PLENO CHA VERDE BIO 0.250ML")?.total, 0.25));
  // One and two decimals are genuinely used for the tiny expensive things, and
  // must survive: these come out near the real EUR 10,000/kg for saffron and
  // EUR 3,800/kg for vanilla.
  check("0.3 G of saffron really is 0.3 grams", near(size("ACAFRAO MOIDO 3 DOSES 0.3 G")?.total, 0.0003));
  check("a 1.2 g vanilla pod likewise", near(size("VAGEM ESPIGA DE BAUNILHA SAQUETA 1.2G")?.total, 0.0012));
  check("and 1.500 KG is still 1.5 kg, not 1500", near(size("ARROZ 1.500 KG")?.total, 1.5));

  // Auchan usually drops the "de" that the other two chains write.
  console.log("\n  food types: plant drinks");
  const t = (name: string) => classifyFoodType(name, "AUCHAN", "alimentação/bebidas");
  check("BEBIDA ARROZ is a drink, not rice", t("BEBIDA ARROZ UHT AUCHAN SEM GLUTEN 1L") === "bebida-vegetal");
  check("BEBIDA AMENDOAS is a drink, not nuts", t("BEBIDA AMÊNDOAS AUCHAN SEM AÇÚCARES 1L") === "bebida-vegetal");
  check("BEBIDA SOJA is classified at all", t("BEBIDA SOJA AUCHAN SEM GLÚTEN 1L") === "bebida-vegetal");
  check("an Alpro naming no plant is still a plant drink", t("BEBIDA ALPRO BARISTA 1L") === "bebida-vegetal");
  check(
    "the written-out form still works",
    classifyFoodType("Bebida Vegetal de Aveia", "CONTINENTE", "Laticínios e Ovos") === "bebida-vegetal"
  );
  check(
    "a dairy drink is NOT swept in - nor, since 17 October 2026, counted as plain milk",
    // A full path, not the bare section: "Laticínios e Ovos" alone tokenises to
    // `ovos` and the fallback answers `ovo`. That is the category fallback
    // being coarse, not the plant-drink rule, and it is why the shelf is only
    // ever consulted last.
    classifyFoodType(
      "Bebida Láctea Infantil 1 a 3 anos",
      "CONTINENTE",
      "Laticínios e Ovos/Leite/Leite Infantil"
    ) === null,
    "widening the rule must not start eating milk"
  );

  return failures - before;
}

/**
 * data/store-sections.ts and the section watch: which products are kept, and
 * what a crawl reports about the store's sections.
 */
function verifyStoreSections(): number {
  const before = failures;
  console.log("\n  store sections");

  check(
    "section names compare without accents, case or punctuation",
    sectionKey("Laticínios e Ovos") === "laticinios-e-ovos" &&
      sectionKey("laticinios-e-ovos") === "laticinios-e-ovos" &&
      sectionKey("viagem,-desporto-e-outdoor") === "viagem-desporto-e-outdoor"
  );
  check(
    "every top section the catalogue holds today is decided, but one broken path",
    ["Frescos/Frutas", "Bio e Saudável", "Marcas/Marcas Continente"].every((p) => sectionOf("CONTINENTE", p).kind !== "unknown") &&
      sectionOf("CONTINENTE", "undefined").kind === "unknown"
  );

  const supplements = sectionOf("CONTINENTE", "Bio e Saudável/Suplementos e Vitaminas/Multivitamínicos");
  check("a skipped sub-section is found below its own level", supplements.skip?.why === "supplements and vitamins");
  check(
    "but its food neighbour in the same section is not skipped",
    sectionOf("CONTINENTE", "Bio e Saudável/Nutrição Desportiva/Barras e Snacks").skip === null
  );
  check(
    "Pingo Doce's unaccented sub-sections match the file's spelling",
    sectionOf("PINGO_DOCE", "Alternativas Alimentares/Suplementos").skip !== null &&
      sectionOf("AUCHAN", "congelados/gelo").skip?.why === "ice"
  );

  check("food in a food section is kept", keepInCatalogue("CONTINENTE", "Mercearia/Conservas", "Atum em Azeite").keep);
  const tv = keepInCatalogue("PINGO_DOCE", "Promoções/Poupe Esta Semana", "TV LG SMART AI FHD 43LR60006LA");
  check("a television in a mixed aisle is left out", !tv.keep && tv.reason === "mixed aisle, not recognised as food");
  check(
    "a recognised food in the same aisle is kept",
    keepInCatalogue("PINGO_DOCE", "Promoções/Poupe Esta Semana", "Queijo Flamengo Fatiado").keep
  );
  const whey = keepInCatalogue("AUCHAN", "biológicos-e-alternativas/nutrição-desportiva/proteína", "PROTEÍNA WHEY 900G");
  check("a protein powder is left out, with the sub-section named", !whey.keep && whey.reason === "skipped sub-section" && /protein powders/.test(whey.detail ?? ""));
  const shampoo = keepInCatalogue("AUCHAN", "beleza-e-higiene/cabelo", "CHAMPÔ");
  check("a non-food section is left out", !shampoo.keep && shampoo.reason === "non-food section");
  const unknown = keepInCatalogue("AUCHAN", "uma-seccao-nova/x", "ARROZ");
  check("an undecided section is left out rather than guessed", !unknown.keep && unknown.reason === "unknown section");

  // --- the section tally -----------------------------------------------------
  const tally = new SectionTally("CONTINENTE");
  tally.add("Mercearia/Conservas/Atum/Em Azeite", "Atum A");
  tally.add("Mercearia/Conservas/Sardinha", "Sardinha B");
  tally.add("Limpeza/Roupa/Detergentes", "Detergente C");
  const paths = tally.entries.map((e) => e.path).sort();
  check(
    "sections are recorded three levels deep at most",
    paths.includes("mercearia/conservas/atum") && !paths.some((p) => p.split("/").length > 3)
  );
  check("a non-food section's sub-sections are not recorded", paths.includes("limpeza") && !paths.includes("limpeza/roupa"));
  const conservas = tally.entries.find((e) => e.path === "mercearia/conservas");
  check("products are counted at every level, with an example", conservas?.products === 2 && conservas.example === "Atum A");
  const listOnly = new SectionTally("CONTINENTE", false);
  listOnly.add("mercearia/conservas");
  check("a list of sections counts no products", listOnly.entries.every((e) => e.products === null));

  // --- comparing with the previous crawl ---------------------------------------
  const t0 = new Date("2026-10-01T00:00:00Z");
  const t1 = new Date("2026-10-02T00:00:00Z");
  const prev = (path: string, at = t1) => ({ path, label: path, depth: path.split("/").length, lastSeenAt: at });
  const seen = (path: string) => ({ path, label: path, depth: path.split("/").length, products: 1, example: "x" });

  const first = compareSections("CONTINENTE", [], [seen("mercearia"), seen("mercearia/nova")], true);
  check("the first crawl calls nothing new", first.firstRun && first.added.length === 0);

  const next = compareSections(
    "CONTINENTE",
    [prev("mercearia"), prev("mercearia/velha"), prev("mercearia/antiga", t0)],
    [seen("mercearia"), seen("mercearia/nova")],
    true
  );
  check("a section not seen before is new, with its section's decision", next.added.length === 1 && next.added[0].kind === "food");
  check(
    "a section the last crawl saw and this one did not has vanished",
    next.vanished.map((v) => v.path).join() === "mercearia/velha",
    "one gone longer ago is not reported again"
  );
  const partial = compareSections("CONTINENTE", [prev("mercearia"), prev("mercearia/velha")], [seen("mercearia")], false);
  check("a partial crawl reports nothing as vanished", partial.vanished.length === 0);

  const undecided = compareSections("AUCHAN", [prev("alimentacao")], [seen("alimentacao"), seen("seccao-nova")], true);
  check("an undecided top section is reported", undecided.undecided.map((s) => s.path).join() === "seccao-nova");
  check("and makes the report WARN", sectionProblems(undecided).some((p) => p.includes("not decided")));
  check(
    "a new non-food section is listed but does not WARN",
    sectionProblems(compareSections("CONTINENTE", [prev("limpeza")], [seen("limpeza"), seen("animais")], true)).length === 0
  );

  const leftOut = new LeftOutTally();
  leftOut.add(tv, "TV", "Promoções/Poupe Esta Semana");
  leftOut.add(shampoo, "CHAMPÔ", "beleza-e-higiene/cabelo");
  check("what was left out is counted, but not the non-food sections", leftOut.total === 1);

  check(
    "Continente's category sitemap is read at every depth",
    parseCategoryPaths(
      "<loc>https://www.continente.pt/mercearia/</loc><loc>https://www.continente.pt/mercearia/conservas/</loc><loc>https://www.continente.pt/</loc>"
    ).join() === "mercearia,mercearia/conservas"
  );
  check(
    "a Pingo Doce address gives a readable example name",
    nameFromUrl("https://www.pingodoce.pt/home/produtos/mercearia/conservas/atum-em-azeite-893466.html") === "atum em azeite"
  );

  return failures - before;
}

/** The real-food list of 17 October 2026: misfilings fixed, new kinds, eggs per egg. */
function verifyRealFoodList(): number {
  const before = failures;
  console.log("\n  the real-food list");
  const c = (name: string, store: string, path: string) => classifyFoodType(name, store, path);

  check(
    "a shelf two levels up does not decide: Pingo Doce's fuet is not cheese",
    c("Fuet Extra", "PINGO_DOCE", "Charcutaria e Queijos/Charcutaria/Outros Enchidos e Fumeiro") !== "queijo" &&
      c("Lombo Fatiado Curado", "PINGO_DOCE", "Charcutaria e Queijos/Charcutaria/Outros Enchidos e Fumeiro") === null
  );
  check(
    "an avocado on the grapes shelf is an avocado",
    c("Abacate Hass Continente", "CONTINENTE", "Frescos/Frutas/Uvas e Tropicais") === "abacate"
  );
  check(
    "a name-only kind is never decided by its shelf: a lime is not an orange",
    c("Lima Continente", "CONTINENTE", "Frescos/Frutas/Laranja, Clementina e Limão") === null
  );
  check(
    "courgettes are not beans",
    c("Curgete Verde Continente", "CONTINENTE", "Frescos/Legumes/Curgete, Beringela e Feijão Verde") === "curgete"
  );
  check(
    "green beans have their own kind",
    c("Feijão Verde", "PINGO_DOCE", "Frutas e Vegetais/Vegetais") === "feijao-verde" &&
      c("Feijão Encarnado Cozido", "PINGO_DOCE", "Mercearia/Arroz Massa e Leguminosas") === "feijao"
  );
  check(
    "Pingo Doce's lactose-free \"Bebida de Leite\" is milk",
    c("Bebida de Leite UHT Livre Meio Gordo", "PINGO_DOCE", "Leite e Bebidas Vegetais/Leite") === "leite"
  );
  check(
    "chocolate milk and coconut milk are not milk",
    c("Leite Achocolatado", "PINGO_DOCE", "Leite e Bebidas Vegetais/Leite") === null &&
      // a kind of its own since 20 October 2026
      c("Leite de Coco Ayam", "CONTINENTE", "Mercearia/Açúcar e Sobremesas/Leite Condensado e Leite de Coco") === "leite-coco"
  );
  check(
    "walnut kernels reach walnuts through the plural",
    c("Miolo de Nozes Metades Continente", "CONTINENTE", "Frescos/Frutas/Frutos Secos, Desidratados e Sementes") === "noz"
  );
  check(
    "oat flakes are oats, and cornflakes are not sweetcorn",
    c("Flocos de Aveia Finos", "PINGO_DOCE", "Mercearia") === "aveia" &&
      c("Flocos de Milho Cobertos com Chocolate", "PINGO_DOCE", "Mercearia") !== "milho"
  );
  check(
    "a cereal bar is not a breakfast cereal",
    c("Barras de Cereais com Chocolate", "PINGO_DOCE", "Bolachas, Cereais e Guloseimas/Cereais Barras e Bolsas de Fruta/Barras de Cereais") === null
  );
  check(
    "egg white and quail eggs are not eggs",
    c("Clara de Ovo Pasteurizada Continente", "CONTINENTE", "Laticínios e Ovos/Ovos") === null &&
      c("Ovos de Codorniz", "PINGO_DOCE", "Ovos") === null &&
      c("Ovos de Solo Classe M", "PINGO_DOCE", "Ovos") === "ovo"
  );

  check(
    "an egg count is read from the name",
    eggCountFromName("OVOS GALINHAS SOLO AUCHAN CLASSE M 12UN") === 12 &&
      eggCountFromName("OVOS POLEGAR CLASSE M MEIA DÚZIA") === 6 &&
      eggCountFromName("OVOS SABOROSOS CLASSE M 2 DUZIAS") === 24 &&
      eggCountFromName("OVOS SABOROSOS CLASSE L UMA DÚZIA") === 12 &&
      eggCountFromName("Ovos de Solo Classe M") === null
  );
  check(
    "or from the store's price per egg, though rounded to the cent",
    eggCountFromUnitPrice(2.99, 0.25, "un") === 12 && eggCountFromUnitPrice(1.79, 0.3, "un") === 6
  );
  check(
    "a per-kilo figure gives no count",
    eggCountFromUnitPrice(2.99, 0.25, "kg") === null && eggCountFromUnitPrice(null, 0.25, "un") === null
  );
  const egg = (store: string, price: number, count: number) =>
    ({ storeProductId: `e-${store}`, store, name: "Ovos", brand: null, price, packageSize: count, unit: "un" });
  check("eggs are compared per egg", comparable(egg("CONTINENTE", 2.99, 12), "ovo") && unitsFor("ovo", []).join() === "un");
  check("a box counted in eggs never enters a per-kilo ranking", !comparable(egg("CONTINENTE", 2.99, 12), "batata"));

  const hidden = new Set(FOOD_TYPES.filter((t) => t.hidden).map((t) => t.id));
  check(
    "sweets and drinks are set aside, everyday food is not",
    ["chocolate", "bolacha", "gelado", "vinho", "cerveja", "refrigerante"].every((id) => hidden.has(id)) &&
      ["leite", "agua", "cafe", "acucar", "pao", "ovo"].every((id) => !hidden.has(id))
  );

  return failures - before;
}

/** The kinds that used to hold several foods, split on 17 October 2026. */
function verifySplitKinds(): number {
  const before = failures;
  console.log("\n  kinds that held several foods, split");
  const c = (name: string, store = "PINGO_DOCE", path = "Mercearia") => classifyFoodType(name, store, path);

  check("a scabbardfish steak is scabbardfish", c("Posta de Peixe Espada Preto Fresco", "PINGO_DOCE", "Peixaria/Peixe") === "peixe-espada");
  check("a grouper head is not grouper", c("Cabeça de Garoupa Fresca", "PINGO_DOCE", "Peixaria/Peixe") === null);
  check("an unnamed fish has no kind now", c("Cachucho Fresco", "PINGO_DOCE", "Peixaria/Peixe") === null);
  check("a fillet goes to its fish", c("Filetes de Pescada do Cabo Congelados") === "pescada" && c("Filetes de Atum em Azeite") === "atum");
  // Since 18 October 2026 tinned and fresh fish are one kind each, kept apart by
  // the label "lata" rather than by separate kinds.
  const tin = (kind: string, name: string) => labelsOf(kind, name).includes("lata");
  check(
    "tinned and fresh fish are one kind, told apart by the label",
    c("Atum ao Natural Bom Petisco 120 (84) G") === "atum" && tin("atum", "Atum ao Natural Bom Petisco 120 (84) G") &&
      c("Bife de Atum Fresco") === "atum" && !tin("atum", "Bife de Atum Fresco") &&
      c("CAVALA KG", "AUCHAN", "produtos-frescos/peixaria") === "cavala" && tin("cavala", "Filetes de Cavala em Azeite")
  );
  check(
    "a tinned squid is squid, labelled tinned",
    c("Lulas em Molho Americano") === "lula" && tin("lula", "Lulas em Molho Americano") &&
      !tin("lula", "LULA COSTA FRESCA INTEIRA KG")
  );
  check(
    "piri-piri sauce and dried piri-piri are different kinds, and a bottle saying neither has none",
    c("Molho Piri-Piri Extra Forte") === "piri-piri" && c("Piri-piri Moído") === "piri-piri-seco" &&
      c("PIRI-PIRI GALLO 50ML") === null
  );
  check(
    "tinned fish written without \"em\", or with a drained weight, is tinned",
    tin("cavala", "Filetes Cavala Óleo Vegetal") && tin("cavala", "FILETE CAVALA PITEU EM MOSTARDA 120G") &&
      tin("sardinha", "SARDINHA AUCHAN COLLECTION SEM PELE E SEM ESPINHA (85)120G")
  );
  check("smoked fish is labelled smoked", labelsOf("sardinha", "SARDINHA FUMADA FILETE REAL 100 GR").includes("fumado"));
  check("a cow's foot is not beef", c("MÃO DE BOVINO CONGELADO KG", "AUCHAN", "produtos-frescos/talho") === null);
  check("breaded fillets are a kind of their own", c("Filetes de Pescada Panados com Limão Congelados") === "filete-panado");
  check("but breaded CHICKEN is not a fish fillet", c("Panado de Frango", "PINGO_DOCE", "Talho/Aves") !== "filete-panado");
  check(
    "the packing is not the food",
    // anchovies have been a kind since 20 October 2026; the point is that it is not oil
    c("Filetes de Anchova em Óleo") === "anchova" && c("Filetes Recheados com Tomate e Mozzarella") === null
  );
  check(
    "everyday sauces have kinds of their own",
    c("Molho de Soja") === "molho-soja" && c("Molho Pesto Alla Genovese") === "pesto" &&
      c("Molho Béchamel") === "bechamel" && c("Molho Piri-Piri Extra Forte") === "piri-piri"
  );
  check("other sauces have no kind", c("Molho Caesar") === null);
  check("seeds are compared seed by seed", c("Sementes de Chia") === "chia" && c("Sementes de Girassol") === "girassol");
  check("a seed mix has no kind", c("Mistura de Sementes") === null);
  check(
    "a bag of leaves and a ready-made salad are different kinds",
    c("Salada Camponesa Embalada", "PINGO_DOCE", "Frutas e Vegetais/Vegetais") === "salada-folhas" &&
      c("Salada de Massa e Atum", "PINGO_DOCE", "Take Away") === "salada-pronta"
  );
  check("codfish cakes are not pastel de nata", c("Pastéis de Bacalhau Congelados") === "pastel-bacalhau" && c("Pastel de Nata") === "pastel-nata");
  check("tomato pulp is its own kind", c("Polpa de Tomate") === "polpa-tomate" && c("Passata de Tomate Mutti") === "polpa-tomate");
  check("beef offal is not beef, but coração de alcatra is", c("Rim de Bovino Embalado", "PINGO_DOCE", "Talho") === null &&
    c("Bife do Coração de Alcatra de Vitela", "CONTINENTE", "Frescos/Talho") === "vitela");
  check("Caldo Verde is a soup, not a stock", c("Caldo Verde Continente") !== "caldo");
  check("salt flakes are salt", c("Flor de Sal Marnoto", "CONTINENTE", "Mercearia/Molhos, Temperos e Sal/Sal") === "sal");
  check(
    "dried herbs on the salt-and-herbs shelf are not salt",
    c("TOMILHO PICADO AUCHAN DESIDRATADO", "AUCHAN", "alimentação/mercearia/sal,-ervas-e-temperos/ervas-aromáticas") === null
  );
  return failures - before;
}

/** The food tree of 18 October 2026: categories, sub-kinds, labels, and the kinds it changed. */
function verifyFoodTree(): number {
  const before = failures;
  console.log("\n  the food tree");
  const c = (name: string, store = "PINGO_DOCE", path = "Mercearia") => classifyFoodType(name, store, path);

  check("the tree is sound: every kind on the site in exactly one category", treeProblems().length === 0, treeProblems().join("; "));
  check("a kind's category follows from the kind", categoryOf("frango")?.id === "carne" && categoryOf("coentros")?.id === "temperos");
  check("a set-aside kind has no category yet, only where it will go", categoryOf("chocolate") === null && laterCategoryOf("vinho") === "Bebidas");

  check("chicken breast is peito, wings are asa", subKindOf("frango", "Peito de Frango Embalado") === "peito" && subKindOf("frango", "ASAS DE FRANGO KG") === "asa");
  check("semi-skimmed milk is not read as whole milk", subKindOf("leite", "Leite UHT Meio Gordo Mimosa") === "meio-gordo");
  check("basmati and risotto rice", subKindOf("arroz", "Arroz Basmati Cigala") === "basmati" && subKindOf("arroz", "Arroz Arbório para Risotto") === "risotto");
  check("a name matching no sub-kind has none", subKindOf("frango", "Frango para Churrasco Embalado") === null);
  check("a kind with no sub-kinds gives none", subKindOf("banana", "Banana da Madeira") === null);

  check("frozen and organic are labels, and can come together", labelsOf("ervilha", "Ervilhas Biológicas Congeladas").join() === "congelado,bio");
  check("tuna in olive oil is tinned", labelsOf("atum", "Atum em Azeite Bom Petisco").includes("lata"));
  check("olive oil is not tinned, though it says azeite", !labelsOf("azeite", "Azeite Virgem Extra Gallo").includes("lata"));
  check("nuts are not dried fruit by the word secos", !labelsOf("noz", "Miolo de Noz Frutos Secos").includes("seco"));
  check("porco preto is a label on pork and charcutaria", labelsOf("porco", "Lombo de Porco Preto").includes("porco-preto") &&
    labelsOf("chourico", "Chouriço de Porco Preto").includes("porco-preto") && !labelsOf("pao", "Pão Alentejano").includes("porco-preto"));
  check("Pingo Doce's \"Livre\" milk is lactose-free", labelsOf("leite", "Bebida de Leite UHT Livre Meio Gordo").includes("sem-lactose"));

  // The read-through of every comparison's cheapest products, 21 October 2026.
  check("free-range eggs are not lactose-free", !labelsOf("ovo", "Ovos de Ar Livre Classe M/L").includes("sem-lactose"));
  check("a frozen shelf makes a product frozen, though its name does not say so",
    labelsOf("espinafre", "ESPINAFRES AUCHAN FOLHAS PORÇÕES 1KG", "congelados/legumes-e-fruta/legumes").includes("congelado") &&
    !labelsOf("espinafre", "Espinafres Embalados", "Frutas e Vegetais/Legumes").includes("congelado"));
  check("fruit in syrup and peeled tomatoes are tinned",
    labelsOf("pessego", "Pêssego em Calda").includes("lata") && labelsOf("tomate", "Tomate Pelado Inteiro").includes("lata") &&
    !labelsOf("tomate", "Tomate Chucha Continente").includes("lata"));
  check("a breaded fillet with garlic is not tinned fish",
    !labelsOf("filete-panado", "Filetes de Pescada com Salsa e Alho Continente").includes("lata") &&
    labelsOf("sardinha", "Sardinhas com Alho Ramirez").includes("lata"));
  check("fragrant rice is not smoked", !labelsOf("arroz", "Arroz Thai Perfumado Caçarola").includes("fumado") &&
    labelsOf("salmao", "Salmão Fumado da Noruega").includes("fumado"));
  check("M/GORDO is semi-skimmed milk", subKindOf("leite", "LEITE UHT GRESSO M/GORDO PACK POUPANÇA 8 X1L") === "meio-gordo");
  // Forms and varieties found by the comparison check, 30 October 2026.
  check("nuts in the shell are a form apart from kernels",
    labelsOf("avela", "Avelã com Casca Agromontenegro").includes("casca") &&
    !labelsOf("avela", "Miolo de Avelã com Pele Continente").includes("casca"));
  check("cooked lobster apart from raw, but every crab alike",
    labelsOf("lavagante", "Lavagante Cozido").includes("cozido") &&
    !labelsOf("lavagante", "LAVAGANTE CANADA FRESCO UNIDADE 400 G").includes("cozido") &&
    !labelsOf("sapateira", "Sapateira Cozida Fresca").includes("cozido"));
  check("a family pie and a pasty are forms of a pie",
    labelsOf("empada", "Empadão de Bacalhau Riberalves").includes("empadao") &&
    labelsOf("empada", "MINI EMPANADAS AUCHAN ATUM 500G").includes("empanada") &&
    subKindOf("empada", "Empadão de Pescada e Legumes") === "peixe");
  check("seasoned meat apart from plain",
    labelsOf("porco", "Entrecosto de Porco Preto Temperado com Ervas Finas Valbolota").includes("temperado") &&
    !labelsOf("porco", "Entremeada com Osso Continente").includes("temperado"));
  check("cauliflower and cabbage are not one comparison",
    subKindOf("couve", "COUVE-FLOR AUCHAN COZIDA 660(390)G") === "flor" &&
    subKindOf("couve", "Couve Branca Monolith") === "branca" &&
    subKindOf("couve", "Couve Lombarda/Saboia Continente") === "lombarda");
  check("couve brócolo is broccoli; a strawberry mix is not strawberry",
    classifyFoodType("Couve Brócolo Continente", "CONTINENTE", "Frutas e Legumes/Legumes") === "brocolo" &&
    classifyFoodType("MORANGOS E AMORAS BOTANIC DESIDRATADO 12G", "AUCHAN", "Frutas e Legumes/Fruta") !== "morango");
  check("pork chops from the loin are chops", subKindOf("porco", "Costeletas do Lombo de Porco Continente") === "costeleta");
  check("Granarolo is a brand, not grana", subKindOf("queijo", "Queijo Ricotta Proteína Granarolo") !== "parmesao" &&
    subKindOf("queijo", "Queijo Grana Padano DOP 16 Meses") === "parmesao");
  check("a cheese spread is a spread whatever the cheese", subKindOf("queijo", "Creme de Queijo para Barrar Emmental Continente") === "barrar");
  check("Calorino is carolino, and plain long-grain is agulha", subKindOf("arroz", "Arroz Calorino") === "carolino" &&
    subKindOf("arroz", "ARROZ LONGO COMUM POLEGAR 1KG") === "agulha" && subKindOf("arroz", "ARROZ CAROLINO AUCHAN EXTRA LONGO 1KG") === "carolino" &&
    subKindOf("arroz", "Arroz Thai Jasmim Dragon Fortune") === "aromatico");
  check("half-fat, salted and unsalted butter are apart", subKindOf("manteiga", "MANTEIGA MAGRA AUCHAN -50% DE GORDURAS 250G") === "magra" &&
    subKindOf("manteiga", "Manteiga sem Sal") === "sem-sal" && subKindOf("manteiga", "Manteiga com Sal") === "com-sal");
  check("white cane sugar is white", subKindOf("acucar", "Açúcar Branco de Cana Sidul") === "branco");
  check("butter beans are not red beans", subKindOf("feijao", "Feijão Manteiga Cozido Continente") === "manteiga");
  check("chocolate salame, coconut sweets and petit-suisse are not what they are named after",
    c("Salame de Chocolate", "PINGO_DOCE", "Padaria e Pastelaria/Pastelaria") !== "salame" &&
    c("CÔCOS DOCES DA PENHA 250G", "AUCHAN", "produtos-frescos/fruta") !== "coco" &&
    c("Queijinho Petit Morango, Banana e Pêssego Continente", "CONTINENTE", "Laticínios e Ovos/Queijos") !== "queijo");
  check("monkfish heads, roe and breaded shrimp are not the fish",
    c("TAMBORIL CABEÇA KG", "AUCHAN", "produtos-frescos/peixaria/peixe-fresco") !== "tamboril" &&
    c("CORVINA OVAS KG", "AUCHAN", "produtos-frescos/peixaria/peixe-fresco") !== "corvina" &&
    c("Camarões Panados Continente", "CONTINENTE", "Congelados/Marisco") !== "camarao");
  check("mince must say so", c("Carne para Cozido", "PINGO_DOCE", "Talho") !== "carne-picada" &&
    c("Carne Picada de Novilho", "PINGO_DOCE", "Talho") === "carne-picada");
  check("pizza dough is neither pasta nor pizza", c("Massa Fresca para Pizza Continente", "CONTINENTE", "Mercearia/Massas") !== "massa" &&
    c("Massa para Pizza sem Glúten", "PINGO_DOCE", "Mercearia/Massas") !== "pizza");
  check("coconut water is not water", c("Água de Coco", "PINGO_DOCE", "Águas, Sumos e Refrigerantes/Águas") !== "agua");

  // Promotion marks (lib/promotion.ts), 21 October 2026.
  const now = new Date("2026-10-21T20:00:00Z");
  const promo = (over: object) => promotionOf({ price: 4.83, packageSize: 1, onPromotion: true, ...over }, now);
  check("a Continente promotion shows the price before, per unit", promo({ price: 9.66, packageSize: 2, regularPrice: 11.72 })?.regularUnitPrice === 5.86);
  check("a Pingo Doce promotion shows its end date", promo({ promoEndsAt: new Date("2026-10-26T00:00:00Z") })?.endsOn === "2026-10-26");
  check("a promotion ending today still counts; one ended yesterday does not",
    promo({ promoEndsAt: new Date("2026-10-21T00:00:00Z") }) !== null && promo({ promoEndsAt: new Date("2026-10-20T00:00:00Z") }) === null);
  check("no marker, or an earlier price that is not higher, says nothing more",
    promotionOf({ price: 4.83, packageSize: 1, onPromotion: null }, now) === null && promo({ regularPrice: 4.83 })?.regularUnitPrice === null);

  check("clementines and tangerines are different kinds", c("CLEMENTINA KG", "AUCHAN", "produtos-frescos/fruta") === "clementina" &&
    c("Mandarina Embalada", "PINGO_DOCE", "Frutas e Vegetais/Frutas") === "tangerina");
  check("a product sold as both is neither", c("Clementina/Mandarina Continente", "CONTINENTE", "Frescos/Frutas") === null);
  check("veal and beef are different kinds", c("Lombo de Vitelão", "PINGO_DOCE", "Talho") === "vitela" &&
    c("Maminha de Novilho", "PINGO_DOCE", "Talho") === "vaca" && c("Picanha de Bovino Europa", "PINGO_DOCE", "Talho") === "vaca");
  check("lamb and kid goat are different kinds", c("Perna de Borrego", "PINGO_DOCE", "Talho") === "borrego" &&
    c("Quartos de Cabrito Balcão Continente", "CONTINENTE", "Frescos/Talho") === "cabrito");
  check("cured shoulder is ham, fresh shoulder is pork", c("PALETA DE PORCO PRETO MONTARAZ 70 G", "AUCHAN", "produtos-frescos/charcutaria") === "presunto" &&
    c("Paleta de Porco", "PINGO_DOCE", "Talho/Porco") === "porco");
  check("Leite Creme is not milk", c("Leite Creme", "PINGO_DOCE", "Leite e Bebidas Vegetais/Leite") !== "leite");
  check("tonic water is set aside with the drinks", c("Água Tónica Schweppes", "CONTINENTE", "Bebidas e Garrafeira/Água") === "agua-sabor");
  check("ravioli is pasta, a filled wrap is not a flatbread", c("Ravioli 4 Queijos") === "massa" && c("Wrap de Atum") !== "tortilha" &&
    c("Wraps de Trigo Integral") === "tortilha");
  check("capsules are counted: 40UN, 10 cápsulas, x16", capsuleCountFromName("CÁPSULAS DELTA Q PACK XL 40UN") === 40 &&
    capsuleCountFromName("Café 10 Cápsulas Nespresso") === 10 && capsuleCountFromName("Pastilhas x16") === 16 &&
    capsuleCountFromName("Cápsulas de Café Intenso Int 13 Continente") === null);
  check("each pack's count comes from the right rule", itemCount("ovo", "OVOS M 12UN", 2.99, null, null) === 12 &&
    itemCount("cafe-capsula", "CAPSULAS DOLCE GUSTO ROBUSTO 30 UN", 10.49, null, null) === 30 && itemCount("arroz", "Arroz 1kg", 1, null, null) === null);

  return failures - before;
}
