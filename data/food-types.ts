/**
 * The curated food-type table: what kinds of food the app compares across
 * stores.
 *
 * A food type is NOT a product and NOT a store category. It is the thing a
 * shopper has in mind - "potatoes", "cheese" - so that "where are potatoes
 * cheapest" has an answer. Store categories are too coarse (all three chains
 * file potatoes on a shelf that also holds sweet potatoes, onions and garlic)
 * and products are too fine.
 *
 * Seeded from `data/food-types-candidates.md`, which was derived by taking the
 * head noun of 38,688 food-section product names. Every type below appeared in
 * at least two stores with 20+ products; "Snacks e doces" was dropped whole at
 * the user's request.
 *
 * Curated data, like HOUSE_LABELS in src/lib/candidates.ts - the judgement is
 * meant to live in one readable place rather than be spread through code.
 */

export interface FoodType {
  /** stable key, stored on CatalogueProduct.foodType */
  id: string;
  /** what a person sees */
  label: string;
  /**
   * Head nouns that map here, accent-free, lowercase, singular. The classifier
   * folds plurals before looking up, so "batatas" finds "batata". Extra entries
   * are aliases: queijinho is a queijo, not a type of its own.
   */
  heads: string[];
  /**
   * Rejects a product whose name matches, tested against the WHOLE name. This
   * is what keeps a label meaning something: `batata` must not swallow batata
   * doce (a different vegetable) or batata frita (a snack).
   */
  exclude?: RegExp;
  /**
   * Requires the name to match. Lets two types share a head noun and be told
   * apart by a modifier: "Batata Doce" and "Batata Vermelha" both head on
   * `batata`, so batata-doce REQUIRES /doce/ and plain batata EXCLUDES it.
   * The first matching type in array order wins, so the specific one is listed
   * first.
   */
  require?: RegExp;
  /** the unit a euro-per-unit comparison should use, when it is knowable */
  unit?: "kg" | "l";
}

/**
 * Head words that name a CUT of an animal rather than a food in its own right.
 *
 * "Peito de Frango" heads on `peito`: without this the classifier drops a
 * chicken product. With it, it reads past the cut to the food behind it - and
 * that food need not be an animal, which is what lets "Miolo de Amêndoa" reach
 * `amendoa`.
 *
 * Measured, not guessed: scanning 10,076 meat and fish products for names whose
 * head is not an animal but which mention one later found 144 such words, where
 * a hand-written list had five.
 *
 * This gate is what keeps the step honest. Removing it and scanning every name
 * matched flavours instead of foods: "Bebida Vegetal de Aveia sem Açúcar" became
 * `acucar` (the name says WITHOUT sugar), "Cookie Double Chocolate" became
 * `chocolate`, "Chausson de Maçã" became `maca`. A cut word is a promise that
 * the next food word is what the product actually IS.
 */
export const CUT_WORDS: readonly string[] = [
  // anatomical
  "peito", "lombo", "lombinho", "posta", "perna", "pernil", "perninha",
  "asa", "asinha", "coxa", "coxinha", "costeleta", "entrecosto", "entrecote",
  "cachaco", "maminha", "vazia", "lagarto", "fraldinha", "secreto", "pluma",
  "presa", "paleta", "entremeada", "barriga", "bochecha", "orelha", "rabo",
  "cauda", "cabeca", "cara", "mao", "pata", "lingua", "figado", "moela",
  "miudo", "toucinho", "painho", "tentaculo", "ova", "boca", "dobrada",
  // "Miolo de Camarão" - the shelled meat of a shellfish. 134 products.
  "miolo", "rillette", "foie", "copita",
  // cut formats
  "bife", "bifinho", "tira", "tranche", "medalhao", "escalope", "rodela",
  "cubo", "pedaco", "porcao", "metade", "suprema", "atado",
  // preparations that name their meat
  "strogonoff", "jardineira", "caldeirada", "feijoada", "bifana", "rojao",
  "patanisca", "canjinha", "moqueca", "carpaccio", "tataki", "roti",
  "grelhada", "panado", "panadinho", "empanada", "cordon",
];

/**
 * Animals a cut resolves to. REFERENCE ONLY, for the same reason as CUT_WORDS:
 * the scan now accepts any food type after the head, not only an animal, which
 * is what lets "Miolo de Amêndoa" reach `amendoa`.
 */
