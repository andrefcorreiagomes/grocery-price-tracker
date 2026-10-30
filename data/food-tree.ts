/**
 * The food tree: category, kind, sub-kind - and the labels that say how a
 * product is sold.
 *
 *   Carne  >  Frango  >  Peito          label: congelado
 *
 * Decided with the user on 18 October 2026 from a measured draft (the
 * "Food Category Tree" page). The rules:
 *
 *   - A KIND (Frango) is decided by src/lib/food-types.ts from the product's
 *     name, and belongs to exactly one CATEGORY (Carne), listed here.
 *   - A SUB-KIND (Peito) is a cut or a variety, read from the name once the kind
 *     is known. It exists only where the products of a kind differ a lot in
 *     price per kilo along a nameable split, or where a shopper would not swap
 *     one for the other (whole and skimmed milk), and only if at least two
 *     chains sell it.
 *   - A LABEL says how a product is sold - fresh or frozen, tinned, smoked,
 *     dried, organic, lactose-free, gluten-free, porco preto - and applies
 *     across kinds. Comparisons group products with the same sub-kind AND the
 *     same labels, so fresh chicken breast is compared with fresh chicken
 *     breast.
 *
 * Fruit varieties (kinds of apple, pear, grape) are a later level; see the
 * project to-do list.
 *
 * Every rule below is tested against the name with accents removed and in
 * lower case. Sub-kinds are tried in order and the first that matches wins; a
 * product matching none has no sub-kind, which is honest.
 */

export interface Category {
  id: string;
  label: string;
  /** the kinds of food it holds, in the order the site shows them */
  kinds: string[];
}

export const CATEGORIES: Category[] = [
  { id: "fruta", label: "Fruta", kinds: [
    "maca", "pera", "laranja", "clementina", "tangerina", "limao", "banana", "uva", "morango", "framboesa",
    "mirtilo", "cereja", "pessego", "nectarina", "alperce", "ameixa", "kiwi", "manga", "ananas", "abacate",
    "figo", "coco", "papaia", "maracuja", "melao", "melancia",
  ] },
  { id: "legumes", label: "Legumes e verduras", kinds: [
    "batata", "batata-doce", "cebola", "alho", "alho-frances", "tomate", "pepino", "pimento", "cenoura",
    "abobora", "beterraba", "couve", "brocolo", "grelo", "espinafre", "curgete", "beringela", "feijao-verde",
    "ervilha", "cogumelo", "milho", "azeitona", "alface", "rucula", "agriao", "salada-folhas", "quiabo",
    "batata-pre-frita",
  ] },
  { id: "carne", label: "Carne", kinds: [
    "frango", "peru", "pato", "porco", "vitela", "vaca", "borrego", "cabrito", "coelho", "carne-picada",
    "hamburguer", "almondega", "nugget",
  ] },
  { id: "peixe", label: "Peixe e marisco", kinds: [
    // Tinned and fresh fish are one kind each; the label "em lata" keeps them apart.
    "bacalhau", "salmao", "pescada", "atum", "sardinha", "cavala",
    "dourada", "robalo", "carapau", "corvina", "tamboril", "perca", "truta", "linguado", "peixe-espada", "pargo",
    "garoupa", "raia", "red-fish", "safio", "maruca", "pregado", "besugo", "faneca", "sargo", "filete-panado",
    "douradinho", "paloco", "anchova", "camarao", "ameijoa", "mexilhao", "lula", "polvo", "pota", "choco", "sapateira", "berbigao",
    "delicias-do-mar", "caracol", "lagosta", "lavagante",
  ] },
  { id: "charcutaria", label: "Charcutaria", kinds: [
    "fiambre", "presunto", "chourico", "salsicha", "mortadela", "bacon", "paio", "salame", "alheira",
    "farinheira", "linguica", "salpicao", "morcela", "pate", "fuet",
  ] },
  { id: "laticinios", label: "Laticínios e ovos", kinds: [
    "leite", "iogurte", "bifidus", "kefir", "queijo", "requeijao", "manteiga", "nata", "ovo", "bebida-vegetal", "vegurte",
    "leite-condensado", "leite-coco",
  ] },
  { id: "padaria", label: "Padaria", kinds: ["pao", "tortilha", "pao-ralado", "tosta"] },
  { id: "cereais", label: "Arroz, massa e cereais", kinds: ["arroz", "massa", "quinoa", "bulgur", "aveia", "cereais", "farinha", "cuscuz"] },
  { id: "leguminosas", label: "Leguminosas", kinds: ["feijao", "grao", "lentilha", "tremoco", "tofu"] },
  { id: "azeite", label: "Azeite, óleo e vinagre", kinds: ["azeite", "oleo", "vinagre"] },
  { id: "temperos", label: "Temperos e especiarias", kinds: [
    "sal", "acucar", "pimenta", "cominho", "oregao", "gengibre-po", "piri-piri-seco", "caril", "canela", "fermento", "caldo",
    // Fresh herbs, mainly used for seasoning: moved here from vegetables by the
    // user's decision.
    "coentros", "salsa", "hortela", "manjericao", "gengibre",
  ] },
  { id: "molhos", label: "Molhos", kinds: [
    "maionese", "ketchup", "mostarda", "molho-soja", "piri-piri", "pesto", "bechamel", "molho-alho", "barbecue",
    "molho-tomate", "polpa-tomate",
  ] },
  { id: "frutos-secos", label: "Frutos secos e sementes", kinds: [
    "amendoim", "amendoa", "caju", "noz", "noz-peca", "avela", "pinhao", "castanha", "pistacio", "chia", "girassol", "sesamo",
    "semente-abobora", "linhaca", "canhamo", "arando",
  ] },
  { id: "refeicoes", label: "Refeições prontas e salgados", kinds: [
    "pizza", "lasanha", "refeicao", "sopa", "sopa-instantanea", "salada-pronta", "quiche", "empada", "rissol", "croquete",
    "pastel-bacalhau", "folhado", "sande",
  ] },
  { id: "cafe", label: "Café, chá e água", kinds: ["cafe", "cafe-capsula", "bebida-cereais", "cha", "infusao", "agua"] },
];

