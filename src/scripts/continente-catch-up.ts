import os from "node:os";
import { prisma } from "../lib/db";
import { discoverProductUrls, fetchProducts, type ProductTarget } from "../scrapers/crawl/continente-products";
import { backlogOrder, isContinenteFood, looksLikeFood, saveGrouped } from "../scrapers/crawl/continente-backlog";
import { checkedIds, recordChecks, type CheckResult } from "../scrapers/crawl/product-checks";
import { openCatalogueWriter } from "../scrapers/crawl/persist";
import { formatHttpStats, requireCrawlerContact, setRequestsPerSecond } from "../scrapers/http";

/**
 * Open every Continente address never opened before, once (the user's wish,
 * 23 October 2026: all products, before the app is built).
 *
 *   npm run catchup:continente -- --stop-at=23:30
 *   npm run catchup:continente -- --stop-at=23:30 --limit=50     # a test slice
 *   npm run catchup:continente -- --stop-at=23:30 --per-second=2 # faster (at most 2)
 *
 * The nightly does the same 3,000 at a time; this does the rest, at the same
 * pace (one request a second, http.ts), in the order of backlogOrder: the
 * addresses whose name suggests food first. Each answer is kept as it comes,
 * 500 pages at a time - food products join the catalogue, the others are
 * written down as not food or gone - so stopping loses at most one slice, and
 * the next start simply continues with what is still unopened.
 *
 * --stop-at is required, so it can never run into the nightly at 00:05: two
 * runs on one store at once would ask Continente for twice the pages, and
 * SQLite takes one writer.
 */

const STORE = "CONTINENTE" as const;
const SLICE = 500;

async function main() {
  requireCrawlerContact();
  const host = os.hostname();
  const allowed = process.env.NIGHTLY_HOST?.trim();
  if (allowed && host.toLowerCase() !== allowed.toLowerCase()) {
    console.error(`This computer is ${host}; the crawls run only on ${allowed} (NIGHTLY_HOST in .env).`);
    process.exit(1);
  }
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
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  // One request a second unless told otherwise; at most 2 (http.ts).
  const perSecond = Number(args.find((a) => a.startsWith("--per-second="))?.split("=")[1] ?? 1);
  setRequestsPerSecond(perSecond);
  console.log(`pace: at most ${perSecond} request(s) a second`);

  console.log("Reading Continente's sitemap...");
  const sitemap = await discoverProductUrls();
  const held = new Set(
    (await prisma.catalogueProduct.findMany({ where: { store: STORE }, select: { storeProductId: true } })).map((r) => r.storeProductId)
  );
  const checked = await checkedIds(STORE);
  const unopened: ProductTarget[] = [];
  for (const [id, url] of sitemap.urls) if (!held.has(id) && !checked.has(id)) unopened.push({ storeProductId: id, url });
  let queue = backlogOrder(unopened, sitemap.lastmod);
  const likely = queue.filter((t) => looksLikeFood(t.url)).length;
  console.log(
    `  ${sitemap.urls.size.toLocaleString()} addresses; ${unopened.length.toLocaleString()} never opened, ` +
      `of which ${likely.toLocaleString()} have a name that suggests food (opened first)`
  );
  if (limit !== undefined) queue = queue.slice(0, limit);
  console.log(`opening ${queue.length.toLocaleString()} page(s), stopping at ${stopRaw} at the latest`);

  const writer = await openCatalogueWriter(STORE);
  const totals = { opened: 0, food: 0, notFood: 0, gone: 0, unreachable: 0, likelyFoodWasFood: 0, likelyFoodOpened: 0 };
  const started = Date.now();

  for (let i = 0; i < queue.length; i += SLICE) {
    if (Date.now() >= stopAt.getTime()) {
      console.log(`\nstopped at ${new Date().toTimeString().slice(0, 5)} (--stop-at); the rest waits for the next start`);
      break;
    }
    const slice = queue.slice(i, i + SLICE);
    const foodIds: string[] = [];
    const result = await fetchProducts(slice, {
      isFood: isContinenteFood,
      onBatch: async (batch) => {
        foodIds.push(...batch.map((b) => b.id));
        await saveGrouped(writer, batch);
      },
    });
    // Every id here was never held, so each verdict goes to ProductCheck, as
    // in the nightly's phase 3.
    const checks: CheckResult[] = [
      ...result.dead.map((d): CheckResult => ({ storeProductId: d.storeProductId, url: d.url, verdict: "DEAD" })),
      ...result.nonFood.map(
        (n): CheckResult => ({ storeProductId: n.storeProductId, url: n.url, verdict: "NOT_FOOD", name: n.name, categoryPath: n.categoryPath })
      ),
    ];
    await recordChecks(STORE, checks, writer.seenAt);

    const foodSet = new Set(foodIds);
    for (const t of slice) {
      if (!looksLikeFood(t.url)) continue;
      totals.likelyFoodOpened++;
      if (foodSet.has(t.storeProductId)) totals.likelyFoodWasFood++;
    }
    totals.opened += slice.length;
    totals.food += foodIds.length;
    totals.notFood += result.nonFood.length;
    totals.gone += result.dead.length;
    totals.unreachable += result.unreachable.length;
    const perHour = totals.opened / ((Date.now() - started) / 3_600_000);
    console.log(
      `  ${totals.opened.toLocaleString()}/${queue.length.toLocaleString()} opened: ${totals.food} food, ` +
        `${totals.notFood.toLocaleString()} not food, ${totals.gone.toLocaleString()} gone, ${totals.unreachable} unreachable` +
        ` - ${Math.round(perHour).toLocaleString()} an hour`
    );
  }

  writer.finish();
  console.log(
    `\ncatch-up: ${totals.opened.toLocaleString()} opened; ${totals.food} food added, ${totals.notFood.toLocaleString()} not food, ` +
      `${totals.gone.toLocaleString()} gone, ${totals.unreachable} unreachable (opened again next time)`
  );
  console.log(
    `the name guess: ${totals.likelyFoodWasFood} of the ${totals.likelyFoodOpened} addresses whose name suggested food were food; ` +
      `${totals.food - totals.likelyFoodWasFood} food products had a name that did not suggest it`
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