export const ANIMALS: readonly string[] = [
  "frango", "galinha", "peru", "pato", "porco", "suino", "leitao", "vaca",
  "bovino", "novilho", "vitela", "borrego", "cordeiro", "cabrito", "coelho",
  "bacalhau", "salmao", "atum", "pescada", "dourada", "robalo", "sardinha",
  "carapau", "cavala", "polvo", "lula", "choco", "pota", "camarao", "gamba",
  "ameijoa", "mexilhao", "linguado", "corvina", "tamboril", "perca", "truta",
  "peixe", "marisco", "sapateira", "santola", "lagosta",
];

/**
 * Store top-level categories that hold food.
 *
 * Continente and Auchan publish a clean food/non-food split at the top level, so
 * they use an allow-list. **Pingo Doce does not**: its `categoryPath` is a flat
 * shelf name ("Mercearia", "Vinho Tinto", "Águas, Sumos e Refrigerantes") with
 * ~67 distinct values, nearly all food. An allow-list there silently lost more
 * than half its catalogue - the entire drinks section read as zero - so it is
 * inverted: everything is food except these.
 */
export const NON_FOOD_SECTIONS: Record<string, readonly string[]> = {
  PINGO_DOCE: [
    "Casa e Eletrodomésticos",
    "Sacos e Sacos de Compras",
    "Gelo",
    "Suplementos",
    "Go Active",
    "Poupe Esta Semana",
    // Mixed food and nappies, exactly as Auchan's o-mundo-do-bebé is excluded
    // from its whitelist. Baby food is tracked as its own piece of work.
    "Bebé e Criança",
  ],
};

/** Continente's food top-levels, mirroring CONTINENTE_FOOD_SECTIONS. */
export const FOOD_SECTIONS: Record<string, readonly string[]> = {
  CONTINENTE: [
    "Frescos", "Laticínios e Ovos", "Congelados", "Mercearia",
    "Bebidas e Garrafeira", "Bio e Saudável",
  ],
  AUCHAN: [
    "alimentação", "produtos-frescos", "bebidas-e-garrafeira", "congelados",
    "biológicos-e-alternativas", "produtos-locais",
  ],
};