/** Where the set-aside kinds go when they come back. */
export const LATER_CATEGORIES: Record<"sweets" | "drinks", string> = {
  sweets: "Doces e sobremesas",
  drinks: "Bebidas",
};

export interface SubKind {
  id: string;
  label: string;
  match: RegExp;
}

const s = (id: string, label: string, match: RegExp): SubKind => ({ id, label, match });

// Plant-based meat substitutes, by the words and brands the three chains use.
// 29 October 2026.
const PLANT = /vegetal|vegetarian|vegan|\bveg\b|veggie|\bveg in\b|\bsoja\b|heura|beyond|seitan|tofu|green cuisine|garden gourmet|alterveg|linda mccartney|revolugreen|vegplanet|vegalia|wheaty|veggis|cem porcento|proteina vegetal/;

// Beef: the same cuts whatever the animal's age.
const BEEF: SubKind[] = [
  s("bifes", "Bifes", /\bbifes?\b|bifinho|escalope/),
  // Shoulder and chuck ("Pá e Acém de Vitelão") are stewing cuts; they were in
  // the loin comparison at half its price. 29 October 2026.
  s("pecas", "Lombo, vazia e alcatra", /^(?!.*(\bpa\b|acem)).*(lombo|vazia|alcatra|maminha|picanha|pojadouro|rosbife|entrecote|ribeye|tomahawk|fraldinha)/),
  s("costeleta", "Costeleta e chuleta", /costelet|chuleta|t-?bone/),
  s("estufar", "Para estufar e cozer", /estufar|cozer|guisar|cozido|jardineira|\bcubos?\b|acem|\bpa\b/),
  s("picada", "Picada", /picad/),
];

/**
 * The third level. Measured on 18 October 2026: each sub-kind is sold at two
 * or more chains, and its typical price per kilo is given against its kind's
 * (x1.26 = 26% dearer). The figures are in the "Food Category Tree" page.
 */
