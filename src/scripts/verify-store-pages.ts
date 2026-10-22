import { parsePingoDocePage } from "../scrapers/pingodoce";
import { struckPricePromotion } from "../scrapers/struck-price";

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

export function verifyStorePages(): number {
  failures = 0;
  console.log("  the crossed-out-price rule (Auchan tiles and Pingo Doce pages)");
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
  return failures;
}

// Run directly, not when imported by verify-nightly.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("verify-store-pages.ts")) {
  const n = verifyStorePages();
  console.log(`\n${n === 0 ? "all checks passed" : `${n} CHECK(S) FAILED`}`);
  if (n > 0) process.exitCode = 1;
}
