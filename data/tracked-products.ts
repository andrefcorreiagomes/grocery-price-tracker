/**
 * Hand-curated list of products to track, each with the exact product page
 * URL/ID at every store it should be compared at. Add more entries here to
 * track more products - re-run `npm run seed` afterwards.
 *
 * Two kinds of entries are expected:
 *  - identical national-brand products (same brand+size at every store)
 *  - equivalent generic/commodity or store-brand products (same item/unit,
 *    different store-brand SKUs - e.g. each store's own loose apples)
 *
 * `category`/`subcategory` drive the browsing menu (category is the
 * top-level entry, e.g. "Carne"; subcategory narrows within it, e.g.
 * "Frango"). `unit` on a product is the canonical base ("L" or "kg") that
 * prices get normalized to for comparison. Each listing's `packageSize` is
 * that store's actual package size expressed in that same base (e.g. 0.75
 * for a 750ml bottle when unit is "L") - stores are free to sell the same
 * product in different package sizes, so this lives per listing, not per
 * product.
 */

export type StoreName = "CONTINENTE" | "PINGO_DOCE" | "AUCHAN";

export interface TrackedListing {
  store: StoreName;
  storeProductId: string;
  url: string;
  packageSize: number;
}

export interface TrackedProduct {
  name: string;
  category: string;
  subcategory: string;
  unit: string;
  listings: TrackedListing[];
}

