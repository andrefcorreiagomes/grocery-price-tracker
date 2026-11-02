import { parsePingoDocePage } from "../scrapers/pingodoce";
import { struckPricePromotion } from "../scrapers/struck-price";
import { sellablePrice } from "../scrapers/types";
import { parseContinentePage } from "../scrapers/continente";
import { parseAuchanTilesDetailed } from "../scrapers/search/auchan";

/**
 * The store page readers, on pieces of real pages. No network, no database.
 *
 * Each price box below is copied character for character from a Pingo Doce
 * product page saved on 22 October 2026; only the structured product block in
 * front of it is shortened to the fields the reader needs.
 */

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
}

const product = (name: string) => `<script type="application/ld+json">{"@type":"Product","name":"${name}","brand":{"name":"Pingo Doce"}}</script>`;

/** Abacate Hass (394616): sold by the kilo, 3,59 instead of 4,59, until 26/10. */
const AVOCADO =
  product("Abacate Hass") +
  `<div class="product-promotion-info"> <img class="product-tile-promo-label" src="x/A3.svg" alt="Poupe mais de 20%" title="Poupe mais de 20%" /> <span class="product-promo-end">Promo&ccedil;&atilde;o at&eacute; 26/10</span> </div> <div class="row"> <div class="col-12"> <div class="prices"> <div class="price"> <span class="price-container"> <span class="sales"> <span class="value" content="3.59"></span> 3,59 &euro;/Kg </span> <span class="strike-through list"> <span class="value" content="4.59"> <span class="sr-only"> Price reduced from </span> 4,59 &euro;/Kg <span class="sr-only"> to </span> </span> </span> </span> </div> </div> </div> </div>`;

/** Adoçante Líquido (992720): a pack, 3,03 instead of 4,05, until 26/10. */
const SWEETENER =
  product("Adoçante Líquido") +
  `<div class="product-promotion-info"> <img class="product-tile-promo-label" src="x/A4.svg" alt="Poupe 25%" title="Poupe 25%" /> <span class="product-promo-end">Promo&ccedil;&atilde;o at&eacute; 26/10</span> </div> <div class="row"> <div class="col-12"> <div class="prices"> <div class="price"> <span class="price-container"> <span class="sales"> <span class="value" content="3.03"></span> 3,03 &euro; </span> <span class="strike-through list"> <span class="value" content="4.05"> <span class="sr-only"> Price reduced from </span> 4,05 &euro; <span class="sr-only"> to </span> </span> </span> </span> </div> </div> </div> </div>`;

/** Azeite Pet (697573): a "Preço Garantido" badge and an EMPTY promotion box - no price cut. */
const GUARANTEED =
  product("Azeite Pet") +
  `<div class="product-promotion-info"> <img class="product-tile-promo-label" src="x/PG.svg" alt="Pre&ccedil;o Garantido" title="Pre&ccedil;o Garantido" /> <span class="product-promo-end"></span> </div> <div class="row"> <div class="col-12"> <div class="prices"> <div class="price"> <span class="price-container"> <span class="sales"> <span class="value" content="4.49"></span> 4,49 &euro; </span> </span> </div> </div> </div> </div>`;

/** Arroz Doce Pack 4 (942178): below the recommended price ("PVPR"), which is not a promotion. */
const BELOW_PVPR =
  product("Arroz Doce Pack 4") +
  `<div class="product-promotion-info"> <img class="product-tile-promo-label" src="x/H8.svg" alt="Poupe mais de 15%" title="Poupe mais de 15%" /> </div> <div class="row"> <div class="col-12"> <div class="prices"> <div class="price"> <span class="price-container"> <span class="sales"> <span class="value" content="2.79"></span> 2,79 &euro; </span> <span class="pvpr-label wishlist-pvpr-label-desktop"> PVPR 3,36 &euro; </span> </span> </div> </div> <span class="product-pvpr-info">Por PVPR deve entender-se o pre&ccedil;o de venda sugerido ou recomendado pelo fabricante, produtor ou fornecedor.</span> </div> </div>`;

/** A page with no promotion box at all. */
const PLAIN = product("Azeite") + `<div class="prices"><div class="price"><span class="sales">3,39 &euro;</span></div></div>`;