export const SUB_KINDS: Record<string, SubKind[]> = {
  frango: [
    s("peito", "Peito e bifes", /peito|bifes? de frango|bifinho|lombinho|escalope/), // x1.26
    s("perna", "Perna e coxa", /perna|coxa|pernil/), // x0.73
    s("asa", "Asa", /\basas?\b|asinha/), // x0.51
    s("inteiro", "Inteiro", /inteir|frango do campo|campestre/), // x0.68
    // Feet too: Auchan's "PATAS DE FRANGO LIMPAS" were its cheapest "other
    // chicken". 21 October 2026.
    s("miudos", "Miúdos", /miud|moela|figado|pescoc|coracoe|\bpatas?\b/), // x0.62
  ],
  peru: [
    s("peito", "Peito e bifes", /peito|bife|escalope/), // x1.40
    s("perna", "Perna e coxa", /perna|coxa|perninha|coto/), // x0.56
    s("asa", "Asa", /\basas?\b/), // x0.33
  ],
  // Chops before loin: "Costeletas do Lombo" are chops, and 7 of them were
  // the loin comparison's cheapest. 30 October 2026.
  porco: [
    s("costeleta", "Costeleta", /costelet/), // x0.71
    s("lombo", "Lombo", /lombo|lombinho/), // x1.14
    s("entrecosto", "Entrecosto e entremeada", /entrecosto|costela|entremeada|barriga/), // x0.93
    s("febras", "Febras e bifanas", /febra|bifana|bife/), // x0.86
    s("secretos", "Secretos, plumas e presas", /secret|pluma|presa|abanico|lagarto/), // x2.43
    s("cachaco", "Cachaço e pá", /cachac|\bpa\b|paleta/), // x1.14
    s("rojoes", "Rojões e para estufar", /rojo|\bcubos?\b|estufar|guisar/), // x0.71
    s("extremidades", "Pés, orelha e chispe", /\bpes?\b|orelha|chispe|unha|cabeca|rabo|toucinho|courato/), // x0.59
  ],
  // Minced veal is sold at Pingo Doce only (18 October 2026).
  vitela: BEEF.filter((k) => k.id !== "picada"),
  vaca: BEEF,
  borrego: [
    s("costeleta", "Costeleta", /costelet/), // x1.24
    s("perna", "Perna", /perna/), // x0.82
    s("estufar", "Para estufar", /estufar|guisar|\bcubos?\b|cozer|\bpa\b/), // x0.82
  ],
  bacalhau: [
    s("lombos", "Lombos", /lombo/), // x1.61
    s("postas", "Postas", /posta/), // x0.83
    s("desfiado", "Desfiado e migas", /desfiad|migas|lascas/), // x0.92
    s("inteiro", "Inteiro", /graud|crescido|especial|corrente|miudo|inteiro|\bkg\b/), // x1.06
  ],
  salmao: [
    s("lombo", "Lombo e filete", /lombo|filete/), // x0.79
    s("posta", "Posta", /posta/), // x0.47
    s("inteiro", "Inteiro", /inteir/), // x0.40
  ],
  pescada: [
    s("filete", "Filete", /filete/), // x1.11
    s("posta", "Posta e medalhão", /posta|medalh|mimo|tranche/), // x1.30
    s("inteira", "Inteira", /inteir|rabo na boca|pescadinha/), // x0.50
  ],
  // One "Couve" put cauliflower, Brussels sprouts, kale and cabbage in one
  // comparison: Auchan's cooked cauliflower jar against Continente's
  // sauerkraut. Varieties from the 77 names on sale, 30 October 2026; a name
  // that says none (a ready meal "com legumes e salsicha") is hidden as "Outros".
  couve: [
    s("flor", "Couve-flor", /\bflor\b/),
    s("bruxelas", "Couve de Bruxelas", /bruxelas/),
    s("kale", "Kale", /\bkale\b/),
    s("chinesa", "Couve chinesa e pak choi", /chinesa|pak ?choi/),
    s("fermentada", "Fermentada (chucrute)", /fermentad|chucrute|salgad/),
    s("roxa", "Couve roxa", /\brox[ao]\b/),
    s("lombarda", "Couve lombarda (saboia)", /lombard|saboia/),
    s("coracao", "Couve coração", /coracao/),
    s("portuguesa", "Couve portuguesa e galega", /portuguesa|penca|galega|caldo verde/),
    s("branca", "Couve branca (repolho)", /branc[ao]|repolho/),
  ],
  camarao: [
    s("miolo", "Miolo", /miolo|descascad/), // x1.40
    s("inteiro", "Inteiro", /./), // x1.00
  ],
  leite: [
    // Prices barely differ, but a shopper does not swap whole milk for skimmed.
    // Auchan abbreviates it "M/GORDO". 21 October 2026.
    s("meio-gordo", "Meio-gordo", /meio.?gordo|\bm ?\/ ?gordo/),
    s("magro", "Magro", /magro|desnatado|\b0%/),
    s("gordo", "Gordo", /\bgordo\b|inteiro/),
  ],
  queijo: [
    // First: a spread is a spread whichever cheese it is made from ("Creme de
    // Queijo para Barrar Emmental" was the cheapest Emmental, and a goat's
    // cheese spread the cheapest goat's cheese). Not "queijinho" alone, which
    // is any small cheese. 21 October 2026.
    s("barrar", "Para barrar", /barrar|philadelphia|creme/), // x0.85
    // Grated before the cheese it is made of: grated Flamengo was compared with
    // a block of it. A form apart (the user's decision, 29 October 2026).
    s("ralado", "Ralado", /ralad/), // x1.04
    s("flamengo", "Flamengo", /flamengo/), // x0.70
    s("mozzarella", "Mozzarella", /mozzarell|mozarel/), // x0.87
    // Processed cheese made with grana ("FUNDIDO C. GRANA PADANO", Inalpi's
    // "Al Grana Padano" slices) was the cheapest Parmesan. 29 October 2026.
    s("fundido", "Fundido", /fundid|\bal grana\b/),
    // A whole word: the brand Granarolo made a ricotta the cheapest Parmesan.
    s("parmesao", "Parmesão e grana", /parmes|\bgrana\b|parmigiano/), // x1.80
    s("brie", "Brie e camembert", /brie|camembert/), // x1.18
    s("cheddar", "Cheddar", /cheddar/), // x1.27
    s("emmental", "Emmental", /emmental|emental/), // x0.93
    s("gouda", "Gouda", /gouda/), // x1.28
    // Fresh goat's and sheep's cheese go to "Fresco": a fresh sheep's cheese was
    // the cheapest sheep's cheese against a cured one. 29 October 2026.
    s("cabra", "Cabra", /^(?!.*\bfresc).*cabra/), // x1.43
    s("ovelha", "Ovelha", /^(?!.*\bfresc).*(ovelha|serra da estrela|azeitao|evora|nisa|serpa)/), // x1.35
    s("fresco", "Fresco", /fresco/), // x0.70
  ],
  iogurte: [
    s("grego", "Grego", /grego|greek/), // x0.97
    s("liquido", "Líquido", /liquido|beber|bebivel/), // x0.69
    s("natural", "Natural", /natural/), // x1.17
    s("aromas", "Aromas e fruta", /morango|baunilha|frutos|banana|ananas|pessego|aroma|framboesa|manga|limao|coco|cereja|mirtilo/), // x1.26
  ],
  arroz: [
    s("risotto", "Risotto e arbóreo", /risott|arborio|carnaroli/), // x1.52
    s("basmati", "Basmati", /basmati/), // x1.20
    // Thai jasmine and other fragrant rice were "other rice", beside plain
    // long-grain at a third of the price. 21 October 2026.
    s("aromatico", "Thai e aromático", /\bthai\b|jasmi|perfumad|aromatic/),
    s("vaporizado", "Vaporizado", /vaporizado/), // x0.66
    s("integral", "Integral", /integral/), // x0.72
    // Pingo Doce writes "Arroz Calorino". Before agulha, because Auchan sells
    // a "CAROLINO ... EXTRA LONGO". 21 October 2026.
    s("carolino", "Carolino", /carolino|calorino/), // x0.60
    // Plain long-grain rice ("Arroz Longo", "Branqueado Longo") is agulha in
    // Portugal; it was "other rice" beside sushi rice. 21 October 2026.
    s("agulha", "Agulha", /agulha|\blongo\b/), // x0.62
  ],
  massa: [
    // Stuffed pasta apart from plain fresh pasta: a fresh tagliatelle was
    // compared with a vegetable ravioli in tomato sauce. 29 October 2026.
    s("recheada", "Recheada", /tortellini|ravioli|recheada|girasoli|tortelloni|cappelletti|agnolotti|panzerotti/),
    s("fresca", "Fresca", /fresca|gnocchi/), // x1.49 (with the stuffed, before 29 October 2026)
    s("lasanha", "Folhas de lasanha e canelone", /lasanha|canelon|cannelloni/), // x1.00
    s("longa", "Esparguete e massas longas", /esparguete|spaghetti|linguine|tagliatelle|fettuccine|talharim/), // x0.70
    s("espirais", "Espirais e fusilli", /espira|fusilli/), // x0.64
    s("penne", "Penne e macarrão", /penne|macarrao|maccheroni|rigatoni/), // x0.64
    s("sopa", "Massinhas para sopa", /cotovelinh|massinh|letras|estrelinh|pevide|aletria|meada|cabelo de anjo/), // x0.48
  ],
  pao: [
    s("forma", "De forma", /forma|sandwich|toast/), // x0.68
    s("broa", "Broa", /broa/), // x1.96
    s("baguete", "Baguete", /baguet/), // x0.86
    s("hamburguer", "De hambúrguer e cachorro", /hamburg|hot ?dog|cachorro|brioche/), // x1.14
    s("dia", "Do dia", /carcaca|bijou|papo.?seco|cacete|\bbola\b|mistura|rustico|alentejano|centeio/), // x0.68
  ],
  cereais: [
    s("granola", "Granola e muesli", /granola|muesli/), // x1.21
    s("flocos", "Flocos e corn flakes", /floco|corn ?flakes/), // x0.76
    s("infantis", "Infantis e com chocolate", /chocolate|choco|\bmel\b|crianca|infantil|kids|chocapic|estrelitas|nesquik/), // x0.90
  ],
  farinha: [
    s("trigo", "Trigo", /trigo|\bt\d{2,3}\b/), // x0.50
    s("milho", "Milho", /milho|fuba|polenta/), // x0.88
    s("outras", "Outras", /arroz|amendoa|mandioca|alfarroba|grao|aveia|espelta|centeio|coco|sem gluten/), // x1.56
  ],
  azeite: [
    s("virgem-extra", "Virgem extra", /virgem extra|extra virgem/), // x1.07
    s("virgem", "Virgem", /virgem/), // x0.62
    s("azeite", "Azeite", /./), // x0.66
  ],
  acucar: [
    // Not "cana" alone: "Açúcar Branco de Cana" is white; whole cane sugar
    // ("Cana Integral") is brown. 21 October 2026.
    s("amarelo", "Amarelo e mascavado", /amarelo|mascavad|moreno|demerara|integral/), // x0.86
    s("branco", "Branco", /branco|granulado|refinado|\bfino\b|\bpo\b/), // x0.68
  ],
  cafe: [
    // A soluble cappuccino or mocha mix is not soluble coffee. 29 October 2026.
    s("preparado", "Cappuccino e preparados", /cappuc|mocha|latte|3 ?em ?1|com leite/),
    s("soluvel", "Solúvel", /soluvel|instant|nescafe/), // x1.48
    s("grao", "Em grão", /\bgrao\b/), // x0.88
    s("moido", "Moído", /moid/), // x0.87
  ],
  agua: [
    s("com-gas", "Com gás", /com gas|gaseificad|frize|\bpedras\b|castelo/), // x1.24
    s("sem-gas", "Sem gás", /./), // x0.50
  ],
  chourico: [
    s("corrente", "Corrente", /corrente/), // x0.49
    // Blood sausage was the cheapest meat chouriço. 21 October 2026.
    s("sangue", "De sangue", /sangue/),
    s("carne", "De carne", /./), // x1.04
  ],
  // Half-fat butter was the cheapest butter at Auchan. Salted and unsalted
  // apart too, as with milk. 21 October 2026.
  manteiga: [
    s("magra", "Magra ou light", /magra|light|\bmeia gordura|reduzid|-\s?\d{2}\s?%/),
    s("sem-sal", "Sem sal", /sem sal/),
    s("com-sal", "Com sal", /com sal|\bsal\b|salgad/),
  ],
  batata: [
    // Wedges and frozen roasting quarters were "para cozer". 29 October 2026.
    s("preparada", "Preparada (palitos, cubos, para forno)", /palito|airfryer|forno|\bcubos?\b|rodelas|salteada|gratin|vapor|wedge|gomos|quartos|mccain|mediterr/), // x2.24
    s("cozer", "Para cozer", /./), // x0.74
  ],
  // By animal, and plant-based apart (the user's decision, 29 October 2026):
  // minced turkey was compared with minced beef, a Beyond Meat sausage with a
  // pork one, fish nuggets with chicken nuggets. A product whose name names no
  // animal stays out of the comparison, as any "Outros" does.
  "carne-picada": [
    s("mista", "Mista", /mist|bovino ?\/ ?suino|porco e (vaca|novilho)/),
    s("bovino", "Bovino", /bovin|vaca|novilh|vitel|angus|carnalentejana|mertolengo|minhota|wagyu/),
    s("porco", "Porco", /porco|suin/),
    s("aves", "Frango e peru", /frango|peru|aves|galinha/),
  ],
  hamburguer: [
    s("vegetal", "Vegetal", PLANT),
    s("mista", "Misto", /mist|bovino ?\/ ?suino/),
    s("bovino", "Bovino", /bovin|vaca|novilh|vitel|angus|carnalentejana|mertolengo|minhota|wagyu|acores/),
    s("porco", "Porco", /porco|suin/),
    s("aves", "Frango e peru", /frango|peru|aves|galinha/),
    s("peixe", "Peixe", /atum|salmao|peixe|pescada|bacalhau/),
  ],
  almondega: [
    s("vegetal", "Vegetal", PLANT),
    s("peixe", "Peixe", /peixe|atum|pescada|bacalhau|salmao/),
    s("mista", "Mista", /mist|bovino ?\/ ?suino/),
    s("bovino", "Bovino", /bovin|vaca|novilh|vitel|angus|carnalentejana|mertolengo/),
    s("porco", "Porco", /porco|suin/),
    s("aves", "Frango e peru", /frango|peru|aves|galinha/),
  ],
  nugget: [
    s("vegetal", "Vegetal", PLANT),
    s("peixe", "Peixe", /peixe|pescada|salmao|bacalhau|atum/),
    s("aves", "Frango e peru", /frango|peru|galinha/),
  ],
  "bebida-vegetal": [
    s("mista", "Mistura", /(soja|aveia|amendoa|arroz|coco|avela|caju)s?\b.*\b(e|com|\+) ?(soja|aveia|amendoa|arroz|coco|avela|caju)|arroz coco/),
    s("soja", "Soja", /soja/),
    s("aveia", "Aveia", /aveia|oat/),
    s("amendoa", "Amêndoa", /amendoa/),
    s("arroz", "Arroz", /arroz/),
    s("coco", "Coco", /coco/),
    s("avela", "Avelã", /avela/),
  ],
  pate: [
    s("peixe", "De peixe e marisco", /atum|sardinha|cavala|salmao|caranguejo|marisco|bacalhau|polvo|espadilha|anchova|truta|peixe|camarao/),
    s("vegetal", "Vegetal", /vegan|vegetal|cem porcento|veganissim/),
    s("carne", "De carne", /./),
  ],
  // Fish before plant: "Empadão de Pescada e Legumes" was filed as plant-based.
  // 30 October 2026.
  empada: [
    s("peixe", "De peixe", /atum|bacalhau|pescada|peixe|marisco|camarao/),
    s("vegetal", "Vegetal", /vegan|soja|legumes|veggis|vegetal/),
    s("aves", "De frango, galinha e pato", /galinha|frango|pato|peru/),
    s("carne", "De carne", /./),
  ],
  // Forms of one spice, compared apart (the user's decision, 29 October 2026):
  // cinnamon sticks against ground cinnamon were 2.7 times apart, whole chilli
  // pods against ground 5 times. A pepper grinder holds whole peppercorns.
  canela: [s("pau", "Em pau", /\bpau\b/), s("moida", "Moída", /./)],
  "piri-piri-seco": [s("inteiro", "Em vagem ou inteiro", /vagem|inteir/), s("moido", "Moído", /./)],
  pimenta: [s("grao", "Em grão ou com moinho", /\bgrao\b|moinho/), s("moida", "Moída", /./)],
  // Baker's yeast and baking powder are both "fermento" and never swapped: yeast
  // was in the own-brand row against baking powder at a third of its price.
  // 29 October 2026.
  fermento: [
    s("padeiro", "De padeiro", /padeiro|levedura|fermento biologico/),
    s("po", "Em pó", /./),
  ],
  feijao: [
    // Butter beans are their own bean, not red ones. 21 October 2026.
    s("manteiga", "Manteiga", /manteiga/),
    s("encarnado", "Encarnado", /encarnado|vermelho|catarino/),
    s("branco", "Branco", /branco/),
    s("frade", "Frade", /frade/),
    s("preto", "Preto", /preto/),
  ],
};

