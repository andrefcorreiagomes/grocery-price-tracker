# Code review, October 2026

A critical read of the project's code, comments, data files and documents,
asked for by André on 22 October 2026: is it good, can it be improved, and are
the same principles kept for every store even where the route to them differs.

**Nothing was changed during the review.** This file is only a list of
findings. Each fix is decided separately and committed only with approval.

## How this was done

- **Read in full:** the store page readers, the three crawlers and their
  nightly commands, the shared saving, delisting and report code, the
  classifier, the comparison and basket logic, the site's pages and components,
  `nightly.ts`, the two nightly follow-up steps (`classify:food`,
  `backfill:sizes`), the store and section data files, the database schema,
  the README, `docs/operations.md`, the crawl skill and the configuration.
- **Read in part (structure, headers and the parts that touch data):** the
  matching pipeline (`generate-candidates`, `enrich-candidates`,
  `match-products`, `grouping.ts`), the review tools (`review-batch`,
  `review-kinds`, `measure-classifier`, `comparison-report-html`, `kind-gold`),
  `validate-comparisons`, `discover`, `check-sections`, and the `verify-*`
  check scripts.
- **Not reviewed:** the style sheets (`*.css`), the code Prisma generates, the
  entries of `data/kind-reviews.ts` and the two `kind-gold*.json` lists (these
  are decisions already approved one by one), and `package-lock.json`.
- **Every number below was counted on the database of 22 October 2026**
  (after the nightly run of that date), unless it says otherwise. Statements
  marked *likely* still need one check before they can be called facts.

How to read a finding: **what** is wrong, **why it matters**, **what I
suggest**, and roughly how big the change is (*small*: under an hour;
*medium*: a few hours; *large*: a day or more). Findings are grouped by how
much harm they can do: **H** can make data wrong or stop a run, **M** makes
the reports, the site or the code misleading or harder to change, **L** is
tidiness and out-of-date text.

---

## Part A. The same principles at every store

Each row is one thing the project collects or decides. "Same principle" asks
whether the three stores follow the same rule, even when they reach it by a
different route.

| What | Continente | Pingo Doce | Auchan | Same principle? |
|---|---|---|---|---|
| **Route** | sitemap, then one product page each | sitemap, then one product page each | listing pages (grids) | **Yes**: each follows its own robots.txt. Auchan's allows the grids; the other two forbid them. But Auchan's robots.txt also names a sitemap, which is not used (see M2). |
| **Price** | from the page's structured data; no check for 0 or an unreadable number | from the price text; 0 and 1 cent become "no price" | from the tile's data; no check for 0 | **No**: "a zero is never a price" is enforced only at Pingo Doce (M9). |
| **Listed but not for sale** | a page without a price counts as **gone** (likely; see H7) | kept, with no price (the store marks it "Indisponível") | tile skipped; the page check marks it "out of stock" and the **last price is kept** | **No**: three different treatments of the same situation (H7). |
| **Pack size** | the "emb." label, then the price per kilo shown under the price | the size label only | the name, checked against the tile's price per kilo | **Mostly**: the store's own figure first, the name second. Pingo Doce does not use its own price per kilo when the label is missing, although the label carries it (M8). |
| **Store's own price per kilo** | read | read | read | **Yes.** |
| **Promotion** | a price before the discount exists | any promotion box on the page; end date | a crossed-out earlier price on the tile | **Not quite**: Continente and Auchan mean "the price was cut"; Pingo Doce means "the page shows a promotion box", which may include other offers (to check: M12). Auchan's page reader, used by the enrich script, uses a third definition (M12). |
| **Barcode** | from the page | none published; the reader looks anyway and has never found one (0 of 9,594) | only from the enrich script: 1,488 of 18,390 | **Yes**, but Pingo Doce's search is dead code (L4). |
| **Brand** | empty becomes "Continente" | empty or in-house labels become "Pingo Doce" | kept as given: 1,377 empty | **No**: three rules. Because Continente's empty brand is filled in, the report's "missing brand" check can never fire there (M5). |
| **Food or not** | `data/store-sections.ts` | `data/store-sections.ts` | `data/store-sections.ts` | **Yes**, the strongest shared rule. **But** a product we hold that moves into a non-food section stops being tracked at Continente and Pingo Doce, and not at Auchan (H4). |
| **New products** | sitemap backlog, 3,000 a night; 71,558 never opened (24 nights at this rate) | every food product in the sitemap, every night | every product in the walk, every night | Yes in purpose; the speeds differ because the routes differ. |
| **Products leaving** | a page that says "gone" | missing from the sitemap, or a page that says "gone" | missing from the walk, then a page that says "gone" | **Yes**: three nights, nothing deleted. **But** at Continente and Pingo Doce a network failure is counted as "gone" (H1), and the reason a product left is not recorded anywhere (M5). |
| **Safety brakes** | dead pages over 10% of the store; non-food over 5%; barcode and price storms | missing from the sitemap over 5% (never expires: M3); dead pages over 5% (added 22 Oct) | grid cut short; broken tiles; empty categories; missing over 10%; dead over 10%; price storm | **No**: the same idea with different limits, written three times. Pingo Doce has no price-storm brake and no non-food brake (M4). |
| **Store's own product counts** | read every night | only in a separate command run by hand | read every night (grid counters) | **No** (M10). |
| **Report** | full report | full report (since 22 Oct) | full report | **Yes**, but Continente's and Auchan's reports print sections written for a different route (M1). |
| **Crash report** | yes | yes (since 22 Oct) | yes | **Yes.** |

