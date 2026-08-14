---
name: product-discovery
description: Discovers and groups comparable products across Continente, Pingo Doce and Auchan for a given search term (a fish species, a meat cut, a grocery staple, etc.), so new products can be added to this app's price tracker in batches instead of one at a time by hand. Use this whenever the user gives a search term and asks to find, group, match, discover, or compare what's available across the three stores - including phrasings like "let's do carapau next", "find bacalhau across the stores", "do the same grouping for X", "what does Y look like at all three sites", or "add some more fish/meat/products to the tracker". Produces a reviewable HTML artifact of proposed groups, plus everything that didn't make it into a group and why - it never writes to tracked-products.ts without explicit sign-off on that artifact first.
---

# Product discovery across Continente, Pingo Doce and Auchan

## Why this exists

Hand-picking one product at a time (search each store, eyeball the results,
verify a match, write it into `data/tracked-products.ts`) works but doesn't
scale - there are hundreds of products and each one costs a full research
pass. The fix isn't to automate the judgment away; it's to batch the
mechanical part. One search term (e.g. "carapau") reliably turns into
several comparable products at once (small/medium/large/etc.), because
that's how grocery stores actually organize a category. This skill runs
that batch - fetch, filter, cluster, sanity-check - and stops at a review
artifact rather than guessing its way to a final answer. The clustering
step is still a judgment call, not a lookup; the skill's job is to make
good judgment calls consistently and show its reasoning, not to remove the
human from the loop.

## The workflow

### 1. Pull structured results from all three stores

Use the search extractors already built for this project - they read
structured data straight out of each store's server-rendered search page
(no headless browser needed, same approach as the production scrapers):

- `src/scrapers/search/continente.ts` - `searchContinente(term)`
- `src/scrapers/search/pingodoce.ts` - `searchPingoDoce(term)`
- `src/scrapers/search/auchan.ts` - `searchAuchan(term)`

Each returns `SearchHit[]` (`src/scrapers/search/types.ts`):
`{ id, name, price, brand, category, url }`. Write a small throwaway
script under `src/scripts/` that imports all three, runs them for the
term, and dumps the results (`console.table` is enough) - delete it once
you've got what you need, same as any other one-off investigation script
in this repo.

If a store's markup has changed and an extractor comes back empty or
throws, don't guess - fetch the search page yourself and look for the
per-tile data attribute again (Continente: `data-product-tile-impression`,
Pingo Doce: `data-gtm-info`, Auchan: `data-gtm` + `data-urls`), the same
way these extractors were originally built. Fix the extractor, not just
this one run.

**Each search reads the top 60 relevance-ranked hits per store - roughly four
requests and a few seconds per term.** That cap (`SEARCH_LIMIT` in
`paginate.ts`) is deliberate: this tracker wants a few dozen good comparison
groups, not exhaustive coverage, and walking a broad term's full result set
cost ~40 requests and 90 seconds before any judgment could start. The number
is the same for all three stores on purpose - they serve different page sizes
(Continente's grid clamps to 35 per request even when asked for more, Pingo
Doce and Auchan cover 60 in one), and an under-sampled store is exactly what
makes a group look 2/3 when it is really 3/3.

**What a capped search can no longer tell you: that a store doesn't carry
something.** Write the ledger reason as *"not in the top 60 at Auchan"*, never
*"Auchan doesn't stock it"*. When a group lands at 2/3 and the missing store
plausibly carries the item, re-run that one term deeper - every `searchX`
takes an optional second argument, e.g. `searchAuchan("manteiga", 200)`. That
is the exception, not the default.

**Prefer a narrower term over a deeper page.** The top 60 of a broad term is
mostly promoted national brands, so `queijo feta` at four requests beats page
twelve of `queijo`. Narrowing the term is the intended way to reach the long
tail, not a workaround.

A count below 60 is a real ceiling, not a truncation - but confirm it the way
Auchan's 24 results for "manteiga" were confirmed (identical at limits of 24,
60, 100 and 200) rather than assuming, because that number happens to equal an
old first-page artifact. Which is the durable lesson: the extractors once read
only page one, silently capping every search at 35 hits from Continente, ~18
from Pingo Doce and 24 from Auchan, and the tell was those three numbers
recurring across five unrelated terms. **When per-store counts come out
suspiciously round, identical across unrelated terms, or unmoved by a term
change that ought to move them, suspect the harness before concluding anything
about the stores.**

