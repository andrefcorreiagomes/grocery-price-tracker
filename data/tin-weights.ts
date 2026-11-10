/**
 * Tins whose single weight no page labels and no other store settles, judged by
 * hand: is the number the store shows the FULL weight or the DRAINED one (the
 * owner's choice of 10 November 2026, check 4; src/lib/tin-weights.ts)?
 *
 * Each judgement was made by an AI (Claude) from the product's name and number
 * and what tins of that food weigh, and checked by Claude against the tins that
 * label both. It holds only while the store still shows that number: when the
 * page changes, the entry stops applying and the tin is unplaced again.
 * The site marks every weight placed this way.
 */
export interface ReviewedTinWeight {
  batch: number;
  store: string;
  /** the store's own product id */
  id: string;
  /** the name at review time, for a person reading this file */
  name: string;
  /** the number the store showed, in kg; the entry applies only while it still shows it */
  shows: number;
  /** which weight that number is; "both" when the store's own label for it gives the same number twice */
  is: "full" | "drained" | "both";
  why: string;
}

export const REVIEWED_TIN_WEIGHTS: ReviewedTinWeight[] = [
  // Batch 1, 10 November 2026: the tins that can appear on the site and that
  // no label settled, judged from what tins of the same food weigh when their
  // stores label both. Olives and 400 g beans left unjudged (seen both ways).
  { batch: 1, store: "AUCHAN", id: "1038770", name: "ATUM RAMIREZ COM GRÃO 120G", shows: 0.12, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "1098007", name: "MILHO BONDUELLE DOCE BIO 2X150G", shows: 0.3, is: "full", why: "sweetcorn tins of this weight are the full weight (285 g drained for 300-340 g)" },
  { batch: 1, store: "AUCHAN", id: "1197739", name: "SARDINHAS SOCILINK SEM PELE E SEM ESPINHA EM AZEITE 125G", shows: 0.125, is: "full", why: "sardine tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "16947", name: "SARDINHA RAMIREZ EM TOMATE PICANTE 125G", shows: 0.125, is: "both", why: "Ramirez's own label for this tin at Continente says 125 g full and 125 g drained (sardines in tomato sauce)" },
  { batch: 1, store: "AUCHAN", id: "16960", name: "SARDINHA RAMIREZ EM TOMATE 125G", shows: 0.125, is: "both", why: "Ramirez's own label for this tin at Continente says 125 g full and 125 g drained (sardines in tomato sauce)" },
  { batch: 1, store: "AUCHAN", id: "2270929", name: "FILETE SANTA CATARINA ATUM AZEITE BIO 120G ESPECIALIDADE", shows: 0.12, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "2734501", name: "ATUM POSTA SANTA CATARINA AZEITE BIOLÓGICO 120G", shows: 0.12, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "2939002", name: "ATUM COM ALHO FICOLUME 110 GR", shows: 0.11, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "3024121", name: "ATUM SANTA CATARINA FILETE AZEITE BIOLÓGICO 120G", shows: 0.12, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "3204565", name: "SARDINHAS RAMIREZ CONSERVA EM AZEITE BIO 125G", shows: 0.125, is: "full", why: "sardine tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "3304036", name: "ATUM SANTA CATARINA POSTA ÓLEO GIRASSOL BIO 120G", shows: 0.12, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "3304071", name: "ATUM SANTA CATARINA POSTA TOMATE BIO 120G", shows: 0.12, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "3410412", name: "ANANAS CIMARROM 820 GRS", shows: 0.82, is: "full", why: "pineapple tins of 560-825 g are the full weight; their drained weight is 340-500 g" },
  { batch: 1, store: "AUCHAN", id: "3510563", name: "ANANÁS RODELAS AUCHAN EM SUMO NATURAL (340) G 560 G", shows: 0.56, is: "full", why: "pineapple tins of 560-825 g are the full weight; their drained weight is 340-500 g" },
  { batch: 1, store: "AUCHAN", id: "3585601", name: "PIMENTO AUCHAN ASSADO EM TIRAS 290 G", shows: 0.29, is: "full", why: "roasted pepper jars of 290 g are the full weight (225 g drained)" },
  { batch: 1, store: "AUCHAN", id: "3669012", name: "CAVALA CAMPOS SANTOS CARIL E MALAGUETA 120G", shows: 0.12, is: "full", why: "mackerel tins of 120 g are the full weight (17 that label both: 120 g full, 78-85 g drained)" },
  { batch: 1, store: "AUCHAN", id: "3699911", name: "MILHO DOCE AUCHAN BIO EM GRÃO 285 G", shows: 0.285, is: "drained", why: "sweetcorn tins are 340 g full, 285 g drained" },
  { batch: 1, store: "AUCHAN", id: "3796392", name: "FILETE ATUM MINERVA AZEITE COM MALAGUETA 125G", shows: 0.082, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "AUCHAN", id: "3815188", name: "FILETE ATUM SANTA CATARINA 120G", shows: 0.12, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "3828534", name: "PETINGA AUCHAN EM AZEITE 88G", shows: 0.062, is: "drained", why: "a drained weight: sardine and petinga tins that label both are 88-125 g full and 62-88 g drained; a name giving 88 G with 62 g shown is the drained 62" },
  { batch: 1, store: "AUCHAN", id: "3828765", name: "PETINGA AUCHAN OLEO DE GIRASSOL 88G", shows: 0.062, is: "drained", why: "a drained weight: sardine and petinga tins that label both are 88-125 g full and 62-88 g drained; a name giving 88 G with 62 g shown is the drained 62" },
  { batch: 1, store: "AUCHAN", id: "3828803", name: "PETINGA AUCHAN EM TOMATE 88G", shows: 0.062, is: "drained", why: "a drained weight: sardine and petinga tins that label both are 88-125 g full and 62-88 g drained; a name giving 88 G with 62 g shown is the drained 62" },
  { batch: 1, store: "AUCHAN", id: "3870995", name: "FILETE CAVALA AZEITE RAMIREZ COM AROMA FUMADO", shows: 0.063, is: "drained", why: "a drained weight of mackerel fillets: tins that label both are 90-150 g full and 63-85 g drained" },
  { batch: 1, store: "AUCHAN", id: "3892159", name: "COGUMELOS INTEIROS AUCHAN 3X115G", shows: 0.345, is: "drained", why: "three tins of 105-115 g drained each (3 x 200 g full)" },
  { batch: 1, store: "AUCHAN", id: "3987430", name: "SALSICHAS VEGGIE IZIDORO MIX 410 G", shows: 0.41, is: "full", why: "Izidoro veggie sausage jars of 410 g are the full weight (220 g drained)" },
  { batch: 1, store: "AUCHAN", id: "4008104", name: "POTA PITEU COM ALHO 115G", shows: 0.115, is: "full", why: "pota tins of 115-120 g are the full weight (72-85 g drained)" },
  { batch: 1, store: "AUCHAN", id: "4008118", name: "POTA PITEU CALDEIRADA 115G", shows: 0.115, is: "full", why: "pota tins of 115-120 g are the full weight (72-85 g drained)" },
  { batch: 1, store: "AUCHAN", id: "4008768", name: "ATUM RAMIREZ EM TOMATE 120GR", shows: 0.12, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "4025913", name: "MEXILHÕES MINERVA Á MARINHEIRA 111G", shows: 0.111, is: "full", why: "mussel tins of 111 g are the full weight (69 g drained)" },
  { batch: 1, store: "AUCHAN", id: "4032431", name: "POTA GIGANTE GENERAL CALDEIRADA 120G", shows: 0.12, is: "full", why: "pota tins of 115-120 g are the full weight (72-85 g drained)" },
  { batch: 1, store: "AUCHAN", id: "4056126", name: "ATUM AO NATURAL BOM PETISCO PACK POUPANÇA 120GX5", shows: 0.6, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "4056129", name: "ATUM EM ÓLEO BOM PETISCO PACK POUPANÇA 120GX5", shows: 0.6, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "4058006", name: "LULA GENERAL CALDEIRADA 115G", shows: 0.115, is: "full", why: "squid tins of 115 g are the full weight (72 g drained)" },
  { batch: 1, store: "AUCHAN", id: "4067892", name: "BETERRABA CIMARROM RODELAS 345G", shows: 0.345, is: "full", why: "beetroot jars of 345 g are the full weight (180 g drained)" },
  { batch: 1, store: "AUCHAN", id: "4070354", name: "FILETE CAVALA PITEU EM MOSTARDA 120G", shows: 0.12, is: "full", why: "mackerel tins of 120 g are the full weight (17 that label both: 120 g full, 78-85 g drained)" },
  { batch: 1, store: "AUCHAN", id: "4070355", name: "FILETE CAVALA PITÉU TOMATE PICANTE 120G", shows: 0.12, is: "full", why: "mackerel tins of 120 g are the full weight (17 that label both: 120 g full, 78-85 g drained)" },
  { batch: 1, store: "AUCHAN", id: "4070356", name: "FILETE ATUM TENÓRIO MANDARINA LIMA E PIRI PIRI 120G", shows: 0.12, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "4070358", name: "FILETE CAVALA PITÉU EM TOMATE 120G", shows: 0.12, is: "full", why: "mackerel tins of 120 g are the full weight (17 that label both: 120 g full, 78-85 g drained)" },
  { batch: 1, store: "AUCHAN", id: "4092636", name: "POTA GIGANTE RAMIREZ ALHO 115G", shows: 0.115, is: "full", why: "pota tins of 115-120 g are the full weight (72-85 g drained)" },
  { batch: 1, store: "AUCHAN", id: "5637", name: "PÊSSEGO FERBAR METADES 810 A 860G", shows: 0.86, is: "full", why: "peach tins of 820-860 g are the full weight; their drained weight is about 480 g" },
  { batch: 1, store: "AUCHAN", id: "658007", name: "FILETE SARDINHA RAMIREZ MOLHO RICO DE TOMATE 100G", shows: 0.1, is: "full", why: "sardine tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "682443", name: "ATUM RAMIREZ COM FEIJÃO FRADE 120G", shows: 0.12, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "682464", name: "ATUM RAMIREZ MILHO E FEIJÃO VERMELHO 120G", shows: 0.12, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "AUCHAN", id: "839380", name: "COGUMELOS COMPAL CORTADOS DA HORTA 290G", shows: 0.29, is: "full", why: "mushroom tins of 290 g are the full weight (155 g drained)" },
  { batch: 1, store: "CONTINENTE", id: "4878837", name: "Milho Doce em Lata sem Glúten Bonduelle", shows: 0.3, is: "full", why: "sweetcorn tins of this weight are the full weight (285 g drained for 300-340 g)" },
  { batch: 1, store: "CONTINENTE", id: "5760291", name: "Atum com Grão de Bico Ramirez", shows: 0.12, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "CONTINENTE", id: "6917860", name: "Atum com Molho de Alho Ficolumé", shows: 0.11, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "CONTINENTE", id: "7632717", name: "Milho Doce em Lata Jerónimos", shows: 0.34, is: "full", why: "sweetcorn tins of this weight are the full weight (285 g drained for 300-340 g)" },
  { batch: 1, store: "CONTINENTE", id: "7712573", name: "Atum Posta em Azeite Santa Catarina", shows: 0.08, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "CONTINENTE", id: "8061426", name: "Atum ao Natural Tritão", shows: 0.27, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "CONTINENTE", id: "8091388", name: "Filetes de Atum com Malagueta Minerva", shows: 0.078, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "CONTINENTE", id: "8392049", name: "Ananás Rodelas em Calda Sumo Natural Continente", shows: 0.825, is: "full", why: "pineapple tins of 560-825 g are the full weight; their drained weight is 340-500 g" },
  { batch: 1, store: "CONTINENTE", id: "8397239", name: "Feijão Preto Cozido Ferbar", shows: 0.25, is: "drained", why: "a drained weight of beans: tins that label both are 380-420 g full and 250-260 g drained" },
  { batch: 1, store: "CONTINENTE", id: "8475606", name: "Salsicha Mix de Vegetais Vegan em Frasco Izidoro", shows: 0.22, is: "drained", why: "a drained weight of sausages in brine: tins and jars that label both are 350-430 g full and 200-230 g drained" },
  { batch: 1, store: "CONTINENTE", id: "8511744", name: "Salsichas Maxi Hot Dog Aves em Lata 6 un Izidoro", shows: 0.2, is: "drained", why: "a drained weight of sausages in brine: tins and jars that label both are 350-430 g full and 200-230 g drained" },
  { batch: 1, store: "CONTINENTE", id: "8511749", name: "Salsichas Maxi Hot Dog em Lata 6 un Izidoro", shows: 0.2, is: "drained", why: "a drained weight of sausages in brine: tins and jars that label both are 350-430 g full and 200-230 g drained" },
  { batch: 1, store: "CONTINENTE", id: "8613074", name: "Atum em Óleo Tritão", shows: 0.072, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "CONTINENTE", id: "8613075", name: "Atum ao Natural Tritão", shows: 0.077, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "CONTINENTE", id: "8623211", name: "Filete de Cavala em Tomate Continente", shows: 0.085, is: "drained", why: "a drained weight of mackerel fillets: tins that label both are 90-150 g full and 63-85 g drained" },
  { batch: 1, store: "CONTINENTE", id: "8646308", name: "Salsicha Mostarda e Mel Frasco Nobre", shows: 0.21, is: "drained", why: "a drained weight of sausages in brine: tins and jars that label both are 350-430 g full and 200-230 g drained" },
  { batch: 1, store: "CONTINENTE", id: "8646317", name: "Salsicha Sweet Chili em Frasco Nobre", shows: 0.21, is: "drained", why: "a drained weight of sausages in brine: tins and jars that label both are 350-430 g full and 200-230 g drained" },
  { batch: 1, store: "CONTINENTE", id: "8763378", name: "Ananás Rodelas em Calda de Açúcar Cimarrom", shows: 0.82, is: "full", why: "pineapple tins of 560-825 g are the full weight; their drained weight is 340-500 g" },
  { batch: 1, store: "CONTINENTE", id: "8773548", name: "Cogumelos Marron Laminados em Lata Compal", shows: 0.29, is: "full", why: "mushroom tins of 290 g are the full weight (155 g drained)" },
  { batch: 1, store: "CONTINENTE", id: "8883772", name: "Cogumelos Inteiros em Lata Continente", shows: 0.315, is: "drained", why: "three tins of 105-115 g drained each (3 x 200 g full)" },
  { batch: 1, store: "CONTINENTE", id: "8897573", name: "Petinga em Azeite Alva", shows: 0.062, is: "drained", why: "a drained weight: sardine and petinga tins that label both are 88-125 g full and 62-88 g drained; a name giving 88 G with 62 g shown is the drained 62" },
  { batch: 1, store: "CONTINENTE", id: "8897574", name: "Petinga em Tomate Alva", shows: 0.062, is: "drained", why: "a drained weight: sardine and petinga tins that label both are 88-125 g full and 62-88 g drained; a name giving 88 G with 62 g shown is the drained 62" },
  { batch: 1, store: "CONTINENTE", id: "8897585", name: "Petinga em Tomate Picante Alva", shows: 0.085, is: "drained", why: "a drained weight: sardine and petinga tins that label both are 88-125 g full and 62-88 g drained; a name giving 88 G with 62 g shown is the drained 62" },
  { batch: 1, store: "CONTINENTE", id: "8897587", name: "Petinga em Óleo Alva", shows: 0.062, is: "drained", why: "a drained weight: sardine and petinga tins that label both are 88-125 g full and 62-88 g drained; a name giving 88 G with 62 g shown is the drained 62" },
  { batch: 1, store: "CONTINENTE", id: "8901244", name: "Filete de Cavala em Azeite Continente", shows: 0.085, is: "drained", why: "a drained weight of mackerel fillets: tins that label both are 90-150 g full and 63-85 g drained" },
  { batch: 1, store: "CONTINENTE", id: "8901245", name: "Filete de Atum ao Natural Continente Seleção", shows: 0.085, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "CONTINENTE", id: "8901287", name: "Filete de Atum em Azeite Continente Seleção", shows: 0.085, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "CONTINENTE", id: "8912255", name: "Filete de Cavala em Tomate Picante Pitéu", shows: 0.12, is: "full", why: "mackerel tins of 120 g are the full weight (17 that label both: 120 g full, 78-85 g drained)" },
  { batch: 1, store: "CONTINENTE", id: "8912257", name: "Filete de Cavala em Mostarda Pitéu", shows: 0.12, is: "full", why: "mackerel tins of 120 g are the full weight (17 that label both: 120 g full, 78-85 g drained)" },
  { batch: 1, store: "CONTINENTE", id: "8912259", name: "Filete de Cavala em Tomate Pitéu", shows: 0.12, is: "full", why: "mackerel tins of 120 g are the full weight (17 that label both: 120 g full, 78-85 g drained)" },
  { batch: 1, store: "CONTINENTE", id: "8994514", name: "Pêssego em Calda Cimarrom", shows: 0.82, is: "full", why: "peach tins of 820-860 g are the full weight; their drained weight is about 480 g" },
  { batch: 1, store: "PINGO_DOCE", id: "1005342", name: "Lulas de Caldeirada", shows: 0.115, is: "full", why: "squid tins of 115 g are the full weight (72 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "1005751", name: "Pota em Caldeirada", shows: 0.115, is: "full", why: "pota tins of 115-120 g are the full weight (72-85 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "1005752", name: "Pota com Alho", shows: 0.072, is: "drained", why: "pota tins are 115 g full, 72 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "1012005", name: "Atum em Tomate", shows: 0.12, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "PINGO_DOCE", id: "1012006", name: "Atum com Baixo Teor de Sal", shows: 0.086, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "1012572", name: "Filetes de Cavala em Tomate", shows: 0.078, is: "drained", why: "a drained weight of mackerel fillets: tins that label both are 90-150 g full and 63-85 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "1012573", name: "Filetes de Cavala em Mostarda", shows: 0.078, is: "drained", why: "a drained weight of mackerel fillets: tins that label both are 90-150 g full and 63-85 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "357370", name: "Feijão Preto em Lata", shows: 0.26, is: "drained", why: "a drained weight of beans: tins that label both are 380-420 g full and 250-260 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "44518", name: "Feijão Manteiga em Lata", shows: 0.26, is: "drained", why: "a drained weight of beans: tins that label both are 380-420 g full and 250-260 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "44521", name: "Feijão Frade em Lata", shows: 0.26, is: "drained", why: "a drained weight of beans: tins that label both are 380-420 g full and 250-260 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "44611", name: "Grão de Bico em Lata", shows: 0.26, is: "drained", why: "a drained weight of chickpeas: tins that label both are 420 g full, 260 g drained (830 g, 520 g)" },
  { batch: 1, store: "PINGO_DOCE", id: "44618", name: "Feijão Branco em Lata", shows: 0.26, is: "drained", why: "a drained weight of beans: tins that label both are 380-420 g full and 250-260 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "44621", name: "Feijão Encarnado em Lata", shows: 0.26, is: "drained", why: "a drained weight of beans: tins that label both are 380-420 g full and 250-260 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "598553", name: "Sardinhas em Tomate", shows: 0.125, is: "both", why: "Ramirez's own label for this tin at Continente says 125 g full and 125 g drained (sardines in tomato sauce)" },
  { batch: 1, store: "PINGO_DOCE", id: "724395", name: "Atum Posta em Óleo", shows: 0.072, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "726418", name: "Salsichas Frankfurt Lata", shows: 0.2, is: "drained", why: "a drained weight of sausages in brine: tins and jars that label both are 350-430 g full and 200-230 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "760271", name: "Grão Bico em Lata", shows: 0.52, is: "drained", why: "a drained weight of chickpeas: tins that label both are 420 g full, 260 g drained (830 g, 520 g)" },
  { batch: 1, store: "PINGO_DOCE", id: "809662", name: "Filetes de Atum em Azeite", shows: 0.13, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "823080", name: "Salsichas de Aves Hot Dog", shows: 0.23, is: "drained", why: "a drained weight of sausages in brine: tins and jars that label both are 350-430 g full and 200-230 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "826208", name: "Polvo e Pota em Alho", shows: 0.072, is: "drained", why: "octopus and pota tins are 120 g full, 72 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "826211", name: "Polvo e Pota Caldeirada", shows: 0.072, is: "drained", why: "octopus and pota tins are 120 g full, 72 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "839270", name: "Ananás em Calda Rodelas", shows: 0.825, is: "full", why: "pineapple tins of 560-825 g are the full weight; their drained weight is 340-500 g" },
  { batch: 1, store: "PINGO_DOCE", id: "844501", name: "Atum Posta ao Natural", shows: 0.077, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "844533", name: "Atum Posta Natural", shows: 0.27, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "884825", name: "Sardinhas em Azeite", shows: 0.084, is: "drained", why: "a drained weight: sardine and petinga tins that label both are 88-125 g full and 62-88 g drained; a name giving 88 G with 62 g shown is the drained 62" },
  { batch: 1, store: "PINGO_DOCE", id: "884851", name: "Sardinhas em Tomate", shows: 0.078, is: "drained", why: "a drained weight: sardine and petinga tins that label both are 88-125 g full and 62-88 g drained; a name giving 88 G with 62 g shown is the drained 62" },
  { batch: 1, store: "PINGO_DOCE", id: "899932", name: "Mexilhão em Escabeche", shows: 0.068, is: "drained", why: "mussel tins are 111-115 g full, 68-70 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "899933", name: "Ventresca Atum", shows: 0.072, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "908783", name: "Sardinhas em Óleo Vegetal", shows: 0.084, is: "drained", why: "a drained weight: sardine and petinga tins that label both are 88-125 g full and 62-88 g drained; a name giving 88 G with 62 g shown is the drained 62" },
  { batch: 1, store: "PINGO_DOCE", id: "908784", name: "Sardinhas em Óleo Vegetal Picante", shows: 0.084, is: "drained", why: "a drained weight: sardine and petinga tins that label both are 88-125 g full and 62-88 g drained; a name giving 88 G with 62 g shown is the drained 62" },
  { batch: 1, store: "PINGO_DOCE", id: "908785", name: "Sardinhas em Tomate", shows: 0.078, is: "drained", why: "a drained weight: sardine and petinga tins that label both are 88-125 g full and 62-88 g drained; a name giving 88 G with 62 g shown is the drained 62" },
  { batch: 1, store: "PINGO_DOCE", id: "908786", name: "Sardinhas em Tomate Picante", shows: 0.078, is: "drained", why: "a drained weight: sardine and petinga tins that label both are 88-125 g full and 62-88 g drained; a name giving 88 G with 62 g shown is the drained 62" },
  { batch: 1, store: "PINGO_DOCE", id: "908787", name: "Sardinhas em Azeite", shows: 0.084, is: "drained", why: "a drained weight: sardine and petinga tins that label both are 88-125 g full and 62-88 g drained; a name giving 88 G with 62 g shown is the drained 62" },
  { batch: 1, store: "PINGO_DOCE", id: "913710", name: "Filetes de Cavala em Azeite", shows: 0.084, is: "drained", why: "a drained weight of mackerel fillets: tins that label both are 90-150 g full and 63-85 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "920839", name: "Atum ao Natural", shows: 0.072, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "920842", name: "Atum em Óleo", shows: 0.072, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "936480", name: "Filetes Cavala Óleo Vegetal", shows: 0.078, is: "drained", why: "a drained weight of mackerel fillets: tins that label both are 90-150 g full and 63-85 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "960942", name: "Filetes de Cavala em Azeite", shows: 0.085, is: "drained", why: "a drained weight of mackerel fillets: tins that label both are 90-150 g full and 63-85 g drained" },
  { batch: 1, store: "PINGO_DOCE", id: "960947", name: "Atum Posta em Azeite Virgem", shows: 0.085, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "960948", name: "Filetes de Atum em Azeite", shows: 0.085, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "968425", name: "Atum em Óleo", shows: 0.072, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "975789", name: "Atum com Grão", shows: 0.12, is: "full", why: "tuna tins of this weight are the full weight: tins that label both weigh it full, none drained" },
  { batch: 1, store: "PINGO_DOCE", id: "978188", name: "Atum em Óleo", shows: 0.072, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "978189", name: "Atum ao Natural", shows: 0.077, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "978190", name: "Atum Posta em Tomate", shows: 0.072, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "978191", name: "Atum Posta em Azeite", shows: 0.072, is: "drained", why: "a drained weight of tuna: tins that label both are 110-120 g full and 72-90 g drained (385 g full, 270 g drained; 200 g full, 130 g drained)" },
  { batch: 1, store: "PINGO_DOCE", id: "989428", name: "Lula Recheada", shows: 0.073, is: "drained", why: "stuffed squid tins are 115 g full, 72-73 g drained" },
];

export function reviewedTinWeight(store: string, id: string, packageSize: number | null): ReviewedTinWeight | null {
  if (packageSize === null) return null;
  const r = REVIEWED_TIN_WEIGHTS.find((e) => e.store === store && e.id === id);
  return r && Math.abs(r.shows - packageSize) < 1e-6 ? r : null;
}
