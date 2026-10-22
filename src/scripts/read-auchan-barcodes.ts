import { prisma } from "../lib/db";
import { matchableEan } from "../lib/matching";
import { extractLdJsonBlocks, failedPageVerdict, fetchPage, requireCrawlerContact } from "../scrapers/http";

/**
 * Read the barcode of Auchan products that sit in a group of identical products
 * whose barcodes are not yet confirmed.
 *
 *   npm run barcodes:auchan                  # at most 300 pages
 *   npm run barcodes:auchan -- --limit=50
 *   npm run barcodes:auchan -- --all --stop-at=23:45
 *       every Auchan product on sale without a barcode, in or out of a group,
 *       stopping at that local time (run once, with the user's go-ahead, on
 *       22 October 2026: about 15,900 pages; never alongside the Auchan crawl)
 *
 * Auchan's listing pages, which its nightly crawl reads, carry no barcode; its
 * product pages do (the structured data's `gtin`). A group of identical products
 * is shown on the site only when every Continente-Auchan pair in it shares a
 * barcode (src/lib/grouping.ts, decided with the user on 22 October 2026), so
 * an Auchan product joined on name alone stays hidden until its page is read.
 * In a sample that day, 5 of 24 such pairs carried different barcodes.
 *
 * The first 1,085 were read once, by hand, on 22 October 2026. After that only
 * products newly in such a group need a read, a few a night; the limit keeps a
 * bad night from turning into thousands of requests. A page that shows no
 * barcode is not read again for RETRY_DAYS; a page that could not be read is
 * tried again the next night.
 */

const DEFAULT_LIMIT = 300;
const RETRY_DAYS = 30;

async function main() {
  requireCrawlerContact();
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const raw = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = raw === undefined ? (all ? Infinity : DEFAULT_LIMIT) : Number(raw);
  if (limit !== Infinity && (!Number.isInteger(limit) || limit < 0)) {
    console.error(`--limit must be a whole number, got "${raw}"`);
    process.exit(1);
  }
  const stopRaw = args.find((a) => a.startsWith("--stop-at="))?.split("=")[1];
  let stopAt: Date | null = null;
  if (stopRaw) {
    const [h, m] = stopRaw.split(":").map(Number);
    stopAt = new Date();
    stopAt.setHours(h, m, 0, 0);
    if (!Number.isFinite(stopAt.getTime()) || stopAt.getTime() <= Date.now()) {
      console.error(`--stop-at must be a later time today, as HH:MM, got "${stopRaw}"`);
      process.exit(1);
    }
  }

  const retryBefore = new Date(Date.now() - RETRY_DAYS * 86_400_000);
  const notRead = {
    store: "AUCHAN",
    delistedAt: null,
    ean: null,
    eanNormalized: null,
    OR: [{ enrichedAt: null }, { enrichedAt: { lt: retryBefore } }],
  };
  const targets: { id: string; url: string }[] = [];
  if (all) {
    // Most recently seen first: the products on sale now matter most.
    targets.push(
      ...(await prisma.catalogueProduct.findMany({ where: notRead, select: { id: true, url: true }, orderBy: { lastSeenAt: "desc" } }))
    );
    console.log(`every Auchan product on sale without a barcode: ${targets.length.toLocaleString()} page(s) to read`);
  } else {
    const unconfirmed = await prisma.productGroup.findMany({
      where: { retiredAt: null, flags: { contains: "barcode-unconfirmed" } },
      select: { members: { select: { productId: true } } },
    });
    const ids = [...new Set(unconfirmed.flatMap((g) => g.members.map((m) => m.productId)))];
    for (let i = 0; i < ids.length && targets.length < limit; i += 500) {
      targets.push(
        ...(await prisma.catalogueProduct.findMany({
          where: { ...notRead, id: { in: ids.slice(i, i + 500) } },
          select: { id: true, url: true },
        }))
      );
    }
    console.log(`${unconfirmed.length.toLocaleString()} group(s) with unconfirmed barcodes; ${Math.min(targets.length, limit)} Auchan page(s) to read`);
  }
  const todo = targets.slice(0, limit);
  if (stopAt) console.log(`stopping at ${stopAt.toTimeString().slice(0, 5)} at the latest`);

  let found = 0;
  let none = 0;
  let failed = 0;
  let done = 0;
  for (const t of todo) {
    if (stopAt && Date.now() >= stopAt.getTime()) {
      console.log(`stopped at ${new Date().toTimeString().slice(0, 5)} as asked, ${(todo.length - done).toLocaleString()} page(s) left for later`);
      break;
    }
    done++;
    if (done % 500 === 0) console.log(`  ${done.toLocaleString()}/${todo.length.toLocaleString()} read, ${found.toLocaleString()} barcodes`);
    try {
      const page = await fetchPage(t.url);
      const product = extractLdJsonBlocks(page.html).find((b) => (b as { "@type"?: string })?.["@type"] === "Product") as
        | { gtin?: string; gtin13?: string }
        | undefined;
      const barcode = product?.gtin ?? product?.gtin13 ?? null;
      if (barcode) found++;
      else none++;
      // Stamped either way: a page read with no barcode waits RETRY_DAYS.
      await prisma.catalogueProduct.update({
        where: { id: t.id },
        data: { ...(barcode ? { ean: barcode, eanNormalized: matchableEan(barcode) } : {}), enrichedAt: new Date() },
      });
    } catch (e) {
      // Gone: nothing to read, now or later. Anything else: try again next night.
      if (failedPageVerdict(e) === "gone") none++;
      else failed++;
    }
  }
  console.log(`barcodes: ${found} read, ${none} page(s) without one, ${failed} could not be read`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