export const FOOD_TYPES: readonly FoodType[] = [
  // --- Frescos: fruta e legumes -------------------------------------------
  // batata is the reason `exclude` and `require` exist: three different foods
  // share the word, and they must be told apart in this order.
  { id: "batata-doce", label: "Batata doce", unit: "kg", heads: ["batata"],
    require: /\bdoce\b/i, exclude: /frit|chips|pure/i },
  { id: "batata", label: "Batata", unit: "kg", heads: ["batata"],
    exclude: /\bdoce\b|frit|palha|chips|pure|rosti|noisette|smile|snack/i },
  { id: "tomate", label: "Tomate", unit: "kg", heads: ["tomate"] },
  { id: "cogumelo", label: "Cogumelo", unit: "kg", heads: ["cogumelo"] },
  { id: "alho", label: "Alho", unit: "kg", heads: ["alho"], exclude: /alho.?franc/i },
  { id: "couve", label: "Couve", unit: "kg", heads: ["couve"] },
  { id: "maca", label: "Maçã", unit: "kg", heads: ["maca"] },
  { id: "ervilha", label: "Ervilha", unit: "kg", heads: ["ervilha"] },
  { id: "cebola", label: "Cebola", unit: "kg", heads: ["cebola"] },
  { id: "pera", label: "Pera", unit: "kg", heads: ["pera"] },
  { id: "pimento", label: "Pimento", unit: "kg", heads: ["pimento"] },
  { id: "melao", label: "Melão", unit: "kg", heads: ["melao"] },
  { id: "ameixa", label: "Ameixa", unit: "kg", heads: ["ameixa"] },
  { id: "uva", label: "Uva", unit: "kg", heads: ["uva"] },
  { id: "mirtilo", label: "Mirtilo", unit: "kg", heads: ["mirtilo"] },
  { id: "pessego", label: "Pêssego", unit: "kg", heads: ["pessego"] },
  { id: "manga", label: "Manga", unit: "kg", heads: ["manga"] },
  { id: "abobora", label: "Abóbora", unit: "kg", heads: ["abobora"] },
  { id: "espinafre", label: "Espinafre", unit: "kg", heads: ["espinafre"] },
  { id: "morango", label: "Morango", unit: "kg", heads: ["morango"] },
  { id: "cenoura", label: "Cenoura", unit: "kg", heads: ["cenoura"] },
  { id: "alface", label: "Alface", unit: "kg", heads: ["alface"] },
  { id: "framboesa", label: "Framboesa", unit: "kg", heads: ["framboesa"] },
  { id: "melancia", label: "Melancia", unit: "kg", heads: ["melancia"] },
  { id: "laranja", label: "Laranja", unit: "kg", heads: ["laranja"] },
  { id: "kiwi", label: "Kiwi", unit: "kg", heads: ["kiwi"] },
  { id: "pepino", label: "Pepino", unit: "kg", heads: ["pepino"] },
  { id: "ananas", label: "Ananás", unit: "kg", heads: ["anana"] },
  { id: "beterraba", label: "Beterraba", unit: "kg", heads: ["beterraba"] },
  { id: "salada", label: "Salada preparada", unit: "kg", heads: ["salada"] },

  // --- Talho ---------------------------------------------------------------
  // The animals: a CUT_WORD resolves to one of these, so they must exist.
  { id: "frango", label: "Frango", unit: "kg", heads: ["frango", "galinha"] },
  { id: "peru", label: "Peru", unit: "kg", heads: ["peru"] },
  { id: "pato", label: "Pato", unit: "kg", heads: ["pato"] },
  { id: "porco", label: "Porco", unit: "kg", heads: ["porco", "suino", "leitao"] },
  { id: "vaca", label: "Vaca e novilho", unit: "kg", heads: ["vaca", "bovino", "novilho", "vitela"] },
  { id: "borrego", label: "Borrego e cabrito", unit: "kg", heads: ["borrego", "cordeiro", "cabrito"] },
  { id: "coelho", label: "Coelho", unit: "kg", heads: ["coelho"] },
  { id: "carne-picada", label: "Carne picada", unit: "kg", heads: ["carne"] },
  // Charcutaria: these name an animal but ARE the food type - see CUT_WORDS.
  { id: "salsicha", label: "Salsicha", unit: "kg", heads: ["salsicha", "salsichao"] },
  { id: "fiambre", label: "Fiambre", unit: "kg", heads: ["fiambre"] },
  { id: "chourico", label: "Chouriço", unit: "kg", heads: ["chourico", "chouricao"] },
  { id: "presunto", label: "Presunto", unit: "kg", heads: ["presunto"] },
  { id: "hamburguer", label: "Hambúrguer", unit: "kg", heads: ["hamburguer", "hamburguere", "hamburger"] },
  { id: "bacon", label: "Bacon", unit: "kg", heads: ["bacon"] },
  { id: "almondega", label: "Almôndega", unit: "kg", heads: ["almondega"] },
  { id: "mortadela", label: "Mortadela", unit: "kg", heads: ["mortadela"] },
  { id: "nugget", label: "Nugget", unit: "kg", heads: ["nugget"] },
  { id: "paio", label: "Paio", unit: "kg", heads: ["paio"] },
  { id: "salame", label: "Salame", unit: "kg", heads: ["salame"] },
  { id: "alheira", label: "Alheira", unit: "kg", heads: ["alheira"] },
  { id: "farinheira", label: "Farinheira", unit: "kg", heads: ["farinheira"] },
  { id: "linguica", label: "Linguiça", unit: "kg", heads: ["linguica"] },
  { id: "picanha", label: "Picanha", unit: "kg", heads: ["picanha"] },
  { id: "salpicao", label: "Salpicão", unit: "kg", heads: ["salpicao"] },
  { id: "morcela", label: "Morcela", unit: "kg", heads: ["morcela"] },

  // --- Peixaria ------------------------------------------------------------
  { id: "filete", label: "Filete", unit: "kg", heads: ["filete"] },
  { id: "atum", label: "Atum", unit: "kg", heads: ["atum"] },
  { id: "bacalhau", label: "Bacalhau", unit: "kg", heads: ["bacalhau"] },
  { id: "camarao", label: "Camarão", unit: "kg", heads: ["camarao", "gamba"] },
  { id: "sardinha", label: "Sardinha", unit: "kg", heads: ["sardinha"] },
  { id: "salmao", label: "Salmão", unit: "kg", heads: ["salmao"] },
  { id: "pescada", label: "Pescada", unit: "kg", heads: ["pescada", "pescadinha"] },
  { id: "lula", label: "Lula", unit: "kg", heads: ["lula"] },
  { id: "polvo", label: "Polvo", unit: "kg", heads: ["polvo"] },
  { id: "douradinho", label: "Douradinho", unit: "kg", heads: ["douradinho"] },
  { id: "pota", label: "Pota", unit: "kg", heads: ["pota"] },
  { id: "choco", label: "Choco", unit: "kg", heads: ["choco"], exclude: /chocolate/i },
  { id: "ameijoa", label: "Amêijoa", unit: "kg", heads: ["ameijoa"] },
  { id: "dourada", label: "Dourada", unit: "kg", heads: ["dourada"] },
  { id: "robalo", label: "Robalo", unit: "kg", heads: ["robalo"] },
  { id: "carapau", label: "Carapau", unit: "kg", heads: ["carapau"] },
  { id: "cavala", label: "Cavala", unit: "kg", heads: ["cavala"] },
  { id: "corvina", label: "Corvina", unit: "kg", heads: ["corvina"] },
  { id: "tamboril", label: "Tamboril", unit: "kg", heads: ["tamboril"] },
  { id: "perca", label: "Perca", unit: "kg", heads: ["perca"] },
  { id: "truta", label: "Truta", unit: "kg", heads: ["truta"] },
  { id: "linguado", label: "Linguado", unit: "kg", heads: ["linguado"] },
  { id: "mexilhao", label: "Mexilhão", unit: "kg", heads: ["mexilhao"] },
  { id: "peixe", label: "Peixe (outro)", unit: "kg", heads: ["peixe"] },
  { id: "marisco", label: "Marisco (outro)", unit: "kg", heads: ["marisco"] },

  // --- Laticínios e ovos ---------------------------------------------------
  { id: "queijo", label: "Queijo", unit: "kg", heads: ["queijo", "queijinho"] },
  { id: "iogurte", label: "Iogurte", unit: "kg", heads: ["iogurte"] },
  // Claimed at step 1 so it never reaches the category fallback, which files an
  // oat drink under `leite` (its shelf is "Leite e Bebidas Vegetais") and a rice
  // drink under `arroz`. A plant drink is not milk and not rice, and mixing them
  // into either would make "cheapest leite" compare different things.
  // The rule used to require the word "de" (`bebida de aveia`), which is how
  // Continente and Pingo Doce write it. Auchan usually drops it, and those
  // names then fell through to whatever shelf they sat on - measured:
  //
  //   BEBIDA ARROZ UHT AUCHAN ...      became `arroz`    (a rice DRINK as rice)
  //   BEBIDA AMENDOAS AUCHAN ...       became `amendoa`  (a drink as nuts)
  //   BEBIDA SOJA AUCHAN ...           became nothing at all
  //   BEBIDA ALPRO SOJA NATURAL 1 LT   became nothing at all
  //
  // So the plant word alone is enough, with or without "de". Alpro is listed by
  // name because every product it makes is a plant drink, which catches the
  // ones naming no plant at all ("BEBIDA ALPRO BARISTA", "NOT MILK").
  //
  // Tested against the ACCENT-STRIPPED name, so `amendoa` here covers `amêndoa`
  // in the product; the old rule's separate accented alternatives were dead.
  { id: "bebida-vegetal", label: "Bebida vegetal", unit: "l", heads: ["bebida"],
    require: /vegetal|alpro|oatly|\b(aveia|soja|arroz|amendoas?|caju|coco|avela|espelta)\b/i },
  { id: "leite", label: "Leite", unit: "l", heads: ["leite"] },
  { id: "manteiga", label: "Manteiga", unit: "kg", heads: ["manteiga"] },
  { id: "kefir", label: "Kefir", unit: "l", heads: ["kefir"] },
  { id: "pudim", label: "Pudim", unit: "kg", heads: ["pudim"] },
  { id: "vegurte", label: "Vegurte", unit: "kg", heads: ["vegurte", "vegegurte"] },
  { id: "nata", label: "Natas", unit: "l", heads: ["nata"] },
  { id: "ovo", label: "Ovos", heads: ["ovo"] },
  { id: "requeijao", label: "Requeijão", unit: "kg", heads: ["requeijao"] },
  { id: "mousse", label: "Mousse", unit: "kg", heads: ["mousse"] },
  { id: "bifidus", label: "Bífidus", unit: "kg", heads: ["bifidu"] },

  // --- Mercearia -----------------------------------------------------------
  { id: "bolacha", label: "Bolacha", unit: "kg", heads: ["bolacha", "biscoito"] },
  { id: "molho", label: "Molho", heads: ["molho"] },
  // massa the pasta, not massa the dough
  { id: "massa", label: "Massa", unit: "kg", heads: ["massa", "esparguete", "noodle", "fusilli"],
    exclude: /massa folhada|massa quebrada|massa de pizza|massa areada/i },
  { id: "chocolate", label: "Chocolate", unit: "kg", heads: ["chocolate"] },
  { id: "arroz", label: "Arroz", unit: "kg", heads: ["arroz"], exclude: /arroz doce/i },
  { id: "gelatina", label: "Gelatina", heads: ["gelatina"] },
  { id: "farinha", label: "Farinha", unit: "kg", heads: ["farinha"] },
  { id: "azeite", label: "Azeite", unit: "l", heads: ["azeite"] },
  { id: "nectar", label: "Néctar", unit: "l", heads: ["nectar"] },
  { id: "feijao", label: "Feijão", unit: "kg", heads: ["feijao"] },
  { id: "vinagre", label: "Vinagre", unit: "l", heads: ["vinagre"] },
  { id: "pate", label: "Paté", unit: "kg", heads: ["pate"] },
  { id: "sopa", label: "Sopa", heads: ["sopa"] },
  { id: "caldo", label: "Caldo", heads: ["caldo"] },
  { id: "tempero", label: "Tempero", heads: ["tempero"] },
  { id: "maionese", label: "Maionese", heads: ["maionese"] },
  { id: "polpa", label: "Polpa", unit: "kg", heads: ["polpa"] },
  { id: "azeitona", label: "Azeitona", unit: "kg", heads: ["azeitona"] },
  { id: "acucar", label: "Açúcar", unit: "kg", heads: ["acucar"] },
  { id: "pasta", label: "Pasta (barrar)", unit: "kg", heads: ["pasta"] },
  { id: "oleo", label: "Óleo", unit: "l", heads: ["oleo"] },
  { id: "mel", label: "Mel", unit: "kg", heads: ["mel"] },
  { id: "sal", label: "Sal", unit: "kg", heads: ["sal"] },
  { id: "pimenta", label: "Pimenta", unit: "kg", heads: ["pimenta"] },
  { id: "ketchup", label: "Ketchup", heads: ["ketchup"] },
  { id: "pipoca", label: "Pipoca", unit: "kg", heads: ["pipoca"] },
  { id: "semente", label: "Semente", unit: "kg", heads: ["semente"] },
  { id: "amendoim", label: "Amendoim", unit: "kg", heads: ["amendoim"] },
  { id: "mostarda", label: "Mostarda", heads: ["mostarda"] },
  { id: "milho", label: "Milho", unit: "kg", heads: ["milho"] },
  { id: "tortilha", label: "Tortilha", heads: ["tortilha"] },
  { id: "caju", label: "Caju", unit: "kg", heads: ["caju"] },
  { id: "amendoa", label: "Amêndoa", unit: "kg", heads: ["amendoa", "amendoas"] },
  // Nuts are usually sold as "Miolo de Noz", "Miolo de Avelã" - the head is
  // `miolo` (the kernel), so they are only reachable by scanning past it.
  { id: "noz", label: "Noz", unit: "kg", heads: ["noz", "nozes"] },
  { id: "avela", label: "Avelã", unit: "kg", heads: ["avela"] },
  { id: "pinhao", label: "Pinhão", unit: "kg", heads: ["pinhao"] },
  { id: "castanha", label: "Castanha", unit: "kg", heads: ["castanha"] },
  { id: "pistacio", label: "Pistácio", unit: "kg", heads: ["pistacio", "pistachio"] },
  { id: "pevide", label: "Pevide", unit: "kg", heads: ["pevide"] },
  { id: "adocante", label: "Adoçante", heads: ["adocante"] },
  { id: "quinoa", label: "Quinoa", unit: "kg", heads: ["quinoa"] },
  { id: "caril", label: "Caril", heads: ["caril"] },
  { id: "marmelada", label: "Marmelada", unit: "kg", heads: ["marmelada"] },
  { id: "lentilha", label: "Lentilha", unit: "kg", heads: ["lentilha"] },
  { id: "grao", label: "Grão", unit: "kg", heads: ["grao"] },
  { id: "tremoco", label: "Tremoço", unit: "kg", heads: ["tremoco"] },
  { id: "fermento", label: "Fermento", heads: ["fermento"] },
  { id: "canela", label: "Canela", heads: ["canela"] },

  // --- Padaria e pastelaria ------------------------------------------------
  { id: "pao", label: "Pão", unit: "kg", heads: ["pao", "baguete", "broa"],
    exclude: /pao ralado|pao de lo/i },
  { id: "bolo", label: "Bolo", unit: "kg", heads: ["bolo", "torta", "madalena"] },
  { id: "croissant", label: "Croissant", heads: ["croissant"] },
  { id: "tarte", label: "Tarte", heads: ["tarte"] },

  // --- Congelados e refeições ----------------------------------------------
  { id: "gelado", label: "Gelado", unit: "l", heads: ["gelado"] },
  { id: "pizza", label: "Pizza", unit: "kg", heads: ["pizza"] },
  { id: "lasanha", label: "Lasanha", unit: "kg", heads: ["lasanha"] },
  { id: "refeicao", label: "Refeição pronta", heads: ["refeicao"] },
  { id: "wrap", label: "Wrap", heads: ["wrap"] },
  { id: "folhado", label: "Folhado", heads: ["folhado"] },
  { id: "rissol", label: "Rissol", heads: ["rissoi", "rissol"] },
  { id: "panqueca", label: "Panqueca", heads: ["panqueca"] },
  { id: "empada", label: "Empada", heads: ["empada", "empadao"] },
  { id: "croquete", label: "Croquete", heads: ["croquete"] },
  { id: "pastel", label: "Pastel", heads: ["pastel", "pastei"] },
  { id: "quiche", label: "Quiche", heads: ["quiche"] },
  { id: "ravioli", label: "Ravioli", heads: ["ravioli"] },
  { id: "sande", label: "Sande", heads: ["sande"] },

  // --- Bebidas -------------------------------------------------------------
  { id: "vinho", label: "Vinho", unit: "l", heads: ["vinho"] },
  { id: "cerveja", label: "Cerveja", unit: "l", heads: ["cerveja"] },
  { id: "refrigerante", label: "Refrigerante", unit: "l", heads: ["refrigerante"] },
  { id: "agua", label: "Água", unit: "l", heads: ["agua"] },
  { id: "cereais", label: "Cereais", unit: "kg", heads: ["cereal"] },
  { id: "cha", label: "Chá", heads: ["cha"] },
  { id: "cafe", label: "Café", unit: "kg", heads: ["cafe"] },
  { id: "sumo", label: "Sumo", unit: "l", heads: ["sumo"] },
  { id: "infusao", label: "Infusão", heads: ["infusao"] },
  { id: "espumante", label: "Espumante", unit: "l", heads: ["espumante"] },
  { id: "licor", label: "Licor", unit: "l", heads: ["licor"] },
  { id: "whisky", label: "Whisky", unit: "l", heads: ["whisky"] },
  { id: "gin", label: "Gin", unit: "l", heads: ["gin"] },
  { id: "sidra", label: "Sidra", unit: "l", heads: ["sidra"] },
  { id: "aguardente", label: "Aguardente", unit: "l", heads: ["aguardente"] },
  { id: "batido", label: "Batido", unit: "l", heads: ["batido"] },
  { id: "vodka", label: "Vodka", unit: "l", heads: ["vodka"] },
  { id: "rum", label: "Rum", unit: "l", heads: ["rum"] },
];