`paginate.ts` holds the shared walk and dedupes by product id. Note that
Continente ignores `start`/`sz` on its public search URL and only honours
`start` on the `Search-UpdateGrid` endpoint its own "load more" button calls,
with `cgid` and `pmin` attached.

### 2. Normalize brand before judging anything

Do this *before* clustering, because brand is one of your signals for
"is this actually the same kind of product" and for picking a
representative SKU when a store has duplicates.

- Continente leaves `brand` empty for anything without a distinct
  third-party brand - that means "their own fresh-food program," not
  "unbranded." The Continente scrapers already default this to
  `"Continente"`.
- Pingo Doce labels its own departments instead ("Nossa Peixaria" = their
  fish counter, "Nosso Talho" = their meat counter) - these read like
  brand names but aren't independent companies.
  `src/scrapers/brand-normalize.ts` normalizes known labels *and* the
  general "Nosso/Nossa ___" = "Our ___" pattern to `"Pingo Doce"`, so
  future in-house labels following that convention are caught
  automatically.
- Auchan's search tiles put a size word ("GRANDE", "MÉDIO") in the brand
  field for some unbranded items - don't treat that as a real brand either.

The underlying lesson, worth applying to any store this project adds
later: an empty or generic-looking brand field is a signal to go figure
out what it actually means, not a value to take at face value. Extend
`brand-normalize.ts` (or add an equivalent for a new store) when you spot
a new pattern - don't special-case it inline.

### 3. Filter out results that aren't actually the product

Search is fuzzy. A search for a fish name can return unrelated products
that merely share a word (a seasoning blend "for" that fish, a medicine
whose name partially matches, a book title). The `category` field each
extractor returns is your first filter - drop anything outside the
relevant department (e.g. "conservas"/canned goods when you're looking for
fresh fish). Anything left that's still obviously wrong, drop by hand and
note it in the artifact's ledger rather than silently deleting it.

**Watch for terms that are also a colour, a flavour, or a material.** Some
searches are mostly noise: "laranja" is the fruit *and* the colour orange
*and* the flavour, "banana" is the fruit and a flavour. Running both
together returned 146 results of which **125 were not fruit at all** - juice
and nectar, flavoured yogurt and kefir, baby pouches, cereal bars, sports
gels, orange-flesh sweet potato and melon, and a tail of items that merely
happened to be orange or banana-shaped (a decorative vase, a children's
book, rodent feed, a reusable shopping bag). A term like this yields a
handful of real products buried under an order of magnitude more noise.

When that happens, **don't itemise the noise in the ledger** - a hundred
rows of orange juice buries the six rows that matter and makes the artifact
unreadable. Collapse it to one summary row per store per term ("29 non-fruit
results discarded - juices, flavoured dairy, cleaning"), and reserve
individual rows for genuine near-misses: the real product that was
single-store, the duplicate SKU, the wrong pack size. The skill's principle
is that nothing the search found is *invisible*, not that everything gets
its own line.

### 4. Cluster what's left into candidate groups

This is the actual judgment step. Two principles that came out of doing
this by hand and getting it wrong the first time:

**Split by form before you group by name.** A named variety can exist in
more than one form at a store - fresh vs. frozen, whole vs. filleted,
different pack sizes - and those forms usually aren't fair comparisons
against each other. Don't cluster on the name alone and then flag the
mismatch after the fact; split by form *first*, then find the largest
subset of forms that's actually shared across stores. Example: searching
"carapau" turned up "Pelim" at both Continente (fresh *and* frozen) and
Auchan (frozen only, third-party packaged) - the correct group was
"Carapau Pelim Congelado" (frozen only, 2 stores), with Continente's fresh
Pelim set aside as unmatched, rather than one flagged group comparing
fresh to frozen.

**Use price-per-kg as a sanity check on the label, not just the label
itself.** Store naming isn't always a reliable signal by itself. When
researching Dourada and Robalo for this tracker, an unlabeled "wild-caught"
listing and a "Nacional" (farmed) listing used near-identical names but
differed in price by roughly 3x - grouping by name alone would have
silently compared a luxury wild fish to a supermarket farmed one. If two
candidates for the same group differ wildly in price, that's a signal to
open both product pages and check what's actually different (species,
sourcing, cut) before deciding whether they belong together.

