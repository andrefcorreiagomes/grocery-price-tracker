# Grocery Price Tracker (Portugal)

Compares what food really costs, per kilo and per litre, across Portugal's three
largest supermarket chains: **Continente**, **Pingo Doce** and **Auchan**. It
reads each chain's full online catalogue, works out what kind of food every
product is, and ranks the chains on a like-for-like basis.

> **Designed and directed by André Gomes. The code was written by Claude,
> Anthropic's AI coding agent, working under my direction.**

## At a glance

| | |
|---|---|
| Products collected | **44,384**: Continente 17,264 · Pingo Doce 9,046 · Auchan 18,074 |
| Products assigned a kind of food | **38,258** (86%) |
| Kinds of food defined | **177**, from *abóbora* to *vinho* |
| Kinds of food that can be compared at all three chains | **162** |
| Identical products matched across two chains | **944** |
| Prices as of | the crawls of 30 August to 1 September 2026 |

What these figures count:

- **Products collected** are the products each chain listed on its website at
  the most recent crawl.
- **Compared at all three chains** means every chain has at least one product
  of that kind with both a price and a known size, so a price per kilo or per
  litre can be calculated for each chain.
- **Identical products** are the same item, for example the same brand and
  pack, sold by two chains. Every match is a pair rather than a triple, because
  Pingo Doce does not publish barcodes, and without a barcode two listings
  cannot be confirmed to be the same item.

Prices are stored as a history: a new entry is written only when a price
changes. The catalogue's history starts on 19 August 2026.

## How this was built

I am a mathematician, not a software engineer. I designed this project and
directed its development; Claude wrote the code. The commit history shows
this: the commits carry a `Co-Authored-By: Claude` line.

My part was deciding what the tool should measure and how, setting the rules it
had to follow, and checking what it produced: questioning numbers that could
not be true, and refusing conclusions drawn from too little evidence. The
problems described below are the ones where those decisions mattered.

## Respecting each store's rules

Collecting the data is only worth doing if it is done properly, so the
crawlers follow each chain's published rules, including where that makes them
much slower.

- **robots.txt.** Every website can publish a file stating what automated
  programs may and may not visit, and the three chains' files differ.
  Continente and Pingo Doce forbid automated access to their paginated product
  listings; Auchan allows it. So Auchan's catalogue is read from its listings
  in minutes, while Continente's and Pingo Doce's are read one product page at
  a time from the sitemaps they publish, which takes hours. An earlier version
  of the crawler used the forbidden listings; it was replaced, and the old
  route is disabled.
- **A gentle pace.** At most one request per second to each store. A failed
  request is retried at most twice, with growing waits, and a store's request
  to slow down (`Retry-After`) is obeyed.
- **Public pages only.** No logins and no accounts. The prices are the public
  online prices, which can differ from in-store and loyalty-card prices.
- **Facts only.** Names, brands, prices, sizes, barcodes and the store's own
  category. No photographs, product descriptions or customer reviews are
  collected or shown, and the chains appear by name only, without logos.
- **Checked over time.** The three robots.txt files and terms of use were
  recorded on 13 August 2026 and checked again on 2 October 2026. The
  robots.txt files were unchanged, and none of the terms of use contained a
  clause on automated access.

Before collecting anything I also worked through the legal position under
Portuguese and EU law. Portugal's copyright code permits text and data mining,
including for commercial purposes, unless the site owner has reserved that
right in a machine-readable form (art. 75.º, n.º 2, al. w) of the CDADC, and
art. 15.º, al. f) of Decreto-Lei 122/2000, both as amended by Decreto-Lei
47/2023). None of the three chains has made such a reservation. This is my
reading, not legal advice.

## Problems worth describing

Comparing supermarket prices sounds solved: fetch two numbers and print the
smaller one. Most of the work went into cases where the obvious number is
quietly the wrong one.

### Missing data has two different meanings

When a chain shows no price for, say, rice, there are two very different
reasons. Either the chain does not sell it, or it sells it but its pack size
could not be read, so no price per kilo exists. Shown the same way, the second
case would tell a shopper that a chain does not sell rice when it does. The
comparison therefore keeps three states for every cell (a price; *not sold*;
*sold, size unknown*), and the pages never display the last two alike.

