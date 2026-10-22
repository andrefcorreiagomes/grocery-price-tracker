import type { ProductNote } from "./daily-report";
import { DEAD_NIGHTS_BEFORE_DELISTING, MAX_SHARE_MISSING } from "./product-checks";

/**
 * What only Pingo Doce's crawl can say about itself, for its daily report.
 *
 * Pingo Doce is crawled from its sitemap, one product page at a time (see
 * src/scripts/crawl-pingodoce-nightly.ts), so its report asks the questions of
 * that route: did the sitemap list the whole store, did every page read, and
 * which products are leaving. The other two stores answer the same questions
 * in their own sections - Continente's `discovery`, Auchan's `gridHealth`.
 *
 * Until 22 October 2026 this crawl printed these figures to its log and wrote a
 * file of section changes only, so nothing could put it in WARN or FAIL. The
 * limits below were set from its three recorded nights (18, 21 and 22 October
 * 2026), with room to spare on each side.
 */

/** Usually 89-90% of the pages read carry a pack size; far fewer means the size reader broke. */
export const MIN_SIZE_SHARE = 0.8;
/** Usually 27% of the pages read are marked unavailable (no price); far more means the price reader broke. */
export const MAX_UNPRICED_SHARE = 0.4;
/** Usually 0, once 1.2% (126 pages answering 503); more than this is worth a look. */
export const MAX_UNREACHABLE_SHARE = 0.01;
/**
 * Usually 1.4-1.7% of the pages fetched say the product is gone. A page the
 * reader cannot understand ALSO counts as gone, so a change to the page's
 * markup would make nearly every page "gone" at once - and three such nights
 * would delist the whole store. Above this share, none of tonight's dead pages
 * is counted.
 */
export const MAX_SHARE_DEAD_PAGES = 0.05;

export interface PingoDoceExtras {
  // the sitemap
  sitemapFiles: { file: string; entries: number }[];
  /** total entries at the previous recorded run; null on a first run */
  sitemapPrevious: number | null;
  food: number;
  nonFood: number;
  /** in a food department, but a sub-section data/store-sections.ts skips */
  skippedSections: number;
  /** of `food`, products from mixed aisles (promotions, seasonal), kept only if their name is food */
  fromMixed: number;
  unfiled: number;
  /** addresses with no product id: should be zero */
  unparseable: number;
  unparseableSamples: string[];
  /** departments the sitemap shows that PINGO_DOCE_SECTIONS does not know: never crawled */
  unknownSections: { section: string; count: number }[];

  // the product pages
  targets: number;
  fetched: number;
  withSize: number;
  /** pages that loaded with no price: marked unavailable ("Indisponível") */
  unpriced: number;
  unreachable: number;
  unreachableSamples: ProductNote[];

  // products leaving
  /** held products the sitemap no longer lists */
  missingFromSitemap: number;
  /** false when too many vanished at once to believe the list */
  sitemapBelieved: boolean;
  /** pages that said the product is gone (404/410, or no product on the page) */
  deadPages: number;
  /** false when so many pages said gone that the page reader is suspect */
  deadPagesBelieved: boolean;
  delistedNow: number;
  delistedSamples: ProductNote[];
  /** held products whose department is no longer food: stopped without a request */
  stoppedBySection: number;
  /** held mixed-aisle products whose name is no longer recognised as food */
  stoppedByName: number;
}

const pct = (n: number, of: number) => `${of === 0 ? "0" : ((100 * n) / of).toFixed(1)}%`;

/** Whether tonight's dead pages can be believed: false when the share means a broken reader. */
export function deadPagesBelievable(deadPages: number, attempted: number): boolean {
  return attempted === 0 || deadPages / attempted <= MAX_SHARE_DEAD_PAGES;
}

/**
 * What should move the verdict, most serious first. FAIL only for a page
 * reader that seems to be broken; everything else is WARN.
 */
export function pingoDoceProblems(x: PingoDoceExtras): { fails: string[]; warnings: string[] } {
  const fails: string[] = [];
  const warnings: string[] = [];

  if (!x.deadPagesBelieved) {
    fails.push(
      `${x.deadPages.toLocaleString()} of ${x.targets.toLocaleString()} pages (${pct(x.deadPages, x.targets)}) said the product is gone, ` +
        `against the usual 1-2% - the page reader has probably broken; none was counted toward delisting tonight`
    );
  }
  if (!x.sitemapBelieved) {
    warnings.push(
      `${x.missingFromSitemap.toLocaleString()} held products are missing from the sitemap, more than ${MAX_SHARE_MISSING * 100}% of the range - ` +
        `the list was not believed and none was counted as gone tonight`
    );
  }
  if (x.unknownSections.length > 0) {
    warnings.push(
      `${x.unknownSections.length} department(s) in the sitemap are not known, so their products were never crawled: ` +
        x.unknownSections.map((s) => `${s.section} (${s.count})`).join(", ")
    );
  }
  if (x.unparseable > 0) {
    warnings.push(`${x.unparseable} sitemap address(es) had no product id and were dropped - the address shape may have changed`);
  }
  if (x.fetched > 0 && x.withSize / x.fetched < MIN_SIZE_SHARE) {
    warnings.push(
      `only ${pct(x.withSize, x.fetched)} of the pages read carried a pack size (usually about 89%) - the size reader may have broken`
    );
  }
  if (x.fetched > 0 && x.unpriced / x.fetched > MAX_UNPRICED_SHARE) {
    warnings.push(
      `${pct(x.unpriced, x.fetched)} of the pages read had no price (usually about 27%) - the price reader may have broken`
    );
  }
  if (x.targets > 0 && x.unreachable / x.targets > MAX_UNREACHABLE_SHARE) {
    warnings.push(
      `${x.unreachable.toLocaleString()} page(s) could not be read (${pct(x.unreachable, x.targets)}) - the store may be refusing requests`
    );
  }
  return { fails, warnings };
}

