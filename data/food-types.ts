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
 * Seeded by taking the head noun of 38,688 food-section product names: every
 * type below appeared in at least two stores with 20+ products. Sweets and
 * snacks were left out on purpose.
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
  /**
   * How a euro-per-unit comparison should measure this food.
   *
   * `"kg"` or `"l"` means one ranking, and anything the stores recorded the
   * other way is excluded rather than converted - grams and millilitres measure
   * different things and there is no honest arithmetic between them.
   *
   * `"either"` means the food is genuinely sold BOTH ways and gets TWO
   * rankings, one per unit, shown side by side. It is not a way of ducking the
   * choice: it is for foods where one ranking would be wrong however it was
   * decided. Tarts are the clearest case - a baked apple tart is sold by weight
   * and a frozen ice-cream tart by volume, and they are not the same food.
   * Mayonnaise is the other kind: one product that the stores simply record
   * differently, where picking one unit would discard about half the jars.
   *
   * Undeclared is a bug, not a third option, and `validate:comparisons` reports
   * it: with no unit the comparison has no grounds to reject anything and ranks
   * a bottle priced per litre against a packet priced per kilo.
   */
  unit?: "kg" | "l" | "either" | "un";
  /**
   * Only the product's own NAME may decide this kind, never the store's shelf.
   * For foods whose names nearly always say what they are, on shelves they
   * share with other foods: "Uvas e Tropicais" holds avocados and papaya,
   * "Laranja, Clementina e Limão" holds lemons, "Curgete, Beringela e Feijão
   * Verde" holds courgettes - and each shelf names only one food we know, so
   * it used to decide for all of them. Measured 17 October 2026.
   */
  nameOnly?: boolean;
  /**
   * Set aside: classified and kept, but not shown on the site for now. The
   * site shows everyday food first; sweets and desserts, and drinks, come back
   * later (decided 17 October 2026).
   */
  hidden?: "sweets" | "drinks";
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
  // Not "foie": foie gras is a pâté, and "Foie Gras de Pato" was filed as
  // duck meat. 20 October 2026.
  "miolo", "rillette", "copita",
  // cut formats
  "bife", "bifinho", "tira", "tranche", "medalhao", "escalope", "rodela",
  "cubo", "pedaco", "porcao", "metade", "quarto", "suprema", "atado",
  // "Flocos de Aveia", "FLOCOS SALUTEM AVEIA": the flakes are the format, the
  // grain is the food. 17 October 2026.
  "floco",
  // "Filetes de Pescada": the fillet is the cut, the fish is the food. Breaded
  // fillets are claimed first, as a kind of their own. 17 October 2026.
  "filete",
  // "Mix Cogumelos Exóticos", "Mistura de Sementes": the mix names its food.
  "mix", "mistura",
  // preparations that name their meat
  "strogonoff", "jardineira", "caldeirada", "feijoada", "bifana", "rojao",
  "patanisca", "moqueca", "carpaccio", "tataki", "roti", "tartaro",
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

// Which store sections hold food is decided in data/store-sections.ts.

/**
 * What makes a name coffee, shared by the two coffee kinds. "compativ":
 * capsules sold as compatible with a machine are coffee capsules unless the
 * exclusion below says otherwise.
 */
const COFFEE_WORDS = String.raw`(?:\b|nes)caf|coffee|galao|mocha|e[xs]pres|lungo|ristretto|roast|blend|meia de leite|latte|macchiato|cap+uc|buondi|sical|delta|nicola|nespresso|\bnsp\b|dolce gusto|\bdg\b|tassimo|starbucks|torrie|l'or|intensidade|compativ`;

/**
 * Sweets flavoured with coffee are sweets, wherever they are shelved. The
 * plural only: "caramelos" are the sweets, "Cápsulas de Café Caramelo" is
 * coffee with a flavour. Barley and chicory are coffee substitutes, not
 * coffee: "CEVADA DELTA TORRADA MOÍDA" got in on the Delta brand and became the
 * cheapest coffee in the country at EUR 6.09/kg.
 */
const COFFEE_EXCLUDE = /rebucado|\bcaramelos\b|\bdrops\b|\bgomas?\b|\bchupa|elastica|^(?!.*(?:(?:\b|nes)caf|coffee|galao|mocha|e[xs]pres|lungo|ristretto|meia de leite|latte|macchiato|cap+uc)).*(?:choco|\bcha\b|tisana|infus|milka|nesquik|leite|cevada|chicoria|malte)/i;