export const trackedProducts: TrackedProduct[] = [
  {
    name: "Leite UHT Meio Gordo",
    category: "Laticínios",
    subcategory: "Leite",
    unit: "L",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "6879912",
        url: "https://www.continente.pt/produto/leite-uht-meio-gordo-continente-6879912.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "48150",
        url: "https://www.pingodoce.pt/home/produtos/leite-e-bebidas-vegetais/leite/leite-meio-gordo-e-gordo/leite-uht-meio-gordo-pingo-doce-48150.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "3010403",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/leites/leite-uht/leite-uht-auchan-meio-gordo-1l/3010403.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Nescafé Clássico",
    category: "Mercearia",
    subcategory: "Café",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2004675",
        url: "https://www.continente.pt/produto/cafe-soluvel-classico-nescafe-nescafe-2004675.html",
        packageSize: 0.1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "941247",
        url: "https://www.pingodoce.pt/home/produtos/cafe-cha-e-achocolatados/cafe-soluvel-e-descafeinado/cafe-soluvel-classico-nescafe-941247.html",
        packageSize: 0.1,
      },
      {
        store: "AUCHAN",
        storeProductId: "36365",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/cafe-cha-e-infusao/cafe-saco-soluvel-e-cevadas/cafe-nescafe-soluvel-com-cafeina-100g/36365.html",
        packageSize: 0.1,
      },
    ],
  },
  {
    name: "Azeite Virgem Extra",
    category: "Mercearia",
    subcategory: "Azeite e Óleos",
    unit: "L",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7108347",
        url: "https://www.continente.pt/produto/azeite-virgem-extra-continente-continente-7108347.html",
        packageSize: 0.75,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "654603",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/azeite-oleo-e-vinagre/azeite/azeite-virgem-extra-as-nossas-planicies-pingo-doce-654603.html",
        packageSize: 0.75,
      },
      {
        store: "AUCHAN",
        storeProductId: "3829993",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/azeite-oleo-e-vinagre/azeite-virgem-e-extra-virgem/azeite-virgem-extra-auchan-750-ml/3829993.html",
        packageSize: 0.75,
      },
    ],
  },
  {
    name: "Maçã Golden",
    category: "Fruta",
    subcategory: "Maçã",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "4276377",
        url: "https://www.continente.pt/produto/maca-golden-continente-continente-4276377.html",
        packageSize: 1, // priced per kg already (loose produce)
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "30825",
        url: "https://www.pingodoce.pt/home/produtos/frutas-e-vegetais/frutas/fruta-da-epoca/maca-golden-das-serras-nossa-fruta-e-legumes-30825.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "3356581",
        url: "https://www.auchan.pt/pt/produtos/maca-golden-auchan-kg/3356581.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Nutella",
    category: "Mercearia",
    subcategory: "Cremes e Compotas",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "5374009",
        url: "https://www.continente.pt/produto/creme-para-barrar-chocolate-e-avelas-nutella-nutella-5374009.html",
        packageSize: 0.35,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "759478",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/compotas-mel-e-cremes-de-barrar/cremes-de-barrar/creme-de-chocolate-para-barrar-nutella-759478.html",
        packageSize: 0.35,
      },
      {
        store: "AUCHAN",
        storeProductId: "3287329",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/cremes-compotas-e-mel/cremes-de-barrar/creme-nutella-barrar-350g/3287329.html",
        packageSize: 0.35,
      },
    ],
  },
  {
    name: "Peito de Frango",
    category: "Carne",
    subcategory: "Frango",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7069674",
        url: "https://www.continente.pt/produto/peito-de-frango-continente-continente-7069674.html",
        packageSize: 1, // priced per kg already (fresh meat counter)
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "465789",
        url: "https://www.pingodoce.pt/home/produtos/talho/aves/frango/peito-de-frango-embalado-pingo-doce-465789.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "2696458",
        url: "https://www.auchan.pt/pt/produtos-frescos/talho/frango-e-galinha/peito-de-frango-auchan-kg/2696458.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Frango Inteiro",
    category: "Carne",
    subcategory: "Frango",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "8780471",
        url: "https://www.continente.pt/produto/frango-inteiro-com-miudos-continente-continente-8780471.html",
        packageSize: 1, // priced per kg already (fresh meat counter)
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "378378",
        url: "https://www.pingodoce.pt/home/produtos/talho/aves/frango/frango-inteiro-com-miudos-nosso-talho-378378.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "2696374",
        url: "https://www.auchan.pt/pt/produtos-frescos/talho/frango-e-galinha/frango-inteiro-com-miudos-em-saco-auchan-kg/2696374.html",
        packageSize: 1,
      },
    ],
  },
  {
    // "Febras de Porco" doesn't exist as a literal product at any of the 3
    // stores (Continente's search maps it to Bifanas; Pingo Doce/Auchan have
    // no results at all) - substituted with Bifanas de Porco
    name: "Bifanas de Porco",
    category: "Carne",
    subcategory: "Porco",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "4285344",
        url: "https://www.continente.pt/produto/bifanas-de-porco-continente-continente-4285344.html",
        packageSize: 1, // priced per kg already (fresh meat counter)
      },
      // Pingo Doce sells 3 own-brand SKUs of this - tracked as 3 separate
      // listings under the same product so the comparison always picks
      // whichever is currently cheapest per kg (e.g. when a promo rotates
      // between them), rather than being locked onto one.
      {
        store: "PINGO_DOCE",
        storeProductId: "250119",
        url: "https://www.pingodoce.pt/home/produtos/talho/porco/bifanas-de-porco-nosso-talho-250119.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "959145",
        url: "https://www.pingodoce.pt/home/produtos/talho/porco/bifanas-de-porco-embaladas-pingo-doce-959145.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "968215",
        url: "https://www.pingodoce.pt/home/produtos/talho/porco/bifanas-de-porco-embaladas-pingo-doce-968215.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "3352730",
        url: "https://www.auchan.pt/pt/produtos-frescos/talho/porco/bifanas-de-porco-auchan-kg/3352730.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Costeletas de Porco",
    category: "Carne",
    subcategory: "Porco",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "4230946",
        url: "https://www.continente.pt/produto/costeletas-de-porco-continente-continente-4230946.html",
        packageSize: 1, // priced per kg already (fresh meat counter)
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "250128",
        url: "https://www.pingodoce.pt/home/produtos/talho/porco/costeletas-de-porco-nosso-talho-250128.html",
        packageSize: 1,
      },
      {
        // Auchan's "Cultivamos o Bom" (6.25€/kg) and "Embalagem Familiar"
        // (5.39€/kg) chop variants are notably pricier - "Porco Nacional"
        // is their plain/standard line and matches the other two stores
        store: "AUCHAN",
        storeProductId: "229362",
        url: "https://www.auchan.pt/pt/produtos-frescos/talho/porco/porco-nacional-costeletas-mistas-kg/229362.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Bife de Peru",
    category: "Carne",
    subcategory: "Peru",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "4460224",
        url: "https://www.continente.pt/produto/bifes-de-peru-continente-continente-4460224.html",
        packageSize: 1, // priced per kg already (fresh meat counter)
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "474570",
        url: "https://www.pingodoce.pt/home/produtos/talho/aves/peru/bifes-de-peru-embalados-pingo-doce-474570.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "2885521",
        url: "https://www.auchan.pt/pt/produtos-frescos/talho/peru/bife-de-peru-auchan-kg/2885521.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Lombo de Porco",
    category: "Carne",
    subcategory: "Porco",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2525325",
        url: "https://www.continente.pt/produto/lombo-de-porco-sem-osso-para-assar-continente-continente-2525325.html",
        packageSize: 1, // priced per kg already (fresh meat counter)
      },
      {
        // closest own-brand match at Pingo Doce is "Lombinhos" (smaller pork
        // loin pieces), not an exact "whole boneless loin" match like the
        // other two stores - same cut family, kept deliberately
        store: "PINGO_DOCE",
        storeProductId: "981747",
        url: "https://www.pingodoce.pt/home/produtos/talho/porco/lombinhos-de-porco-embalados-nosso-talho-981747.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "3352772",
        url: "https://www.auchan.pt/pt/produtos-frescos/talho/porco/lombo-de-porco-sem-osso-vacuo-auchan-kg/3352772.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Posta de Salmão",
    category: "Peixe",
    subcategory: "Salmão",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "4405983",
        url: "https://www.continente.pt/produto/posta-de-salmao-fresca-4405983.html",
        packageSize: 1, // priced per kg already (fresh fish counter)
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "303620",
        url: "https://www.pingodoce.pt/home/produtos/peixaria/peixe/atum-e-salmao/posta-de-salmao-fresco-nossa-peixaria-303620.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "997628",
        url: "https://www.auchan.pt/pt/produtos-frescos/peixaria/peixe-fresco/posta-de-salmao/997628.html",
        packageSize: 1,
      },
    ],
  },
  {
    // bacalhau is sold frozen in fixed-weight packs, not priced per kg
    // directly - packageSize normalizes each store's different pack size
    name: "Posta de Bacalhau",
    category: "Peixe",
    subcategory: "Bacalhau",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7291114",
        url: "https://www.continente.pt/produto/postas-tradicionais-de-bacalhau-msc-congelado-continente-continente-7291114.html",
        packageSize: 0.8, // 800g pack
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "948617",
        url: "https://www.pingodoce.pt/home/produtos/peixaria/bacalhau/bacalhau-congelado/postas-de-bacalhau-congeladas-pingo-doce-948617.html",
        packageSize: 0.8, // 800g pack
      },
      {
        store: "AUCHAN",
        storeProductId: "3408961",
        url: "https://www.auchan.pt/pt/produtos-frescos/peixaria/bacalhau/postas-de-bacalhau-da-noruega-msc-auchan-600gr/3408961.html",
        packageSize: 0.6, // 600g pack
      },
    ],
  },
  {
    name: "Dourada",
    category: "Peixe",
    subcategory: "Dourada",
    unit: "kg",
    listings: [
      {
        // "Nacional" (farmed) variant specifically - Continente/Pingo Doce
        // both also sell an unlabeled "wild" dourada at a very different
        // price point (~3x), which would have been a bad match
        store: "CONTINENTE",
        storeProductId: "7141576",
        url: "https://www.continente.pt/produto/dourada-media-fresca-nacional-7141576.html",
        packageSize: 1, // priced per kg already (fresh fish counter)
      },
      {
        // DEAD LISTING - Pingo Doce delisted this SKU. Left in place on
        // purpose for now; the fix below is deferred, not forgotten.
        //
        // It is genuinely gone, not relocated: the URL 404s, Pingo Doce
        // redirects it to a renamed slug ("200/600" -> "ate 600g") that also
        // 404s, and the SKU returns 404 at every combination of old slug,
        // renamed slug, and with/without the zero-width space described below.
        // It appears nowhere in Pingo Doce's own search results.
        //
        // Consequences while it stays: this listing fails on every nightly
        // scrape (that is the "1 failed" in the run summary), and the Dourada
        // row keeps showing its last-scraped price, which will never update.
        //
        // The intended fix is to DELETE this listing and let Dourada become a
        // two-store group. Note that deleting it here is not sufficient -
        // seed.ts only upserts and never removes listings that vanish from this
        // file, so the row would survive in the database and keep both symptoms
        // alive. The database row has to be deleted explicitly, snapshots first
        // (the FK is ON DELETE RESTRICT).
        //
        // Do NOT simply repoint this at the surviving Nacional dourada
        // (877430, "+600g", EUR 12,99). That is a larger size band than
        // Continente's "Media" and Auchan's 400/600, so it would bias Pingo
        // Doce's EUR/kg upward and turn a size difference into an apparent
        // price gap.
        //
        // Unrelated but worth knowing, found while diagnosing this: Pingo Doce
        // category slugs can contain a zero-width space, e.g.
        // "dourada-e-robalo%E2%80%8B" and the "fiambre-mortadela-e-chouricao%E2%80%8B"
        // already used further down this file. A listing that has merely MOVED
        // will 404 without it, which looks identical to a delisting.
        store: "PINGO_DOCE",
        storeProductId: "867745",
        url: "https://www.pingodoce.pt/home/produtos/peixaria/peixe/dourada-e-robalo/dourada-fresca-nacional-200%2F600-nossa-peixaria-867745.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "3357145",
        url: "https://www.auchan.pt/pt/produtos-frescos/peixaria/peixe-fresco/dourada-fresca-inteira-400600-kg/3357145.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Carapau",
    category: "Peixe",
    subcategory: "Carapau",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2147745",
        url: "https://www.continente.pt/produto/carapau-pequeno-fresco-2147745.html",
        packageSize: 1, // priced per kg already (fresh fish counter)
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "632782",
        url: "https://www.pingodoce.pt/home/produtos/peixaria/peixe/peixe-selvagem/carapau-pequeno-fresco-nossa-peixaria-632782.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "3448015",
        url: "https://www.auchan.pt/pt/produtos-frescos/peixaria/peixe-fresco/carapau-pequeno-auchan-kg/3448015.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Robalo",
    category: "Peixe",
    subcategory: "Robalo",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2147671",
        url: "https://www.continente.pt/produto/robalo-medio-fresco-2147671.html",
        packageSize: 1, // priced per kg already (fresh fish counter)
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "44066",
        url: "https://www.pingodoce.pt/home/produtos/peixaria/peixe/dourada-e-robalo/robalo-200%2F600-fresco-nossa-peixaria-44066.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "3357146",
        url: "https://www.auchan.pt/pt/produtos-frescos/peixaria/peixe-fresco/robalo-fresco-inteiro-300600-kg/3357146.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Perca",
    category: "Peixe",
    subcategory: "Perca",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "4403147",
        url: "https://www.continente.pt/produto/posta-de-perca-do-nilo-fresca-4403147.html",
        packageSize: 1, // priced per kg already (fresh fish counter)
      },
      {
        // Not "Tranche de Perca..." (846172): that listing's page shows the
        // flat price of one pre-cut piece as the primary price, with the
        // €/Kg rate only in a secondary element our scraper doesn't read -
        // this one shows the €/Kg rate directly, like our other weight-priced
        // listings, and its price also matches Continente/Auchan exactly
        store: "PINGO_DOCE",
        storeProductId: "451249",
        url: "https://www.pingodoce.pt/home/produtos/peixaria/peixe/peixe-selvagem/perca-do-nilo-fresca-nossa-peixaria-451249.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "3450517",
        url: "https://www.auchan.pt/pt/produtos-frescos/peixaria/peixe-fresco/posta-perca-auchan-kg/3450517.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Iogurte Natural",
    category: "Laticínios",
    subcategory: "Iogurte Natural",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "6804954",
        url: "https://www.continente.pt/produto/iogurte-natural-continente-continente-6804954.html",
        packageSize: 1, // 8×125 g (1 kg total)
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "969872",
        url: "https://www.pingodoce.pt/home/produtos/iogurtes-e-sobremesas/iogurtes/iogurtes-naturais/iogurte-natural-pack-8-pingo-doce-969872.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "1042304",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/iogurtes/magros-e-naturais/iogurte-auchan-natural-8x125g/1042304.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Iogurte Natural Danone",
    category: "Laticínios",
    subcategory: "Iogurte Natural",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "4696631",
        url: "https://www.continente.pt/produto/iogurte-natural-danone-danone-4696631.html",
        packageSize: 0.96, // 8×120 g
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "917194",
        url: "https://www.pingodoce.pt/home/produtos/iogurtes-e-sobremesas/iogurtes/iogurtes-naturais/iogurte-natural-pack-8-danone-917194.html",
        packageSize: 0.96,
      },
      {
        store: "AUCHAN",
        storeProductId: "968505",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/iogurtes/magros-e-naturais/iogurte-danone-aroma-natural-8x120g/968505.html",
        packageSize: 0.96,
      },
    ],
  },
  {
    name: "Iogurte Bífidus Natural Activia",
    category: "Laticínios",
    subcategory: "Iogurte Natural",
    unit: "kg",
    listings: [
      {
        // Continente didn't appear in search results for "iogurte natural" —
        // may carry it but didn't match; only PD and Auchan confirmed
        store: "PINGO_DOCE",
        storeProductId: "969071",
        url: "https://www.pingodoce.pt/home/produtos/iogurtes-e-sobremesas/iogurtes/iogurtes-naturais/iogurte-bifidus-natural-pack-4-activia-danone-969071.html",
        packageSize: 0.48, // 4×120 g
      },
      {
        store: "AUCHAN",
        storeProductId: "877729",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/iogurtes/bifidus/iogurte-activia-bifidus-natural-4x120g/877729.html",
        packageSize: 0.48,
      },
    ],
  },
  {
    name: "Iogurte Grego Natural Oikos (tub)",
    category: "Laticínios",
    subcategory: "Iogurte Grego",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7639131",
        url: "https://www.continente.pt/produto/iogurte-grego-natural-oikos-danone-oikos-danone-7639131.html",
        packageSize: 0.9, // 900 g tub
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "950061",
        url: "https://www.pingodoce.pt/home/produtos/iogurtes-e-sobremesas/iogurtes/iogurtes-naturais/iogurte-grego-natural-oikos-danone-950061.html",
        packageSize: 0.9,
      },
      {
        store: "AUCHAN",
        storeProductId: "3521453",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/iogurtes/cremosos-gregos/iogurte-grego-oikos-natural-900gr/3521453.html",
        packageSize: 0.9,
      },
    ],
  },
  {
    name: "Iogurte Grego Natural Oikos (4-pack)",
    category: "Laticínios",
    subcategory: "Iogurte Grego",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7214150",
        url: "https://www.continente.pt/produto/iogurte-grego-natural-oikos-danone-oikos-danone-7214150.html",
        packageSize: 0.44, // 4×110 g
      },
      {
        // Pingo Doce doesn't carry this pack size — their only Oikos is the 900g tub above
        store: "AUCHAN",
        storeProductId: "2116034",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/iogurtes/cremosos-gregos/iogurte-o%C3%AEkos-danone-grego-natural-4x110g/2116034.html",
        packageSize: 0.44,
      },
    ],
  },
  {
    name: "Iogurte Grego Natural Danone (4-pack)",
    category: "Laticínios",
    subcategory: "Iogurte Grego",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "8860408",
        url: "https://www.continente.pt/produto/iogurte-grego-natural-danone-danone-8860408.html",
        packageSize: 0.44, // 4×110 g
      },
      {
        // Pingo Doce doesn't carry Danone Greek separately (only Oikos)
        store: "AUCHAN",
        storeProductId: "4025178",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/iogurtes/cremosos-gregos/iogurte-danone-grego-natural-4x110g/4025178.html",
        packageSize: 0.44,
      },
    ],
  },
  {
    name: "Iogurte Grego Natural",
    category: "Laticínios",
    subcategory: "Iogurte Grego",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7403700",
        url: "https://www.continente.pt/produto/iogurte-grego-mythos-natural-continente-continente-7403700.html",
        packageSize: 1, // confirmed: "emb. 1 kg" on product page
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "940497",
        url: "https://www.pingodoce.pt/home/produtos/iogurtes-e-sobremesas/iogurtes/iogurtes-naturais/iogurte-grego-natural-pingo-doce-940497.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "3356169",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/iogurtes/cremosos-gregos/iogurte-grego-auchan-natural-1kg/3356169.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Whole bone-in leg - distinct from the boneless "Perna de Peru
    // Desossada" below, and from the existing "Bife de Peru" (a thinner
    // steak cut, not the whole leg)
    name: "Perna de Peru",
    category: "Carne",
    subcategory: "Peru",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7071905",
        url: "https://www.continente.pt/produto/perna-de-peru-continente-continente-7071905.html",
        packageSize: 1, // priced per kg already (fresh meat counter)
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "442056",
        url: "https://www.pingodoce.pt/home/produtos/talho/aves/peru/perna-de-peru-nosso-talho-442056.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "2885523",
        url: "https://www.auchan.pt/pt/produtos-frescos/talho/peru/perna-de-peru-auchan-inteira-kg/2885523.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Perna de Peru Desossada",
    category: "Carne",
    subcategory: "Peru",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "8208827",
        url: "https://www.continente.pt/produto/perna-de-peru-desossada-lusiaves-lusiaves-8208827.html",
        packageSize: 1, // priced per kg already (fresh meat counter)
      },
      // Pingo Doce doesn't carry a boneless leg (confirmed absent from
      // search results, not filtered out)
      {
        store: "AUCHAN",
        storeProductId: "3744957",
        url: "https://www.auchan.pt/pt/produtos-frescos/talho/peru/perna-de-peru-sem-osso-auchan-kg/3744957.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Novilho para Estufar",
    category: "Carne",
    subcategory: "Novilho", // new subcategory - no beef in the tracker before this
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7418594",
        url: "https://www.continente.pt/produto/novilho-para-estufar-continente-continente-7418594.html",
        packageSize: 1, // priced per kg already (fresh meat counter)
      },
      // Auchan's tile and URL call this generically "Carne Estufar de
      // Bovino"; confirmed as genuine novilho via the product page's legal
      // Denominação field ("NOVILHO NACIONAL ESTUFAR:PEITO KG"), not assumed
      // from department placement. Pingo Doce returned only 2 SKUs for the
      // whole "carne de novilho" search and no stewing cut - not tracked here.
      {
        store: "AUCHAN",
        storeProductId: "101340",
        url: "https://www.auchan.pt/pt/produtos-frescos/talho/vitela-e-novilho/carne-estufar-de-bovino-kg/101340.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Bife da Vazia de Novilho Angus",
    category: "Carne",
    subcategory: "Novilho",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "6870584",
        url: "https://www.continente.pt/produto/bife-da-vazia-de-novilho-fatiado-no-balcao-angus-angus-6870584.html",
        packageSize: 1, // priced per kg already (fresh meat counter)
      },
      // Flagged for review and kept after checking: Continente's
      // €19.99/kg vs Pingo Doce's €30.48/kg is a real ~53% spread, not a
      // scraping artifact (Pingo Doce's page was checked directly and shows
      // "30,48 €/Kg"). "Angus" denotes breed rather than grade, so
      // sourcing/ageing may differ - Continente's is counter-sliced (fatiado
      // no balcão) vs Pingo Doce's pre-packaged (embalado). Kept
      // deliberately.
      {
        store: "PINGO_DOCE",
        storeProductId: "853104",
        url: "https://www.pingodoce.pt/home/produtos/talho/vitela-vitelao-e-bovino/angus/bife-da-vazia-de-novilho-angus-embalado-nosso-talho-853104.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Laranja",
    category: "Fruta",
    subcategory: "Laranja",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7221212",
        url: "https://www.continente.pt/produto/laranja-continente-continente-7221212.html",
        packageSize: 1, // priced per kg already (loose produce)
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "46442",
        url: "https://www.pingodoce.pt/home/produtos/frutas-e-vegetais/frutas/fruta-da-epoca/laranja-nossa-fruta-e-legumes-46442.html",
        packageSize: 1,
      },
      // Auchan's listing is named "Laranja do Algarve IGP Auchan" -
      // "IGP Algarve" here is Auchan's own-brand naming, not a variety
      // claim, so it stays in this generic loose tier alongside the other
      // two stores' plain own-brand oranges rather than being split off.
      {
        store: "AUCHAN",
        storeProductId: "3374907",
        url: "https://www.auchan.pt/pt/laranja-do-algarve-igp-auchan-kg/3374907.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Pre-bagged nets, distinct from the loose "Laranja" above. No pack size
    // is common to all three stores (Continente sells 2 kg and 3 kg, Pingo
    // Doce 1,5 kg and 2 kg, Auchan 1,5 kg and 3 kg), so this group matches on
    // the IGP Algarve variety label and lets packageSize normalise the
    // differing weights to €/kg - same approach as "Posta de Bacalhau"'s
    // 0.8/0.8/0.6 packs. Scrapers read the pack price here (Continente
    // €1.98 ÷ 2 kg = €0.99/kg, verified against the price shown on their
    // site; Pingo Doce and Auchan €2.49 ÷ 1.5 kg = €1.66/kg).
    name: "Laranja IGP Algarve (Rede)",
    category: "Fruta",
    subcategory: "Laranja",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "5602895",
        url: "https://www.continente.pt/produto/laranja-igp-algarve-d.-joao-continente-continente-5602895.html",
        packageSize: 2, // 2 kg net
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "764041",
        url: "https://www.pingodoce.pt/home/produtos/frutas-e-vegetais/frutas/fruta-da-epoca/laranja-igp-algarve-embalada-os-nossos-frescos-764041.html",
        packageSize: 1.5, // 1,5 kg net
      },
      {
        store: "AUCHAN",
        storeProductId: "3274212",
        url: "https://www.auchan.pt/pt/produtos-frescos/fruta/laranjas-clementinas-e-limoes/laranja-do-algarve-igp-auchan-cultivamos-o-bom-1.5-kg/3274212.html",
        packageSize: 1.5, // 1,5 kg net
      },
    ],
  },
  {
    // Ordinary imported dessert banana, the commodity tier - distinct from
    // "Banana da Madeira" below (see that entry for why they aren't merged)
    name: "Banana",
    category: "Fruta",
    subcategory: "Banana",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2597619",
        url: "https://www.continente.pt/produto/banana-continente-continente-2597619.html",
        packageSize: 1, // priced per kg already (loose produce)
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "43218",
        url: "https://www.pingodoce.pt/home/produtos/frutas-e-vegetais/frutas/fruta-da-epoca/banana-importada-nossa-fruta-e-legumes-43218.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "234229",
        url: "https://www.auchan.pt/pt/produtos-frescos/fruta/banana-e-frutos-tropicais/banana-del-monte-kg/234229.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Kept as a separate product from "Banana" above - it's a distinct
    // protected regional product (smaller fruit), not a labelling variant,
    // checked by hand. The premium is real and holds at every store:
    // €2.89 vs €1.29 is ~2.2x. Merging them would repeat the mistake
    // documented for "Dourada" (wild vs farmed at ~3x price under
    // near-identical names). Continente's page shows an "emb. 1,05 kg"
    // label, but its secondary rate equals the displayed price, so it is
    // per-kg priced and packageSize is 1 - this is the "emb." trap
    // described in step 4 of the product-discovery skill, not a 1.05 kg
    // pack.
    name: "Banana da Madeira",
    category: "Fruta",
    subcategory: "Banana",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2076480",
        url: "https://www.continente.pt/produto/banana-da-madeira-continente-continente-2076480.html",
        packageSize: 1, // "emb. 1,05 kg" label is a per-kg price, not a pack
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "31208",
        url: "https://www.pingodoce.pt/home/produtos/frutas-e-vegetais/frutas/bananas-peras-e-macas/banana-da-madeira-nossa-fruta-e-legumes-31208.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "25154",
        url: "https://www.auchan.pt/pt/produtos-frescos/fruta/banana-e-frutos-tropicais/banana-da-madeira-kg/25154.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Organic tier. Pingo Doce carries no organic banana (confirmed absent
    // from search results). No organic Madeira banana exists at any of the
    // three stores - organic appears only on imported fruit. Continente's
    // page again shows an "emb." label (1,1 kg) that is not the
    // packageSize; per-kg confirmed, so 1.
    name: "Banana Biológica",
    category: "Fruta",
    subcategory: "Banana",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2577634",
        url: "https://www.continente.pt/produto/banana-biologica-continente-bio-continente-bio-2577634.html",
        packageSize: 1, // "emb. 1,1 kg" label is a per-kg price, not a pack
      },
      {
        store: "AUCHAN",
        storeProductId: "720350",
        url: "https://www.auchan.pt/pt/biologicos-e-alternativas/biologicos/biologicos-produtos-frescos/frutas-e-legumes/frutas-sumos-e-polpas/banana-importada-bio-kg/720350.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Cheese sold in fixed-weight packs, not priced per kg directly - the
    // displayed price buys the whole pack, so packageSize is the pack
    // weight in kg (e.g. a 500 g pack at €3,99 is €7,98/kg).
    name: "Queijo Flamengo Fatiado",
    category: "Laticínios",
    subcategory: "Queijo",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2888438",
        url: "https://www.continente.pt/produto/queijo-flamengo-fatiado-continente-continente-2888438.html",
        packageSize: 0.5, // 500 g pack
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "996980",
        url: "https://www.pingodoce.pt/home/produtos/charcutaria-e-queijos/queijos/queijo-fatiado-e-bola/queijo-flamengo-fatiado-pingo-doce-996980.html",
        packageSize: 0.5,
      },
      {
        store: "AUCHAN",
        storeProductId: "3352009",
        url: "https://www.auchan.pt/pt/produtos-frescos/queijaria/queijo-fatiado-e-barra/queijo-flamengo-auchan-a-mesa-em-portugal-acores-fatias-500g/3352009.html",
        packageSize: 0.5,
      },
    ],
  },
  {
    name: "Queijo Flamengo Ralado",
    category: "Laticínios",
    subcategory: "Queijo",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "8170352",
        url: "https://www.continente.pt/produto/queijo-flamengo-ralado-para-gratinar-continente-continente-8170352.html",
        packageSize: 0.2, // 200 g pack
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "773026",
        url: "https://www.pingodoce.pt/home/produtos/charcutaria-e-queijos/queijos/queijo-ralado/queijo-flamengo-ralado-pingo-doce-773026.html",
        packageSize: 0.2,
      },
      {
        store: "AUCHAN",
        storeProductId: "3285001",
        url: "https://www.auchan.pt/pt/produtos-frescos/queijaria/queijo-ralado-e-para-culinaria/queijo-flamengo-auchan-ralado-200g/3285001.html",
        packageSize: 0.2,
      },
    ],
  },
  {
    name: "Queijo Mozzarella Fresca",
    category: "Laticínios",
    subcategory: "Queijo",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "6249460",
        url: "https://www.continente.pt/produto/queijo-mozzarella-continente-continente-6249460.html",
        packageSize: 0.125, // 125 g ball
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "996707",
        url: "https://www.pingodoce.pt/home/produtos/charcutaria-e-queijos/queijos/queijo-estrangeiro/queijo-mozzarella-fresca-pingo-doce-996707.html",
        packageSize: 0.125,
      },
      {
        store: "AUCHAN",
        storeProductId: "3199381",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/queijaria/queijo-frescomagrorequeijaomozzarella/queijo-mozzarella-fresca-auchan-125g/3199381.html",
        packageSize: 0.125,
      },
    ],
  },
  {
    name: "Queijo Fresco para Barrar",
    category: "Laticínios",
    subcategory: "Queijo",
    unit: "kg",
    listings: [
      {
        // Continente €1,09 undercuts €1,19 at the other two
        store: "CONTINENTE",
        storeProductId: "8667359",
        url: "https://www.continente.pt/produto/queijo-fresco-para-barrar-original-continente-continente-8667359.html",
        packageSize: 0.2, // 200 g pack
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "925077",
        url: "https://www.pingodoce.pt/home/produtos/charcutaria-e-queijos/queijos/queijo-para-barrar/queijo-para-barrar-natural-pingo-doce-925077.html",
        packageSize: 0.2,
      },
      {
        store: "AUCHAN",
        storeProductId: "3771234",
        url: "https://www.auchan.pt/pt/produtos-frescos/queijaria/queijo-para-barrar/queijo-fresco-auchan-para-barrar-normal-200-g/3771234.html",
        packageSize: 0.2,
      },
    ],
  },
  {
    // Own-brand butter, cheapest tier - 250 g packs, price buys the pack
    name: "Manteiga com Sal Açores",
    category: "Laticínios",
    subcategory: "Manteiga",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2705884",
        url: "https://www.continente.pt/produto/manteiga-com-sal-acores-continente-continente-2705884.html",
        packageSize: 0.25,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "833012",
        url: "https://www.pingodoce.pt/home/produtos/manteiga-margarina-e-natas/manteiga-e-margarina/manteiga-com-sal-acores-pingo-doce-833012.html",
        packageSize: 0.25,
      },
      {
        store: "AUCHAN",
        storeProductId: "523676",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/manteiga-cremes-e-margarina/manteiga/manteiga-com-sal-auchan-a-mesa-em-portugal-acores-250g/523676.html",
        packageSize: 0.25,
      },
    ],
  },
  {
    // Widest three-way spread in the butter set (€2,19 / €2,49 / €2,24)
    name: "Manteiga com Sal Milhafre",
    category: "Laticínios",
    subcategory: "Manteiga",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2228159",
        url: "https://www.continente.pt/produto/manteiga-com-sal-milhafre-milhafre-2228159.html",
        packageSize: 0.25,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "335310",
        url: "https://www.pingodoce.pt/home/produtos/manteiga-margarina-e-natas/manteiga-e-margarina/manteiga-com-sal-milhafre-335310.html",
        packageSize: 0.25,
      },
      {
        store: "AUCHAN",
        storeProductId: "11002",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/manteiga-cremes-e-margarina/manteiga/manteiga-milhafre-com-sal-250g/11002.html",
        packageSize: 0.25,
      },
    ],
  },
  {
    name: "Manteiga com Sal Primor",
    category: "Laticínios",
    subcategory: "Manteiga",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2482134",
        url: "https://www.continente.pt/produto/manteiga-com-sal-primor-primor-2482134.html",
        packageSize: 0.25,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "399740",
        url: "https://www.pingodoce.pt/home/produtos/manteiga-margarina-e-natas/manteiga-e-margarina/manteiga-com-sal-primor-399740.html",
        packageSize: 0.25,
      },
      {
        store: "AUCHAN",
        storeProductId: "431992",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/manteiga-cremes-e-margarina/manteiga/manteiga-primor-com-sal-250g/431992.html",
        packageSize: 0.25,
      },
    ],
  },
  {
    // Light tier - Auchan brands it "Light 45% Gordura", same product
    name: "Manteiga Magra Matinal",
    category: "Laticínios",
    subcategory: "Manteiga",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2416978",
        url: "https://www.continente.pt/produto/manteiga-magra-matinal-matinal-2416978.html",
        packageSize: 0.25,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "480252",
        url: "https://www.pingodoce.pt/home/produtos/manteiga-margarina-e-natas/manteiga-e-margarina/manteiga-magra-matinal-480252.html",
        packageSize: 0.25,
      },
      {
        store: "AUCHAN",
        storeProductId: "324515",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/manteiga-cremes-e-margarina/manteiga/manteiga-matinal-light---45-gordura-250g/324515.html",
        packageSize: 0.25,
      },
    ],
  },
  {
    // Eggs use unit "un" with packageSize = egg count, not kg/L like every
    // other product in this file - price / packageSize yields €/egg via
    // unitPrice(), which is the only way a 6-pack and a 12-pack compare.
    // Housing type (solo/caged vs ar livre/free-range) is held constant
    // within each group since it drives price more than any other factor -
    // mixing them would repeat the mistake documented for "Dourada" above.
    name: "Ovos de Ar Livre Classe M/L",
    category: "Laticínios",
    subcategory: "Ovos",
    unit: "un",
    listings: [
      {
        // Auchan €1,89 vs €2,09
        store: "CONTINENTE",
        storeProductId: "6805484",
        url: "https://www.continente.pt/produto/ovos-de-ar-livre-classe-m-l-continente-continente-6805484.html",
        packageSize: 6,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "889024",
        url: "https://www.pingodoce.pt/home/produtos/as-nossas-marcas/pingo-doce/ovos-de-ar-livre-classe-m%2Fl-pingo-doce-889024.html",
        packageSize: 6,
      },
      {
        store: "AUCHAN",
        storeProductId: "3076463",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/ovos/ovos-galinhas-criadas-ao-ar-livre/ovos-auchan-galinhas-ar-livre-classe-ml-12-duzia/3076463.html",
        packageSize: 6,
      },
    ],
  },
  {
    // Same third-party brand at all three; Continente €3,99 vs €4,59
    name: "Ovos de Ar Livre Classe M/L Matinados",
    category: "Laticínios",
    subcategory: "Ovos",
    unit: "un",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "6664918",
        url: "https://www.continente.pt/produto/ovos-de-ar-livre-classe-m-l-matinados-matinados-6664918.html",
        packageSize: 12,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "895037",
        url: "https://www.pingodoce.pt/home/produtos/ovos/ovos-de-ar-livre-classe-m%2Fl-matinados-895037.html",
        packageSize: 12,
      },
      {
        store: "AUCHAN",
        storeProductId: "2884565",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/ovos/ovos-galinhas-criadas-ao-ar-livre/ovos-matinados-do-campo-ar-livre-classe-m-e-l-uma-duzia/2884565.html",
        packageSize: 12,
      },
    ],
  },
  {
    name: "Ovos de Solo Classe L",
    category: "Laticínios",
    subcategory: "Ovos",
    unit: "un",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7066777",
        url: "https://www.continente.pt/produto/ovos-de-solo-classe-l-continente-continente-7066777.html",
        packageSize: 12,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "889026",
        url: "https://www.pingodoce.pt/home/produtos/as-nossas-marcas/pingo-doce/ovos-de-solo-classe-l-pingo-doce-889026.html",
        packageSize: 12,
      },
      {
        store: "AUCHAN",
        storeProductId: "446852",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/ovos/ovos-galinhas-criadas-no-solo/ovos-auchan-galinhas-solo-classe-l-uma-duzia/446852.html",
        packageSize: 12,
      },
    ],
  },
  {
    name: "Ovos de Solo Classe XL",
    category: "Laticínios",
    subcategory: "Ovos",
    unit: "un",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "6903601",
        url: "https://www.continente.pt/produto/ovos-de-solo-classe-xl-continente-continente-6903601.html",
        packageSize: 6,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "889029",
        url: "https://www.pingodoce.pt/home/produtos/as-nossas-marcas/pingo-doce/ovos-de-solo-classe-xl-pingo-doce-889029.html",
        packageSize: 6,
      },
      {
        store: "AUCHAN",
        storeProductId: "2132649",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/ovos/ovos-galinhas-criadas-no-solo/ovos-auchan-galinhas-solo-classe-xl-12-duzia/2132649.html",
        packageSize: 6,
      },
    ],
  },
  {
    // "Leite UHT Meio Gordo" above is already tracked - this is its adjacent
    // skimmed variant, not a duplicate
    name: "Leite UHT Magro",
    category: "Laticínios",
    subcategory: "Leite",
    unit: "L",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "6879889",
        url: "https://www.continente.pt/produto/leite-hgt-magro-com-tampa-rosca-continente-equilibrio-continente-equilibrio-6879889.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "48149",
        url: "https://www.pingodoce.pt/home/produtos/leite-e-bebidas-vegetais/leite/leite-magro/leite-uht-magro-pingo-doce-48149.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "3010400",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/leites/leite-uht/leite-uht-auchan-magro-1l/3010400.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Continente and Auchan call it "Inteiro", Pingo Doce "Gordo" - same
    // product, different store naming
    name: "Leite UHT Gordo",
    category: "Laticínios",
    subcategory: "Leite",
    unit: "L",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "6927108",
        url: "https://www.continente.pt/produto/leite-uht-inteiro-continente-continente-6927108.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "48151",
        url: "https://www.pingodoce.pt/home/produtos/leite-e-bebidas-vegetais/leite/leite-meio-gordo-e-gordo/leite-uht-gordo-pingo-doce-48151.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "3998562",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/leites/leite-uht/leite-uht-inteiro-auchan-1l/3998562.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Continente and Auchan carry no own-brand 1 L in this variant (only
    // 6-packs), so Mimosa's 1 L is the form-matched representative at both;
    // Pingo Doce's own-brand 1 L at €1,08 undercuts it.
    name: "Leite UHT Meio Gordo sem Lactose",
    category: "Laticínios",
    subcategory: "Leite",
    unit: "L",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "4064882",
        url: "https://www.continente.pt/produto/leite-uht-meio-gordo-sem-lactose-mimosa-mimosa-4064882.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "977850",
        url: "https://www.pingodoce.pt/home/produtos/leite-e-bebidas-vegetais/leite/leite-sem-lactose/leite-uht-meio-gordo-sem-lactose-pingo-doce-977850.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "2125876",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/sem-lactose/leite-sem-lactose/leite-mimosa-uht-especial-0-lactose-meio-gordo-1l/2125876.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Terra Nostra at all three - same brand chosen deliberately rather than
    // each store's own pasture line, so it's a true same-product comparison.
    // Widest spread in the milk set (€1,14 / €0,89 / €1,07).
    name: "Leite de Pastagem Meio Gordo",
    category: "Laticínios",
    subcategory: "Leite",
    unit: "L",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7379406",
        url: "https://www.continente.pt/produto/leite-meio-gordo-pastagem-terra-nostra-terra-nostra-7379406.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "822652",
        url: "https://www.pingodoce.pt/home/produtos/leite-e-bebidas-vegetais/leite/leite-meio-gordo-e-gordo/leite-de-pastagem-uht-meio-gordo-terra-nostra-822652.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "2351186",
        url: "https://www.auchan.pt/pt/alimentacao/produtos-lacteos/leites/leite-uht/leite-terra-nostra-pastagem-meio-gordo-1l/2351186.html",
        packageSize: 1,
      },
    ],
  },
  {
    // DRAINED weight (peso escorrido), not net. All three stores compute their
    // displayed €/kg on the drained figure, and all three publish it for this
    // jar: 400 g. Using it makes our €/kg match what each store prints on its
    // own page (€2,23 / €2,13 / €2,13 per kg) instead of sitting 35% below it.
    // The two groups below can't use drained - see their comments.
    name: "Grão de Bico Cozido em Frasco",
    category: "Mercearia",
    subcategory: "Leguminosas", // new subcategory - no pulses in the tracker before this
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7466560",
        url: "https://www.continente.pt/produto/grao-de-bico-cozido-sem-gluten-continente-continente-7466560.html",
        packageSize: 0.4, // emb. 540 gr (peso escorrido 400 gr)
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "4965",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/conservas/feijao-grao-e-outros/grao-de-bico-cozido-em-frasco-pingo-doce-4965.html",
        packageSize: 0.4, // page states "0.4 Kg | 2,13 €/Kg"
      },
      {
        store: "AUCHAN",
        storeProductId: "4011196",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/conservas/cogumelo-milho-ervilha-feijao-e-outros/grao-de-bico-auchan-frasco-540%28400%29g/4011196.html",
        packageSize: 0.4, // name says 540(400)G; description confirms escorrido 400
      },
    ],
  },
  {
    // NET weight here, unlike the own-brand jar above, because the two stores
    // disagree about the drained weight of the *same* Compal tin: Continente
    // declares 234 g, Auchan 260 g. One of them is wrong, and using drained
    // would invent a €0,64/kg gap between two identical tins both priced
    // €1,49. Net (410 g at both) is the honest denominator for this group.
    //
    // Pingo Doce carries this brand and weight only as a can - a different
    // form, so it stays out rather than being compared against a jar.
    name: "Grão de Bico Cozido Compal da Horta",
    category: "Mercearia",
    subcategory: "Leguminosas",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2003596",
        url: "https://www.continente.pt/produto/grao-de-bico-cozido-sem-gluten-compal-da-horta-compal-da-horta-2003596.html",
        packageSize: 0.41,
      },
      {
        store: "AUCHAN",
        storeProductId: "22809",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/conservas/cogumelo-milho-ervilha-feijao-e-outros/grao-compal-da-horta-cozido-410g/22809.html",
        packageSize: 0.41,
      },
    ],
  },
  {
    // NET weight: Auchan publishes no drained figure for this jar at all
    // (Continente says 400 g). A group can't mix bases, so both stay on net.
    name: "Grão de Bico Cozido Origens Bio",
    category: "Mercearia",
    subcategory: "Leguminosas",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7095384",
        url: "https://www.continente.pt/produto/grao-de-bico-cozido-sem-gluten-origens-bio-origens-bio-7095384.html",
        packageSize: 0.54,
      },
      {
        store: "AUCHAN",
        storeProductId: "3204121",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/conservas/cogumelo-milho-ervilha-feijao-e-outros/grao-origens-de-bico-bio-540g/3204121.html",
        packageSize: 0.54,
      },
    ],
  },
  {
    // Each store's own-brand generic blend. All three at €1,79 on the day this
    // was added - worth watching precisely because it starts as a dead heat.
    name: "Óleo Alimentar",
    category: "Mercearia",
    subcategory: "Azeite e Óleos",
    unit: "L",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "5045342",
        url: "https://www.continente.pt/produto/oleo-alimentar-continente-continente-5045342.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "922815",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/azeite-oleo-e-vinagre/oleo/oleo-alimentar-pingo-doce-922815.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "3994247",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/azeite-oleo-e-vinagre/oleo-girassol-amendoim-e-vegetal/oleo-alimentar-auchan-1l/3994247.html",
        packageSize: 1,
      },
    ],
  },
  {
    // National-brand counterpart to the own-brand blend above. Pingo Doce was
    // on promotion at €1,79 when added (regular €2,19), so the first snapshot
    // understates it - expect the ranking to move.
    name: "Óleo Alimentar Fula",
    category: "Mercearia",
    subcategory: "Azeite e Óleos",
    unit: "L",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2004635",
        url: "https://www.continente.pt/produto/oleo-alimentar-fula-fula-2004635.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "621280",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/azeite-oleo-e-vinagre/oleo/oleo-alimentar-fula-621280.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "5845",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/azeite-oleo-e-vinagre/oleo-girassol-amendoim-e-vegetal/oleo-alimentar-fula-1l/5845.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Kept separate from the 1 L bottle rather than merged into it: unit "L"
    // would normalize them, but a catering bottle isn't the same purchase.
    // Holding both makes the bulk discount visible (~2%, barely worth it).
    name: "Óleo Alimentar (3 L)",
    category: "Mercearia",
    subcategory: "Azeite e Óleos",
    unit: "L",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "5045343",
        url: "https://www.continente.pt/produto/oleo-alimentar-continente-continente-5045343.html",
        packageSize: 3,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "884221",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/azeite-oleo-e-vinagre/oleo/oleo-alimentar-pingo-doce-884221.html",
        packageSize: 3,
      },
      {
        store: "AUCHAN",
        storeProductId: "3994253",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/azeite-oleo-e-vinagre/oleo-girassol-amendoim-e-vegetal/oleo-alimentar-auchan-3l/3994253.html",
        packageSize: 3,
      },
    ],
  },
  {
    // Widest spread of any group added in this batch - the identical bottle
    // ran 30% dearer at Auchan than Continente. Note the inversion against
    // Oliveira da Serra below: no store wins the olive-oil aisle outright.
    name: "Azeite Virgem Extra Clássico Gallo",
    category: "Mercearia",
    subcategory: "Azeite e Óleos",
    unit: "L",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2893558",
        url: "https://www.continente.pt/produto/azeite-virgem-extra-classico-gallo-gallo-2893558.html",
        packageSize: 0.75,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "52579",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/azeite-oleo-e-vinagre/azeite/azeite-virgem-extra-classico-gallo-52579.html",
        packageSize: 0.75,
      },
      {
        store: "AUCHAN",
        storeProductId: "643774",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/azeite-oleo-e-vinagre/azeite-virgem-e-extra-virgem/azeite-gallo-virgem-extra-classico-750ml/643774.html",
        packageSize: 0.75,
      },
    ],
  },
  {
    // "Clássico" is the grade marker that matters here - both brands also sell
    // a plain "virgem" line under near-identical packaging, which is a lower
    // grade and must not end up in this group.
    name: "Azeite Virgem Extra Clássico Oliveira da Serra",
    category: "Mercearia",
    subcategory: "Azeite e Óleos",
    unit: "L",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2014566",
        url: "https://www.continente.pt/produto/azeite-virgem-extra-classico-oliveira-da-serra-oliveira-da-serra-2014566.html",
        packageSize: 0.75,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "268224",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/azeite-oleo-e-vinagre/azeite/azeite-virgem-extra-classico-oliveira-da-serra-268224.html",
        packageSize: 0.75,
      },
      {
        store: "AUCHAN",
        storeProductId: "5860",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/azeite-oleo-e-vinagre/azeite-virgem-e-extra-virgem/azeite-oliveira-da-serra-virgem-extra-classico-750ml/5860.html",
        packageSize: 0.75,
      },
    ],
  },
  {
    // Estate/organic tier, ~3x the own-brand rate per litre.
    name: "Azeite Virgem Extra Biológico Herdade do Esporão",
    category: "Mercearia",
    subcategory: "Azeite e Óleos",
    unit: "L",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7403870",
        url: "https://www.continente.pt/produto/azeite-virgem-extra-biologico-herdade-do-esporao-herdade-do-esporao-7403870.html",
        packageSize: 0.5,
      },
      {
        store: "AUCHAN",
        storeProductId: "2216686",
        url: "https://www.auchan.pt/pt/biologicos-e-alternativas/biologicos/biologicos-mercearia/azeite-oleo-e-vinagre/azeite/azeite-herdade-do-esporao-biologico-0.5l/2216686.html",
        packageSize: 0.5,
      },
    ],
  },
  {
    name: "Sal Grosso",
    category: "Mercearia",
    subcategory: "Sal", // new subcategory
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "5621031",
        url: "https://www.continente.pt/produto/sal-grosso-continente-continente-5621031.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "1960",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/temperos-e-molhos/sal/sal-grosso-pingo-doce-1960.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "4055031",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/sal-ervas-e-temperos/sal/sal-marinho-auchan-grosso-1kg/4055031.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Auchan calls it "de mesa" rather than "fino"; same product, size and rate
    // confirmed identical. Against Sal Grosso above this shows the real story:
    // the same €0,29 buys a quarter as much salt in the 250 g box.
    name: "Sal Fino",
    category: "Mercearia",
    subcategory: "Sal",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "5621157",
        url: "https://www.continente.pt/produto/sal-fino-continente-continente-5621157.html",
        packageSize: 0.25,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "1805",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/temperos-e-molhos/sal/sal-fino-pingo-doce-1805.html",
        packageSize: 0.25,
      },
      {
        store: "AUCHAN",
        storeProductId: "2211352",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/sal-ervas-e-temperos/sal/sal-auchan-de-mesa-250g/2211352.html",
        packageSize: 0.25,
      },
    ],
  },
  {
    // Its own group on purpose: flor de sal runs ~25x coarse salt per kilo and
    // would swamp any group it shared.
    name: "Flor de Sal Marnoto",
    category: "Mercearia",
    subcategory: "Sal",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2767086",
        url: "https://www.continente.pt/produto/flor-de-sal-marnoto-marnoto-2767086.html",
        packageSize: 0.25,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "555699",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/temperos-e-molhos/sal/flor-de-sal-marnoto-555699.html",
        packageSize: 0.25,
      },
      {
        store: "AUCHAN",
        storeProductId: "728200",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/sal-ervas-e-temperos/sal/flor-de-sal-marnoto-saco-zip-250g/728200.html",
        packageSize: 0.25,
      },
    ],
  },
  {
    name: "Arroz Carolino",
    category: "Mercearia",
    subcategory: "Arroz", // new subcategory
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "4738050",
        url: "https://www.continente.pt/produto/arroz-carolino-continente-continente-4738050.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "918813",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/arroz-massa-e-leguminosas/arroz/arroz-carolino-pingo-doce-918813.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "56832",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/arroz-e-massa/arroz/arroz-carolino-auchan-extra-longo-1kg/56832.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Continente and Auchan are own-brand but Pingo Doce's is the Europa
    // label - not a pure own-brand comparison, which may explain its lead.
    name: "Arroz Agulha",
    category: "Mercearia",
    subcategory: "Arroz",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "6927230",
        url: "https://www.continente.pt/produto/arroz-agulha-continente-continente-6927230.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "651178",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/arroz-massa-e-leguminosas/arroz/arroz-agulha-europa-pingo-doce-651178.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "1193801",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/arroz-e-massa/arroz/arroz-agulha-auchan-extra-longo-branqueado-1kg/1193801.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Arroz Basmati",
    category: "Mercearia",
    subcategory: "Arroz",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "4949515",
        url: "https://www.continente.pt/produto/arroz-basmati-continente-continente-4949515.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "651101",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/arroz-massa-e-leguminosas/arroz/arroz-basmati-pingo-doce-651101.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "548510",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/arroz-e-massa/arroz/arroz-basmati-auchan-extra-longo-1kg/548510.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Massa Esparguete",
    category: "Mercearia",
    subcategory: "Massa", // new subcategory
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "5254224",
        url: "https://www.continente.pt/produto/massa-esparguete-continente-continente-5254224.html",
        packageSize: 0.5,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "1010174",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/arroz-massa-e-leguminosas/massa-esparguete-pingo-doce-1010174.html",
        packageSize: 0.5,
      },
      {
        store: "AUCHAN",
        storeProductId: "3771760",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/arroz-e-massa/esparguete-aletria-e-meadas/esparguete-auchan-500g/3771760.html",
        packageSize: 0.5,
      },
    ],
  },
  {
    // Auchan names the shape "fusilli" but files it in its own espiral
    // department - same product, different vocabulary.
    name: "Massa Espirais",
    category: "Mercearia",
    subcategory: "Massa",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2060683",
        url: "https://www.continente.pt/produto/massa-espirais-continente-continente-2060683.html",
        packageSize: 0.5,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "657178",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/arroz-massa-e-leguminosas/massa/massa-espirais-pingo-doce-657178.html",
        packageSize: 0.5,
      },
      {
        store: "AUCHAN",
        storeProductId: "3824491",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/arroz-e-massa/cotovelos-espiral-e-massinhas/massa-fusilli-auchan-500g/3824491.html",
        packageSize: 0.5,
      },
    ],
  },
  {
    // Pingo Doce uses the diminutive "macarronete" for the same ridged tube.
    name: "Massa Macarrão Riscado",
    category: "Mercearia",
    subcategory: "Massa",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2015465",
        url: "https://www.continente.pt/produto/massa-macarrao-riscado-continente-continente-2015465.html",
        packageSize: 0.5,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "857929",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/arroz-massa-e-leguminosas/massa/massa-macarronete-riscado-pingo-doce-857929.html",
        packageSize: 0.5,
      },
      {
        store: "AUCHAN",
        storeProductId: "56770",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/arroz-e-massa/tagliatelli-e-macarrao/macarrao-auchan-riscado-500g/56770.html",
        packageSize: 0.5,
      },
    ],
  },
  {
    // All three tuna groups use DRAINED weight (peso escorrido), read from each
    // store's own page - Continente's `.ct-pdp--unit`, Auchan's product name,
    // Pingo Doce's scoped "0.085 Kg | 13,18 €/Kg" block. Every tin is 120 g net,
    // so net weight would report a flat three-way tie and hide the real
    // difference: the same €1,12 buys 85 g of fish at Pingo Doce against 78 g
    // at the other two. These are own-brand-vs-own-brand groups, so the
    // differing fills are genuine product differences, not a data error.
    name: "Atum Posta em Azeite",
    category: "Mercearia",
    subcategory: "Conservas", // new subcategory
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "3697794",
        url: "https://www.continente.pt/produto/atum-em-azeite-continente-continente-3697794.html",
        packageSize: 0.078, // emb. 120 gr (peso escorrido 78 gr)
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "559259",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/conservas/atum/atum-posta-em-azeite-pingo-doce-559259.html",
        packageSize: 0.085,
      },
      {
        store: "AUCHAN",
        storeProductId: "3877258",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/conservas/atum/atum-posta-auchan-em-azeite-120-%2878%29g/3877258.html",
        packageSize: 0.078, // name: 120(78)G
      },
    ],
  },
  {
    // The reversal worth watching: Auchan matches Pingo Doce's €0,93 shelf
    // price but fills 78 g against 85 g, making it the dearest of the three.
    name: "Atum Posta em Óleo Vegetal",
    category: "Mercearia",
    subcategory: "Conservas",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7241158",
        url: "https://www.continente.pt/produto/atum-posta-em-oleo-vegetal-continente-continente-7241158.html",
        packageSize: 0.085,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "753720",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/conservas/atum/atum-posta-em-oleo-pingo-doce-753720.html",
        packageSize: 0.085,
      },
      {
        store: "AUCHAN",
        storeProductId: "3871046",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/conservas/atum/atum-posta-auchan-em-oleo-120-%2878%29-g/3871046.html",
        packageSize: 0.078,
      },
    ],
  },
  {
    name: "Atum Posta ao Natural",
    category: "Mercearia",
    subcategory: "Conservas",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7241155",
        url: "https://www.continente.pt/produto/atum-posta-ao-natural-continente-equilibrio-continente-equilibrio-7241155.html",
        packageSize: 0.085,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "559260",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/conservas/atum/atum-posta-ao-natural-pingo-doce-559260.html",
        packageSize: 0.085,
      },
      {
        store: "AUCHAN",
        storeProductId: "3877251",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/conservas/atum/atum-posta-auchan-ao-natural-120-%2884%29g/3877251.html",
        packageSize: 0.084, // name: 120(84)G
      },
    ],
  },
  {
    name: "Açúcar Branco Granulado",
    category: "Mercearia",
    subcategory: "Açúcar", // new subcategory
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "5038799",
        url: "https://www.continente.pt/produto/acucar-branco-continente-continente-5038799.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "643460",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/farinha-fermento-e-acucar/acucar-e-adocante/acucar-branco-granulado-pingo-doce-643460.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "4002491",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/acucar-e-adocante/acucar/acucar-auchan-branco-granulado-1kg/4002491.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Auchan's is Sidul, a national brand, where the other two are own-brand -
    // read the 10-cent gap as a shelf comparison, not like-for-like.
    name: "Açúcar Amarelo",
    category: "Mercearia",
    subcategory: "Açúcar",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "8205568",
        url: "https://www.continente.pt/produto/acucar-amarelo-continente-continente-8205568.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "839396",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/farinha-fermento-e-acucar/acucar-e-adocante/acucar-amarelo-pingo-doce-839396.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "332513",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/acucar-e-adocante/acucar/acucar-sidul-amarelo-1kg/332513.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Mixed pack sizes: Auchan sells only a 500 g box where the other two sell
    // 1 kg. unit "kg" normalizes it, and on that basis the smaller box is also
    // the dearest. Sizes individually verified, not assumed.
    name: "Açúcar Mascavado",
    category: "Mercearia",
    subcategory: "Açúcar",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7352655",
        url: "https://www.continente.pt/produto/acucar-mascavado-continente-continente-7352655.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "902460",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/farinha-fermento-e-acucar/acucar-e-adocante/acucar-mascavado-pingo-doce-902460.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "3223587",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/acucar-e-adocante/acucar/acucar-auchan-mascavado-500g/3223587.html",
        packageSize: 0.5,
      },
    ],
  },
  {
    // All three Salsichas groups use DRAINED weight (peso escorrido) per the
    // conserve rule - the sausages, not the brine. Two of the three are
    // national brands, which is the case that forced the Compal chickpeas onto
    // net weight, so the retailers' declarations were checked rather than
    // assumed: Continente's `emb. 350 gr (peso escorrido 200 gr)`, Auchan's
    // `350(200)g` name and Pingo Doce's rate block all agree to the gram.
    name: "Salsichas de Aves em Lata",
    category: "Mercearia",
    subcategory: "Salsichas", // new subcategory
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "6498858",
        url: "https://www.continente.pt/produto/salsichas-de-aves-em-lata-8-un-continente-continente-6498858.html",
        packageSize: 0.2,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "936066",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/conservas/salsichas/salsichas-de-aves-pingo-doce-936066.html",
        packageSize: 0.2,
      },
      {
        store: "AUCHAN",
        storeProductId: "2645150",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/conservas/salsichas-aves/salsichas-aves-auchan-lata-8-un-350%28200%29g/2645150.html",
        packageSize: 0.2,
      },
    ],
  },
  {
    // Widest spread found outside branded olive oil: the identical Nobre tin
    // runs €1,79 at Auchan and €2,39 at Pingo Doce, a 34% gap.
    name: "Salsichas Cocktail Nobre",
    category: "Mercearia",
    subcategory: "Salsichas",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2108568",
        url: "https://www.continente.pt/produto/salsichas-cocktail-em-lata-nobre-nobre-2108568.html",
        packageSize: 0.18,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "4989",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/conservas/salsichas/salsichas-cocktail-em-lata-nobre-4989.html",
        packageSize: 0.18,
      },
      {
        store: "AUCHAN",
        storeProductId: "59731",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/conservas/salsichas-porco/salsichas-nobre-cocktail-lata-350%28180%29g/59731.html",
        packageSize: 0.18,
      },
    ],
  },
  {
    name: "Salsichas Bockwurst Izidoro",
    category: "Mercearia",
    subcategory: "Salsichas",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2002235",
        url: "https://www.continente.pt/produto/salsichas-bockwurst-em-frasco-5-un-izidoro-izidoro-2002235.html",
        packageSize: 0.245,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "366106",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/conservas/salsichas/salsichas-bockwurst-em-frasco-izidoro-366106.html",
        packageSize: 0.245,
      },
      {
        store: "AUCHAN",
        storeProductId: "99035",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/conservas/salsichas-porco/salsichas-porco-izidoro-bockwurst-frasco5un-400%28245%29g/99035.html",
        packageSize: 0.245,
      },
    ],
  },
  {
    // NET weight here, not drained: polpa is homogeneous, so the whole contents
    // are the product. packageSize is the TOTAL across the 3-tin pack (3 x 210 g),
    // which is what the price buys - and what `parsePackageSize()` had to be
    // extended to read, since "emb. 3 x 210 gr" previously returned null.
    name: "Polpa de Tomate (3 x 210 g)",
    category: "Mercearia",
    subcategory: "Tomate", // new subcategory
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "6498117",
        url: "https://www.continente.pt/produto/polpa-de-tomate-continente-continente-6498117.html",
        packageSize: 0.63,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "923707",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/temperos-e-molhos/polpas-e-concentrados/polpa-de-tomate-pack-3-pingo-doce-923707.html",
        packageSize: 0.63,
      },
      {
        store: "AUCHAN",
        storeProductId: "4002452",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/polpas-caldos-e-temperos/polpa-tomate/polpa-de-tomate-auchan-3*210g/4002452.html",
        packageSize: 0.63,
      },
    ],
  },
  {
    // Kept separate from the multipack above rather than merged: holding both
    // makes the multipack premium visible (€2,37/kg against €1,98/kg - the
    // 3-pack is 20% dearer per kilo than the single tin).
    name: "Polpa de Tomate (500 g)",
    category: "Mercearia",
    subcategory: "Tomate",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "4898365",
        url: "https://www.continente.pt/produto/polpa-de-tomate-continente-continente-4898365.html",
        packageSize: 0.5,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "927480",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/temperos-e-molhos/polpas-e-concentrados/polpa-de-tomate-pingo-doce-927480.html",
        packageSize: 0.5,
      },
      {
        store: "AUCHAN",
        storeProductId: "3528662",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/polpas-caldos-e-temperos/polpa-tomate/polpa-de-tomate-auchan-500g/3528662.html",
        packageSize: 0.5,
      },
    ],
  },
  {
    // Whole peeled tomatoes - a different product from polpa, not a tier of it.
    // Auchan's tin is 380 g against 390 g at the other two, hence the split
    // packageSize; net basis throughout.
    name: "Tomate Pelado Inteiro",
    category: "Mercearia",
    subcategory: "Tomate",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "8382527",
        url: "https://www.continente.pt/produto/tomate-pelado-inteiro-continente-continente-8382527.html",
        packageSize: 0.39,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "762247",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/temperos-e-molhos/polpas-e-concentrados/tomate-pelado-inteiro-pingo-doce-762247.html",
        packageSize: 0.39,
      },
      {
        store: "AUCHAN",
        storeProductId: "3421691",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/polpas-caldos-e-temperos/polpa-tomate/tomate-auchan-inteiro-pelado-380-%28240%29-g/3421691.html",
        packageSize: 0.38,
      },
    ],
  },
  {
    // Auchan has no plain own-brand equivalent, so this uses Polegar (a
    // national brand) - read the 6-cent gap as a shelf comparison rather than
    // own-brand against own-brand.
    name: "Farinha de Trigo sem Fermento",
    category: "Mercearia",
    subcategory: "Farinha", // new subcategory
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2388667",
        url: "https://www.continente.pt/produto/farinha-de-trigo-t55-sem-fermento-continente-continente-2388667.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "650222",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/farinha-fermento-e-acucar/farinha-fermento-e-pao-ralado/farinha-de-trigo-tipo-55-sem-fermento-pingo-doce-650222.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "3438705",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/farinha/farinha-trigo/farinha-de-trigo-polegar-sem-fermento-para-usos-culinarios-1kg/3438705.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Self-raising and plain are not substitutes, hence separate groups.
    name: "Farinha de Trigo com Fermento",
    category: "Mercearia",
    subcategory: "Farinha",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2388512",
        url: "https://www.continente.pt/produto/farinha-de-trigo-super-fina-com-fermento-continente-continente-2388512.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "650224",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/farinha-fermento-e-acucar/farinha-fermento-e-pao-ralado/farinha-de-trigo-super-fina-com-fermento-pingo-doce-650224.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "56782",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/farinha/farinha-trigo/farinha-de-trigo-auchan-com-fermento-1kg/56782.html",
        packageSize: 1,
      },
    ],
  },
  {
    name: "Farinha de Trigo Integral",
    category: "Mercearia",
    subcategory: "Farinha",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7117588",
        url: "https://www.continente.pt/produto/farinha-de-trigo-integral-continente-equilibrio-continente-equilibrio-7117588.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "694638",
        url: "https://www.pingodoce.pt/home/produtos/mercearia/farinha-fermento-e-acucar/farinha-fermento-e-pao-ralado/farinha-de-trigo-integral-pingo-doce-694638.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "4022955",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/farinha/farinha-especialidades/farinha-trigo-auchan-tipo-150-integral-1-kg/4022955.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Every loaf weight in the Pão groups was read off its own product page,
    // never inferred from the name - sizes run 450-650 g here and are often
    // absent from the title, which is the main way a bread comparison breaks.
    name: "Pão de Forma sem Côdea",
    category: "Mercearia",
    subcategory: "Pão", // new subcategory
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7159043",
        url: "https://www.continente.pt/produto/pao-de-forma-sem-codea-continente-continente-7159043.html",
        packageSize: 0.45,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "463549",
        url: "https://www.pingodoce.pt/home/produtos/padaria-e-pastelaria/pao-embalado/pao-de-forma-e-embalado/pao-de-forma-branco-sem-codea-pingo-doce-463549.html",
        packageSize: 0.45,
      },
      {
        store: "AUCHAN",
        storeProductId: "3935465",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/tostas-e-pao-embalado/pao-embalado/pao-de-forma-auchan-sem-codea-450g/3935465.html",
        packageSize: 0.45,
      },
    ],
  },
  {
    // Mixed loaf sizes (475 / 500 / 600 g), each individually confirmed - this
    // compares each store's own wholemeal loaf, not one identical loaf three
    // times. Worth watching because the ranking inverts against shelf price:
    // Pingo Doce has the lowest sticker (€0,99) but the smallest loaf, so
    // Auchan's €1,15 is cheaper per kilo.
    name: "Pão de Forma Integral com Côdea",
    category: "Mercearia",
    subcategory: "Pão",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7158639",
        url: "https://www.continente.pt/produto/pao-de-forma-integral-com-codea-continente-continente-7158639.html",
        packageSize: 0.475,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "996375",
        url: "https://www.pingodoce.pt/home/produtos/padaria-e-pastelaria/pao-embalado/pao-de-forma-e-embalado/pao-de-forma-integral-com-codea-pingo-doce-996375.html",
        packageSize: 0.5,
      },
      {
        store: "AUCHAN",
        storeProductId: "3963430",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/tostas-e-pao-embalado/pao-embalado/pao-de-forma-auchan-trigo-integral-600-g/3963430.html",
        packageSize: 0.6,
      },
    ],
  },
  {
    // Pingo Doce was on promotion at €2,14 when added (regular €2,69, matching
    // Continente), so the first snapshot understates it.
    name: "Pão de Forma sem Côdea Bimbo",
    category: "Mercearia",
    subcategory: "Pão",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "6246547",
        url: "https://www.continente.pt/produto/pao-de-forma-sem-codea-bimbo-bimbo-6246547.html",
        packageSize: 0.65,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "847560",
        url: "https://www.pingodoce.pt/home/produtos/padaria-e-pastelaria/pao-embalado/pao-de-forma-e-embalado/pao-de-forma-branco-sem-codea-bimbo-847560.html",
        packageSize: 0.65,
      },
      {
        store: "AUCHAN",
        storeProductId: "2168767",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/tostas-e-pao-embalado/pao-embalado/pao-bimbo-forma-sem-codea-650g/2168767.html",
        packageSize: 0.65,
      },
    ],
  },
  {
    // Fiambre lives under Mercearia, not Carne: the Carne category holds raw
    // cuts you cook, and packaged deli ham shops more like a grocery item.
    name: "Fiambre da Perna Extra Fatiado",
    category: "Mercearia",
    subcategory: "Fiambre", // new subcategory
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7102481",
        url: "https://www.continente.pt/produto/fiambre-da-perna-extra-fatiado-continente-continente-7102481.html",
        packageSize: 0.2, // emb. 200 gr
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "739880",
        url: "https://www.pingodoce.pt/home/produtos/charcutaria-e-queijos/charcutaria/fiambre-mortadela-e-chouricao%E2%80%8B/fiambre-da-perna-extra-fatiado-pingo-doce-739880.html",
        packageSize: 0.2,
      },
      {
        store: "AUCHAN",
        storeProductId: "2179834",
        url: "https://www.auchan.pt/pt/produtos-frescos/charcutaria/fiambre-de-porco/fiambre-da-perna-extra-auchan-fatias-200-g/2179834.html",
        packageSize: 0.2,
      },
    ],
  },
  {
    // PRICED PER KILO, not per pack - the counter tier, sliced to order. This
    // is the same trap that once made a turkey leg read €2,27/kg instead of
    // €4,99, so it was verified against control listings rather than assumed:
    // Continente's price block reads `19,99€/kg` then `3,00€/un`, the same
    // shape as the known per-kg Perna de Peru, where a packaged item like Sal
    // Grosso instead reads `0,29€` then `0,29€/kg`. The page also swaps the
    // `emb.` label for `Quant. Mínima = 150 gr`, a minimum order rather than a
    // pack size, and €19,99 x 0,15 kg = €3,00 exactly as printed.
    //
    // Worth holding beside the tray group above: the same cut and grade costs
    // roughly twice as much per kilo sliced at the counter.
    name: "Fiambre da Perna Extra Nobre (balcão)",
    category: "Mercearia",
    subcategory: "Fiambre",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2112780",
        url: "https://www.continente.pt/produto/fiambre-da-perna-extra-fatiado-no-balcao-nobre-nobre-2112780.html",
        packageSize: 1,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "337364",
        url: "https://www.pingodoce.pt/home/produtos/charcutaria-e-queijos/charcutaria/fiambre-mortadela-e-chouricao%E2%80%8B/fiambre-da-perna-extra-%28fatiado-ao-balcao%29-nobre-337364.html",
        packageSize: 1,
      },
      {
        store: "AUCHAN",
        storeProductId: "4765",
        url: "https://www.auchan.pt/pt/produtos-frescos/charcutaria/fiambre-de-porco/fiambre-da-perna-extra-nobre-kg/4765.html",
        packageSize: 1,
      },
    ],
  },
  {
    // Turkey ham is the dearer option, not the budget one - €13,27/kg against
    // €8,95-9,95 for the pork leg tray above.
    name: "Fiambre de Peito de Peru Fatiado",
    category: "Mercearia",
    subcategory: "Fiambre",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7308018",
        url: "https://www.continente.pt/produto/fiambre-de-peito-de-peru-fatiado-continente-continente-7308018.html",
        packageSize: 0.15, // emb. 150 gr
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "991955",
        url: "https://www.pingodoce.pt/home/produtos/charcutaria-e-queijos/charcutaria/fiambre-mortadela-e-chouricao%E2%80%8B/fiambre-peito-de-peru-pingo-doce-991955.html",
        packageSize: 0.15,
      },
      {
        store: "AUCHAN",
        storeProductId: "3803966",
        url: "https://www.auchan.pt/pt/produtos-frescos/charcutaria/fiambre-de-peru-e-frango/fiambre-de-peito-peru-auchan-fatias-150g/3803966.html",
        packageSize: 0.15,
      },
    ],
  },
  {
    // 800 g four-pack. packageSize is the pack TOTAL, read from Continente's
    // own `emb. 4 x 200 gr` label - the multi-count format that
    // parsePackageSize() silently returned null for until it was extended.
    // Hold this beside the Cuétara sleeve below: same biscuit, €1,99/kg here
    // against €4,95/kg there, which is a bigger saving than any store switch
    // this tracker has turned up.
    name: "Bolacha Maria",
    category: "Mercearia",
    subcategory: "Bolachas", // new subcategory
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "6715842",
        url: "https://www.continente.pt/produto/bolachas-maria-continente-continente-6715842.html",
        packageSize: 0.8,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "673345",
        url: "https://www.pingodoce.pt/home/produtos/bolachas-cereais-e-guloseimas/bolachas-e-biscoitos/maria-manteiga-e-classicas/bolacha-maria-pack-4-pingo-doce-673345.html",
        packageSize: 0.8,
      },
      {
        store: "AUCHAN",
        storeProductId: "2202915",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/bolachas-e-bolos/bolacha-maria-manteiga-e-sortidos/bolacha-auchan-maria-4x200g/2202915.html",
        packageSize: 0.8,
      },
    ],
  },
  {
    // The caramelised-top line - separately priced, not a flavour variant, so
    // it gets its own group rather than being folded into plain Maria.
    name: "Bolacha Maria Dourada",
    category: "Mercearia",
    subcategory: "Bolachas",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "7384607",
        url: "https://www.continente.pt/produto/bolachas-maria-dourada-continente-continente-7384607.html",
        packageSize: 0.8,
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "819904",
        url: "https://www.pingodoce.pt/home/produtos/bolachas-cereais-e-guloseimas/bolachas-e-biscoitos/maria-manteiga-e-classicas/bolachas-maria-douradas-pingo-doce-819904.html",
        packageSize: 0.8,
      },
      {
        store: "AUCHAN",
        storeProductId: "2202923",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/bolachas-e-bolos/bolacha-maria-manteiga-e-sortidos/bolacha-auchan-maria-dourada-4x200g/2202923.html",
        packageSize: 0.8,
      },
    ],
  },
  {
    // Pingo Doce carries Cuétara Maria only as an 800 g pack, so it is not in
    // this group. Continente also lists an 800 g-looking "Bolachas Maria
    // Cuétara" (id 2060529) that is actually 600 g (3 x 200) - grouping these
    // on the name alone would have reported a size difference as a price gap.
    name: "Bolacha Maria Cuétara (200 g)",
    category: "Mercearia",
    subcategory: "Bolachas",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2003363",
        url: "https://www.continente.pt/produto/bolachas-maria-cuetara-cuetara-2003363.html",
        packageSize: 0.2,
      },
      {
        store: "AUCHAN",
        storeProductId: "55274",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/bolachas-e-bolos/bolacha-maria-manteiga-e-sortidos/bolacha-cuetara-maria-200g/55274.html",
        packageSize: 0.2,
      },
    ],
  },
  {
    // The one genuine store-to-store gap on this term: identical 177 g pack,
    // €1,01 at Continente against €1,39 at Pingo Doce - 38% apart. Auchan's
    // only Triunfo listing is a butter biscuit (168 g), not a Maria, so this
    // is a two-store group by evidence rather than by absence.
    name: "Bolacha Maria Triunfo",
    category: "Mercearia",
    subcategory: "Bolachas",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "8198671",
        url: "https://www.continente.pt/produto/bolachas-maria-triunfo-triunfo-8198671.html",
        packageSize: 0.177, // emb. 177 gr
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "985343",
        url: "https://www.pingodoce.pt/home/produtos/bolachas-cereais-e-guloseimas/bolachas-e-biscoitos/maria-manteiga-e-classicas/bolacha-maria-triunfo-985343.html",
        packageSize: 0.177, // page block: "0.177 Kg | 7,85 €/Kg"
      },
    ],
  },
  {
    // MID-PROMOTION when added: €5,99 is the recommended price at all three,
    // and Continente and Pingo Doce were both discounted to €3,89 that week.
    // The first snapshot therefore understates two of the three - expect this
    // row to show the promotion ending rather than a structural gap.
    name: "Café Moído Delta Origins Brasil",
    category: "Mercearia",
    subcategory: "Café",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "6278018",
        url: "https://www.continente.pt/produto/cafe-moido-torrado-moagem-universal-origins-brasil-int-9-delta-delta-6278018.html",
        packageSize: 0.22, // emb. 220 gr
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "748058",
        url: "https://www.pingodoce.pt/home/produtos/cafe-cha-e-achocolatados/cafe-moido-e-grao/cafe-moido-moagem-universal-brasil-delta-748058.html",
        packageSize: 0.22, // page block: "0.22 Kg | 17,68 €/Kg"
      },
      {
        store: "AUCHAN",
        storeProductId: "2533016",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/cafe-cha-e-infusao/cafe-de-maquina-grao-e-pastilhas/cafe-delta-moido-brasil-220g/2533016.html",
        packageSize: 0.22, // Quantidade Liquida: 0.22 KG
      },
    ],
  },
  {
    // Auchan's is the weakest weight evidence in this batch: that SKU publishes
    // no net-quantity attribute, so its 1 kg rests on the product name plus an
    // exact price match against the two independently confirmed 1 kg packs.
    name: "Café em Grão Delta Lote Superior",
    category: "Mercearia",
    subcategory: "Café",
    unit: "kg",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "2014662",
        url: "https://www.continente.pt/produto/cafe-em-grao-torrado-lote-superior-int-13-delta-delta-2014662.html",
        packageSize: 1, // emb. 1 kg
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "104362",
        url: "https://www.pingodoce.pt/home/produtos/cafe-cha-e-achocolatados/cafe-moido-e-grao/cafe-em-grao-torrado-lote-superior-delta-104362.html",
        packageSize: 1, // page block: "1 Kg | 25,99 €/Kg"
      },
      {
        store: "AUCHAN",
        storeProductId: "733968",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/cafe-cha-e-infusao/cafe-de-maquina-grao-e-pastilhas/cafe-delta-grao-lote-superior-1kg/733968.html",
        packageSize: 1, // name states 1KG; no net-quantity attribute published
      },
    ],
  },
  {
    // COUNTED, NOT WEIGHED. `unit: "un"` with the capsule count as packageSize,
    // giving € per capsule - the same mechanism the Ovos products use with egg
    // count. A capsule holds ~5 g, so this €3,99 box of ten would otherwise
    // read ~€70/kg and sit absurdly beside ground coffee at €17/kg. Nobody buys
    // capsules by the kilo. unitPrice() is price/packageSize, so no code change.
    //
    // This makes Café the first subcategory with mixed units - three rows in
    // €/kg and this one in €/un. That is correct: a capsule and a kilo of beans
    // are not comparable quantities.
    //
    // Delta Q system only. Delta Q, Nespresso-compatible and Dolce Gusto fit
    // different machines, so a group must hold exactly one system.
    name: "Cápsulas Delta Q Qharacter",
    category: "Mercearia",
    subcategory: "Café",
    unit: "un",
    listings: [
      {
        store: "CONTINENTE",
        storeProductId: "4107655",
        url: "https://www.continente.pt/produto/capsulas-de-cafe-qharacter-int-9-delta-q-delta-q-4107655.html",
        packageSize: 10, // emb. 10 un
      },
      {
        store: "PINGO_DOCE",
        storeProductId: "625870",
        url: "https://www.pingodoce.pt/home/produtos/cafe-cha-e-achocolatados/capsulas-de-cafe/capsulas-de-cafe-qharacter-delta-q-625870.html",
        packageSize: 10, // page block: "10 Un | 0,4 €/Un"
      },
      {
        store: "AUCHAN",
        storeProductId: "841840",
        url: "https://www.auchan.pt/pt/alimentacao/mercearia/cafe-cha-e-infusao/capsula-delta-q-e-compativeis/capsulas-delta-q-cafe-qharacter-10un/841840.html",
        packageSize: 10, // name states 10UN
      },
    ],
  },
];
