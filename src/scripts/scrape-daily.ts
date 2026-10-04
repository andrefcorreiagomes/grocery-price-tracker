import { scrapeAuchan } from "../scrapers/auchan";
import { scrapeContinente } from "../scrapers/continente";
import { scrapePingoDoce } from "../scrapers/pingodoce";
import { sleep, requireCrawlerContact } from "../scrapers/http";
import type { ScrapeResult } from "../scrapers/types";
import { prisma } from "../lib/db";
import { appendLog } from "../lib/log";

const scrapersByStore: Record<string, (url: string) => Promise<ScrapeResult>> = {
  CONTINENTE: scrapeContinente,
  PINGO_DOCE: scrapePingoDoce,
  AUCHAN: scrapeAuchan,
};

function todayTruncated(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

async function main() {
  requireCrawlerContact();
  const listings = await prisma.storeListing.findMany({ include: { product: true } });
  const date = todayTruncated();

  let succeeded = 0;
  let failed = 0;
  // listed, but with no price to snapshot - see the skip below
  let unpriced = 0;
  // promo counts per store - see the canary note where these are printed
  const promoSeen: Record<string, { promo: number; total: number }> = {};

  for (const listing of listings) {
    const scrape = scrapersByStore[listing.store];
    try {
      const result = await scrape(listing.url);

      const promo = {
        onPromotion: result.onPromotion,
        regularPrice: result.regularPrice,
        promoEndsAt: result.promoEndsAt,
      };

      // A product page can load a real product that carries no sellable price -
      // out of stock, or sold by variable weight. There is no honest snapshot to
      // write for that day: a zero would be read as a price, and carrying
      // yesterday's forward would invent an observation. Recording nothing
      // leaves a gap in the series, which is exactly what happened.
      if (result.price === null) {
        console.log(`SKIP ${listing.store} ${listing.product.name} - listed without a price`);
        unpriced++;
        await sleep(1000);
        continue;
      }

      await prisma.priceSnapshot.upsert({
        where: { storeListingId_date: { storeListingId: listing.id, date } },
        // the update branch matters as much as create: re-running on the same
        // day hits the existing row, and stale promo data must not survive
        update: { price: result.price, ...promo },
        create: { storeListingId: listing.id, date, price: result.price, ...promo },
      });

      const seen = (promoSeen[listing.store] ??= { promo: 0, total: 0 });
      seen.total++;
      if (result.onPromotion) seen.promo++;

      if (result.ean && result.ean !== listing.ean) {
        await prisma.storeListing.update({
          where: { id: listing.id },
          data: { ean: result.ean },
        });
      }

      console.log(
        `OK   ${listing.store} ${listing.product.name} -> ${result.price}€`
      );
      succeeded++;
    } catch (err) {
      const message = `FAIL ${listing.store} ${listing.product.name} (${listing.url}): ${(err as Error).message}`;
      console.error(message);
      appendLog(message);
      failed++;
    }

    await sleep(1000);
  }

  console.log(
    `\nDone: ${succeeded} succeeded, ${failed} failed` +
      (unpriced ? `, ${unpriced} listed without a price` : "") + "."
  );

  // Canary. A missing promo marker is read as "not on promotion" rather than
  // throwing, so if a store changes its markup this would silently report no
  // promotions forever. A store dropping to 0/N after routinely showing a
  // dozen is the signal that extraction broke, not that the sales stopped.
  for (const [store, { promo, total }] of Object.entries(promoSeen)) {
    console.log(`  ${store.padEnd(11)} ${promo}/${total} on promotion`);
  }

  if (failed > 0) {
    appendLog(
      `Run summary: ${succeeded} succeeded, ${failed} failed` +
        (unpriced ? `, ${unpriced} listed without a price` : "") + "."
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
