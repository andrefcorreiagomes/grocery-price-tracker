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
    "amendoim", "amendoa", "caju", "noz", "avela", "pinhao", "castanha", "pistacio", "chia", "girassol", "sesamo",
    "semente-abobora", "linhaca", "canhamo", "arando",
  ] },
  { id: "refeicoes", label: "Refeições prontas e salgados", kinds: [
    "pizza", "lasanha", "refeicao", "sopa", "salada-pronta", "quiche", "empada", "rissol", "croquete",
    "pastel-bacalhau", "folhado", "sande",
  ] },
  { id: "cafe", label: "Café, chá e água", kinds: ["cafe", "cafe-capsula", "cha", "infusao", "agua"] },
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

// Beef: the same cuts whatever the animal's age.
const BEEF: SubKind[] = [
  s("bifes", "Bifes", /\bbifes?\b|bifinho|escalope/),
  s("pecas", "Lombo, vazia e alcatra", /lombo|vazia|alcatra|maminha|picanha|acem|pojadouro|rosbife|entrecote|ribeye|tomahawk|fraldinha/),
  s("costeleta", "Costeleta e chuleta", /costelet|chuleta|t-?bone/),
  s("estufar", "Para estufar e cozer", /estufar|cozer|guisar|cozido|jardineira|\bcubos?\b/),
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
    s("miudos", "Miúdos", /miud|moela|figado|pescoc|coracoe/), // x0.62
  ],
  peru: [
    s("peito", "Peito e bifes", /peito|bife|escalope/), // x1.40
    s("perna", "Perna e coxa", /perna|coxa|perninha|coto/), // x0.56
    s("asa", "Asa", /\basas?\b/), // x0.33
  ],
  porco: [
    s("lombo", "Lombo", /lombo|lombinho/), // x1.14
    s("costeleta", "Costeleta", /costelet/), // x0.71
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
  camarao: [
    s("miolo", "Miolo", /miolo|descascad/), // x1.40
    s("inteiro", "Inteiro", /./), // x1.00
  ],
  leite: [
    // Prices barely differ, but a shopper does not swap whole milk for skimmed.
    s("meio-gordo", "Meio-gordo", /meio.?gordo/),
    s("magro", "Magro", /magro|desnatado|\b0%/),
    s("gordo", "Gordo", /\bgordo\b|inteiro/),
  ],
  queijo: [
    s("flamengo", "Flamengo", /flamengo/), // x0.70
    s("mozzarella", "Mozzarella", /mozzarell|mozarel/), // x0.87
    s("ralado", "Ralado", /ralad/), // x1.04
    s("parmesao", "Parmesão e grana", /parmes|grana|parmigiano/), // x1.80
    s("brie", "Brie e camembert", /brie|camembert/), // x1.18
    s("cheddar", "Cheddar", /cheddar/), // x1.27
    s("emmental", "Emmental", /emmental|emental/), // x0.93
    s("gouda", "Gouda", /gouda/), // x1.28
    s("cabra", "Cabra", /cabra/), // x1.43
    s("ovelha", "Ovelha", /ovelha|serra da estrela|azeitao|evora|nisa|serpa/), // x1.35
    s("fresco", "Fresco", /fresco/), // x0.70
    s("barrar", "Para barrar", /barrar|creme|philadelphia|queijinho/), // x0.85
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
    s("vaporizado", "Vaporizado", /vaporizado/), // x0.66
    s("integral", "Integral", /integral/), // x0.72
    s("agulha", "Agulha", /agulha/), // x0.62
    s("carolino", "Carolino", /carolino/), // x0.60
  ],
  massa: [
    s("fresca", "Fresca e recheada", /fresca|tortellini|ravioli|gnocchi|recheada|girasoli|tortelloni/), // x1.49
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
    s("amarelo", "Amarelo e mascavado", /amarelo|mascavad|moreno|demerara|\bcana\b/), // x0.86
    s("branco", "Branco", /branco|granulado|refinado|\bfino\b|\bpo\b/), // x0.68
  ],
  cafe: [
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
    s("carne", "De carne", /./), // x1.04
  ],
  batata: [
    s("preparada", "Preparada (palitos, cubos, para forno)", /palito|airfryer|forno|\bcubos?\b|rodelas|salteada|gratin|vapor/), // x2.24
    s("cozer", "Para cozer", /./), // x0.74
  ],
  feijao: [
    s("encarnado", "Encarnado", /encarnado|vermelho|catarino|manteiga/),
    s("branco", "Branco", /branco/),
    s("frade", "Frade", /frade/),
    s("preto", "Preto", /preto/),
  ],
};

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
}

/**
 * How a product is sold. A product can carry several ("congelado" and "bio").
 * Comparisons will keep products with different labels apart (step 2).
 */
export const LABELS: Label[] = [
  { id: "congelado", label: "Congelado", match: /congelad/ },
  {
    id: "lata", label: "Em lata ou frasco",
    // In fish, "em azeite" and a drained weight "120 (84) G" mean a tin; in
    // pulses and vegetables, "cozido" means the cooked jar rather than dried.
    match: /\blatas?\b|conserva|\bfrasco\b|\bem (azeite|oleo|agua|tomate|molho|escabeche)\b|ao natural|\(\d+\)|\bcozid[oa]s?\b/,
    // Whatever a chain files under its tinned-goods shelf is tinned, though
    // the name may not say so ("Atum Posta Natural"). 18 October 2026.
    shelf: /conserva/,
    categories: ["peixe", "legumes", "leguminosas", "fruta", "charcutaria"],
  },
  {
    // Tinned fish names say more ways than other tins: "Filetes Cavala Óleo
    // Vegetal", "em Mostarda", "Picante", "com Alho". These words mean a tin
    // only for fish - "alho" is garlic in a vegetable. 17 October 2026.
    id: "lata", label: "Em lata ou frasco",
    match: /\bazeite\b|\boleo\b|\btomate\b|\bmolho\b|mostarda|piri.?piri|\blimao\b|picante|malagueta|\bcaril\b|\balho\b/,
    categories: ["peixe"],
  },
  { id: "fumado", label: "Fumado", match: /fumad/ },
  // Not "frutos secos" (nuts), which names a whole aisle.
  { id: "seco", label: "Seco ou desidratado", match: /(?<!frutos )\bsec[oa]s?\b|desidratad/ },
  { id: "bio", label: "Biológico", match: /\bbio\b|biologic/ },
  // Pingo Doce sells its lactose-free milk as "... Livre".
  { id: "sem-lactose", label: "Sem lactose", match: /sem lactose|lactose free|\blivre\b/, categories: ["laticinios"] },
  { id: "sem-gluten", label: "Sem glúten", match: /sem gluten|gluten free/ },
  {
    // The Iberian black pig (Alentejano in Portugal, Ibérico in Spain): the same
    // cut costs 1.9 to 4 times more. Measured 18 October 2026.
    id: "porco-preto", label: "Porco preto",
    match: /porco preto|iberic|alentejan|bolota|montanheira|pata negra/,
    kinds: ["porco", "presunto", "chourico", "paio", "farinheira", "linguica", "salpicao", "fiambre", "salame", "morcela", "bacon", "alheira"],
  },
];
