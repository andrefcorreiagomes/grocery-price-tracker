import type { Store } from "../src/lib/stores";

/**
 * Which of each store's sections hold food: the one place this is decided.
 *
 * Every crawl and the food-type classifier read this file, and every crawl
 * compares the sections the store publishes against it (see
 * src/scrapers/crawl/section-watch.ts). A section the file does not mention is
 * left out AND reported, never decided silently.
 *
 * Section names are written as the store writes them. They are compared after
 * removing accents, case and punctuation, so "Laticínios e Ovos", Continente's
 * own slug "laticinios-e-ovos" and Pingo Doce's "Nutricao Desportiva" all
 * match the way they read.
 *
 * Three kinds of top section:
 *
 *   food      every product is kept, except under a `skip` path below
 *   non-food  nothing is kept
 *   mixed     promotions, seasonal and own-brand aisles holding food and
 *             non-food alike, where the section cannot tell them apart. A
 *             product is kept only when its NAME is recognised as a known kind
 *             of food (src/lib/food-types.ts).
 *
 * Why the mixed rule is "recognised as food" rather than a list of non-food
 * words: measured on 17 October 2026 over Pingo Doce's 814 mixed-aisle
 * products, a 30-word list (fraldas, detergente, champô, ...) caught 79 and
 * missed more than 300 plain non-food items - gift sets, stationery, garden
 * tools, a microwave. The same words OUTSIDE mixed aisles caught real food:
 * "Guardanapo" is a cake, "Vela" a chouriço, "Gelo Total" a brand of
 * croquettes, and creatine and collagen are in protein yogurts.
 *
 * `skip` paths are sub-sections of a food or mixed section that are not food.
 * Counts are live catalogue products on 17 October 2026, and how many of them
 * the classifier had given a food type - mostly wrongly, e.g. "Leite de
 * Limpeza" (a cosmetic) filed as milk.
 */

export type SectionKind = "food" | "non-food" | "mixed";

export interface SkipPath {
  /** "Section/Sub-section[/Sub-sub-section]" */
  path: string;
  why: string;
}

export interface StoreSectionDecisions {
  sections: Record<string, SectionKind>;
  skip: SkipPath[];
}