### A handful of examples is not a measurement

Twice, a conclusion about a whole group of products was nearly drawn from a
sample far too small to support it.

- Six pages of one Pingo Doce aisle all showed a price of €0.00, which suggested
  the aisle was not food and could be dropped: 1,010 products. Measured
  properly, 494 of them were food. The six pages were out-of-season Christmas
  stock, sampled in August.
- 9 of 20 Continente product pages turned out to be dead links, which would mean
  45% of the catalogue was gone. A sample of 300 put the figure at 2.3%.

The working rule since then: before making a rule about a whole class of
products, count the class. Counting is cheap here, and it has repeatedly
overturned the first guess.

### A tin of tuna has two weights

A tin has a net weight (everything in the tin) and a drained weight (the food
alone). All three chains calculate the price per kilo printed on their pages
from the drained weight. Using net weight does more than shift the numbers; it
hides differences. The own-brand 120 g tuna tin costs €1.12 at all three chains,
so on net weight all three tie at €9.33/kg. On drained weight, the same €1.12
buys 85 g of fish at Pingo Doce and 78 g at the other two.

### Reading a size out of a product name

Most sizes come from free text, written differently by each chain, and the
obvious reading is often wrong:

| Written as | Obvious reading | Correct reading |
|---|---|---|
| `MARISCADA COZIDA UNIDADE 1.200 GR` | 1.2 g | 1,200 g: Portuguese separates thousands with a dot |
| `AGUA C/ GAS VIMEIRO 6X050L` | six 50-litre bottles | six 0.5 L bottles: centilitres, with the decimal point dropped |
| `BOLO CAKE DESIGN Nº20 KG` | a 20 kg cake | cake design number 20, sold by the kilo |
| `Cápsulas de Café Fortissimo Int 10 L'Or` | 10 litres of coffee | no size at all: *L'Or* is the brand |
| `ACAFRAO AUCHAN MOIDO 3 DOSES 0.3 G` | perhaps 300 g | really 0.3 g of saffron, about €10,000/kg |

The last row is why the thousands rule applies only to exactly three digits
after the dot: one or two decimals are genuinely used for small, expensive
things. Each rule is tested against the cases it must change and the cases it
must leave alone.

### Sorting 44,000 products into 177 kinds of food

Each kind of food is defined by the words that name it, plus exclusions where a
word misleads: *pasta* is not *pasta de dentes* (toothpaste). Exclusions have to
be precise. A rule meant to separate sweets from chocolate excluded anything
mentioning *caramelo*, which silently removed every caramel-filled chocolate
bar, 285 products, until it was rewritten to exclude caramel only when no
chocolate is mentioned.

Rules were chosen over a trained model on purpose. There was no labelled data
to train on, and with rules every decision can be read, checked, and traced
back to the line that made it.

### A shelf that names several foods

When a product's name does not say what it is, the store's shelf can. But many
shelves name several foods, such as Continente's "Banana, Maçã e Pera", and the
classifier used to take the first one named. Measured across the catalogue,
that decided 2,271 products on 125 such shelves, and it was wrong more often
than right: bananas filed as apples, farfalle as rice, oregano as salt, and
mashed potato on the rice page. Now a shelf decides only when it names exactly
one food; otherwise the product stays unclassified, which is the honest
answer. The groups the old rule did get right, such as coffee capsules whose
names never say "café", are now recognised from their names instead.

Each version of the rule was measured against the whole catalogue before it
was kept, and several were rejected that way. One counted the shelf's foods only
after the product's own rules had run, which made "Café, Chá e Achocolatados"
look like a tea shelf to anything rejected as coffee. The other let the
shelf's words count as evidence, which filed every vanilla essence on the shelf
"aromas, fermento e corantes" as baking powder.

### A repair that would have done harm

Some products appeared to contradict themselves, for example a kind of food
measured by weight but sold in litres. An automatic repair was written, then
measured before it ran: it would have rewritten 765 rows that were correct, such
as whipped cream that really is sold by volume, in 0.25 L packs. It was withdrawn. The
contradictions are now reported for review rather than fixed automatically.