/** Listed but not for sale: "0,00 €", with a promotion box that once said otherwise. */
const UNAVAILABLE =
  product("Bolo") +
  `<div class="product-promotion-info"><span class="product-promo-end">Promo&ccedil;&atilde;o at&eacute; 26/10</span></div><div class="prices"><div class="price"><span class="sales">0,00 &euro;</span><span class="strike-through list"><span class="value" content="2.10">2,10 &euro;</span></span></div></div>`;

/** Gelado de Café Caramel Latte (992086), 29 October 2026: unavailable, the price shown as the word "null". */
const UNAVAILABLE_NULL =
  product("Gelado de Café Caramel Latte") +
  `<div class="add-to-cart" data-endpoint-add-to-cart="/on/demandware.store/Sites-pingo-doce-Site/default/Cart-AddProduct"> <div class="product-unavailable"> <div class="btn btn-product-unavailable" aria-label="product unavailable"> <span>Indispon&iacute;vel</span> </div> </div></div>` +
  `<div class="prices"> <div class="price"> <span class="price-container"> <span class="sales"> <span class="value" content="null"></span> null </span> </span> </div> </div>`;
/** The same price box with no "product unavailable" box: not enough to call it unavailable. */
const NULL_ALONE = product("Gelado") + UNAVAILABLE_NULL.slice(UNAVAILABLE_NULL.indexOf(`<div class="prices">`));

/**
 * Whole product pages for the two readers that read one page per product
 * (code review M13). Unlike the pieces above these are REBUILT, not copied:
 * each holds the markup the reader's own comments quote from real pages (the
 * `&amp;ean=` nutrition address, the escaped dataLayer with
 * `pre_discount_price` and four `item_category` levels, Pingo Doce's
 * "0.4 Kg | 9,98 €/Kg" size label), with everything else left out. Pieces of
 * real pages would be better, and can replace these when pages are next read.
 */
