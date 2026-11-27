import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { STORE_ERRORS } from "../../data/store-errors";
import { prisma } from "../lib/db";
import { stripAccents } from "../lib/text";
import { auchanSoldBy } from "../scrapers/auchan";
import { failedPageVerdict, fetchPage, requireCrawlerContact } from "../scrapers/http";

/**
 * Auchan products named "... KG" with no size: is the price per kilo?
 *
 *   npm run auchan:kilo-pages            # at most 200 pages
 *   npm run auchan:kilo-pages -- --dry   # says what it would do, opens nothing
 *
 * Auchan's listing shows these products with a price "per unit" equal to the
 * price, which cannot tell a price per kilo from a price per piece (a quail at
 * 1.25 € is per bird), so the listing leaves them without a size and they sit
 * out of the comparisons (src/lib/sizes.ts, auchanTileSize). The product's own
 * page says which (auchanSoldBy): 82 of 104 such pages said "sold by the kilo"
 * on 26 November 2026 (assumption 8.48). The owner approved this step that day.
 *
 * Each page's answer is kept in auchan-kilo-pages.json (on the server, not in
 * git), so a page is opened once and again only after KILO_DAYS (sold by the
 * kilo) or RETRY_DAYS (no mark: not for sale online that day, or sold by the
 * piece). The nightly listing writes "no size" over these products every night;
 * this step, after it, gives the ones a page proved sold by the kilo 1 kg again,
 * from the file, without opening anything. First night about 104 pages; then a
 * few a night (new products, and rechecks).
 */

const STATE_FILE = "auchan-kilo-pages.json";
const DEFAULT_LIMIT = 200;
const KILO_DAYS = 30;
const RETRY_DAYS = 7;
const SOLD_PER_KG = /\bkg\b/i;

type Verdict = "kilo" | "unit" | "no-mark" | "gone";
type State = Record<string, { checked: string; verdict: Verdict }>;

function readState(): State {
  if (!existsSync(STATE_FILE)) return {};
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
}

function writeState(state: State) {
  writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(state, null, 1));
  renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
}

const ageDays = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86_400_000;

async function main() {
  const dry = process.argv.includes("--dry");
  if (!dry) requireCrawlerContact();
  const raw = process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = raw === undefined ? DEFAULT_LIMIT : Number(raw);

  // A product already settled by hand in data/store-errors.ts (the fresh coconut
  // 234185, 1 kg while its listing is unchanged) is left to that entry: sizing it
  // here would read there as "the store's data changed" and take it out.
  const hasStoreError = new Set(STORE_ERRORS.filter((e) => e.store === "AUCHAN").map((e) => e.storeProductId));
  const products = (
    await prisma.catalogueProduct.findMany({
      where: { store: "AUCHAN", delistedAt: null, foodType: { not: null }, packageSize: null },
      select: { id: true, storeProductId: true, name: true, url: true },
    })
  ).filter((p) => SOLD_PER_KG.test(stripAccents(p.name)) && !hasStoreError.has(p.storeProductId));

  const state = readState();
  const counts = { candidates: products.length, fromFile: 0, opened: 0, kilo: 0, unit: 0, noMark: 0, gone: 0, failed: 0, waiting: 0, overLimit: 0 };
  const sized: string[] = [];

  for (const p of products) {
    const known = state[p.storeProductId];
    if (known && known.verdict === "kilo" && ageDays(known.checked) < KILO_DAYS) {
      counts.fromFile++;
      sized.push(p.id);
      continue;
    }
    if (known && known.verdict !== "kilo" && ageDays(known.checked) < RETRY_DAYS) {
      counts.waiting++;
      continue;
    }
    if (counts.opened >= limit) {
      counts.overLimit++;
      continue;
    }
    if (dry) {
      counts.opened++;
      continue;
    }
    counts.opened++;
    let verdict: Verdict;
    try {
      verdict = auchanSoldBy((await fetchPage(p.url)).html);
    } catch (e) {
      if (failedPageVerdict(e) !== "gone") {
        counts.failed++; // tried again next night
        continue;
      }
      verdict = "gone";
    }
    state[p.storeProductId] = { checked: new Date().toISOString(), verdict };
    if (verdict === "kilo") {
      counts.kilo++;
      sized.push(p.id);
    } else if (verdict === "unit") counts.unit++;
    else if (verdict === "no-mark") counts.noMark++;
    else counts.gone++;
  }

  if (!dry) {
    writeState(state);
    for (let i = 0; i < sized.length; i += 500) {
      await prisma.catalogueProduct.updateMany({
        where: { id: { in: sized.slice(i, i + 500) } },
        data: { packageSize: 1, unit: "kg", sizeSource: "page" },
      });
    }
  }
  console.log(
    `Auchan "KG" products with a kind and no size: ${counts.candidates}; ` +
      `${dry ? "would open" : "pages opened"} ${counts.opened} (sold by the kilo ${counts.kilo}, by the piece ${counts.unit}, no mark ${counts.noMark}, gone ${counts.gone}, could not be read ${counts.failed}); ` +
      `sold by the kilo from earlier pages ${counts.fromFile}; waiting to be looked at again ${counts.waiting}; over tonight's limit ${counts.overLimit}; ` +
      `${dry ? "would size" : "sized 1 kg"} ${sized.length}`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