export const FOOD_TYPES: readonly FoodType[] = [
  // --- Frescos: fruta e legumes -------------------------------------------
  // batata is the reason `exclude` and `require` exist: three different foods
  // share the word, and they must be told apart in this order.
  { id: "batata-doce", label: "Batata doce", nameOnly: true, unit: "kg", heads: ["batata"],
    require: /\bdoce\b/i, exclude: /frit|chips|pure/i },
  { id: "batata", label: "Batata", nameOnly: true, unit: "kg", heads: ["batata"],
    exclude: /\bdoce\b|frit|palha|chips|pure|rosti|noisette|smile|snack|\bflocos?\b/i },
  // Frozen chips, not crisps: "Batatas Pré-Fritas Palitos". "Batata para Fritar"
  // is raw potato and stays out (no "pré-frita", not frozen). 20 October 2026.
  { id: "batata-pre-frita", label: "Batata pré-frita congelada", nameOnly: true, unit: "kg", heads: ["batata"],
    require: /pr[eé].?frit|\bcongelad/i, exclude: /\bdoce\b|chips|snack|palha|pure/i },
  // Okra. 20 October 2026.
  { id: "quiabo", label: "Quiabo", unit: "kg", heads: ["quiabo"] },
  // Not tomato paste in a tube or tin: "Tomate Duplo Concentrado". 20 October 2026.
  { id: "tomate", label: "Tomate", unit: "kg", heads: ["tomate"], exclude: /concentrad/i },
  { id: "cogumelo", label: "Cogumelo", nameOnly: true, unit: "kg", heads: ["cogumelo"] },
  // Leek is "alho francês": a different vegetable sharing garlic's head word,
  // so it is listed first and claims the names that say "francês".
  { id: "alho-frances", label: "Alho francês", unit: "kg", heads: ["alho"], require: /alho.?franc/i },
  { id: "alho", label: "Alho", unit: "kg", heads: ["alho"], exclude: /alho.?franc/i },
  { id: "couve", label: "Couve", unit: "kg", heads: ["couve"] },
  { id: "maca", label: "Maçã", unit: "kg", heads: ["maca"] },
  { id: "ervilha", label: "Ervilha", unit: "kg", heads: ["ervilha"] },
  // Not "Cebola Frita Crocante", a topping. 20 October 2026.
  { id: "cebola", label: "Cebola", unit: "kg", heads: ["cebola"], exclude: /\bfrita\b|crocante/i },
  { id: "pera", label: "Pera", unit: "kg", heads: ["pera"] },
  { id: "pimento", label: "Pimento", unit: "kg", heads: ["pimento"] },
  { id: "melao", label: "Melão", unit: "kg", heads: ["melao"] },
  // Not "Ameixa d'Elvas", plums candied in syrup. 20 October 2026.
  { id: "ameixa", label: "Ameixa", unit: "kg", heads: ["ameixa"], exclude: /elvas|\bcalda\b/i },
  { id: "uva", label: "Uva", nameOnly: true, unit: "kg", heads: ["uva"] },
  { id: "mirtilo", label: "Mirtilo", unit: "kg", heads: ["mirtilo"] },
  { id: "pessego", label: "Pêssego", unit: "kg", heads: ["pessego"] },
  { id: "manga", label: "Manga", unit: "kg", heads: ["manga"] },
  { id: "abobora", label: "Abóbora", unit: "kg", heads: ["abobora"] },
  { id: "espinafre", label: "Espinafre", unit: "kg", heads: ["espinafre"] },
  { id: "morango", label: "Morango", nameOnly: true, unit: "kg", heads: ["morango"] },
  { id: "cenoura", label: "Cenoura", unit: "kg", heads: ["cenoura"] },
  { id: "alface", label: "Alface", nameOnly: true, unit: "kg", heads: ["alface"] },
  { id: "framboesa", label: "Framboesa", unit: "kg", heads: ["framboesa"] },
  { id: "melancia", label: "Melancia", unit: "kg", heads: ["melancia"] },
  { id: "laranja", label: "Laranja", nameOnly: true, unit: "kg", heads: ["laranja"] },
  { id: "kiwi", label: "Kiwi", unit: "kg", heads: ["kiwi"] },
  { id: "pepino", label: "Pepino", unit: "kg", heads: ["pepino"] },
  { id: "ananas", label: "Ananás", unit: "kg", heads: ["anana", "abacaxi"] },
  { id: "beterraba", label: "Beterraba", unit: "kg", heads: ["beterraba"] },
  // Two different things used to share "Salada preparada": a bag of leaves and a
  // ready-made dish. A salad naming a protein, grain or pasta is the dish; the
  // rest are leaves. Fruit salad is a dessert. 17 October 2026.
  { id: "salada-pronta", label: "Salada pronta", nameOnly: true, unit: "kg", heads: ["salada"],
    require: /\b(atum|massa|russa|frango|camarao|marisco|polvo|bacalhau|salmao|grao|feijao|quinoa|cuscuz|bulgur|arroz|batata|ovos?|proteina|caesar|cesar|queijo|presunto|lentilhas?|delicias|sapateira|gambas?)\b/i,
    exclude: /\bfruta|ananas|abacaxi|melao|melancia|morango/i },
  { id: "salada-folhas", label: "Salada em saco", nameOnly: true, unit: "kg", heads: ["salada"],
    // ...nor a herb mix for salads ("Mistura Ervas Saladas"). 20 October 2026.
    exclude: /\bfruta|ananas|abacaxi|melao|melancia|morango|\bsandes\b|\bwrap\b|semente|\bervas\b|tempero/i },
  // Everyday fruit, vegetables and herbs that had no kind of their own, so
  // they were left out or - worse - taken by a shelf naming a neighbour:
  // avocados as grapes, lemons as oranges, courgettes as beans. Counted on
  // 17 October 2026: each is sold at all three chains, 4 to 27 products.
  // Fresh fruit, not dried or candied (a different price per kilo).
  { id: "banana", label: "Banana", unit: "kg", heads: ["banana"],
    exclude: /chips|frita|snack|desidrat|\bsecas?\b|bolo|\bpao\b|gelado|iogurte|sumo|batido/i },
  { id: "abacate", label: "Abacate", unit: "kg", heads: ["abacate"], exclude: /guacamole|\boleo\b/i },
  { id: "limao", label: "Limão", unit: "kg", heads: ["limao"],
    exclude: /sumo|limonada|refresco|\bcha\b|infus|tarte|bolo|bolacha|gelado|iogurte|\bdoce\b/i },
  // Two different fruits (decided 18 October 2026). Pingo Doce names its
  // tangerines "Mandarina". A product sold as both ("Clementina/Mandarina")
  // goes in neither rather than being guessed.
  { id: "clementina", label: "Clementina", unit: "kg", heads: ["clementina", "tangerina", "mandarina"], require: /clementin/i,
    exclude: /mandarin|tangerin|sumo|gelado|iogurte|\bdoce\b|calda/i },
  { id: "tangerina", label: "Tangerina", unit: "kg", heads: ["clementina", "tangerina", "mandarina"], require: /mandarin|tangerin/i,
    exclude: /clementin|sumo|gelado|iogurte|\bdoce\b|calda/i },
  { id: "cereja", label: "Cereja", unit: "kg", heads: ["cereja"],
    exclude: /calda|cristaliz|licor|chocolate|bombo|\bdoce\b|compota|tomate cereja/i },
  { id: "nectarina", label: "Nectarina", unit: "kg", heads: ["nectarina"], exclude: /calda|sumo|\bdoce\b/i },
  { id: "alperce", label: "Alperce", unit: "kg", heads: ["alperce", "damasco"],
    exclude: /\bsecos?\b|desidrat|calda|\bdoce\b|compota|sumo|nectar/i },
  { id: "figo", label: "Figo", unit: "kg", heads: ["figo"],
    exclude: /\bsecos?\b|desidrat|\bdoce\b|compota|chocolate|bolacha|torta|cheio/i },
  { id: "coco", label: "Coco", unit: "kg", heads: ["coco"],
    exclude: /ralado|leite|bebida|\bagua\b|creme|chips|\boleo\b|farinha|\bdoce\b|chocolate|bolacha|iogurte|gelado/i },
  { id: "papaia", label: "Papaia", unit: "kg", heads: ["papaia", "mamao"], exclude: /desidrat|\bsecas?\b|sumo/i },
  { id: "maracuja", label: "Maracujá", unit: "kg", heads: ["maracuja"], exclude: /sumo|nectar|polpa|iogurte|gelado|\bdoce\b/i },
  { id: "brocolo", label: "Brócolos", unit: "kg", heads: ["brocolo", "brocoli"], exclude: /sopa|creme|pure|gratinad/i },
  { id: "curgete", label: "Curgete", unit: "kg", heads: ["curgete", "courgette"], exclude: /sopa|creme|pure|esparguete/i },
  { id: "beringela", label: "Beringela", unit: "kg", heads: ["beringela"], exclude: /pasta|creme|pate/i },
  { id: "grelo", label: "Grelos", unit: "kg", heads: ["grelo"] },
  { id: "rucula", label: "Rúcula", unit: "kg", heads: ["rucula"] },
  { id: "agriao", label: "Agrião", unit: "kg", heads: ["agriao"], exclude: /sopa|creme/i },
  // Fresh herbs. Salsa is also a Mexican dip, and herbs are also teas.
  { id: "coentros", label: "Coentros", unit: "kg", heads: ["coentro"], exclude: /\bmoidos?\b|\bem po\b|\bsementes?\b|\bgrao\b/i },
  { id: "salsa", label: "Salsa", unit: "kg", heads: ["salsa"],
    exclude: /molho|picante|mexican|\btex\b|nacho|\bdip\b|chunky|\bsalsa e\b.*\bmolho\b|old el paso|\bsuave\b/i },
  { id: "hortela", label: "Hortelã", unit: "kg", heads: ["hortela"],
    exclude: /\bcha\b|infus|rebucad|pastilha|chocolate|licor|\bxarope\b|pimenta/i },
  { id: "manjericao", label: "Manjericão", unit: "kg", heads: ["manjericao"], exclude: /\bmolho\b|pesto|\bseco\b|desidrat/i },
  // Ground ginger is a dried spice, many times the price per kilo of the fresh
  // root, so a kind of its own. 20 October 2026.
  { id: "gengibre-po", label: "Gengibre em pó", nameOnly: true, unit: "kg", heads: ["gengibre"],
    require: /\bmoido\b|\bem po\b/i, exclude: /\bcha\b|infus|bebida|biscoit|bolacha|rebucad|\bdoce\b|\bcom\b/i },
  { id: "gengibre", label: "Gengibre", unit: "kg", heads: ["gengibre"],
    exclude: /\bcha\b|infus|\bshot\b|bebida|ginger|biscoit|bolacha|rebucad|cerveja|\bem po\b|\bmoido\b|cristaliz|\bdoce\b/i },

  // --- Talho ---------------------------------------------------------------
  // The animals: a CUT_WORD resolves to one of these, so they must exist.
  // Roast chicken from the take-away counter is a cooked dish, not raw chicken;
  // "Frango para Assar" is raw and says "assar", not "assado". 20 October 2026.
  { id: "frango", label: "Frango", unit: "kg", heads: ["frango", "galinha"], exclude: /\bassad[oa]s?\b/i },
  { id: "peru", label: "Peru", unit: "kg", heads: ["peru"] },
  // Auchan shelves quail under "pato-e-mais-aves" (duck and other birds), and
  // a shelf naming one food decides - so five quail products became duck,
  // one of them the cheapest "duck" in the country at EUR 1.25, a price per bird.
  { id: "pato", label: "Pato", unit: "kg", heads: ["pato"], exclude: /codorni|perdiz|faisao/i },
  { id: "porco", label: "Porco", unit: "kg", heads: ["porco", "suino", "leitao"] },
  // Meat, not offal: a beef kidney was the cheapest "beef". 17 October 2026.
  // Beef in two kinds (decided 18 October 2026): calf, whose name always says
  // so ("vitela", "vitelão"), and all other beef ("novilho", "bovino", or no
  // age at all). Picanha is a cut of either, not a kind of its own. Meat, not
  // offal: a beef kidney was the cheapest "beef". 17 October 2026.
  { id: "vitela", label: "Vitela", unit: "kg", heads: ["vaca", "bovino", "novilho", "novilha", "vitela", "vitelao", "picanha"],
    require: /\bvitela\b|vitelao/i,
    exclude: /\b(rim|rins|figado|lingua|dobrada|bucho|tripas?|mioleira|rabo|maos?)\b|coracao de (bovino|vaca|vitela|novilho)/i },
  { id: "vaca", label: "Vaca", unit: "kg", heads: ["vaca", "bovino", "novilho", "novilha", "vitela", "vitelao", "picanha"],
    exclude: /\bvitela\b|vitelao|\b(rim|rins|figado|lingua|dobrada|bucho|tripas?|mioleira|rabo|maos?)\b|coracao de (bovino|vaca|vitela|novilho)/i },
  // Lamb and kid goat are different meats (decided 18 October 2026).
  { id: "borrego", label: "Borrego", unit: "kg", heads: ["borrego", "cordeiro", "cabrito"], exclude: /cabrito/i },
  { id: "cabrito", label: "Cabrito", unit: "kg", heads: ["borrego", "cordeiro", "cabrito"], require: /cabrito/i },
  // "Coelhos de Chocolate" are Easter sweets. 20 October 2026.
  { id: "coelho", label: "Coelho", unit: "kg", heads: ["coelho"], exclude: /chocolate/i },
  // Not a seasoning "para carne" ("Mix Salicórnia p/ Carne"). 20 October 2026.
  { id: "carne-picada", label: "Carne picada", nameOnly: true, unit: "kg", heads: ["carne"], exclude: /\bp(ara|\/) carne|tempero|salicornia|\bervas\b/i },
  // Charcutaria: these name an animal but ARE the food type - see CUT_WORDS.
  { id: "salsicha", label: "Salsicha", nameOnly: true, unit: "kg", heads: ["salsicha", "salsichao"] },
  { id: "fiambre", label: "Fiambre", unit: "kg", heads: ["fiambre"] },
  { id: "chourico", label: "Chouriço", unit: "kg", heads: ["chourico", "chouricao", "chourica"] },
  // Cured shoulder ("Paleta de Porco Preto", sliced, about EUR 64/kg) is ham,
  // not fresh pork shoulder: a "paleta" that is sliced, cured, or sold by the
  // gram. Otherwise "paleta" is read past as a cut. 18 October 2026.
  { id: "presunto", label: "Presunto", unit: "kg", heads: ["presunto", "paleta"],
    require: /presunto|speck|jamon|prosciutto|parma|serrano|fatiad|curad|cebo|bolota|montanheira|iberic|\b\d{2,3}\s*g\b/i },
  { id: "hamburguer", label: "Hambúrguer", unit: "kg", heads: ["hamburguer", "hamburguere", "hamburger"] },
  // Bacon must say so in its own name, or be one of its close relatives:
  // pancetta, and "barriga fumada" (smoked pork belly, which is what bacon
  // is). Continente's shelf "Bacon e Fumados" also holds smoked ham hock,
  // pig's head and ear, loin and pastrami, and filed all 29 of them here -
  // a smoked ham hock at EUR 7.89/kg was the cheapest "bacon". Decided by
  // hand, 17 October 2026.
  { id: "bacon", label: "Bacon", unit: "kg", heads: ["bacon", "pancetta"], require: /\bbacon\b|\bpancetta\b|\bbarriga fumada\b/i },
  { id: "almondega", label: "Almôndega", unit: "kg", heads: ["almondega"] },
  { id: "mortadela", label: "Mortadela", unit: "kg", heads: ["mortadela"] },
  { id: "nugget", label: "Nugget", unit: "kg", heads: ["nugget"] },
  // "Paio York" is a cooked ham, not the smoked sausage. 20 October 2026.
  { id: "paio", label: "Paio", unit: "kg", heads: ["paio"], exclude: /\byork\b/i },
  { id: "salame", label: "Salame", unit: "kg", heads: ["salame"] },
  // Catalan cured sausage, at all three chains. 20 October 2026.
  { id: "fuet", label: "Fuet", unit: "kg", heads: ["fuet"] },
  { id: "alheira", label: "Alheira", unit: "kg", heads: ["alheira"] },
  { id: "farinheira", label: "Farinheira", unit: "kg", heads: ["farinheira"] },
  { id: "linguica", label: "Linguiça", unit: "kg", heads: ["linguica"] },
  { id: "salpicao", label: "Salpicão", unit: "kg", heads: ["salpicao"] },
  { id: "morcela", label: "Morcela", unit: "kg", heads: ["morcela"] },

  // --- Peixaria ------------------------------------------------------------
  // "Filete" used to be a kind, holding tinned tuna next to frozen hake. A
  // fillet is now read past (CUT_WORDS) to its fish, except breaded fillets,
  // which are a product of their own. 17 October 2026.
  { id: "filete-panado", label: "Filetes panados", unit: "kg", heads: ["filete"],
    require: /panad|primavera|crocante/i },
  // Tinned and fresh used to be separate kinds (17 October 2026); since the
  // site compares by label they are one kind each, and the label "em lata"
  // (data/food-tree.ts) keeps tinned apart from fresh. 18 October 2026.
  { id: "atum", label: "Atum", unit: "kg", heads: ["atum"] },
  // Not cod: Alaska pollock ("paloco") and coley ("escamudo"), sold on the
  // cod shelf as cheaper substitutes. And not cod as people mean it: heads
  // ("caras"), tongues, cheeks and swim bladders ("samos"), sold for specific
  // dishes - heads at EUR 5.99/kg were the cheapest "cod". The same reasoning
  // as salmon heads. Decided by hand, 17 October 2026.
  { id: "bacalhau", label: "Bacalhau", unit: "kg", heads: ["bacalhau"], exclude: /\b(paloco|escamudo)\b|\b(caras?|cabecas?|linguas?|bochechas?|samos?)\b/i },
  { id: "camarao", label: "Camarão", unit: "kg", heads: ["camarao", "gamba"] },
  // "Petinga" is young sardine, sold tinned like sardines. 20 October 2026.
  { id: "sardinha", label: "Sardinha", unit: "kg", heads: ["sardinha", "petinga"] },
  // Heads are sold for stock and soup, not as salmon to eat: three Auchan
  // salmon heads at EUR 1.89-1.99/kg were the cheapest "salmon" in the country.
  // Decided by hand, 4 October 2026.
  { id: "salmao", label: "Salmão", nameOnly: true, unit: "kg", heads: ["salmao"], exclude: /\bcabeca\b/i },
  { id: "pescada", label: "Pescada", nameOnly: true, unit: "kg", heads: ["pescada", "pescadinha"], exclude: /panad/i },
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
  // Salmon heads, kept out of salmão, would otherwise fall to this type through
  // Auchan's "peixe-fresco" shelf. Only SALMON heads: Auchan writes CABEÇA into
  // many fish names, and at EUR 21.99/kg "DOURADA MAR CABEÇA" is not a head.
  // "Peixe (outro)" and "Marisco (outro)" used to be kinds, and "cheapest
  // other fish" compared a grouper head with a scabbardfish. Replaced by the
  // fish and shellfish sold at all three chains; the rest have no kind.
  // Heads are for stock, not fish to eat (as for salmon). 17 October 2026.
  { id: "peixe-espada", label: "Peixe-espada", unit: "kg", heads: ["peixe"], require: /peixe.?espada/i, exclude: /\bcabecas?\b/i },
  { id: "pargo", label: "Pargo", unit: "kg", heads: ["pargo"], exclude: /\bcabecas?\b/i },
  { id: "garoupa", label: "Garoupa", unit: "kg", heads: ["garoupa"], exclude: /\bcabecas?\b/i },
  { id: "raia", label: "Raia", unit: "kg", heads: ["raia"], exclude: /\bcabecas?\b/i },
  { id: "red-fish", label: "Red fish (cantarilho)", unit: "kg", heads: ["red", "cantarilho"], require: /red ?fish|cantarilho/i, exclude: /\bcabecas?\b/i },
  { id: "safio", label: "Safio (congro)", unit: "kg", heads: ["safio", "congro"], exclude: /\bcabecas?\b/i },
  { id: "maruca", label: "Maruca", unit: "kg", heads: ["maruca"], exclude: /\bcabecas?\b/i },
  // Alaska pollock: "paloco" at Continente and Pingo Doce, "escamudo" at Auchan.
  // Fish fingers made of it head on "douradinho" first. 20 October 2026.
  { id: "paloco", label: "Paloco (escamudo)", unit: "kg", heads: ["paloco", "escamudo"] },
  { id: "anchova", label: "Anchova", unit: "kg", heads: ["anchova", "anchoa"] },
  { id: "pregado", label: "Pregado", unit: "kg", heads: ["pregado"], exclude: /\bcabecas?\b/i },
  { id: "besugo", label: "Besugo", unit: "kg", heads: ["besugo"], exclude: /\bcabecas?\b/i },
  { id: "faneca", label: "Faneca", unit: "kg", heads: ["faneca"], exclude: /\bcabecas?\b/i },
  { id: "sargo", label: "Sargo", unit: "kg", heads: ["sargo"], exclude: /\bcabecas?\b/i },
  // Cooked crab, whole. Not the filling or the claws, sold for other uses.
  { id: "sapateira", label: "Sapateira", unit: "kg", heads: ["sapateira"], exclude: /recheio|\bbocas?\b|\bpatas?\b/i },
  // Lobster and European lobster were filed as crab through the shelf "Sapateira
  // e Lagosta". Two kinds: different animals at different prices. Not the
  // "Lagosta" vinho verde, nor lobster-shaped surimi. 20 October 2026.
  { id: "lagosta", label: "Lagosta", unit: "kg", heads: ["lagosta"], exclude: /vinho|delicias|surimi|forma de/i },
  { id: "lavagante", label: "Lavagante", unit: "kg", heads: ["lavagante"] },
  { id: "berbigao", label: "Berbigão", unit: "kg", heads: ["berbigao"] },
  { id: "delicias-do-mar", label: "Delícias do mar", unit: "kg", heads: ["delicia"], require: /delicias? do mar/i },
  { id: "caracol", label: "Caracóis", unit: "kg", heads: ["caracol", "caracoi", "caracoleta"], exclude: /canela|frutas|chocolate|folhad|massa|creme/i },

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
    require: /vegetal|alpro|oatly|\b(aveia|soja|arroz|amendoas?|caju|coco|avela|espelta)\b/i,
    // An almond liqueur names a plant too. 17 October 2026.
    exclude: /\blicor/i },
  // Plain cow's milk, compared per litre. Pingo Doce calls its lactose-free
  // milk "Bebida de Leite", hence the second head. Not flavoured milk drinks,
  // coffee drinks, condensed or powdered milk, or coconut "milk" (all came in
  // through shelves or the name). 17 October 2026.
  // Condensed and coconut milk head on "leite" and milk excludes both, so they
  // had no kind at all. 20 October 2026.
  { id: "leite-condensado", label: "Leite condensado", nameOnly: true, unit: "kg", heads: ["leite"], require: /condensad/i },
  { id: "leite-coco", label: "Leite de coco", nameOnly: true, unit: "l", heads: ["leite"], require: /\bcoco\b|coconut/i,
    // "Leite Coco Fermentado" is a coconut yoghurt.
    exclude: /fermentad/i },
  { id: "leite", label: "Leite", nameOnly: true, unit: "l", heads: ["leite", "bebida"], require: /\bleite\b/i,
    // "Leite Creme" is a custard dessert. 18 October 2026.
    exclude: /achocolat|chocolate|cacau|\bcafe|galao|cap+uc|latte|morango|baunilha|banana|caramelo|condensad|\bem po\b|\bcoco\b|creme de leite|leite creme|\bcreme\b|protei|crescimento|infantil|fermentad/i },
  // Not peanut or other nut butters. 20 October 2026.
  { id: "manteiga", label: "Manteiga", nameOnly: true, unit: "kg", heads: ["manteiga"], exclude: /amendoim|amendoa|caju|avela|pistacio|cacau/i },
  { id: "kefir", label: "Kefir", unit: "l", heads: ["kefir"] },
  { id: "pudim", label: "Pudim", hidden: "sweets", unit: "kg", heads: ["pudim"] },
  // Plant-based yoghurts go by brand names too: Alpro's "Yofu", Sojasun's
  // "Sojagurte", the "Cocogurte" of several makers. Approved in review batch 1,
  // 20 October 2026 - they were filed as dairy yoghurt.
  { id: "vegurte", label: "Vegurte", unit: "kg", heads: ["vegurte", "vegegurte", "yofu", "sojagurte", "cocogurte"] },
  { id: "nata", label: "Natas", nameOnly: true, unit: "l", heads: ["nata"] },
  // Split: shell eggs are sold by weight, pasteurised egg white by volume, and
  // both are genuinely egg. What is NOT egg is a chocolate Kinder egg or "ovos
  // moles", the Aveiro egg-yolk sweet - both were landing here on the word.
  //
  // Hen's eggs in the shell, compared per EGG: a box says "12 un" or "meia
  // dúzia", not a weight. Not egg white or liquid egg (sold by volume or
  // weight, a different product), boiled eggs, quail eggs, or a dish with egg
  // in it. 17 October 2026.
  { id: "ovo", label: "Ovos", unit: "un", heads: ["ovo"],
    exclude: /chocolate|kinder|surpresa|\bmoles\b|bombom|\bclaras?\b|liquido|pasteuriz|cozid|codorniz|espinafre|\bem po\b/i },
  { id: "requeijao", label: "Requeijão", unit: "kg", heads: ["requeijao"] },
  { id: "mousse", label: "Mousse", hidden: "sweets", unit: "kg", heads: ["mousse"] },
  { id: "bifidus", label: "Bífidus", unit: "kg", heads: ["bifidu"] },

  // --- Mercearia -----------------------------------------------------------
  { id: "bolacha", label: "Bolacha", hidden: "sweets", unit: "kg", heads: ["bolacha", "biscoito"] },
  // Split: jarred pesto and tomato are sold by weight, bechamel and soy sauce
  // by volume. `com molho` excludes a DISH that comes with a sauce - "Pernil
  // Assado com Molho de Cerveja" is roast pork, and reached here because the
  // cut-word scan reads past `pernil` and finds `molho`.
  // "Molho" used to be one kind of 611 sauces, where the cheapest was always
  // whichever sauce is cheapest to make. Split into the everyday sauces sold at
  // all three chains; the rest have no kind. Sold by weight or by volume, as
  // the stores record them. `com molho` is a dish that comes with a sauce.
  // 17 October 2026.
  { id: "molho-soja", label: "Molho de soja", unit: "either", heads: ["molho", "shoyu"],
    // Not soy steaks in tomato sauce ("Bifes Cem Porcento Soja Molho Tomate"),
    // nor miso or fermented soy beans. Auchan writes "MOLHO KIKKOMAN SOJA", so
    // the words need not be next to each other. 20 October 2026.
    require: /\bsoja\b|shoyu/i, exclude: /\bcom molho\b|\bbifes?\b|tomate|\bmiso\b|fermentad/i },
  // The sauce and the dried chilli are different products (EUR 2.26 against
  // about EUR 31 a kilo), and the unit cannot tell them apart: Pingo Doce
  // records its sauce by weight. So each must say what it is - "molho", or
  // ground, whole, dried. A bottle saying neither ("PIRI-PIRI GALLO 50ML") has
  // no kind rather than a guess. 17 October 2026.
  { id: "piri-piri", label: "Molho piri-piri", unit: "either", heads: ["molho", "piri", "piripiri"], require: /(?=.*\bmolho\b)(?=.*piri)/i,
    exclude: /\bcom molho\b|azeite|oleo/i },
  { id: "piri-piri-seco", label: "Piri-piri seco", unit: "kg", heads: ["piri", "piripiri"],
    require: /(?=.*piri)(?=.*(moid|\bgrao\b|\bsecos?\b|\bem po\b|flocos|esmagad|saqueta|vagem))/i, exclude: /\bmolho\b/i },
  { id: "pesto", label: "Pesto", unit: "either", heads: ["molho", "pesto"], require: /pesto/i, exclude: /\bcom molho\b/i },
  { id: "bechamel", label: "Béchamel", unit: "either", heads: ["molho", "bechamel"], require: /bechamel/i, exclude: /\bcom molho\b/i },
  { id: "molho-alho", label: "Molho de alho", unit: "either", heads: ["molho"], require: /molho de alho|\balho\b/i, exclude: /\bcom molho\b|piri|pesto|soja/i },
  { id: "barbecue", label: "Molho barbecue", unit: "either", heads: ["molho"], require: /barbecue|\bbbq\b/i, exclude: /\bcom molho\b/i },
  { id: "molho-tomate", label: "Molho de tomate", unit: "either", heads: ["molho"], require: /\btomate\b/i, exclude: /\bcom molho\b|ketchup/i },
  // massa the pasta, not massa the dough
  // Ravioli and tortellini are filled fresh pasta (a sub-kind), not a kind of
  // their own. 18 October 2026.
  { id: "massa", label: "Massa", unit: "kg", heads: ["massa", "esparguete", "noodle", "fusilli", "ravioli", "tortellini"],
    // Tofu, seitan and potato starch share Auchan's fresh-pasta shelves.
    // "Massa de Alho" and "Massa de Pimentão" are seasoning pastes. 20 October 2026.
    exclude: /massa folhada|massa quebrada|massa de pizza|massa areada|massa de (alho|pimentao|piment|malagueta|tomate)|\btofu\b|\bseitan\b|fecula|\bpots?\b|^pasta (bolonhesa|carbonara)/i },
  // Sweets that are not chocolate, which reach here through the shelf rather
  // than the name: "Chocolates e Guloseimas" holds both, and a name like
  // "Rebuçados de Mentol" has no head of its own, so the category answered.
  // Mint sweets at EUR 4.36/kg then led the cheapest-chocolate ranking.
  //
  // An EXCLUDE and not a REQUIRE: 480 of the 1,599 never say "chocolate" and
  // most of them are chocolate anyway - Kinder Bueno, Lindt Lindor, Maltesers,
  // Kit Kat. Demanding the word would drop hundreds of real ones to catch a few
  // dozen strays.
  // The sweet words only disqualify a product that never mentions chocolate:
  // a plain `caramelo` exclusion also threw out "Tablete de Chocolate com
  // Caramelo", which is chocolate with caramel in it. Measured, the blunt
  // version removed 285 products where the guarded one removes far fewer.
  // "tablete": Auchan names most chocolate bars by the format alone, as in
  // "TABLETE LINDT EXCELLENCE 70%". They used to reach chocolate only through
  // their shelf, which no longer decides when it names several foods.
  // Powders are not chocolate bars, and listed BEFORE chocolate so they claim
  // first: the first type in array order whose rules accept a name wins. About
  // 120 powders were filed as chocolate, and drink powder at EUR 5.36/kg was
  // the cheapest "chocolate". Pure cocoa and the sweetened drink powder are
  // different products again, so each gets its own ranking. 17 October 2026.
  //
  // Reached ONLY through the word "chocolate" (in the name or on the shelf).
  // Claiming "achocolatado" or "cacau" as words of their own made shelves
  // like "chocolates-e-achocolatados" name two foods, and a two-food shelf
  // decides nothing - 135 chocolate bars lost their food in the preview.
  // They claim "tablete" too, for the same reason: "Tabletes de Chocolate"
  // must name ONE set of foods, so both words need the same claimants.
  { id: "cacau", label: "Cacau em pó", hidden: "sweets", unit: "kg", heads: ["chocolate", "tablete"],
    require: /(?=.*\bcacau\b)(?=.*\bpo\b)/i, exclude: /chocolate|achocolatad|soluvel|cobert|amendo/i },
  { id: "achocolatado", label: "Achocolatado em pó", hidden: "sweets", unit: "kg", heads: ["chocolate", "tablete"],
    require: /achocolatad|soluvel|\bem po\b|\bpo\b|ovomaltine|fortificante|milk-mix|magic milk|granulos|nesquik|cola cao|toddy|chocolate quente/i,
    exclude: /\btab(e)?lete\b|bombo|snack|cobert|amendo|pepita|\bbarras?\b/i },
  { id: "chocolate", label: "Chocolate", hidden: "sweets", unit: "kg", heads: ["chocolate", "tablete"],
    // Sugared almonds ("tipo francês", "lisas cores") sit on the chocolate
    // shelf but are sugar-coated, not chocolate.
    // And a pastry from the bakery counter is not chocolate either.
    exclude: /^(?!.*(?:chocolat|cacau|choco\b)).*(?:rebucado|\bchupa|\bgoma|caramelo|torrao|nougat|marshmallow|alcacuz|tipo frances|\blisas? cores\b)|\bsupremas?\b|nossa pastelaria|\bflocos?\b/i },
  { id: "arroz", label: "Arroz", unit: "kg", heads: ["arroz"], exclude: /arroz doce|\bflocos?\b|nestum/i },
  { id: "gelatina", label: "Gelatina", hidden: "sweets", unit: "kg", heads: ["gelatina"] },
  { id: "farinha", label: "Farinha", nameOnly: true, unit: "kg", heads: ["farinha"] },
  // "Azeite de Dendê" is palm oil, not olive oil. 20 October 2026.
  { id: "azeite", label: "Azeite", unit: "l", heads: ["azeite"], exclude: /dende/i },
  { id: "nectar", label: "Néctar", hidden: "drinks", unit: "l", heads: ["nectar"] },
  // Green beans are a fresh vegetable, not dried beans, and share the head word.
  { id: "feijao-verde", label: "Feijão verde", unit: "kg", heads: ["feijao"], require: /feijao verde/i },
  { id: "feijao", label: "Feijão", nameOnly: true, unit: "kg", heads: ["feijao"], exclude: /feijao verde/i },
  // Not balsamic glaze ("Creme Balsâmico"), a thick reduction. 20 October 2026.
  { id: "vinagre", label: "Vinagre", unit: "l", heads: ["vinagre"], exclude: /\bcreme\b|glace|reducao/i },
  { id: "pate", label: "Paté", nameOnly: true, unit: "kg", heads: ["pate"] },
  // "Canja"/"Canjinha" is chicken broth: a soup, not chicken. 20 October 2026.
  { id: "sopa", label: "Sopa", unit: "kg", heads: ["sopa", "canja", "canjinha"] },
  // Soup powders and sachets: a packet of powder cannot be compared per kilo
  // with ready soup. No heads yet - their names ("Creme de Marisco Knorr")
  // read like ready soups - so only review assigns it (data/kind-reviews.ts).
  // Approved in review batch 2, 20 October 2026.
  { id: "sopa-instantanea", label: "Sopas instantâneas", unit: "kg", heads: [] },
  // Stock, not "Caldo Verde", which is a soup. 17 October 2026.
  { id: "caldo", label: "Caldo", nameOnly: true, unit: "kg", heads: ["caldo"], exclude: /caldo verde/i },
  // "Tempero" (seasoning mixes) and "Pasta" (pastes: curry next to olive next
  // to instant pasta pots) were kinds with no single food in them, and were
  // removed on 17 October 2026.
  // Split, though for the other reason: every one of these is a jar of
  // mayonnaise and the stores simply record it differently - 46 by weight, 57
  // by volume, and inconsistently WITHIN each chain. Picking one unit would
  // throw away about half the jars, so both rankings are shown.
  { id: "maionese", label: "Maionese", unit: "either", heads: ["maionese"] },
  // Tomato pulp, passata and concentrate: an everyday ingredient. It used to
  // share "Polpa" with fruit pouches for children. 17 October 2026.
  { id: "polpa-tomate", label: "Polpa de tomate", unit: "kg", heads: ["polpa", "passata", "concentrado"], require: /tomate/i },
  // Fruit pouches and purées, set aside with the sweets. Pingo Doce's
  // "Bolsas de Fruta" used to reach cereals through the shelf above them.
  { id: "fruta-saqueta", label: "Fruta em saqueta e puré", hidden: "sweets", unit: "kg", heads: ["polpa", "pure", "saqueta", "boiao"],
    require: /fruta|frutos|maca|banana|manga|pera|morango|multifruto|maracuja|acai|goiaba|pessego/i, exclude: /tomate|batata/i },
  { id: "azeitona", label: "Azeitona", unit: "kg", heads: ["azeitona"] },
  { id: "acucar", label: "Açúcar", nameOnly: true, unit: "kg", heads: ["acucar"] },
  // Toothpaste is a `pasta` by head noun and is not food. It never showed up
  // while the own-brand aisle was skipped wholesale, because toothpaste's usual
  // home is `higiene-pessoal-e-beleza`, which the URL excludes; crawling that
  // aisle brings 7 of them in through a path that says nothing about what they
  // are. The only systematic contaminant of the 494 food products there.
  { id: "oleo", label: "Óleo", unit: "l", heads: ["oleo"] },
  // Name only: shelves like "Compotas, Mel e Cremes de Barrar" name honey as
  // their only food, and filed 338 jams and spreads as honey. 20 October 2026.
  { id: "mel", label: "Mel", hidden: "sweets", nameOnly: true, unit: "kg", heads: ["mel"], exclude: /\bflocos?\b/i },
  // "Flor de Sal" (salt flakes) heads on "flor". 17 October 2026.
  { id: "sal", label: "Sal", nameOnly: true, unit: "kg", heads: ["sal", "flor", "moinho", "escama"], require: /\bsal\b/i, exclude: /bicarbonato/i },
  { id: "pimenta", label: "Pimenta", nameOnly: true, unit: "kg", heads: ["pimenta"] },
  // Dried spices with no kind until 20 October 2026.
  { id: "cominho", label: "Cominhos", nameOnly: true, unit: "kg", heads: ["cominho"] },
  { id: "oregao", label: "Orégãos", nameOnly: true, unit: "kg", heads: ["oregao"] },
  { id: "ketchup", label: "Ketchup", unit: "kg", heads: ["ketchup"] },
  { id: "pipoca", label: "Pipoca", hidden: "sweets", unit: "kg", heads: ["pipoca"] },
  // "Semente" used to be one kind, where chia and sunflower were compared as
  // the same thing. One kind per seed sold at all three chains; seed mixes
  // have none. 17 October 2026.
  { id: "chia", label: "Sementes de chia", unit: "kg", heads: ["semente", "chia"], require: /chia/i, exclude: /pudim|iogurte|bebida|barra|bolacha|\bpao\b/i },
  { id: "girassol", label: "Sementes de girassol", unit: "kg", heads: ["semente", "pipa", "girassol"], require: /girassol/i, exclude: /\boleo\b|\bpao\b|barra|bolacha/i },
  { id: "sesamo", label: "Sementes de sésamo", unit: "kg", heads: ["semente", "sesamo"], require: /sesamo/i, exclude: /\boleo\b|\bpao\b|barra|bolacha|tahini|pasta/i },
  { id: "semente-abobora", label: "Sementes de abóbora", unit: "kg", heads: ["semente", "pevide"], require: /sementes? de abobora|sementes abobora|pevides?/i },
  // Dried cranberries. 20 October 2026.
  { id: "arando", label: "Arandos", unit: "kg", heads: ["arando", "cranberry"], exclude: /chocolate|frutos secos/i },
  { id: "linhaca", label: "Linhaça", unit: "kg", heads: ["semente", "linhaca"], require: /linhaca/i, exclude: /\bpao\b|barra|bolacha|\boleo\b/i },
  { id: "canhamo", label: "Sementes de cânhamo", unit: "kg", heads: ["semente", "canhamo"], require: /canhamo/i, exclude: /\boleo\b|proteina|bebida/i },
  { id: "amendoim", label: "Amendoim", unit: "kg", heads: ["amendoim"] },
  { id: "mostarda", label: "Mostarda", unit: "kg", heads: ["mostarda"] },
  // Sweetcorn, not cornflakes, which the read past "flocos" would otherwise reach.
  // "Milho para Pipocas" is popcorn kernels, not sweetcorn. 20 October 2026.
  { id: "milho", label: "Milho", unit: "kg", heads: ["milho"], exclude: /\bflocos?\b|pipoca/i },
  // The three chains sell the same flatbreads as "tortilhas" and "wraps".
  // A filled wrap ("Wrap de Atum") is a sandwich, not the flatbread.
  { id: "tortilha", label: "Tortilha e wrap", unit: "kg", heads: ["tortilha", "wrap"],
    exclude: /\bwraps? de (?!trigo|milho|espelta|centeio|aveia|cereais)/i },
  { id: "caju", label: "Caju", unit: "kg", heads: ["caju"] },
  // The nut, plain, roasted or salted - not the sweet. 54 of 134 were Easter
  // chocolate almonds, sugared almonds ("tipo francês", "lisas cores"),
  // drageias and cakes, and a sugared almond at EUR 9.93/kg was the cheapest
  // "almond". Honey-and-salt almonds stay: a snack nut, not a sweet. Decided
  // by hand, 17 October 2026.
  { id: "amendoa", label: "Amêndoa", unit: "kg", heads: ["amendoa", "amendoas"], exclude: /chocolate|\bcobert|acucar|tipo frances|\blisas? cores\b|drageia|confeit|biscoito|\bbolos?\b/i },
  // Nuts are usually sold as "Miolo de Noz", "Miolo de Avelã" - the head is
  // `miolo` (the kernel), so they are only reachable by scanning past it.
  { id: "noz", label: "Noz", unit: "kg", heads: ["noz", "nozes", "noze"] },
  // Chocolate-coated hazelnuts are sweets, as with almonds above.
  { id: "avela", label: "Avelã", unit: "kg", heads: ["avela"], exclude: /chocolate|\bcobert|acucar/i },
  { id: "pinhao", label: "Pinhão", unit: "kg", heads: ["pinhao"] },
  { id: "castanha", label: "Castanha", unit: "kg", heads: ["castanha"] },
  { id: "pistacio", label: "Pistácio", unit: "kg", heads: ["pistacio", "pistachio"] },
  { id: "adocante", label: "Adoçante", hidden: "sweets", unit: "kg", heads: ["adocante"] },
  { id: "quinoa", label: "Quinoa", unit: "kg", heads: ["quinoa"] },
  // Plain couscous, not the ready bowls and salads made with it. 20 October 2026.
  { id: "cuscuz", label: "Cuscuz", unit: "kg", heads: ["couscou", "cuscuz"],
    exclude: /bowl|vegetais|legumes|frango|salada|refeic|para cou?scou?s|marroquin|mediterr/i },
  // Plain oats - flakes, bran, whole - not oat biscuits, drinks, granola or a
  // Nestum mix that contains some. 17 October 2026.
  { id: "aveia", label: "Aveia", nameOnly: true, unit: "kg", heads: ["aveia"],
    exclude: /bebida|barr(a|as|inha|itas?)\b|bolacha|biscoit|cookie|granola|muesli|panqueca|chocolate|protei|iogurte|nestum|\bmel\b|\bpao\b|tortit|papa de/i },
  { id: "tofu", label: "Tofu", unit: "kg", heads: ["tofu"], exclude: /salsicha|hamburguer|nugget|refeic|caril|panad/i },
  { id: "bulgur", label: "Bulgur", unit: "kg", heads: ["bulgur"] },
  // The spice. Not a curry DISH ("Caril de Lentilhas", "Caril de Frango" -
  // a jar of lentil curry at EUR 4.85/kg was the cheapest "caril"), and not
  // the paprika and turmeric on the same Auchan spice shelf, whose names never
  // say curry. Nor a curry paste or sauce, sold in bigger jars and cheaper per
  // kilo than the powder. Decided by hand, 17 October 2026.
  { id: "caril", label: "Caril", unit: "kg", heads: ["caril", "curry"], require: /\b(caril|curry)\b/i, exclude: /\b(caril|curry) (thai |indiano )?(de|com)\b|refeic|\bpasta\b|tikka|masala|\bmolho\b/i },
  { id: "marmelada", label: "Marmelada", hidden: "sweets", unit: "kg", heads: ["marmelada"] },
  { id: "lentilha", label: "Lentilha", unit: "kg", heads: ["lentilha"] },
  // "Grão Vasco" is a Dão wine. 20 October 2026.
  { id: "grao", label: "Grão", unit: "kg", heads: ["grao"], exclude: /vinho/i },
  { id: "tremoco", label: "Tremoço", unit: "kg", heads: ["tremoco"] },
  // Everything here is a powder, sold by weight. The 13 products recorded by
  // volume were not yeast at all - vanilla essence and food colouring, which
  // arrived through the shelf rather than the name - so the name must now say
  // so. Nothing replaces them: unclassified is honest.
  { id: "fermento", label: "Fermento", unit: "kg", heads: ["fermento"],
    require: /fermento|levedura/i },
  // "Línguas de gato" are biscuits. Auchan writes them "LÍNGUAS AUCHAN DE GATO
  // ... CANELA", which hides the name, and the read past `lingua` (a cut word,
  // as in ox tongue) landed on the flavour.
  { id: "canela", label: "Canela", unit: "kg", heads: ["canela"], exclude: /\bde gato\b/i },

  // --- Padaria e pastelaria ------------------------------------------------
  // Toasts, mini-toasts, crispbread and breadsticks: not bread, and not biscuits.
  // Auchan filed them as bread and Pingo Doce as biscuits, so the same product
  // was never compared. Approved in review batch 1, 20 October 2026. Not
  // croutons, nor a "Tosta Mista" (a toasted ham-and-cheese sandwich).
  { id: "tosta", label: "Tostas e gressinos", unit: "kg",
    // Not "bruschetta" by name: Ponti's is a tomato topping in a jar. The
    // bruschetta toasts on Auchan's toast shelf are toasts through the shelf.
    heads: ["tosta", "gressino", "grissino", "grissini", "crostini", "tarallini", "taralli", "biscottina", "regana"],
    exclude: /crouton|\bmista\b/i },
  // Breadcrumbs: "Pão Ralado" heads on pão, so it is listed first. 20 October 2026.
  { id: "pao-ralado", label: "Pão ralado", unit: "kg", heads: ["pao", "panko"], require: /\bralado\b|panko/i },
  { id: "pao", label: "Pão", unit: "kg", heads: ["pao", "baguete", "broa"],
    // Nachos, taco shells and crackers sit on the "pão, tostas e snacks" shelves.
    // "Pão Ló de Ovar" is a sponge cake too, written without "de". 20 October 2026.
    exclude: /pao ralado|pao (de )?lo\b|nacho|cracker|\btaco|\bsnacks?\b/i },
  { id: "bolo", label: "Bolo", hidden: "sweets", unit: "kg", heads: ["bolo", "torta", "madalena"] },
  { id: "croissant", label: "Croissant", hidden: "sweets", unit: "kg", heads: ["croissant"] },
  // Split: a baked apple tart is sold by weight and a frozen ice-cream tart by
  // volume, and they are not the same food.
  { id: "tarte", label: "Tarte", hidden: "sweets", unit: "either", heads: ["tarte"] },

  // --- Congelados e refeições ----------------------------------------------
  { id: "gelado", label: "Gelado", hidden: "sweets", unit: "l", heads: ["gelado"] },
  { id: "pizza", label: "Pizza", unit: "kg", heads: ["pizza"] },
  { id: "lasanha", label: "Lasanha", unit: "kg", heads: ["lasanha"] },
  // A dish, not an ingredient that shares its shelf. Auchan's "preparados e
  // refeições rápidas" ("mixes and quick meals") also holds cornmeal, maize,
  // cassava, bulgur, palm hearts, cake mixes, sauerkraut and kimchi, and fubá
  // (cornmeal) at EUR 2.01/kg was the cheapest "ready meal". Plain tofu,
  // seitan, tempeh and riced vegetables are ingredients too - but a name that
  // only CONTAINS one of them ("LUNCH BOWL BULGUR", "BOLONHESA SEITAN",
  // "TOPOKKI ... KIMCHI") can still be a meal. 17 October 2026.
  { id: "refeicao", label: "Refeição pronta", unit: "kg", heads: ["refeicao"],
    exclude: /\b(fuba|flocao|canjic\w*|canjiquinha|xerem|sagu|farofa|mandioca|palmito|chucrute|jalapeno|tofu|tempeh|riced|veggie rice)\b|^(bulgur|seitan|kimchi)\b|trigo para kibe|preparados? (koala|duncan|mississippi)|mistura preparada|base (de pinsa|sopa)/i },
  // Savoury: the sweet ones (apple, chocolate, guava) are set aside with the
  // sweets. 17 October 2026.
  { id: "folhado", label: "Folhado", unit: "kg", heads: ["folhado"],
    exclude: /maca|chocolate|goiabada|\bcreme\b|\bdoce\b|\bnata\b|frutos|canela|twists?|feuilletine|manteiga/i },
  { id: "rissol", label: "Rissol", unit: "kg", heads: ["rissoi", "rissol"] },
  // Not the mixes for making them. 20 October 2026.
  { id: "panqueca", label: "Panqueca", hidden: "sweets", unit: "kg", heads: ["panqueca"], exclude: /\bmix\b|mistura|preparado/i },
  // "Empanada de Atum" is a pie, not tuna: the word used to be read past as a cut.
  { id: "empada", label: "Empada", unit: "kg", heads: ["empada", "empadao", "empanada"] },
  { id: "croquete", label: "Croquete", unit: "kg", heads: ["croquete", "croqueta"] },
  // "Pastel" used to be one kind: pastel de nata next to codfish cakes.
  // 17 October 2026.
  { id: "pastel-bacalhau", label: "Pastéis de bacalhau", unit: "kg", heads: ["pastel", "pastei"], require: /bacalhau/i },
  { id: "pastel-nata", label: "Pastel de nata", hidden: "sweets", unit: "kg", heads: ["pastel", "pastei"], require: /\bnata\b|belem/i },
  { id: "quiche", label: "Quiche", unit: "kg", heads: ["quiche"] },
  { id: "sande", label: "Sande", unit: "kg", heads: ["sande"] },

  // --- Bebidas -------------------------------------------------------------
  { id: "vinho", label: "Vinho", hidden: "drinks", unit: "l", heads: ["vinho"] },
  { id: "cerveja", label: "Cerveja", hidden: "drinks", unit: "l", heads: ["cerveja"] },
  { id: "refrigerante", label: "Refrigerante", hidden: "drinks", unit: "l", heads: ["refrigerante"] },
  // Tonic water and flavoured waters are soft drinks, set aside with the other
  // drinks; listed first so they claim those names. 18 October 2026.
  { id: "agua-sabor", label: "Água tónica e com sabor", hidden: "drinks", nameOnly: true, unit: "l", heads: ["agua"],
    require: /tonica|ginger|\bsabor|aromatizad|botanic|\bpink\b|\blima\b|\blimao\b|framboesa|morango|pessego|frutos/i },
  { id: "agua", label: "Água", nameOnly: true, unit: "l", heads: ["agua"] },
  // Breakfast cereals, not cereal BARS (a snack, set aside with the sweets) or
  // protein powders sold on the sports-nutrition cereal shelf. 17 October 2026.
  { id: "cereais", label: "Cereais", unit: "kg", heads: ["cereal"],
    // ...nor a roasted cereal drink, "Mistura Torrada Moída de Cereais", nor
    // energy balls. 20 October 2026.
    exclude: /\bbarr(a|as|inha|inhas|ita|itas)\b|whey|\bproteina\b.*\bpo\b|clara de ovo|\bbolsas?\b|torrad[ao] moid|\bbebida|energetic|tiras de fruta/i },
  { id: "cha", label: "Chá", unit: "kg", heads: ["cha"] },
  // Capsules and pods ("cápsulas", "pastilhas") are coffee only when the name
  // shows it: a coffee word, or a coffee-machine system or brand. Not on the
  // head word alone, because "pastilha" is also a lozenge - the shelf "Gomas,
  // Pastilhas e Rebuçados" would otherwise file Halls as coffee - and
  // "Cápsulas de Vitamina D" exist. And not when the name says they hold
  // something else without also saying coffee: "CÁPSULAS TORRIÉ CAFÉ COM
  // LEITE" is coffee, "CÁPSULAS TASSIMO MILKA" and "Cápsulas de Chá" are not.
  // Names like "CÁPSULAS DOLCE GUSTO BUONDI" used to reach café only through a
  // shelf that also names tea, which no longer decides.
  //
  // Capsules are their own kind, compared per CAPSULE (decided 18 October
  // 2026): a box is sold by count - "30 UN" - and a price per kilo of capsules
  // means nothing. Listed first, so it claims every coffee name that also says
  // capsule, pod or a capsule system; the rest is ground, bean or instant.
  { id: "cafe-capsula", label: "Café em cápsulas", unit: "un", heads: ["cafe", "capsula", "pastilha"],
    require: new RegExp(`(?=.*(?:capsul|pastilha|\\bpods?\\b|nespresso|dolce gusto|tassimo|\\bnsp\\b|\\bdg\\b|delta q|compativ))(?=.*(?:${COFFEE_WORDS}))`, "i"),
    exclude: COFFEE_EXCLUDE },
  // Barley, chicory and cereal drinks (Pensal, Bolero, Delta Cereais), a
  // coffee substitute sold at all three chains. No heads yet - "Bebida",
  // "Mistura" and "Solúvel" lead many other names - so only review assigns it
  // (data/kind-reviews.ts). Approved in review batch 2, 20 October 2026.
  { id: "bebida-cereais", label: "Bebidas de cereais (cevada e chicória)", unit: "kg", heads: [] },
  { id: "cafe", label: "Café", unit: "kg", heads: ["cafe", "capsula", "pastilha"],
    require: new RegExp(COFFEE_WORDS, "i"), exclude: COFFEE_EXCLUDE },
  { id: "sumo", label: "Sumo", hidden: "drinks", unit: "l", heads: ["sumo"] },
  { id: "infusao", label: "Infusão", unit: "kg", heads: ["infusao"] },
  { id: "espumante", label: "Espumante", hidden: "drinks", unit: "l", heads: ["espumante"] },
  { id: "licor", label: "Licor", hidden: "drinks", unit: "l", heads: ["licor"] },
  { id: "whisky", label: "Whisky", hidden: "drinks", unit: "l", heads: ["whisky"] },
  { id: "gin", label: "Gin", hidden: "drinks", unit: "l", heads: ["gin"] },
  { id: "sidra", label: "Sidra", hidden: "drinks", unit: "l", heads: ["sidra"] },
  { id: "aguardente", label: "Aguardente", hidden: "drinks", unit: "l", heads: ["aguardente"] },
  { id: "batido", label: "Batido", hidden: "drinks", unit: "l", heads: ["batido"] },
  { id: "vodka", label: "Vodka", hidden: "drinks", unit: "l", heads: ["vodka"] },
  { id: "rum", label: "Rum", hidden: "drinks", unit: "l", heads: ["rum"] },
];
