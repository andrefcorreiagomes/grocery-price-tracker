import { parseCategoryPath } from "../scrapers/continente";
import { addressToStore } from "../scrapers/crawl/continente-products";
import {
  CONTINENTE_FOOD_SECTIONS,
  CONTINENTE_SECTION_SLUGS,
  auditCategorySlugs,
  parseCategoryPaths,
  parseCategorySlugs,
  withoutSupermercado,
} from "../scrapers/crawl/continente-categories";
import { NON_FOOD_LIMIT, isNonFoodCatastrophe } from "../scrapers/crawl/reidentification";
import { keepInCatalogue } from "../lib/catalogue-filter";

/**
 * Continente's layout of 18 October 2026, checked on what its pages really
 * send. Each snippet below is copied byte for byte from a product page saved on
 * 19 October (the analytics block that names the product's shelf), so the
 * checks need no request. That night every product read as non-food: a new top
 * level, "Supermercado", our section list did not know, and a fourth shelf
 * level our reader did not read.
 */
export function verifyContinentePages(): number {
  let failures = 0;
  const check = (label: string, ok: boolean, detail = "") => {
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
  };

  const q = "&quot;";
  const page = (levels: string[], listId = "x") =>
    levels.map((v, i) => `${q}item_category${i === 0 ? "" : i + 1}${q}:${q}${v}${q}`).join(",") +
    `,${q}item_list_id${q}:${q}${listId}${q}`;

  // --- the shelf path ------------------------------------------------------
  const yoghurt = page(["Supermercado", "Latic&iacute;nios e Ovos", "Iogurtes e Outros L&aacute;cteos", "Gregos"], "laticinios-iogurtes-gregos");
  const wine = page(["Supermercado", "Bebidas e Garrafeira", "Vinhos", "Vinho Branco"], "bebidas-vinho-branco");
  const biscuits = page(["Supermercado", "Mercearia", "Bolachas e Biscoitos", "Bolachas com Cobertura e Recheio"]);
  const pies = page(["Supermercado", "Congelados", "Salgados e Folhados", "Salgados"]);
  const bread = page(["Supermercado", "Padaria e Pastelaria", "P&atilde;o do Dia e Broa"], "padaria-e-pastelaria-padaria-fresco");
  const bar = page(["Supermercado", "Suplementos e Nutri&ccedil;&atilde;o", "Alimenta&ccedil;&atilde;o Desportiva", "Barras Proteicas"]);

  // Each product's path as we stored it on 3 October, before the change.
  check(
    "a moved-down section reads exactly as before: all four levels, without \"Supermercado\"",
    parseCategoryPath(yoghurt) === "Laticínios e Ovos/Iogurtes e Outros Lácteos/Gregos",
    String(parseCategoryPath(yoghurt))
  );
  check("the same for wine", parseCategoryPath(wine) === "Bebidas e Garrafeira/Vinhos/Vinho Branco");
  check(
    "the same for biscuits",
    parseCategoryPath(biscuits) === "Mercearia/Bolachas e Biscoitos/Bolachas com Cobertura e Recheio"
  );
  check("the same for frozen pies", parseCategoryPath(pies) === "Congelados/Salgados e Folhados/Salgados");
  check(
    "a former \"Frescos\" shelf is now a top section",
    parseCategoryPath(bread) === "Padaria e Pastelaria/Pão do Dia e Broa",
    String(parseCategoryPath(bread))
  );
  check(
    "a page from before the change still reads as it did",
    parseCategoryPath(page(["Frescos", "Frutas", "Ma&ccedil;&atilde;"])) === "Frescos/Frutas/Maçã"
  );
  check(
    "a space after the colon does not lose the shelf",
    parseCategoryPath(`"item_category": "Supermercado", "item_category2": "Talho"`) === "Talho"
  );
  check("a page with no shelf at all gives none", parseCategoryPath("<html></html>") === null);

  // --- the section list ------------------------------------------------------
  const keep = (snippet: string, name = "Produto") =>
    keepInCatalogue("CONTINENTE", parseCategoryPath(snippet), name).keep;
  check(
    "all six products from the saved pages are kept as food",
    [yoghurt, wine, biscuits, pies, bread, bar].every((s) => keep(s))
  );
  for (const shelf of ["Peixaria", "Talho", "Frutas e Legumes", "Charcutaria e Queijos", "Refeições Práticas"]) {
    check(`"${shelf}" is a food section`, keepInCatalogue("CONTINENTE", `${shelf}/Outros`, "Produto").keep);
  }
  check(
    "supplements are left out on the new layout",
    !keepInCatalogue("CONTINENTE", "Suplementos e Nutrição/Suplementos Alimentares/Multivitamínicos", "Produto").keep
  );
  check(
    "protein powders are left out on the new layout",
    !keepInCatalogue("CONTINENTE", "Suplementos e Nutrição/Performance Desportiva/Proteína", "Produto").keep
  );
  check(
    "weight-control products are left out",
    !keepInCatalogue("CONTINENTE", "Suplementos e Nutrição/Controlo de Peso/Termogénicos", "Produto").keep
  );
  check(
    "hygiene is not food",
    !keepInCatalogue("CONTINENTE", "Higiene e Cuidado Pessoal/Cabelo", "Champô").keep
  );

  // --- the category sitemap and the section counts --------------------------
  const sitemap = [
    "https://www.continente.pt/",
    "https://www.continente.pt/supermercado/",
    "https://www.continente.pt/supermercado/mercearia/",
    "https://www.continente.pt/supermercado/mercearia/conservas/",
    "https://www.continente.pt/beleza/cabelo/",
    "https://www.continente.pt/garrafeira/",
  ]
    .map((u) => `<loc>${u}</loc>`)
    .join("");
  check(
    "the category sitemap drops \"supermercado\" as the page reader does",
    parseCategoryPaths(sitemap).join() === "mercearia,mercearia/conservas,beleza/cabelo,garrafeira",
    parseCategoryPaths(sitemap).join()
  );
  check("and its top sections are read the same way", parseCategorySlugs(sitemap).join() === "mercearia,garrafeira");
  check(
    "every top section the test run of 19 October found is decided",
    auditCategorySlugs(["beleza", "cultura-e-lazer", "destaques", "garrafeira", "folhetos-pesquisa", "sugestoes-continente", "mercearia", "peixaria"]).length === 0
  );
  check("\"supermercado\" is taken off only at the front", withoutSupermercado("mercearia/supermercado") === "mercearia/supermercado");
  check(
    "every section counted against the store is a food section of ours",
    [...CONTINENTE_SECTION_SLUGS.keys()].every((label) => CONTINENTE_FOOD_SECTIONS.has(label))
  );
  check(
    "and every food section of the new layout is counted",
    ["Padaria e Pastelaria", "Peixaria", "Talho", "Frutas e Legumes", "Charcutaria e Queijos", "Refeições Práticas",
      "Mercearia", "Bebidas e Garrafeira", "Laticínios e Ovos", "Congelados"].every((l) => CONTINENTE_SECTION_SLUGS.has(l))
  );
  check(
    "each count is read from a page under supermercado/",
    [...CONTINENTE_SECTION_SLUGS.values()].every((slug) => slug.startsWith("supermercado/"))
  );

  // --- the "not food" safety limit ---------------------------------------
  check(`the limit is 5%`, NON_FOOD_LIMIT === 0.05);
  check("a normal night does not trip it (141 of 17,264, 3 October)", !isNonFoodCatastrophe({ nonFood: 141, attempted: 17_264 }));
  check("the night of 18 October trips it (2,971 of 3,200)", isNonFoodCatastrophe({ nonFood: 2_971, attempted: 3_200 }));
  check("exactly 5% does not trip it", !isNonFoodCatastrophe({ nonFood: 50, attempted: 1_000 }));
  check("a 20-product test run with 2 non-food trips it", isNonFoodCatastrophe({ nonFood: 2, attempted: 20 }));
  check("nothing attempted trips nothing", !isNonFoodCatastrophe({ nonFood: 0, attempted: 0 }));

  // --- moved addresses -------------------------------------------------------
  const target = {
    storeProductId: "7477269",
    url: "https://www.continente.pt/produto/iogurte-grego-stracciatella-mimosa-mimosa-7477269.html",
  };
  const moved = "https://www.continente.pt/produto/iogurte-grego-stracciatella-mimosa-7477269.html";
  check("a moved product's new address is stored", addressToStore(target, moved) === moved);
  check("an unmoved product keeps its address", addressToStore(target, target.url) === target.url);
  check(
    "a redirect to another product's page is not stored",
    addressToStore(target, "https://www.continente.pt/produto/outro-produto-1234567.html") === target.url
  );
  check("a redirect to the home page is not stored", addressToStore(target, "https://www.continente.pt/") === target.url);
  check("no final address keeps the stored one", addressToStore(target, undefined) === target.url);

  return failures;
}
