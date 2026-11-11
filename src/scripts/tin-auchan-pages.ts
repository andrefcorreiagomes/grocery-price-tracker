import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { prisma } from "../lib/db";
import { auchanTinWeights } from "../scrapers/auchan";

/**
 * Auchan tins' drained weights, from product pages saved earlier (the owner's
 * choice for tins, 10 November 2026; src/lib/tin-weights.ts). Auchan's nightly
 * crawl reads listings, not product pages, so its pages are read apart - a
 * one-off, the 348 tins whose name gives one weight, read on 10 November 2026
 * into ~/tin-pages/pages on the server - and this writes what they say. No
 * store requests: it reads the saved files only.
 *
 *   npm run tins:auchan-pages -- --dir=<folder of AUCHAN-<id>.html.gz> [--dry]
 *
 * Writes each tin's weights with source "page"; the nightly step (npm run
 * tins:weights) keeps them while Auchan still shows one of them as the size.
 */

async function main() {
  const dir = process.argv.find((a) => a.startsWith("--dir="))?.slice(6);
  const dry = process.argv.includes("--dry");
  if (!dir) throw new Error("say which folder: --dir=<folder of saved Auchan pages>");
  const files = readdirSync(dir).filter((f) => /^AUCHAN-.+\.html\.gz$/.test(f));
  const counts = { pages: files.length, both: 0, drainedOnly: 0, none: 0, notInCatalogue: 0, written: 0 };
  for (const f of files) {
    const id = f.slice("AUCHAN-".length, -".html.gz".length);
    const row = await prisma.catalogueProduct.findUnique({
      where: { store_storeProductId: { store: "AUCHAN", storeProductId: id } },
      select: { id: true, name: true, fullWeight: true, drainedWeight: true, fullWeightSource: true, drainedWeightSource: true },
    });
    if (!row) { counts.notInCatalogue++; continue; }
    const html = gunzipSync(readFileSync(path.join(dir, f))).toString("utf8");
    const w = auchanTinWeights(row.name, html);
    if (w.drained === null) { counts.none++; continue; }
    if (w.full !== null) counts.both++;
    else counts.drainedOnly++;
    const data = {
      fullWeight: w.full, fullWeightSource: w.full === null ? null : "page",
      drainedWeight: w.drained, drainedWeightSource: "page",
    };
    const same = row.fullWeight === data.fullWeight && row.fullWeightSource === data.fullWeightSource &&
      row.drainedWeight === data.drainedWeight && row.drainedWeightSource === data.drainedWeightSource;
    if (same) continue;
    if (!dry) await prisma.catalogueProduct.update({ where: { id: row.id }, data });
    counts.written++;
  }
  console.log(
    `Auchan pages read: ${counts.pages}; both weights ${counts.both}; the drained one only ${counts.drainedOnly}; ` +
      `no drained weight on the page ${counts.none}; no longer in the catalogue ${counts.notInCatalogue}`
  );
  console.log(`${dry ? "would write" : "wrote"} ${counts.written} product(s).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