/**
 * Catch-alls: a whole kind, or a sub-kind, whose products are too unlike to
 * compare - a "cheapest" among them answers nothing. Hidden from the site like
 * "Outros" (the user's decision, 29 October 2026: flour "Outras" put oat flour
 * against almond flour, almost 8 times dearer, and "Refeição pronta" a
 * tabbouleh against breaded chicken). To be split into real types later.
 */
export const CATCH_ALL_KINDS = new Set(["refeicao", "salada-pronta"]);
export const CATCH_ALL_SUB_KINDS: Record<string, string[]> = { farinha: ["outras"] };

/**
 * Forms of one food that are compared apart but are still the same food, so a
 * page can also say which is cheapest per kilo in ANY form (the user's
 * decision, 29 October 2026): the labels that are only a form, and the kinds
 * whose sub-kinds are only forms.
 */
export const FORM_LABELS = new Set(["fatiado", "filete", "peca", "casca", "cozido", "empadao", "empanada", "temperado"]);
export const FORM_SUB_KIND_KINDS = new Set(["canela", "piri-piri-seco", "pimenta"]);

export interface Label {
  id: string;
  label: string;
  match: RegExp;
  /** also applies when the store's own shelf matches this */
  shelf?: RegExp;
  /** limited to these categories; everywhere when absent */
  categories?: string[];
  /** or to these kinds */
  kinds?: string[];
  /** never when the name matches this */
  unless?: RegExp;
  /** never for these kinds */
  notKinds?: string[];
}

