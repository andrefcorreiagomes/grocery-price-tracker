import os from "node:os";
import { prisma } from "../lib/db";
import { keepInCatalogue } from "../lib/catalogue-filter";
import { kindFromName } from "../lib/food-types";
import { topSectionKind } from "../lib/store-sections";
import { auchanBarcodeFromHtml, auchanStatusFromHtml, parseAuchanPage } from "../scrapers/auchan";
import { nameFromAuchanUrl, readAuchanSitemap, shelfFromAuchanUrl } from "../scrapers/crawl/auchan-sitemap";
import { checkedIds, recordChecks, type CheckResult } from "../scrapers/crawl/product-checks";
import { openCatalogueWriter } from "../scrapers/crawl/persist";
import { fetchHtml, formatHttpStats, HttpError, requireCrawlerContact, setRequestsPerSecond } from "../scrapers/http";
import type { SearchHit } from "../scrapers/search/types";
import { takeLock } from "./run-lock";

/**
 * Open, once, every Auchan product on a food shelf in Auchan's own list that we
 * have never held (the user's decision, 26 October 2026, "option B").
 *
 *   npm run catchup:auchan -- --stop-at=23:30 --per-second=0.6667
 *   npm run catchup:auchan -- --stop-at=23:30 --limit=20      # a test slice
 *
 * The nightly reads Auchan's shelf pages, so a product that was out of stock on
 * every night, or is on no shelf, never got a row. A sample of 100 on
 * 26 October found about three in four gone (Auchan still lists them), a few
 * percent real products, and the rest non-food on the mixed Halloween aisle.
 *
 * Opened: every never-held product on a food shelf, and on a mixed aisle only
 * when its name (read from the address) suggests food - the Halloween costumes
 * stay unopened. Each answer is kept as it comes, 100 at a time:
 *   for sale or out of stock, and food  -> added to the catalogue (out of stock
 *                                          is kept without a price, as always)
 *   not food (a mixed aisle, a skipped sub-section) -> recorded NOT_FOOD
 *   gone (404, or Auchan's "Não temos o que procura")  -> recorded DEAD
 *   could not tell                     -> nothing; opened again next time
 * so stopping loses at most one slice, and a later start continues with what
 * is still unopened. --stop-at is required, so it can never run into the
 * nightly at 00:05; the lock (run-lock.ts) refuses to run beside another
 * collection.
 */

const STORE = "AUCHAN" as const;
const SLICE = 100;