const escaped = (json: string) => json.replace(/"/g, "&quot;");
const CONTINENTE_PAGE =
  `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Iogurte Grego Natural Oikos","brand":{"name":"Oikos"},"offers":{"@type":"Offer","price":"3.89","priceCurrency":"EUR"}}</script>` +
  `<div class="ct-pdp--prices"><span class="pwc-tile--price-primary">3,89€</span><span class="pwc-tile--price-secondary">8,46€/kg</span></div>` +
  `<span class="ct-pdp--unit">emb. 4 x 115 gr</span>` +
  `<a href="/nutrition?pid=4696048&amp;ean=5601234567897">Informação nutricional</a>` +
  `<script>dataLayer.push(${escaped('{"ecommerce":{"items":[{"item_category":"Supermercado","item_category2":"Laticínios e Ovos","item_category3":"Iogurtes e Outros Lácteos","item_category4":"Gregos","discount":1.1,"pre_discount_price":4.99}]}}')})</script>`;
const PINGO_DOCE_PAGE =
  `<script type="application/ld+json">{"@type":"Product","name":"Pão de Forma Integral","brand":{"name":"Nossa Padaria"}}</script>` +
  `<h1 class="product-unit-measure">0.4 Kg | 9,98 €/Kg</h1>` +
  `<div class="prices"><div class="price"><span class="sales"><span class="value" content="3.99"></span> 3,99 &euro; </span></div></div>`;

export function verifyStorePages(): number {
  failures = 0;
  console.log("  whole product pages, rebuilt from the markup the readers quote (code review M13)");
  const co = parseContinentePage(CONTINENTE_PAGE, "https://www.continente.pt/produto/iogurte-4696048.html");
  check("Continente: name, brand, price and barcode", co.name === "Iogurte Grego Natural Oikos" && co.brand === "Oikos" && co.price === 3.89 && co.ean === "5601234567897",
    `${co.name} | ${co.brand} | ${co.price} | ${co.ean}`);
  check("Continente: the shelf, four levels with Supermercado dropped", co.categoryPath === "Laticínios e Ovos/Iogurtes e Outros Lácteos/Gregos", String(co.categoryPath));
  check("Continente: 4 x 115 g is 0.46 kg, and the price per kilo is the one shown",
    co.packageUnit === "kg" && Math.abs((co.packageSize ?? 0) - 0.46) < 1e-9 && co.shownUnitPrice?.value === 8.46, `${co.packageSize} ${co.packageUnit}`);
  check("Continente: a price before the discount above today's is a promotion", co.onPromotion && co.regularPrice === 4.99);
  const coOwn = parseContinentePage(
    CONTINENTE_PAGE.replace('"brand":{"name":"Oikos"},', "").replace(/,&quot;discount&quot;:1\.1,&quot;pre_discount_price&quot;:4\.99/, ""),
    "co-own"
  );
  check("Continente: no brand is its own range, and no price before the discount is no promotion",
    coOwn.brand === "Continente" && !coOwn.onPromotion && coOwn.regularPrice === null);
  const pd = parsePingoDocePage(PINGO_DOCE_PAGE, "https://www.pingodoce.pt/home/produtos/padaria-e-pastelaria/pao/pao-de-forma-integral-123456.html");
  check("Pingo Doce: price, size from the label, and the price per kilo shown",
    pd.price === 3.99 && pd.packageSize === 0.4 && pd.packageUnit === "kg" && pd.shownUnitPrice?.value === 9.98, `${pd.price} ${pd.packageSize} ${pd.packageUnit} ${pd.shownUnitPrice?.value}`);
  check("Pingo Doce: its own counter (\"Nossa Padaria\") is its own brand", pd.brand === "Pingo Doce", pd.brand ?? "");
  check("Pingo Doce: no shelf from the page (it comes from the address) and no barcode", pd.categoryPath === null && pd.ean === null);
  check("Pingo Doce: a page with a price is for sale", pd.availability === "for_sale" && pd.availabilitySign === "price shown");

  console.log("\n  the crossed-out-price rule (Auchan tiles and Pingo Doce pages)");
  check("an earlier price above today's is a promotion", struckPricePromotion("Price reduced from 4,59 €/Kg to", 3.59).regularPrice === 4.59);
  check("a dot as the decimal mark reads too", struckPricePromotion("4.05", 3.03).regularPrice === 4.05);
  check("an earlier price not above today's is not", !struckPricePromotion("3,03 €", 3.03).onPromotion);
  check("no crossed-out price is not", !struckPricePromotion("", 3.03).onPromotion && !struckPricePromotion(null, 3.03).onPromotion);
  check("no price today is not", !struckPricePromotion("4,05 €", null).onPromotion);

  console.log("\n  Pingo Doce product pages (saved 22 October 2026)");
  const avocado = parsePingoDocePage(AVOCADO, "avocado");
  check("a kilo price cut is a promotion, with the earlier price per kilo", avocado.onPromotion && avocado.price === 3.59 && avocado.regularPrice === 4.59,
    `${avocado.price} was ${avocado.regularPrice}`);
  check("and its end date", avocado.promoEndsAt !== null && avocado.promoEndsAt.getUTCDate() === 26 && avocado.promoEndsAt.getUTCMonth() === 9);
  check("a kilo price is still read as per kilo", avocado.packageSize === 1 && avocado.packageUnit === "kg" && avocado.shownUnitPrice?.value === 3.59);
  const sweetener = parsePingoDocePage(SWEETENER, "sweetener");
  check("a pack price cut is a promotion, with the earlier pack price", sweetener.onPromotion && sweetener.price === 3.03 && sweetener.regularPrice === 4.05);
  const guaranteed = parsePingoDocePage(GUARANTEED, "guaranteed");
  check("an empty promotion box (Preço Garantido) is NOT a promotion", !guaranteed.onPromotion && guaranteed.regularPrice === null && guaranteed.promoEndsAt === null);
  const pvpr = parsePingoDocePage(BELOW_PVPR, "pvpr");
  check("a price below the recommended price (PVPR) is NOT a promotion", !pvpr.onPromotion && pvpr.regularPrice === null && pvpr.price === 2.79);
  check("a page with no promotion box is not one", !parsePingoDocePage(PLAIN, "plain").onPromotion);
  const unavailable = parsePingoDocePage(UNAVAILABLE, "unavailable");
  check("a product not for sale is never on promotion", unavailable.price === null && !unavailable.onPromotion);
  check("\"0,00\" is not for sale, and says so", unavailable.availability === "not_for_sale" && unavailable.availabilitySign === "price shown as 0,00");
  const unavailableNull = parsePingoDocePage(UNAVAILABLE_NULL, "unavailable-null");
  check("\"null\" with the unavailable box is not for sale, and is read", unavailableNull.price === null && unavailableNull.name === "Gelado de Café Caramel Latte" &&
    unavailableNull.availability === "not_for_sale");
  let nullAlone = "read";
  try {
    parsePingoDocePage(NULL_ALONE, "null-alone");
  } catch (e) {
    nullAlone = (e as Error).message;
  }
  check("\"null\" without the unavailable box is still unreadable", nullAlone !== "read", nullAlone.slice(0, 60));
  console.log("\n  a zero is never a price, at any store (code review M9)");
  check("0, one cent, nothing and an unreadable number are no price",
    [0, 0.01, null, undefined, NaN].every((v) => sellablePrice(v) === null));
  check("five cents is a price", sellablePrice(0.05) === 0.05);
  const zeroAtContinente = parseContinentePage(
    `<script type="application/ld+json">{"@type":"Product","name":"Pão","offers":{"price":"0.00"}}</script>`,
    "co"
  );
  check("Continente: a page priced 0 is listed, not for sale", zeroAtContinente.price === null && !zeroAtContinente.onPromotion);
  // Out of stock (31 October 2026): the milk 8168224 as its page read that day,
  // one carton's price for a pack of six.
  const coStock = (availability: string | null) =>
    parseContinentePage(
      `<script type="application/ld+json">{"@type":"Product","name":"Leite Meio Gordo Bio Prado Verde","offers":{"price":"1.29"${
        availability === null ? "" : `,"availability":"${availability}"`
      }}}</script>` +
        `<div class="ct-pdp--prices"><span class="pwc-tile--price-primary">1,29€</span><span class="pwc-tile--price-secondary">0,22€/lt</span></div>` +
        `<div class="ct-pdp--unit">emb. 6 x 1 lt</div>` +
        `&quot;pre_discount_price&quot;:1.49`,
      "co-stock"
    );
  const outOfStock = coStock("https://schema.org/OutOfStock");
  // The owner's rule, 1 November 2026: keep the price it shows, mark it.
  check("Continente: an OutOfStock page keeps the price it shows, marked out of stock",
    outOfStock.price === 1.29 && outOfStock.availability === "not_for_sale", `${outOfStock.price} ${outOfStock.availability}`);
  check("and says what it went by", outOfStock.availabilitySign === "page data: OutOfStock", outOfStock.availabilitySign);
  check("and the promotion it shows", outOfStock.onPromotion && outOfStock.regularPrice === 1.49);
  check(
    "and it keeps its size, read with the price the page shows",
    outOfStock.packageSize === 6 && outOfStock.packageUnit === "l",
    `${outOfStock.packageSize} ${outOfStock.packageUnit}`
  );
  check("the old http:// spelling is out of stock too", coStock("http://schema.org/OutOfStock").availability === "not_for_sale");
  check("an InStock page keeps its price, for sale", coStock("https://schema.org/InStock").price === 1.29 && coStock("https://schema.org/InStock").availability === "for_sale");
  check("a page that states no availability keeps its price, and says it cannot tell",
    coStock(null).price === 1.29 && coStock(null).availability === "unknown", coStock(null).availability);
  check("an availability word never seen before is unknown, not for sale",
    coStock("https://schema.org/SomethingNew").availability === "unknown" && coStock("https://schema.org/SomethingNew").availabilitySign === "page data: SomethingNew");
  check("Continente: a page priced 0 is marked out of stock too", zeroAtContinente.availability === "not_for_sale" && zeroAtContinente.availabilitySign === "no sellable price shown");
  // Tinned fish by its drained weight (31 October 2026): the label as on
  // Ramirez tuna's page that day, at 1,49 EUR and 17,33 EUR/kg.
  const coTin = (name: string, label: string) =>
    parseContinentePage(
      `<script type="application/ld+json">{"@type":"Product","name":"${name}","offers":{"price":"1.49"}}</script>` +
        `<div class="ct-pdp--prices"><span class="pwc-tile--price-primary">1,49€</span><span class="pwc-tile--price-secondary">17,33€/kg</span></div>` +
        `<div class="ct-pdp--unit">${label}</div>`,
      "co-tin"
    );
  const tuna = coTin("Atum em Azeite Ramirez", "emb. 120 gr (peso escorrido 86 gr)");
  check("Continente: tinned fish is the drained weight on its label", tuna.packageSize === 0.086, String(tuna.packageSize));
  // Every tin by its drained weight where the label gives it (the owner's
  // rule, the same evening); labels as on the pages opened then.
  check("Continente: every other tin is the drained weight on its label too",
    coTin("Feijão Preto Cozido Continente", "emb. 820 gr (peso escorrido 520 gr)").packageSize === 0.52 &&
      coTin("Pêssego em Calda Continente", "emb. 840 gr (peso escorrido 480 gr)").packageSize === 0.48);
  const corn = coTin("Milho Doce em Lata sem Glúten Continente", "emb. 3 x 150 gr (peso escorrido 3 x 140 gr)");
  check("Continente: a multipack's drained weight counts every tin", Math.abs((corn.packageSize ?? 0) - 0.42) < 1e-9, String(corn.packageSize));
  check("a fish tin with one weight on its label keeps it", coTin("Atum Posta em Azeite Santa Catarina", "emb. 80 gr").packageSize === 0.08);
  const tile = (price: string) =>
    `<div data-gtm='{"id":"1","name":"PAO","price":"${price}","category":"alimentacao/padaria"}' data-urls='{"absoluteProductUrl":"https://www.auchan.pt/p/1.html"}'></div>`;
  const zeroTile = parseAuchanTilesDetailed(tile("0.00"));
  check("Auchan: a tile priced 0 is skipped as unpriced, like one with no price", zeroTile.hits.length === 0 && zeroTile.unpriced === 1);
  check("Auchan: a real price still reads", parseAuchanTilesDetailed(tile("1.29")).hits[0]?.price === 1.29);

  // Out of stock on a listing tile: the hot-dog sausages' tile on the pork-
  // sausage shelf, 31 October 2026 - still priced 1,29 EUR at 3,69 EUR/kg, a
  // struck-through price added here to check no promotion is recorded.
  const sausageTile = (classes: string) =>
    `<div class="${classes}" data-gtm='{"id":"3931536","name":"SALSICHAS HOTDOG IZIDORO 6 UN","price":"1.29","category":"alimentacao/mercearia/conservas/salsichas-porco"}' ` +
    `data-urls='{"absoluteProductUrl":"https://www.auchan.pt/p/3931536.html"}'>` +
    `<span class="auc-price__stricked">1,59 &euro;</span><span class="auc-measures--price-per-unit">3.69 &euro;/Kg</span></div>`;
  const marked = parseAuchanTilesDetailed(sausageTile("product-tile auc-product-tile auc-js-product-tile auc-product-unavailable"));
  const unmarked = parseAuchanTilesDetailed(sausageTile("product-tile auc-product-tile auc-js-product-tile"));
  check("Auchan: a tile marked out of stock is kept with its price, marked", marked.hits.length === 1 && marked.hits[0].price === 1.29 && marked.hits[0].availability === "not_for_sale",
    JSON.stringify(marked.hits[0]));
  check("Auchan: a tile marked out of stock is counted, and not as unpriced", marked.markedUnavailable === 1 && marked.unpriced === 0);
  check("Auchan: a tile marked out of stock keeps the size its price shows",
    marked.hits[0]?.packageSize === unmarked.hits[0]?.packageSize && marked.hits[0]?.packageSize != null,
    `${marked.hits[0]?.packageSize} vs ${unmarked.hits[0]?.packageSize}`);
  check("Auchan: a tile marked out of stock keeps the promotion it shows",
    marked.hits[0]?.onPromotion === true && marked.hits[0]?.regularPrice === 1.59);
  check("Auchan: an unmarked tile keeps its price, for sale, not counted",
    unmarked.hits[0]?.price === 1.29 && unmarked.hits[0]?.availability === "for_sale" && unmarked.markedUnavailable === 0);
  return failures;
}

// Run directly, not when imported by verify-nightly.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("verify-store-pages.ts")) {
  const n = verifyStorePages();
  console.log(`\n${n === 0 ? "all checks passed" : `${n} CHECK(S) FAILED`}`);
  if (n > 0) process.exitCode = 1;
}