/** The report's two Pingo Doce sections, as plain lines. */
export function pingoDoceLines(x: PingoDoceExtras): { reached: string[]; leaving: string[] } {
  const total = x.sitemapFiles.reduce((n, f) => n + f.entries, 0);
  const reached = [
    `  sitemap: ${total.toLocaleString()} address(es) in ${x.sitemapFiles.length} file(s)` +
      (x.sitemapPrevious === null
        ? "   (no previous run to compare)"
        : `   (last run ${x.sitemapPrevious.toLocaleString()})`),
    ...x.sitemapFiles.map((f) => `    ${f.file.padEnd(28)} ${f.entries.toLocaleString().padStart(8)}`),
    `  food products:            ${x.food.toLocaleString()}` +
      (x.fromMixed > 0 ? `   (${x.fromMixed.toLocaleString()} from mixed aisles, kept only if the name is food)` : ""),
    `  non-food, never fetched:  ${x.nonFood.toLocaleString()}`,
    `  skipped sub-sections:     ${x.skippedSections.toLocaleString()}   (supplements, pet food, ... - data/store-sections.ts)`,
    ...(x.unfiled > 0 ? [`  no department in the address: ${x.unfiled.toLocaleString()}`] : []),
    `  addresses with no id:     ${x.unparseable}` + (x.unparseable === 0 ? "   (as it should be)" : ""),
    ...x.unparseableSamples.slice(0, 5).map((u) => `    ${u}`),
    ...(x.unknownSections.length > 0
      ? ["  !! departments not known, never crawled:", ...x.unknownSections.map((s) => `    ${s.section}: ${s.count}`)]
      : []),
    "",
    `  pages read:               ${x.fetched.toLocaleString()} of ${x.targets.toLocaleString()} attempted`,
    `  with a pack size:         ${x.withSize.toLocaleString()} (${pct(x.withSize, x.fetched)})`,
    `  listed without a price:   ${x.unpriced.toLocaleString()} (${pct(x.unpriced, x.fetched)}) - marked unavailable, kept with no price`,
    `  could not be read:        ${x.unreachable.toLocaleString()}` + (x.unreachable > 0 ? "   (no claim made about these)" : ""),
    ...x.unreachableSamples.slice(0, 5).map((u) => `    ${u.storeProductId}: ${u.name}`),
  ];

  const leaving = [
    `  missing from the sitemap: ${x.missingFromSitemap.toLocaleString()}` +
      (x.sitemapBelieved ? "" : "   NOT BELIEVED tonight - too many at once, none counted"),
    `  pages that said gone:     ${x.deadPages.toLocaleString()}` +
      (x.deadPagesBelieved ? "" : "   NOT BELIEVED tonight - too many at once, none counted"),
    `  delisted this run (third night): ${x.delistedNow.toLocaleString()}`,
    ...x.delistedSamples.map((n) => `    ${n.name.slice(0, 60)}`),
    ...(x.stoppedBySection > 0 ? [`  moved out of a food department: ${x.stoppedBySection.toLocaleString()} (no longer tracked)`] : []),
    ...(x.stoppedByName > 0 ? [`  mixed-aisle name not food:      ${x.stoppedByName.toLocaleString()} (no longer tracked)`] : []),
  ];

  return { reached, leaving };
}

/** The note under "Products leaving the catalogue" for this store. */
export const LEAVING_NOTE =
  "A product Pingo Doce stops selling leaves its sitemap and is simply never asked for again, so " +
  "absence from the sitemap counts a night, and so does a page that says the product is gone. " +
  `${DEAD_NIGHTS_BEFORE_DELISTING} nights in a row delist it; one bad night cannot. Nothing is deleted: ` +
  "the row and its price history stay. Either count is ignored for the night when an implausible " +
  "share arrives at once, because that means a broken list or a broken page reader, not a store " +
  "emptying its shelves.";

/** The note under "Sitemap and product pages" for this store. */
export const REACHED_NOTE =
  "Pingo Doce is read from its sitemap, which lists every product address with its department, " +
  "and then one product page at a time - the route its robots.txt allows. The department settles " +
  "food or not without a request. Two silent failures matter here. A department the sitemap shows " +
  "that we do not know is a department never crawled. And a page reader that breaks returns no " +
  "error, only fewer sizes or prices, so their shares are watched: about 89% of pages carry a pack " +
  "size and about 27% have no price because the store marks them unavailable.";
