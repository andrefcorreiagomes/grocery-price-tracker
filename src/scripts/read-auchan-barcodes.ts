import { prisma } from "../lib/db";
import { matchableEan } from "../lib/matching";
import { extractLdJsonBlocks, failedPageVerdict, fetchPage, requireCrawlerContact } from "../scrapers/http";

/**
 * Read the barcode of Auchan products that sit in a group of identical products
 * whose barcodes are not yet confirmed.
 *
 *   npm run barcodes:auchan                  # at most 300 pages
 *   npm run barcodes:auchan -- --limit=50
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
  const raw = process.argv.slice(2).find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = raw === undefined ? DEFAULT_LIMIT : Number(raw);
  if (!Number.isInteger(limit) || limit < 0) {
    console.error(`--limit must be a whole number, got "${raw}"`);
    process.exit(1);
  }

  const unconfirmed = await prisma.productGroup.findMany({
    where: { retiredAt: null, flags: { contains: "barcode-unconfirmed" } },
    select: { members: { select: { productId: true } } },
  });
  const ids = [...new Set(unconfirmed.flatMap((g) => g.members.map((m) => m.productId)))];
  const retryBefore = new Date(Date.now() - RETRY_DAYS * 86_400_000);
  const targets: { id: string; url: string }[] = [];
  for (let i = 0; i < ids.length && targets.length < limit; i += 500) {
    targets.push(
      ...(await prisma.catalogueProduct.findMany({
        where: {
          id: { in: ids.slice(i, i + 500) },
          store: "AUCHAN",
          delistedAt: null,
          eanNormalized: null,
          OR: [{ enrichedAt: null }, { enrichedAt: { lt: retryBefore } }],
        },
        select: { id: true, url: true },
      }))
    );
  }
  const todo = targets.slice(0, limit);
  console.log(`${unconfirmed.length.toLocaleString()} group(s) with unconfirmed barcodes; ${todo.length} Auchan page(s) to read`);

  let found = 0;
  let none = 0;
  let failed = 0;
  for (const t of todo) {
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