async function main() {
  requireCrawlerContact();
  const host = os.hostname();
  const allowed = process.env.NIGHTLY_HOST?.trim();
  if (allowed && host.toLowerCase() !== allowed.toLowerCase()) {
    console.error(`This computer is ${host}; the crawls run only on ${allowed} (NIGHTLY_HOST in .env).`);
    process.exit(1);
  }
  takeLock("npm run catchup:auchan");
  const args = process.argv.slice(2);
  const stopRaw = args.find((a) => a.startsWith("--stop-at="))?.split("=")[1];
  const [h, m] = (stopRaw ?? "").split(":").map(Number);
  const stopAt = new Date();
  stopAt.setHours(h, m, 0, 0);
  if (!stopRaw || !Number.isFinite(stopAt.getTime()) || stopAt.getTime() <= Date.now()) {
    console.error(`--stop-at is required, as a later time today, HH:MM (got "${stopRaw ?? ""}")`);
    process.exit(1);
  }
  const limitRaw = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const perSecond = Number(args.find((a) => a.startsWith("--per-second="))?.split("=")[1] ?? 1);
  setRequestsPerSecond(perSecond);
  console.log(`pace: at most ${perSecond} request(s) a second`);

  console.log("Reading Auchan's list of products...");
  const sitemap = await readAuchanSitemap();
  const held = new Set(
    (await prisma.catalogueProduct.findMany({ where: { store: STORE }, select: { storeProductId: true } })).map((r) => r.storeProductId)
  );
  const checked = await checkedIds(STORE);
  let skippedMixed = 0;
  let queue: { id: string; url: string; shelf: string }[] = [];
  for (const [id, url] of sitemap.urls) {
    if (held.has(id) || checked.has(id)) continue;
    const shelf = shelfFromAuchanUrl(url);
    if (!shelf) continue;
    const kind = topSectionKind(STORE, shelf.split("/")[0]);
    if (kind === "food") queue.push({ id, url, shelf });
    else if (kind === "mixed") {
      if (kindFromName(nameFromAuchanUrl(url), STORE) !== null) queue.push({ id, url, shelf });
      else skippedMixed++;
    }
  }
  console.log(
    `  ${sitemap.ids.size.toLocaleString()} products listed; ${queue.length.toLocaleString()} never held to open ` +
      `(${skippedMixed.toLocaleString()} on mixed aisles skipped: their names do not suggest food)`
  );
  if (limitRaw !== undefined) queue = queue.slice(0, Number(limitRaw));
  console.log(`opening ${queue.length.toLocaleString()} page(s), stopping at ${stopRaw} at the latest`);

  const writer = await openCatalogueWriter(STORE);
  const totals = { opened: 0, forSale: 0, outOfStock: 0, notFood: 0, gone: 0, unreachable: 0 };
  const started = Date.now();

  for (let i = 0; i < queue.length; i += SLICE) {
    if (Date.now() >= stopAt.getTime()) {
      console.log(`\nstopped at ${new Date().toTimeString().slice(0, 5)} (--stop-at); the rest waits for the next start`);
      break;
    }
    const hits: SearchHit[] = [];
    const checks: CheckResult[] = [];
    for (const t of queue.slice(i, i + SLICE)) {
      totals.opened++;
      let html: string;
      try {
        html = await fetchHtml(t.url);
      } catch (error) {
        if (error instanceof HttpError && (error.status === 404 || error.status === 410)) {
          checks.push({ storeProductId: t.id, url: t.url, verdict: "DEAD" });
          totals.gone++;
        } else totals.unreachable++;
        continue;
      }
      const status = auchanStatusFromHtml(html);
      if (status === "gone") {
        checks.push({ storeProductId: t.id, url: t.url, verdict: "DEAD" });
        totals.gone++;
        continue;
      }
      if (status === "unreachable") {
        totals.unreachable++;
        continue;
      }
      let page;
      try {
        page = parseAuchanPage(html, t.url);
      } catch {
        totals.unreachable++;
        continue;
      }
      if (!keepInCatalogue(STORE, t.shelf, page.name).keep) {
        checks.push({ storeProductId: t.id, url: t.url, verdict: "NOT_FOOD", name: page.name, categoryPath: t.shelf });
        totals.notFood++;
        continue;
      }
      const inStock = status === "alive";
      if (inStock) totals.forSale++;
      else totals.outOfStock++;
      hits.push({
        id: t.id,
        name: page.name,
        // Out of stock: kept without a price, as at every store (code review H7).
        price: inStock ? page.price : null,
        brand: page.brand ?? "",
        category: t.shelf,
        url: t.url,
        ean: auchanBarcodeFromHtml(html),
        packageSize: page.packageSize,
        unit: page.packageUnit,
        onPromotion: page.onPromotion,
        regularPrice: page.regularPrice,
        promoEndsAt: page.promoEndsAt,
      });
    }
    if (hits.length) await writer.save(hits, "catch-up");
    await recordChecks(STORE, checks, writer.seenAt);
    const perHour = totals.opened / ((Date.now() - started) / 3_600_000);
    console.log(
      `  ${totals.opened.toLocaleString()}/${queue.length.toLocaleString()} opened: ${totals.forSale} for sale, ` +
        `${totals.outOfStock} out of stock, ${totals.notFood} not food, ${totals.gone.toLocaleString()} gone, ` +
        `${totals.unreachable} could not tell - ${Math.round(perHour).toLocaleString()} an hour`
    );
  }

  writer.finish();
  console.log(
    `\ncatch-up: ${totals.opened.toLocaleString()} opened; ${totals.forSale} added for sale, ${totals.outOfStock} added out of stock, ` +
      `${totals.notFood} not food, ${totals.gone.toLocaleString()} gone, ${totals.unreachable} could not tell (opened again next time)`
  );
  console.log("\nrequests:");
  for (const line of formatHttpStats()) console.log(line);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