---

## Part B. Findings

### H: can make data wrong or stop a run

**H1. A network failure is counted as "the product is gone" (Continente, Pingo Doce).**
*Read in code.* When a page cannot be fetched because of a timeout or a dropped
connection, the fetcher tries 3 times and then gives up with an error that is
not an "HTTP status" error ([http.ts:318](../src/scrapers/http.ts#L318)). Both
crawlers then decide "gone" for anything that is not an HTTP status error
([continente-products.ts:314](../src/scrapers/crawl/continente-products.ts#L314),
[pingodoce-products.ts:124](../src/scrapers/crawl/pingodoce-products.ts#L124)).
Their own comments say the opposite: only a page that *says* the product is
gone should count. Auchan does it correctly
([auchan.ts:71](../src/scrapers/auchan.ts#L71)).
*Why it matters:* a bad network night adds a "dead night" to every product it
touched; three such nights delist real products. The safety brake only stops
this when more than 10% (Continente) or 5% (Pingo Doce) of the store fails at
once.
*Suggest:* count as "gone" only a 404/410 answer or a page that loaded and has
no product on it; everything else is "could not tell". *Small.*

**H2. The Continente and Auchan safety brakes would crash on the night they are needed.**
*Measured.* The database refuses a list of more than 996 ids in one query
(tested on 22 October with harmless read-only queries). Several helpers send
their whole list at once: `touchChecked`, `recordRecategorised`,
`recordUnavailable` in
[product-checks.ts](../src/scrapers/crawl/product-checks.ts). When the
Continente brake fires (over 10% of about 17,000 pages dead, so over 1,700
ids), it calls `touchChecked` with all of them
([crawl-continente-nightly.ts:337](../src/scripts/crawl-continente-nightly.ts#L337));
Auchan does the same ([crawl-auchan-nightly.ts:213](../src/scripts/crawl-auchan-nightly.ts#L213)).
The run would stop with an error at exactly the moment it is protecting the
data. The code's own comments already say "in batches of 500" elsewhere.
*Suggest:* batch these three helpers like the others. *Small.*

**H3. The price history loses every product once it stops being sold.**
*Measured.* The history page says it counts "every product that ever belonged
to the comparison, delisted ones included"
([grupos.ts:307](../src/lib/grupos.ts#L307)). But the nightly classification
step first erases the kind of every product, sold or not, and then gives a kind
back only to products still on sale
([classify-food-types.ts:173](../src/scripts/classify-food-types.ts#L173)).
Today 0 of the 1,982 products no longer sold keeps a kind, so none of them
appears in any history. When a product is delisted, past points on a chart can
change after the fact: if August's cheapest product is gone, that day's price
moves up. Tonight's Auchan delistings (up to about 570) will do this.
Nothing is lost for good: every price is still stored, and only the link from
product to kind is missing.
*Suggest:* give every product a kind, whether it is still sold or not. The
history then gets the delisted products back, including the past ones.
*Small.*

**H4. Auchan's "alive but missing" warning is probably mostly the baby-food gap.**
*Likely, to confirm with one product page.* When the Auchan walk finds a
product in a non-food section, it skips it but does not stop tracking it if we
hold it ([crawl/auchan.ts:274](../src/scrapers/crawl/auchan.ts#L274)).
Continente and Pingo Doce do stop tracking it. The product then looks
"missing", its page answers, and the report says "the walk has a hole". Of last
night's 39 such products, 32 are baby food (fruit pouches and jars) still filed
under "biológicos", all last seen on 31 August. That fits Auchan moving them to
its baby section, which is decided as non-food.
*Why it matters:* a warning that is mostly false teaches the reader to ignore
it. Also, these products, and 447 Auchan products not seen for over a month,
still count as "on sale": the README's total of 18,390 Auchan products includes
them.
*Suggest:* treat a product seen in a non-food section like the other two
stores do. Separately, decide the baby-food question (already on the to-do
list). *Small* for the first part.
*Confirmed on 22 October* from Auchan's own sitemap (see M2): 29 of the 39 are
in its first product file, and 27 of those are now filed under
`o-mundo-do-bebe`, Auchan's baby section.

**H5. The classification step empties the whole catalogue for a moment, with nothing to undo a crash.**
*Read in code.* `classify:food` erases every product's kind, sub-kind and
labels in one statement, then writes them back group by group
([classify-food-types.ts:173](../src/scripts/classify-food-types.ts#L173)).
Not in one transaction. While it runs, the site shows no comparisons; if it
stops halfway, the catalogue keeps a half-written state until the next night.
*Suggest:* write only what changed, in one transaction. *Small to medium.*

**H6. The "identical products" on the site are frozen at 17 October.**
*Measured.* The 922 groups of the same product at two chains (908 with both
sides still on sale) were last rebuilt on 17 October. Matching is not part of
the nightly run, so a product that appeared since then is never matched, and
the site keeps showing the old groups.
*Suggest:* decide whether matching should run each night (it needs no store
requests) or the site should say how old the groups are. *Small* to add to the
nightly run, once you agree.

**H7. Products "listed but not for sale" are handled three different ways.**
*Read in code; Continente's case to confirm.* Pingo Doce keeps them with no
price. Auchan keeps the last price and marks them out of stock. Continente's
reader throws an error when a page has no price
([continente.ts:28](../src/scrapers/continente.ts#L28)), which the crawler
counts as "gone" (H1). If Continente drops the price for out-of-stock products,
they are delisted after three nights.
*Suggest:* one rule for all three: listed and not sellable means "kept, no
current price, not gone". Confirm Continente's behaviour on one out-of-stock
page first. *Medium.*

### M: misleading reports, site or code

**M1. The reports contain sections that do not describe the run.**
*Seen in the 22 October reports.*
- "Not confirmed in over a month" counts products already delisted: 531 of
  Continente's 533 ([rotation-report.ts:86](../src/scrapers/crawl/rotation-report.ts#L86)).
- The "dead page" examples print the error message instead of the product
  name, so the report showed the same truncated line 12 times
  ([crawl-continente-nightly.ts:617](../src/scripts/crawl-continente-nightly.ts#L617)).
- "Did the crawl work" lists Mercearia and Laticínios twice, because two lists
  of results are joined without merging
  ([crawl-continente-nightly.ts:608](../src/scripts/crawl-continente-nightly.ts#L608)).
- The section headed "This run refreshed a slice" is printed for full runs too
  ([render-report.ts:145](../src/scrapers/crawl/render-report.ts#L145)).
- Auchan's report includes "What only a product page can tell us", but Auchan
  is not read from product pages.
- The note on store counts still explains "Bio e Saudável" and "Frescos",
  which Continente removed on 18 October.

*Suggest:* fix each; most are one line. *Small to medium.*

**M2. Auchan publishes a sitemap that the project does not use.**
*Read in Auchan's robots.txt.* `Sitemap: https://www.auchan.pt/sitemap_index.xml`.
The Auchan code says a grid walk has "no independent list to check
completeness against". If the sitemap lists products, it is that list, and it
might replace many of the page checks for missing products. That is not known
until it is looked at.
*Looked at on 22 October, with permission (3 requests; one was repeated
because of my own mistake saving it):* the index lists 13 files, two of them
products (`sitemap_0-product.xml`, `sitemap_1-product.xml`). The first holds
34,376 product addresses, each with a date and, like Pingo Doce's, the section
it is filed under (`/pt/alimentacao/mercearia/...`). Its ids are the ids we
store (address `.../10.html` is product 10). 12,635 of our 18,390 Auchan
products on sale are in that first file; the second was not fetched.
*Suggest:* use it the way Pingo Doce's is used: to learn which products left,
and which moved into a non-food section, without a page request each.
*Medium.*

**M3. Pingo Doce's sitemap guard never accepts a real change.**
*Read in code.* If more than 5% of the products we hold vanish from the sitemap,
the list is not believed that night, and the same will happen every night after
([product-checks.ts:220](../src/scrapers/crawl/product-checks.ts#L220)).
Continente's guard was written to avoid exactly this: after 3 nights with the
same figures it accepts them as the new normal
([sitemap-trust.ts](../src/scrapers/crawl/sitemap-trust.ts)). Also, Pingo
Doce's two sitemap files are written into the code
([pingodoce-sitemap.ts:34](../src/scrapers/crawl/pingodoce-sitemap.ts#L34)),
so a third file would be missed in silence. Continente reads the list of files
from the index.
*Suggest:* use the same trust rule and read the index. *Medium.*

**M4. One safety idea, written three times with different limits.**
"Too many dead pages at once": 10% at Continente and Auchan
([reidentification.ts:27](../src/scrapers/crawl/reidentification.ts#L27)), 5%
at Pingo Doce ([pingodoce-report.ts](../src/scrapers/crawl/pingodoce-report.ts)).
"Too many prices moved at once" exists for Continente and Auchan, not for Pingo
Doce. "Too many products suddenly non-food" exists only for Continente.
*Suggest:* one shared set of brakes, with each store's limit set from its own
measured nights, written down in one place. *Medium.*

**M5. Why a product left is not recorded.**
`delistedAt` means four different things: three dead nights; moved out of food;
left out by the section rules; its id taken over by another product. The
"delisted" totals in the reports and the README mix all four. Separately,
`deadCount` is not reset when an Auchan page answers "out of stock"
([product-checks.ts:314](../src/scrapers/crawl/product-checks.ts#L314)), so
"three nights in a row" is not strictly true. And Continente's brand is filled
in as "Continente" when empty, so the "missing brand" check can never fire
there.
*Suggest:* add a reason next to `delistedAt`; reset the counter whenever a page
answers. *Small to medium.*

**M6. The basket is built on the retired model.**
*Read in code.* The basket page turns each catalogue price into an old-style
"listing" with a pack size of 1 and an invented "snapshot"
([cabaz/page.tsx](../src/app/cabaz/page.tsx)). Behind it,
[cabaz.ts](../src/lib/cabaz.ts) and the table keep a whole "stale price"
feature (a state, a toggle, a warning, a date note and their styles) that can
no longer happen. Separately, a decision for you: the basket adds up an item
only when all **three** stores price it, while the rest of the site needs
**two** chains. Your rule of 18 October, that a store added later must not
change what counts as a comparison, does not hold in the basket.
*Suggest:* rewrite `cabaz.ts` around the basket lines directly, and add checks
for it (it has none). *Medium.*

**M7. The database location is fixed in the code, and the checks write to the real database.**
[db.ts:10](../src/lib/db.ts#L10) always opens `dev.db` in the current folder;
the `DATABASE_URL` setting in `.env` is used only by the Prisma tools, not by
the app. Because of that, the automatic checks cannot be pointed at a copy, so
they create and delete made-up products in the real database every night (none
was left behind on 22 October; I checked). The name "dev.db" for the only real
database is also misleading.
*Suggest:* read the location from `DATABASE_URL`, and run the database checks
on a copy. *Small to medium.* Worth doing before the move to the laptop.

**M8. The rules for reading sizes, names and brands are scattered and duplicated.**
- Sizes are worked out in five places: Continente's reader, Pingo Doce's reader,
  Auchan's tile reader (inside `matching.ts`), the nightly `backfill:sizes`, and
  `egg-count.ts`. The order of trust (store page, then tile, then name) is
  decided in `backfill:sizes`.
- Portuguese plurals are folded by three different rules (`food-types.ts`,
  `candidates.ts`, and a copy inside `matchesTerm`).
- There are two copies of the name-overlap score, and two ways of comparing
  brand names. These disagree on exactly the case one of them warns about:
  "L'Or" and "LOr" are the same brand when candidates are found, but different
  brands when an exact match is decided
  ([matching.ts:475](../src/lib/matching.ts#L475)). So such pairs can never be
  confirmed automatically.
- `matching.ts` holds text helpers, sizes, an Auchan-only rule, barcodes and
  matching: its name hides most of what it does.

*Suggest:* one module each for text, sizes and barcodes; one plural rule; one
brand rule. *Large* if done at once; can be done piece by piece.

**M9. "A zero is never a price" holds only at Pingo Doce.**
Continente's and Auchan's readers accept 0 or an unreadable price. The
clean-up in `validate:comparisons` catches only prices above 0 and up to 1
cent, and clears only the current price, not the price history that the charts
read. `validate:comparisons` also *writes* to the database, although its name
says it only checks; and it calls anything above €200 per kilo odd, while
`matching.ts` documents saffron at about €10,000 per kilo as real.
*Suggest:* refuse 0 and unreadable prices in every reader. Move the clean-up
out of the check. *Small.*

**M10. Old commands that no longer do what they say.**
- `crawl:continente` checks Continente's sections using its names from before
  18 October (Frescos, Bio e Saudável), so it would report them as missing.
- `crawl:continente:products` duplicates `crawl:continente:nightly -- --limit`
  with different rules: it does not count dead nights, puts products no longer
  sold first in its queue, and overwrites `reports/latest.md` with a test
  slice.
- `crawl:pingodoce` (Pingo Doce's own product counts) is useful but runs only
  by hand, so the Pingo Doce report has no "store's own counts" check, unlike
  the other two.

*Suggest:* delete the first two; fold the third into the Pingo Doce nightly
(about 19 allowed requests). *Small.*

**M11. "Three stores" is written into the site and code.**
"nas três cadeias", "nas três lojas", "As três" when there is a tie, and a
fixed list of three stores in `getFreshness`. `stores.ts` says adding a store
should be one entry there plus its crawler.
*Suggest:* derive these from the store list. *Small.*

**M12. "On promotion" may not mean the same at Pingo Doce, and the enrich script uses a fourth definition.**
Pingo Doce counts any promotion box on the page; whether that includes
"buy 2, pay 1" offers has not been checked. Separately, `enrich-candidates`
reads Auchan's product pages with a definition based on an end date
([auchan.ts:128](../src/scrapers/auchan.ts#L128)), and saves it, overwriting
what the tile reader records.
*Looked at on 22 October, with permission (5 Pingo Doce product pages):* Pingo
Doce has no multi-buy section, but the check found something else. Of its
2,688 products marked on promotion, 361 have no end date. Three of those pages
were read: two carry a "Preço Garantido" (guaranteed price) badge and one a
recommended retail price ("PVPR"), and none shows a promotion. Pingo Doce puts
the promotion box on these pages **empty**, and our reader counts the box
whether or not it holds anything
([pingodoce.ts:158](../src/scrapers/pingodoce.ts#L158)). The two real
promotions read show the earlier price crossed out ("Price reduced from 4,59
€/Kg to"), the same markup as Auchan's tiles, although the reader's comment
says Pingo Doce never prints the earlier price.
*Suggest:* at Pingo Doce, as at Auchan and Continente, "on promotion" means a
crossed-out earlier price above today's price, and that earlier price is
stored. That would make the rule the same at all three stores. Decide whether
a price below the recommended retail price ("PVPR") counts. Make the enrich
script leave promotions alone. *Small.*

**M13. The checks are hard to find their way around, and some important readers are not tested.**
`verify-matching.ts` has grown to 2,127 lines and 412 checks, mixing matching,
promotions, the classifier and, since today, Pingo Doce's report (my
addition). Continente's and Pingo Doce's full page readers are exported "so they
can be checked on a saved page", but no check uses them. The basket logic has
no checks.
*Suggest:* split the file by subject; add saved-page checks for both readers.
*Medium.*

**M14. Dates on the site use the computer's time zone.**
"Preços recolhidos" shows dates with the server's own clock. On MSI that is
Lisbon time; on a rented server it is usually UTC, and a crawl started at 00:05
would show the previous day. The history page already uses Lisbon time.
*Suggest:* Lisbon time everywhere. *Small.* Matters only once the site moves.

**M15. The classifier's rules live partly in code.**
`explainFoodType` ([food-types.ts](../src/lib/food-types.ts)) is a 150-line
function with word lists inside it (prepared shelves, cooking words, coated,
mixes, "open" shelves, and an exception for one Auchan shelf). The shelf rule
is also written twice, once with and once without some words. Point 2 (giving
every product a kind) will add many kinds, and the result also changes what
mixed aisles keep (a product is kept there only if it gets a kind).
*Suggest:* move the word lists into `data/`, next to the kinds. *Medium.* Best
done before point 2.

### L: tidiness and out-of-date text

**L1. Comments and documents that are no longer true.**
- [types.ts](../src/scrapers/types.ts): says no report counts promotions yet;
  "regular price: only Continente"; "end date: Pingo Doce and Auchan".
- [stores.ts](../src/lib/stores.ts): mentions `queries.ts` (deleted); gives
  Auchan's barcode source as "product page", which the nightly never reads.
- [persist.ts](../src/scrapers/crawl/persist.ts): `persistCatalogue` says it
  saves listing data only and leaves barcodes and sizes untouched; it does not.
- [schema.prisma](../prisma/schema.prisma): the price column says the real
  history is in `PriceSnapshot` (retired); `unit` says "kg or l" (also "un").
- [comparison.ts](../src/lib/comparison.ts) and the food page: "Continente
  publishes a size for 57%" (now 91%). The food page: "only Continente gives the
  price before" (Auchan does too, since today).
- [crawl-auchan-nightly.ts](../src/scripts/crawl-auchan-nightly.ts): "records
  no promotion state for Auchan yet".
- [nightly.ts](../src/scripts/nightly.ts): "Pingo Doce writes no full report".
- The crawl skill: Pingo Doce "no report"; times from 3 October (Auchan now
  80–86 min, not 39).
- README code map: "the 233 kinds of food" (252). I missed this one in
  today's update.
- [food-types data](../data/food-types.ts): "sweets and snacks were left out"
  (sweets are in, set aside).
- [brand-normalize.ts](../src/scrapers/brand-normalize.ts): "curation",
  "the already-tracked azeite" (retired).
- Pingo Doce files: "9,059 requests, 2.5 h" (now about 10,200 and 3 h); one
  file says 29 of 7,191 names carry a size, another says 14.
- `validate-comparisons`: "the next crawl three hours from now"; the food
  filter: "166 strings".

**L2. Three doc comments sit above the wrong function**
(`productIdFromUrl` in `continente-products.ts`, `openCatalogueWriter` in
`persist.ts`, `classifyCandidate` in `matching.ts`).

**L3. Small helpers copied several times:** `topSection` (4 copies),
`productIdFromUrl` (2 identical), `SAMPLE` (4), `PLACEHOLDER_PRICE` (2),
`findClosingBrace` (2), the "Preços recolhidos" footer (5 pages), the
basket-line name rule (2).

**L4. Code nothing uses:** `ANIMALS`, `NON_PRODUCT_SITEMAP`, `parseAuchanTiles`,
`resetHttpStats`, Pingo Doce's barcode search, the old Continente category list
and audit functions (used only by the stale command in M10), and the
`FoodTypeCategory` table (retired with its admin page; you chose to keep the
other old tables).

**L5. Requests are under-counted.** A 404 or a retried attempt is not counted
in "requests", so the reports understate the load put on a store a little.

**L6. No slowing down when a store starts refusing.** If a store answers
"busy" (503) or "too many requests" (429) to everything, the crawler still
continues all night at one page per second, trying each page 3 times. A
courteous crawler would pause or stop after many refusals in a row.

**L7. The saved robots.txt copies live in `logs/`, which is not in git.** On
the laptop or a server, the first night would find no copy and skip every
store (safe, but a surprise).

**L8. `reports/` and `logs/` grow without limit** (backups keep 7; these keep
everything).

**L9. Pingo Doce's progress line** appears only after a successfully read page,
the same problem fixed at Continente on 19 October.

**L10. The egg and capsule count uses the classifier without the review
decisions**, while the stored kind uses them (`backfill-sizes.ts`).

**L11. Style:** imports placed after code in `backfill-sizes.ts`;
`prisma` and `tsx` listed as app dependencies rather than tools.

---

## What is good and should stay

- The page readers, the classifier, the comparison rules and the guards are
  written without the database or the network, so they are checked quickly and
  reliably.
- "Unknown" is preferred to a guess everywhere: sizes, kinds, promotions.
- Nothing is deleted: products and their price history stay.
- Most comments explain *why*, with the case that taught it. That is also why
  so many go out of date (L1); the answer is to date the numbers in them, not
  to remove them.

## Fixed

- **H1, H2, H3** on 22 October 2026, with checks in
  `src/scripts/verify-crawl-safety.ts` (section 19 of `verify:nightly`).
- **H4, H5** on 22 October 2026, checks in the same file.
- **M12, Pingo Doce part** on 22 October 2026: a promotion is a crossed-out
  earlier price above today's, at Pingo Doce as at Auchan
  (`src/scrapers/struck-price.ts`); a price below the recommended price
  ("PVPR") is not one, by the user's decision. Checks on pieces of saved pages
  in `src/scripts/verify-store-pages.ts` (section 20). Still open: the enrich
  script's Auchan promotions.

## Measured, waiting for a decision

- **H6.** Rebuilding the groups on a copy of the database (22 October 2026,
  about 3 minutes, no store requests): the 922 groups would become 2,861, of
  them 544 at all three chains, 214 of today's groups would change members and
  56 would be retired. The three-chain groups rest on brand, size and name
  alone, because Pingo Doce has no barcodes, and the site says no group spans
  the three. Before matching runs nightly: check a sample of the new groups,
  and change that text.
- **H7.** Needs a few Continente product pages of products that are out of
  stock, to see whether such a page drops its price.

## Suggested order

1. **Data safety:** H1, H2, H3. Small changes that stop real data being
   damaged. None is urgent for a single night: H1 needs three bad nights in a
   row, H2 only matters on a night a brake fires, and H3 loses nothing for good.
2. **Honest reports:** H4, M1, M5. The 5–7 good nights you are counting are
   judged by these reports.
3. **Same rules everywhere:** H7, M3, M4, M9, M12, then M2 (needs your
   permission for 1–2 Auchan requests).
4. **Before the move to the laptop:** M7, M14, L7.
5. **Before point 2 (kinds for every product):** M15, and decide H6.
6. **Tidying:** M6, M8, M10, M11, M13, and all of L.