export const STORE_SECTIONS: Record<Store, StoreSectionDecisions> = {
  CONTINENTE: {
    sections: {
      Frescos: "food",
      "Laticínios e Ovos": "food",
      Congelados: "food",
      Mercearia: "food",
      "Bebidas e Garrafeira": "food",
      "Bio e Saudável": "food",

      // Continente's layout from 18 October 2026, read from its site menu. Every
      // food shelf now sits under "Supermercado", which the page reader drops
      // (parseCategoryPath, src/scrapers/continente.ts). The "Frescos" level is
      // gone and its shelves are top sections; Frutas + Legumes and Charcutaria
      // + Queijos were merged; "Bio e Saudável" was split up, its sports food
      // moving to "Suplementos e Nutrição". The old names above stay until no
      // stored product carries them.
      "Padaria e Pastelaria": "food",
      Peixaria: "food",
      Talho: "food",
      "Frutas e Legumes": "food",
      "Charcutaria e Queijos": "food",
      "Refeições Práticas": "food",
      // Food only in "Alimentação Desportiva" (protein bars, spreads, oats);
      // the rest is skipped below.
      "Suplementos e Nutrição": "food",
      "Higiene e Cuidado Pessoal": "non-food",
      "Consumíveis": "non-food",
      // New top sections outside "Supermercado", first seen by the test run of
      // 19 October 2026. Beauty and culture are named in the site menu, with
      // sub-sections that are all non-food (perfume, hair, books, toys, ...).
      Beleza: "non-food",
      "Cultura e Lazer": "non-food",
      // Not in the menu and their contents not yet seen, so a product filed here
      // is kept only if its name is recognised as food: a wine shop, two
      // promotional shelves and the flyer search.
      Garrafeira: "mixed",
      Destaques: "mixed",
      "Sugestões Continente": "mixed",
      "Folhetos Pesquisa": "mixed",

      Limpeza: "non-food",
      // Holds baby food too; baby food is its own piece of work.
      Bebé: "non-food",
      "Beleza e Higiene": "non-food",
      Animais: "non-food",
      "Casa e Jardim": "non-food",
      "Brinquedos e Jogos": "non-food",
      Livros: "non-food",
      Papelaria: "non-food",
      "Desporto e Viagem": "non-food",
      Negócios: "non-food",

      // Promotional and seasonal shelves. A product is filed here as its MAIN
      // section only now and then (46 products, all since delisted, e.g. vodka
      // under "Oportunidades/Verão").
      Marcas: "mixed",
      Novidades: "mixed",
      Oportunidades: "mixed",
      Verão: "mixed",
      "Black Friday": "mixed",
      "Cyber Monday": "mixed",
      "Singles Day": "mixed",
      Campanhas: "mixed",
      Presentes: "mixed",
    },
    skip: [
      // 102 products, 10 with a food type (matcha, curcuma, psyllium)
      { path: "Bio e Saudável/Suplementos e Vitaminas", why: "supplements and vitamins" },
      // 3 products, none with a food type
      { path: "Mercearia/Suplementos e Vitaminas", why: "supplements and vitamins" },
      // 70 products, 5 with a food type; whey powders. The rest of Nutrição
      // Desportiva - protein bars, peanut butter, oats - is food and stays.
      { path: "Bio e Saudável/Nutrição Desportiva/Energia e Proteína", why: "protein powders" },
      // The same three kinds of product on Continente's layout of 18 October 2026.
      { path: "Suplementos e Nutrição/Suplementos Alimentares", why: "supplements and vitamins" },
      { path: "Suplementos e Nutrição/Performance Desportiva", why: "protein powders, creatine, energy gels" },
      { path: "Suplementos e Nutrição/Controlo de Peso", why: "weight-control products" },
    ],
  },

  PINGO_DOCE: {
    sections: {
      "Frutas e Vegetais": "food",
      Talho: "food",
      Peixaria: "food",
      "Padaria e Pastelaria": "food",
      "Charcutaria e Queijos": "food",
      Ovos: "food",
      "Manteiga, Margarina e Natas": "food",
      "Iogurtes e Sobremesas": "food",
      "Leite e Bebidas Vegetais": "food",
      Congelados: "food",
      "Café, Chá e Achocolatados": "food",
      "Bolachas, Cereais e Guloseimas": "food",
      Mercearia: "food",
      "Águas, Sumos e Refrigerantes": "food",
      "Cervejas e Sidras": "food",
      Espirituosas: "food",
      Vinhos: "food",
      "Take Away": "food",
      "Alternativas Alimentares": "food",

      Limpeza: "non-food",
      "Higiene Pessoal e Beleza": "non-food",
      "Casa e Eletrodomésticos": "non-food",
      "Livraria e Papelaria": "non-food",
      Parafarmácia: "non-food",
      Animais: "non-food",
      // Mixed food and nappies; baby food is its own piece of work.
      "Bebé e Criança": "non-food",
      "Sacos e Sacos de Compras": "non-food",

      Promoções: "mixed",
      "As Nossas Marcas": "mixed",
      "Natal e Ano Novo": "mixed",
      Páscoa: "mixed",
      "Santos Populares": "mixed",
      "Feira do Bebé": "mixed",
      "Master Catalog": "mixed",
    },
    skip: [
      // 36 products, 2 with a food type
      { path: "Alternativas Alimentares/Suplementos", why: "supplements" },
      // 13 products, none with a food type (creatine, electrolytes, collagen).
      // The rest of Nutrição Desportiva - bars, oats, protein yogurts - stays.
      {
        path: "Alternativas Alimentares/Nutricao Desportiva/Suplementos Nutricao Desportiva",
        why: "sports supplements",
      },
      // Pingo Doce's own-brand lines that are not food. 9 + 1 products
      { path: "As Nossas Marcas/Activpet", why: "pet food" },
      { path: "As Nossas Marcas/Kitty", why: "pet food" },
      // 24 + 2 products; 3 had a food type ("Leite de Limpeza" as milk)
      { path: "As Nossas Marcas/Be Beauty", why: "cosmetics" },
      { path: "As Nossas Marcas/Skino", why: "cosmetics" },
      // 19 products; 1 had a food type ("Óleo Corporal para Bebé" as oil)
      { path: "As Nossas Marcas/Cuida Bebe", why: "nappies and baby care" },
      // 16 products
      { path: "As Nossas Marcas/Ultra", why: "cleaning products" },
      // 2 products
      { path: "Congelados/Gelo", why: "ice" },
    ],
  },

  AUCHAN: {
    sections: {
      alimentação: "food",
      "produtos-frescos": "food",
      "bebidas-e-garrafeira": "food",
      congelados: "food",
      "biológicos-e-alternativas": "food",
      // Auchan's local-produce line: 4 products, all fresh vegetables.
      "produtos-locais": "food",
      // Not seen yet; kept in case ice cream moves to the top level.
      gelados: "food",

      tecnologia: "non-food",
      eletrodomésticos: "non-food",
      "viagem,-desporto-e-outdoor": "non-food",
      brinquedos: "non-food",
      animais: "non-food",
      "beleza-e-higiene": "non-food",
      "limpeza-e-cuidados-do-lar": "non-food",
      "papelaria,-livraria-e-experiências": "non-food",
      "casa-e-jardim": "non-food",
      "automóvel-e-bricolage": "non-food",
      // Ordinary biscuits next to nappies; baby food is its own piece of work.
      "o-mundo-do-bebé": "non-food",
      "saúde-e-bem-estar": "non-food",
      serviços: "non-food",
      "roupa,-calçado-e-acessórios": "non-food",

      // Promotional and seasonal shelves: 2 to 23 products each.
      campanhas: "mixed",
      marcas: "mixed",
      "marcas-auchan": "mixed",
      "promoções-clube-auchan": "mixed",
      "feira-do-bebé": "mixed",
      "feira-dos-vinhos": "mixed",
      halloween: "mixed",
      "regresso-às-aulas": "mixed",
      folhetos: "mixed",
      // First seen 18 October 2026, decided by the user the same day: a
      // promotion shelf (8 products, heaters) and Auchan's own ready-meal line
      // (2 products, a pork dish and a trifle).
      "black-friday": "mixed",
      "sabores-auchan": "mixed",
    },
    skip: [
      // 93 products, none with a food type (creatine, pre-workout)
      { path: "biológicos-e-alternativas/nutrição-desportiva/suplementos-desportivos", why: "sports supplements" },
      // 164 products, 5 with a food type; whey powders and mass gainers
      { path: "biológicos-e-alternativas/nutrição-desportiva/proteína", why: "protein powders" },
      // 88 products, none with a food type (energy gels, electrolyte powders)
      {
        path: "biológicos-e-alternativas/nutrição-desportiva/bebidas-desportivas-e-géis-energéticos",
        why: "sports supplements",
      },
      // 3 + 1 products
      { path: "congelados/gelo", why: "ice" },
      { path: "congelados/sacos-térmicos", why: "cool bags" },
    ],
  },
};