**Read the pack size off the page, don't infer it from the name.** Product
names are inconsistent about size - some spell it out ("8×125 g"), some say
nothing at all. `scrapeContinente(url)` returns a `packageSize` (in kg or L)
parsed from the `emb. X` label Continente puts on every product page, so
when two candidates might be different formats, fetch it rather than
guessing. This came out of grouping plain yogurt: Continente's "Iogurte
Grego Mythos Natural" gave no size in its name and was flagged as an
ambiguous 2/3 group on the theory that it might be a 4-pack rather than a
tub - the page said `emb. 1 kg`, which made it a clean 3/3. Pingo Doce and
Auchan return `null` for now (no equivalent element found on their pages),
so those still need the name, the €/kg rate, or the product page read by
hand.

**But `emb.` is not always the `packageSize` you want.** Continente shows
that label on variable-weight fresh counter goods too, where it's the
approximate weight of *that particular piece* while the displayed price is
already the €/kg rate. "Perna de Peru" reads `price: 4.99, packageSize: 2.2`
- the €4.99 is per kilo, and 2.2 kg is just how much that leg happened to
weigh. Writing `packageSize: 2.2` would compute €2.27/kg and quietly
understate the product by half. The test is the secondary €/kg figure on the
page:

- secondary rate **equals** the main price → price is already per unit →
  `packageSize: 1` (all fresh counter meat and fish falls here)
- secondary rate **differs** from the main price → the price buys the whole
  pack → use the `emb.` weight (fixed-weight pre-packed goods: a 500 g tray
  of picada, an 800 g bag of frozen fillets, a 1 kg tub of yogurt)

**The sharper test: look at the suffix on the headline price.** Deli-counter
goods often carry no secondary €/kg at all, so the comparison above has nothing
to compare and comes out inconclusive. Continente's price block settles it
directly, and the two shapes are unmistakable once seen side by side:

| Page shows | Meaning | `packageSize` |
|---|---|---|
| `19,99€/kg` then `3,00€/un` | headline is per kilo; the /un figure is what the minimum cut costs | `1` |
| `1,99€` then `9,95€/kg` | headline is the pack price; the /kg is derived | pack weight |

Counter goods also replace the `emb.` label with a minimum-order one -
`Quant. Mínima = 150 gr (aprox. 4 fatias)` - which is not a pack size and must
never be used as one. Cross-check by multiplying: €19,99/kg × 0,15 kg = €3,00,
exactly the /un figure shown.

When in doubt, run a control: fetch a listing whose mode you already know from
`tracked-products.ts` (Perna de Peru is per-kg, Sal Grosso is a pack) and
compare the page signatures. That is how the fiambre counter listings were
settled rather than argued about.

**On canned and jarred goods, use the drained weight - with two exceptions.**
A conserve has two weights: *peso líquido* (net, everything in the tin) and
*peso escorrido* (drained, just the food). All three stores compute their
displayed €/kg on the **drained** weight, so that is the basis to use:
`packageSize` = drained. It is the food you actually get, and it makes this
app's €/kg match the rate printed on each store's own page, which means the
numbers can be checked against a shelf.

Using net instead hides real differences. The own-brand 120 g tuna tin costs
€1,12 at all three stores, so on net weight all three read €9,33/kg - a perfect
tie. On drained weight Continente and Auchan drain to 78 g and Pingo Doce to
85 g, so Pingo Doce is really 8% cheaper per kilo of fish. That is exactly the
comparison this tracker exists to make.

**Exception 1 - a store that doesn't publish it.** Auchan gives no drained
weight for the Origens Bio chickpea jar. If any store in the group is missing
it, use net for the whole group and note it; never mix bases within a group.

**Exception 2 - one national brand, disagreeing retailers.** For the identical
Compal da Horta 410 g chickpea tin, Continente declares 234 g drained and
Auchan declares 260 g. Same manufacturer, same tin - one of them is simply
wrong, and using drained would invent a €0,64/kg gap between two products
priced identically at €1,49. When a group is a single national brand and the
declared drained weights disagree, that is a retailer data error, not a product
difference: use net. Own-brand-vs-own-brand groups are the opposite case -
those are genuinely different products, so differing drained weights are real
and worth capturing.

**Where to read the weights.** Continente's `.ct-pdp--unit` element carries
both at once - `emb. 120 gr (peso escorrido 78 gr)`. Auchan puts them in the
product name (`540(400)G`) and in its description block. Pingo Doce publishes
only the drained figure, in a scoped `0.085 Kg | 13,18 €/Kg` block.

**Do not regex `€/kg` out of the whole page.** These pages carry
related-product carousels, and a page-wide match will happily return a
neighbouring product's rate. That produced a wrong answer here once already:
it made Continente's azeite tin look like it drained to 85 g when its own
`.ct-pdp--unit` says 78 g. Always scope to the product-detail element.