### Pack price or price per kilo?

Continente and Pingo Doce use the same size label for a pack (a 500 g tray) and
for the weight of one particular item sold by the kilo. A whole chicken shows
`2,49€/kg` and `emb. 2,95 kg (aprox.)`; dividing one by the other priced it at
€0.84/kg, and a whole salmon at €1.90/kg. The reliable signal is the suffix on
the headline price itself: `€/kg` means the price is already per kilo, and the
label is only what one item weighs.

This was first solved by hand for a short list of products and only later
found to affect the whole catalogue, by scanning every food for prices far
below what that food usually costs. The rule was then written from five live
product pages and tested on them before any crawl was run.

The same scan found the opposite mistake in the stores' own data: Pingo Doce
labels a box of 10 coffee capsules "10 Kg | 0,38 €/Kg", and Continente's pages
give L'Or capsules' intensity ("Int 10") as 10 litres. Capsules are never sold
by the litre or by the kilo, so those sizes are treated as unknown.

### Promotions, and two signals that lie

Each chain marks promotions differently, and two of the obvious signals are
false: Pingo Doce's analytics data reports a discount of `0` on discounted
items, and Auchan's promotion style names appear on pages that have no
promotion. The first run with correct promotion data overturned a conclusion: a
58% price gap on a Nescafé jar, which had looked like Pingo Doce charging more,
was a temporary discount at Continente. All three chains' regular prices were
within four cents of each other.

### A crawler that ran out of memory

The first full Continente crawl crashed after 2,200 of its 17,292 products.
The few useful characters taken from each page were still references into the
whole page, so every page stayed in memory: about 1,953 KB per product. Copying
the extracted values out of the page brought that to about 0.1 KB.

## Current limitations

- **Continente sizes.** A size is known for 57% of Continente's products,
  against 91 to 92% at the other two chains, so Continente takes part in fewer
  comparisons. For wine, no comparison is possible yet.
- **Prices are from one crawl**, at the end of August 2026. The crawls have not
  yet been put on a daily schedule.
- **Pingo Doce shows no online price** for 1,918 of its 9,046 products.
- **Some kinds of food are too broad to rank fairly.** *Queijo* (cheese) covers
  everything from a children's fromage frais to a cured Serra da Estrela.
- **Goods sold by weight are corrected only as their pages are re-read.** The
  crawler now handles them (see *Pack price or price per kilo?*), but the
  stored data predates the fix, so until the next full crawl of Continente and
  Pingo Doce some of those products still show a price per kilo that is too
  low.
- **Not yet online.** The site runs locally; it is not hosted publicly.

## Technical overview

TypeScript throughout: **Next.js 16** for the site, **Prisma 7** with
**SQLite** for storage. Pages are fetched with plain HTTP requests, with no
headless browser; prices and product details are read from the structured data
the stores already embed in their pages.

| Where | What |
|---|---|
| `src/scrapers/crawl/` | the catalogue crawler for each chain |
| `src/scrapers/http.ts` | the shared fetcher: pace, retries, `Retry-After` |
| `src/lib/matching.ts` | reading sizes and normalising product names |
| `data/food-types.ts` | the 177 kinds of food |
| `src/lib/comparison.ts` | the comparison rules, including the three cell states |
| `src/app/grupos/` | the comparison pages (in Portuguese) |
| `src/scripts/verify-*.ts` | the automated checks |

The site itself is in Portuguese, since it is meant for shoppers in Portugal.

### Running it

```bash
npm install
npx prisma migrate dev           # creates the database
npm run verify:nightly           # the automated checks; no requests to the stores
npm run dev                      # the site, at http://localhost:3000/grupos
```

Filling the database means crawling the stores (`npm run crawl:auchan`,
`npm run crawl:continente:products`, `npm run crawl:pingodoce:products`, then
`npm run classify:food`). These make real requests to the chains' websites and
take hours, so please do not run them casually.

Notes on the original hand-picked product list and its daily scrape are in
[`docs/operations.md`](docs/operations.md).
