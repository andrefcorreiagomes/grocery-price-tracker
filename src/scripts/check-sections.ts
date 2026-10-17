import { prisma } from "../lib/db";
import { keepInCatalogue } from "../lib/catalogue-filter";
import { STORE_ORDER } from "../lib/stores";
import { recordRecategorised } from "../scrapers/crawl/product-checks";

/**
 * Which products already in the catalogue does data/store-sections.ts now
 * leave out?
 *
 *   npm run sections:check              # list them; changes nothing
 *   npm run sections:check -- --apply   # and mark them as no longer food
 *
 * The crawls apply the same rule to every product they save from now on; this
 * is for the rows saved before a rule existed, or before it changed. Marking
 * is what a crawl does when a product leaves the food sections: it sets
 * `delistedAt`, so the product drops out of every comparison, and deletes
 * nothing - the row and its price history stay, and a later rule change can
 * bring it back. No network.
 */

const EXAMPLES = 6;

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await prisma.catalogueProduct.findMany({
    where: { delistedAt: null },
    select: { store: true, storeProductId: true, name: true, categoryPath: true, foodType: true },
  });

  const out: Record<string, typeof rows> = {};
  for (const r of rows) {
    const d = keepInCatalogue(r.store, r.categoryPath, r.name);
    if (d.keep) continue;
    const top = (r.categoryPath ?? "").split("/").slice(0, d.reason === "skipped sub-section" ? 3 : 1).join("/");
    const key = `${r.store}\t${d.reason}\t${d.detail ?? top}`;
    (out[key] ??= []).push(r);
  }

  const keys = Object.keys(out).sort();
  const total = keys.reduce((n, k) => n + out[k].length, 0);
  const typed = keys.reduce((n, k) => n + out[k].filter((r) => r.foodType !== null).length, 0);
  console.log(`${rows.length.toLocaleString()} live products; the rules leave out ${total.toLocaleString()}, of which ${typed} have a food type today.\n`);

  for (const store of STORE_ORDER) {
    const mine = keys.filter((k) => k.startsWith(`${store}\t`));
    if (mine.length === 0) continue;
    console.log(store);
    for (const k of mine) {
      const [, reason, where] = k.split("\t");
      const list = out[k];
      const withType = list.filter((r) => r.foodType !== null);
      console.log(`  ${String(list.length).padStart(4)}  ${reason}: ${where}` + (withType.length ? `  (${withType.length} with a food type)` : ""));
      for (const r of [...withType, ...list.filter((x) => x.foodType === null)].slice(0, EXAMPLES)) {
        console.log(`          ${r.name.slice(0, 60)}${r.foodType ? `  [${r.foodType}]` : ""}`);
      }
    }
    console.log("");
  }

  if (!apply) {
    console.log("Nothing changed. Run with --apply to mark these as no longer food.");
    return;
  }
  const now = new Date();
  for (const store of STORE_ORDER) {
    const ids = keys.filter((k) => k.startsWith(`${store}\t`)).flatMap((k) => out[k].map((r) => r.storeProductId));
    for (let i = 0; i < ids.length; i += 500) await recordRecategorised(store, ids.slice(i, i + 500), now);
  }
  console.log(`Marked ${total.toLocaleString()} product(s) as no longer food.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