**Prefer own-brand over a generic-labeled duplicate at the same store.**
It's common for a store to carry two near-identical SKUs at the same
tier and price - one under their own name, one more genericly labeled
(or a legacy/duplicate listing). Use the own-branded one as the group's
representative and note the other as a duplicate in the ledger, don't
create a second group for it.

**Verify outliers against the actual product page before excluding them.**
A suspiciously round or low price on a search tile might be a genuine
site quirk, not a scraping error - check the individual product page's
structured data before deciding it's bad data. (We once found a fresh
fish priced at exactly €1.00 on both the tile and the product page - real,
just unusual - so it was excluded as unreliable rather than silently used
as the group's price.)

### 5. Decide what's actually trackable

A group needs **two or more stores** represented to be worth adding as a
comparison product - a single-store hit isn't a comparison, it's just a
listing. Don't promote those to groups by default, but don't hide them
either: they go in the artifact's ledger with a clear reason, so the user
can override that call if they know something the data doesn't show.

### 6. Build the review artifact

Load the `artifact-design` skill before writing it (this is a utilitarian
review document, not a landing page - polish and real hierarchy, not a
flashy hero). `assets/review-template.html` in this skill has the layout
already worked out from the first pass at this (a market-ledger treatment
- serif headings, monospace prices/data, tabular price alignment); start
from it and adapt the content rather than redesigning from scratch each
time. Structure:

- **Masthead**: the search term, which stores were checked, and counts
  (results found / groups ready / set aside).
- **Proposed groups**: one card per group, one slot per store (empty/dashed
  slot when a store doesn't carry it), price + a brand/form tag, link to
  the actual product page. A short note on *why* it's grouped this way if
  it's not obvious (e.g. "Pingo Doce doesn't carry this size").
- **Didn't make it into a group**: a ledger table, one row per leftover
  result, with a specific reason - single-store, wrong category, duplicate
  of an already-used SKU, price anomaly, mismatched form. The point of
  this section is that nothing the search actually found is invisible,
  even the stuff you're recommending against tracking.

A "Flagged - needs your call" section is for genuine judgment calls you
can't resolve yourself (not for things the form-splitting/price-check
principles above should have already resolved) - keep it for real
ambiguity, not as a default dumping ground.

### 7. Stop and wait for sign-off

Nothing gets written to `data/tracked-products.ts` until the user has
looked at the artifact and told you which groups to add (all of them,
some of them, with corrections, etc.). Treat the artifact as the proposal,
not the record.

### 8. Once approved: add, seed, scrape, verify

Follow the existing conventions in `data/tracked-products.ts` - each
approved group becomes one `TrackedProduct` with `category`/`subcategory`
matching the app's existing category menu (add a new one only if it
genuinely doesn't fit), `unit` as the comparison base ("kg", "L", etc.),
and each store's `packageSize` expressed in that unit (see
`src/lib/pricing.ts` for how that's used - `1` when the store already
prices per unit, otherwise the pack size). For Continente listings
`scrapeContinente(url).packageSize` gives you that number directly - but
only for fixed-weight packs; on per-kg counter goods it returns the piece's
weight and the correct value is `1` (see the `emb.` caveat in step 4). The
other two stores return `null` and stay manual. Then:

```bash
npm run seed
npm run scrape
```

Spot-check the result - `npx tsc --noEmit` / `npx eslint .`, and either a
quick DB query or the running dev server - the same verification pass used
for every other change in this project. If a listing fails to scrape,
that's usually a URL that doesn't resolve the way you expect; open it and
check before assuming the group was wrong.

## Files this skill depends on

| File | Role |
|---|---|
| `src/scrapers/search/{continente,pingodoce,auchan}.ts` | Structured search-result extraction per store |
| `src/scrapers/search/paginate.ts` | `SEARCH_LIMIT` (60/store) and the offset walk |
| `src/scrapers/search/types.ts` | `SearchHit` shape |
| `src/scrapers/brand-normalize.ts` | Pingo Doce in-house label detection |
| `src/scrapers/continente.ts` | `scrapeContinente()` - returns `packageSize` parsed from the `emb. X` label |
| `src/lib/pricing.ts` | `unitPrice()` - how packageSize normalization works |
| `data/tracked-products.ts` | Where approved groups get added |
| `src/scripts/seed.ts`, `src/scripts/scrape-daily.ts` | Finalization pipeline after approval |
