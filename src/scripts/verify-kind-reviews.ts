import { REVIEWED_GROUPS, REVIEWED_PRODUCTS } from "../../data/kind-reviews";
import { FOOD_TYPE_BY_ID, classifyFoodType } from "../lib/food-types";
import { decideKind, shelfKey } from "../lib/kind-decisions";
import { certaintyOf } from "../lib/kind-certainty";

/**
 * The review decisions (data/kind-reviews.ts) are well-formed, and the stored
 * kind follows them: a reviewed product wins over everything, a reviewed group
 * confirms or corrects what the classifier says, and anything reviewed counts
 * as certain. Pure - no database.
 */
export function verifyKindReviews(): number {
  let failures = 0;
  const check = (label: string, ok: boolean, detail = "") => {
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
  };

  // --- the file itself --------------------------------------------------------
  const unknown = [
    ...REVIEWED_GROUPS.flatMap((g) => [g.kind, g.becomes].filter((k): k is string => !!k)),
    ...REVIEWED_PRODUCTS.map((p) => p.kind).filter((k): k is string => k !== null),
  ].filter((k) => !FOOD_TYPE_BY_ID.has(k));
  check("every kind named in a review exists", unknown.length === 0, unknown.join(", "));
  const productKeys = REVIEWED_PRODUCTS.map((p) => `${p.store}\t${p.id}`);
  check("no product is reviewed twice", new Set(productKeys).size === productKeys.length);
  const groupKeys = REVIEWED_GROUPS.map((g) => [g.store, g.shelf, g.kind, g.step].join("\t"));
  check("no group is reviewed twice", new Set(groupKeys).size === groupKeys.length);
  check("every group names a step the classifier uses", REVIEWED_GROUPS.every((g) => ["head", "cut", "shelf"].includes(g.step)));
  check("the shelf key is the last two levels", shelfKey("a/b/c") === "b/c" && shelfKey(null) === "(none)");

  // --- what decideKind does with it ---------------------------------------------
  const pork = decideKind({
    store: "AUCHAN", storeProductId: "3986638", name: "COSTELA DE PORCO AUCHAN KG",
    categoryPath: "produtos-frescos/talho/vitela-e-novilho",
  });
  check("a reviewed product gets its reviewed kind (a pork rib on the beef shelf)", pork.id === "porco" && pork.reviewed?.by === "product", String(pork.id));
  const noKind = decideKind({
    store: "AUCHAN", storeProductId: "3929033", name: "SUSHI KIT SAITAKU 361G",
    categoryPath: "alimentação/sabores-do-mundo/cozinha-asiática/preparados-e-refeições-rápidas",
  });
  check("a product reviewed as no kind gets none", noKind.id === null && noKind.reviewed?.by === "product");
  const snack = decideKind({
    store: "CONTINENTE", storeProductId: "test-1", name: "Coxinhas de Frango Continente",
    categoryPath: "Congelados/Salgados e Folhados/Salgados",
  });
  check("a corrected group becomes its new kind (snacks were puff pastry)", snack.id === "refeicao" && snack.e.id === "folhado", `${snack.e.id} -> ${snack.id}`);
  const ribs = decideKind({ store: "CONTINENTE", storeProductId: "test-2", name: "Bifanas de Porco Continente", categoryPath: "Talho/Porco" });
  check("a confirmed group keeps its kind, marked as reviewed", ribs.id === "porco" && ribs.reviewed?.by === "group");
  const elsewhere = decideKind({ store: "PINGO_DOCE", storeProductId: "test-3", name: "Bifanas de Porco", categoryPath: "Talho/Novo" });
  check("a group does not reach another shelf", elsewhere.reviewed === null);
  const index = new Map();
  check("anything reviewed counts as certain",
    certaintyOf({ store: "CONTINENTE", storeProductId: "test-2", name: "Bifanas de Porco Continente", categoryPath: "Talho/Porco", eanNormalized: null }, index).level === "high");

  // --- the rules that came with batch 1 -------------------------------------------
  const is = (name: string, store: string, path: string, want: string | null) =>
    check(`${name.slice(0, 40).padEnd(40)} -> ${String(want)}`, classifyFoodType(name, store, path) === want, `got ${classifyFoodType(name, store, path)}`);
  console.log("\n  rules approved with batch 1");
  is("MINI RISSÓIS DE CARNE AUCHAN PARA FORNO 28UN 600G", "AUCHAN", "congelados/refeições-rápidas/salgados-e-petiscos", "rissol");
  is("Mini Pepino Biológico Continente Bio", "CONTINENTE", "Frutas e Legumes/Legumes/Pepino e Pimento", "pepino");
  const toasts = "alimentação/mercearia/tostas-e-pão-embalado/tostas,-mini-tostas-e-gressinos";
  is("TOSTAS AUCHAN DE TRIGO 270G", "AUCHAN", toasts, "tosta");
  is("GRESSINOS AUCHAN 250G", "AUCHAN", toasts, "tosta");
  is("Tostas com Alecrim", "PINGO_DOCE", "Bolachas, Cereais e Guloseimas/Bolachas e Biscoitos/Tostas Gressinos e Croutons", "tosta");
  is("CROUTONS AUCHAN COM ALHO 100G", "AUCHAN", toasts, null);
  is("Tosta Mista", "PINGO_DOCE", "Take Away/Sandes e Wraps", null);
  is("BRUSCHETTA PONTI TOMATE 130G", "AUCHAN", "alimentação/mercearia/conservas/patés-e-pastas", null);
  is("YOFU ALPRO SOJA NATURAL 4X125G", "AUCHAN", "alimentação/produtos-lácteos/iogurtes/soja-e-vegetais", "vegurte");
  is("SOJAGURTE SOJASUN NATURAL 6X100G", "AUCHAN", "alimentação/produtos-lácteos/iogurtes/soja-e-vegetais", "vegurte");

  return failures;
}