/**
 * How a product is sold. A product can carry several ("congelado" and "bio").
 * Comparisons will keep products with different labels apart (step 2).
 */
export const LABELS: Label[] = [
  // The shelf too: a frozen bag's name often does not say so ("Espinafres em
  // Folha Continente", Auchan's "ERVILHAS EXTRAFINAS 1KG"), and those were
  // the cheapest FRESH spinach, peas and green beans. 21 October 2026.
  { id: "congelado", label: "Congelado", match: /congelad/, shelf: /congelad/ },
  {
    id: "lata", label: "Em lata ou frasco",
    // In fish, "em azeite" and a drained weight "120 (84) G" mean a tin; in
    // pulses and vegetables, "cozido" means the cooked jar rather than dried.
    // Fruit "em calda" (in syrup) is tinned: Pingo Doce's tinned peaches were
    // its cheapest fresh peach. 21 October 2026.
    match: /\blatas?\b|conserva|\bfrasco\b|\bem (azeite|oleo|agua|tomate|molho|escabeche|calda)\b|ao natural|\(\d+\)/,
    // Whatever a chain files under its tinned-goods shelf is tinned, though
    // the name may not say so ("Atum Posta Natural"). 18 October 2026. Not
    // Auchan's "conservas/vegetais-secos", which is DRY pulses: a 1 kg bag of
    // lentils was in the tinned comparison. 29 October 2026.
    shelf: /conserva(?!.*\bsecos?\b)(?!.*-secos)/,
    categories: ["peixe", "legumes", "leguminosas", "fruta", "charcutaria"],
  },
  {
    // "Cozido" means the cooked jar only for vegetables and pulses. Cooked
    // seafood from the fish counter ("Mexilhão Cozido Refrigerado", "Miolo de
    // Camarão Cozido Embalado", "POLVO COZIDO METADE") is not tinned, and was
    // compared with tins. 29 October 2026.
    id: "lata", label: "Em lata ou frasco", match: /\bcozid[oa]s?\b/, categories: ["legumes", "leguminosas"],
  },
  {
    // Tinned fish names say more ways than other tins: "Filetes Cavala Óleo
    // Vegetal", "em Mostarda", "Picante", "com Alho". These words mean a tin
    // only for fish - "alho" is garlic in a vegetable. 17 October 2026.
    id: "lata", label: "Em lata ou frasco",
    match: /\bazeite\b|\boleo\b|\btomate\b|\bmolho\b|mostarda|piri.?piri|\blimao\b|picante|malagueta|\bcaril\b|\balho\b/,
    categories: ["peixe"],
    // Not breaded, frozen or fresh fish: "Filetes de Pescada com Salsa e Alho"
    // and a lemon breaded fillet were filed as tinned - the first a breaded
    // fillet whose name does not say so, hence the kinds too. 21 October 2026.
    unless: /panad|congelad|fresc/,
    notKinds: ["filete-panado", "douradinho", "delicias-do-mar"],
  },
  {
    // Peeled or crushed tomatoes are tinned; a fresh tomato is never "pelado".
    // Pingo Doce's and Auchan's tinned tomatoes were their cheapest fresh
    // tomatoes. 21 October 2026.
    id: "lata", label: "Em lata ou frasco", match: /\bpelad[oa]s?\b|triturad|em pedacos/, kinds: ["tomate"],
  },
  // At the start of a word: "perfumado" (Thai fragrant rice) is not smoked.
  // 21 October 2026.
  { id: "fumado", label: "Fumado", match: /\b(de)?fumad/ },
  // Not "frutos secos" (nuts), which names a whole aisle.
  { id: "seco", label: "Seco ou desidratado", match: /(?<!frutos )\bsec[oa]s?\b|desidratad/ },
  // Forms compared apart (the user's decision, 29 October 2026): a whole 8.5 kg
  // ham leg was the cheapest ham against 200 g of slices; sardine fillets
  // against whole sardines. Each page adds one line with the cheapest per kilo
  // in any form (FORM_LABELS below).
  { id: "fatiado", label: "Fatiado", match: /fatia|fatiad|laminad/, kinds: ["presunto", "queijo", "chourico", "paio", "salame"] },
  { id: "filete", label: "Filetes", match: /filete/, kinds: ["sardinha", "carapau", "cavala", "dourada", "robalo", "truta", "corvina", "red-fish", "linguado"] },
  // A whole or half ham leg, or a piece of one, is a third form beside slices
  // and packets: an 8.5 kg leg with the bone was the cheapest Iberian ham.
  { id: "peca", label: "Em peça", match: /inteir|com osso|\bpeca\b|quartos|tabua|meio presunto|desossad/, kinds: ["presunto"] },
  // Plant-based sausages, mortadella and the like apart from meat ones, in the
  // kinds with no animal split. 29 October 2026.
  { id: "vegetal", label: "Vegetal", match: PLANT, categories: ["charcutaria"] },
  // Desiccated coconut strips and flakes against fresh coconut pieces. 29 October 2026.
  { id: "seco", label: "Seco ou desidratado", match: /ralad|\btiras\b|\bflocos?\b/, kinds: ["coco"] },
  // Fresh cod is not the salted dried "bacalhau" Portugal means: "BACALHAU
  // FRESCO KG" at 5.99 was the cheapest whole salted cod. 29 October 2026.
  { id: "fresco", label: "Fresco (não salgado)", match: /\bfresco\b/, kinds: ["bacalhau"] },
  // More forms, 30 October 2026. Nuts in the shell against kernels: hazelnuts
  // in the shell at 9.97/kg against kernels at 20-21/kg (part of the weight is
  // shell). Measured: 21 names say "com casca"; a kernel says "miolo" or nothing.
  { id: "casca", label: "Com casca", match: /\bcom casca\b|\bc ?\/ ?casca\b/, kinds: ["amendoa", "amendoim", "avela", "noz", "pistacio", "pinhao", "semente-abobora"] },
  // Cooked shellfish against raw: "Lavagante Cozido" against a live Canadian
  // lobster. Not "sapateira": nearly every crab is sold cooked, and Auchan's
  // and Pingo Doce's names often do not say so (13 names, 30 October 2026).
  { id: "cozido", label: "Cozido", match: /\bcozid[oa]s?\b/, kinds: ["camarao", "lavagante", "lagosta", "mexilhao", "polvo", "pota"] },
  // A family pie, a pasty and a small pie: Riberalves' 300 g cod "empadão"
  // against Auchan's mini tuna "empanadas", 4.5 times apart.
  { id: "empadao", label: "Empadão", match: /\bempadao\b/, kinds: ["empada"] },
  { id: "empanada", label: "Empanada", match: /\bempanadas?\b/, kinds: ["empada"] },
  // Seasoned or marinated meat against plain: seasoned black-pork ribs were
  // Continente's cheapest against plain ones. 22 meat names say so.
  { id: "temperado", label: "Temperado", match: /temperad|marinad/, categories: ["carne"] },
  { id: "bio", label: "Biológico", match: /\bbio\b|biologic/ },
  // Pingo Doce sells its lactose-free milk as "... Livre" - but "Ovos de Ar
  // Livre" are free-range eggs. 21 October 2026.
  { id: "sem-lactose", label: "Sem lactose", match: /sem lactose|lactose free|(?<!\bar )\blivre\b/, categories: ["laticinios"] },
  { id: "sem-gluten", label: "Sem glúten", match: /sem gluten|gluten free/ },
  {
    // The Iberian black pig (Alentejano in Portugal, Ibérico in Spain): the same
    // cut costs 1.9 to 4 times more. Measured 18 October 2026.
    id: "porco-preto", label: "Porco preto",
    match: /porco preto|iberic|alentejan|bolota|montanheira|pata negra/,
    kinds: ["porco", "presunto", "chourico", "paio", "farinheira", "linguica", "salpicao", "fiambre", "salame", "morcela", "bacon", "alheira"],
  },
];
