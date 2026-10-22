import { buildCabaz, parseSelection, serializeSelection, type CabazCell, type CabazProduct } from "../lib/cabaz";

/**
 * The basket's sums (src/lib/cabaz.ts), which had no checks before 22 October
 * 2026 (code review M6). Pure: no database, no network. The stores are in
 * STORE_ORDER: Continente, Pingo Doce, Auchan.
 */

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
}

const price = (unitPrice: number): CabazCell => ({ kind: "price", unitPrice, productName: "p", promotion: null });
const notSold: CabazCell = { kind: "not-stocked" };
const noSize: CabazCell = { kind: "no-size", productName: "sem peso" };
const line = (id: string, cells: CabazCell[]): CabazProduct => ({ id, name: id, unit: "kg", cells });

const MILK = line("leite", [price(0.89), price(0.85), price(0.95)]);
const RICE = line("arroz", [price(1.2), price(1.1), price(1.3)]);
const SALMON = line("salmao", [price(15), notSold, price(14)]);
const EGGS = line("ovos", [price(2), noSize, notSold]);
const SAME = line("sal", [price(0.5), price(0.5), price(0.5)]);
const ALL = [MILK, RICE, SALMON, EGGS, SAME];

export function verifyBasket(): number {
  failures = 0;

  const two = buildCabaz(ALL, [{ productId: "leite", quantity: 2 }, { productId: "arroz", quantity: 1 }]);
  check("each store's total adds its own prices times the quantities",
    two.totals.map((t) => t?.toFixed(2)).join() === "2.98,2.80,3.20", two.totals.join());
  check("the cheapest total is marked", two.cheapestStores.join() === "PINGO_DOCE");
  check("every chosen item counts when all three stores price it", two.includedCount === 2 && two.selectedCount === 2 && two.exclusions.length === 0);

  const withSalmon = buildCabaz(ALL, [{ productId: "leite", quantity: 1 }, { productId: "salmao", quantity: 1 }]);
  check("an item one store does not sell is left out of EVERY total, so all compare the same products",
    withSalmon.includedCount === 1 && withSalmon.totals.map((t) => t?.toFixed(2)).join() === "0.89,0.85,0.95", withSalmon.totals.join());
  check("and is listed under \"fora da comparação\" with the store that does not sell it",
    withSalmon.exclusions.length === 1 && withSalmon.exclusions[0].blockers.map((b) => `${b.store}:${b.kind}`).join() === "PINGO_DOCE:not-stocked");

  // The second line (the user's design, 22 October 2026): nothing is dropped.
  check("the full total adds everything each store has: salmon counts where it is sold",
    withSalmon.fullTotals.map((t) => t?.toFixed(2)).join() === "15.89,0.85,14.95", withSalmon.fullTotals.join());
  check("and each store's missing items are named", withSalmon.missing.map((m) => m.map((p) => p.id).join("+")).join("|") === "|salmao|");
  check("the cheapest store is named only on the comparable total", withSalmon.cheapestStores.join() === "PINGO_DOCE");
  const userExample = buildCabaz(
    [line("A", [price(4), price(4), price(4)]), line("B", [price(5), price(5), price(5)]), line("C", [price(6), notSold, price(6)])],
    [{ productId: "A", quantity: 1 }, { productId: "B", quantity: 1 }, { productId: "C", quantity: 1 }]
  );
  check("the user's example: A+B is 9 everywhere; with everything, 15, 9 lacking C, 15",
    userExample.totals.join() === "9,9,9" && userExample.fullTotals.join() === "15,9,15" && userExample.missing[1].map((p) => p.id).join() === "C",
    `${userExample.totals.join()} / ${userExample.fullTotals.join()}`);

  const eggs = buildCabaz(ALL, [{ productId: "ovos", quantity: 1 }]);
  check("\"sells it without a size\" and \"does not sell it\" stay different facts",
    eggs.exclusions[0]?.blockers.map((b) => b.kind).join() === "no-size,not-stocked");
  check("with nothing comparable, the totals are empty rather than zero", eggs.totals.every((t) => t === null) && eggs.cheapestStores.length === 0);

  const zero = buildCabaz(ALL, [{ productId: "leite", quantity: 1 }, { productId: "salmao", quantity: 0 }]);
  check("an item at quantity 0 stays on screen but takes part in nothing",
    zero.rows.length === 2 && zero.selectedCount === 1 && zero.exclusions.length === 0 && zero.includedCount === 1);
  check("and still marks its cheapest store, at the price of one", zero.rows[1].lowestStores.join() === "AUCHAN");

  const tie = buildCabaz(ALL, [{ productId: "sal", quantity: 1 }]);
  check("a three-way tie marks no store as cheapest, in the row or the total",
    tie.rows[0].lowestStores.length === 0 && tie.cheapestStores.length === 3);

  check("an address naming a line that no longer exists is dropped",
    buildCabaz(ALL, [{ productId: "desaparecido", quantity: 1 }]).rows.length === 0);

  const selection = parseSelection("leite,arroz:3,salmao:0,leite:5,x:abc");
  check("the basket survives the address bar: quantities, zeros, repeats and nonsense",
    serializeSelection(selection) === "leite,arroz:3,salmao:0,x", serializeSelection(selection));
  check("quantities are capped at 99", parseSelection("leite:500")[0].quantity === 99);

  return failures;
}

// Run directly, not when imported by verify-nightly.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("verify-basket.ts")) {
  const n = verifyBasket();
  console.log(`\n${n === 0 ? "all checks passed" : `${n} CHECK(S) FAILED`}`);
  if (n > 0) process.exitCode = 1;
}
