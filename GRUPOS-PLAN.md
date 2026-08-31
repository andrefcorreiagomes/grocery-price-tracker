# PLAN: the comparison page (`/grupos`)

Status: **awaiting your approval.** Nothing here is built yet.

---

## 1. The problem, stated properly

The app answers one question: **where is this food cheapest?**

The obvious way to answer it — match a product in one store to the same product
in another — covers almost nothing. There are 944 confirmed product groups
against roughly 44,000 catalogue products, about 2%. And none of them span all
three stores, because Pingo Doce publishes no barcode at all, so there is
nothing to match its products on with certainty.

Worse, the 2% is not a random 2%. It is branded, packaged goods — Nutella,
Compal, Delta. The things people spend most of their money on, potatoes and
chicken and rice, are exactly the things that can never match, because loose
potatoes have no barcode and every store's own-brand rice is a different
product by definition.

So the unit of comparison cannot be the product. It has to be the **kind of
food**. That is what the food-type layer built last week is for, and as of today
**164 kinds of food can be compared per kilo across all three chains**.

Your three group kinds answer three genuinely different questions, and they can
disagree with each other without any of them being wrong:

| group | question it answers |
|---|---|
| **Cheapest per store** | "Where do I go for cheap rice?" |
| **Own-brand** | "At the same quality tier, who is cheaper?" |
| **A named product** | "This exact thing I buy — where is it cheapest?" |

A store can win the first and lose the second: cheapest *anything* is not the
same as cheapest *comparable thing*. Showing all three is the point.

---

## 2. What today's data revealed, and it changes the plan

I ran the cheapest-per-kilo query across ten food types before writing this.
Some work perfectly. Several do not, and the failures fall into three kinds.

### (a) Ranking by "cheapest" is a bug amplifier

```
cerveja   EUR 0.02 per litre   CERVEJA SEM ALCOOL SUPER BOCK 0.0% 6X...   size read as 198 L
```

That is a six-pack. Its size was parsed as 198 litres — almost certainly `6 x
33 cl` read as `6 x 33 L`. The price is fine; the size is 600x too large.

This is not one bad row. It is structural: **any size that parses too large
produces an absurdly low price per kilo, and "cheapest" sorts it straight to the
top.** Every parsing error in the catalogue will surface on the page, and only
the errors will. A page built on `MIN(price/size)` shows the bugs first.

### (b) Some food types are too coarse to rank

```
queijo    EUR 2.63/kg   Queijinho Petit Morango, Banana e Pessego   (children's dessert)
          EUR 5.22/kg   Queijo Flamengo Barra                       (actual cheese)

massa     EUR 0.85/kg   Noodles Sabor a Vegetais                    (instant noodles)
          EUR 0.99/kg   Esparguete Auchan 1KG                       (actual pasta)

atum      EUR 4.33/kg   Lombo de Atum Descongelado                  (frozen tuna loin)
          EUR 6.73/kg   Atum em Oleo Tritao                         (canned tuna)
```

`queijo` holds 1,099 priced products spanning fresh dessert cheese to aged hard
cheese. "Cheapest cheese" is then a true statement about a meaningless set.

Compare the ones that work cleanly, where the type really is one thing:

```
batata   Pingo Doce 0.73  Continente 0.75  Auchan 0.79   EUR/kg
leite    Continente 0.79  Pingo Doce 0.83  Auchan 0.84   EUR/L
azeite   Continente 4.35  Pingo Doce 4.39  Auchan 4.40   EUR/L
frango   Continente 0.84  Pingo Doce 1.66                EUR/kg
```

Those are genuinely useful and genuinely comparable.

### (c) A few products are in the wrong type

```
arroz    BEBIDA ARROZ UHT AUCHAN     a rice DRINK, filed as rice
```

The classifier's rule for plant drinks requires the word "de" (`bebida de
arroz`), and Auchan writes `BEBIDA ARROZ` without it, so it fell through to the
shelf category. Same family as the tequila-filed-as-gin case found earlier.

**The conclusion I draw:** the query is easy and mostly already works. The risk
is not the code — it is publishing confident wrong numbers. So validation comes
before the page, not after.

---

## 3. Design

### Phase 1 — the query layer (`src/lib/comparison.ts`), pure and testable

```ts
type Cell =
  | { kind: "price";         unitPrice: number; product: {...} }
  | { kind: "not-stocked" }                  // store sells nothing of this type
  | { kind: "no-size"; packPrice: number }   // stocked, but EUR/kg is unknowable
```

Three functions, one per group kind, all returning one `Cell` per store:

- `cheapestPerStore(foodType)` — minimum `price / packageSize` per store
- `ownBrandPerStore(foodType)` — same, restricted to each chain's own label
  (`isOwnBrand` already exists in `src/lib/candidates.ts`)
- `namedGroups(foodType)` — the confirmed `ProductGroup` rows for this type

**The two blank states must never render alike.** "Continente does not sell
this" and "Continente sells it but we cannot compute a price per kilo" are
different facts, and today they are common: Continente has a size for only 57%
of its products, and 21% of Pingo Doce's pages carry no sellable price. A blank
cell that means both is a lie the page tells silently.

### Phase 2 — a validation pass, BEFORE any UI

A script that runs all 164 types and flags:

- **impossible unit prices** — anything under EUR 0.10/kg or over EUR 200/kg is
  a parse error, not a bargain. This is what catches the 198-litre beer.
- **implausible size spread within a type** — when the largest pack in a type is
  more than ~50x the smallest, the sizes disagree with each other.
- **types too broad to rank** — measured by how far apart the cheapest and the
  median sit. `batata` will be tight; `queijo` will be wide.

Output is a review artifact listing every type with a verdict, so **you decide**
which types the page ships with. I am not going to guess which of the 164 are
fair comparisons — several are judgement calls about Portuguese groceries, and
that is your call, not mine.

### Phase 3 — the page

`/grupos/[foodType]`, one food type per page, the three groups stacked:

```
Batata
  Cheapest per store    Pingo Doce 0.73    Continente 0.75    Auchan 0.79  EUR/kg
  Own-brand             Pingo Doce 0.89    Continente 0.95    Auchan 0.99  EUR/kg
  Batata do Ze                             Pingo Doce 1.20    Auchan 1.15
                                           (Continente: not stocked)
```

Each cell names the actual product, so a reader can see for themselves when the
cheapest "cheese" is a children's dessert. **Transparency rather than a silent
wrong answer** is the whole design stance, given section 2.

An index page lists the shipped food types with the cheapest store for each.

---

## 4. What this deliberately does NOT do

- **It does not fix the size parser.** The 198-litre beer needs a real fix, but
  that is its own piece of work with its own tests, and phase 2 is what tells us
  how big the problem is first.
- **It does not add a quality tier.** The honest fix for `queijo` is a level
  between "food type" and "product" — hard cheese against fresh cheese. That is
  a substantial new layer and should not be smuggled into a UI plan.
- **It does not touch matching.** The 944 groups stay exactly as they are.
- **It does not re-classify.** Wrong labels are reported by phase 2 and fixed in
  `data/food-types.ts` by hand, as before.

---

## 5. What I need from you

1. **Approve or change the phasing.** My strong recommendation is that phase 2
   comes before phase 3. Building the page first means finding these problems in
   public.
2. **After phase 2, pick the food types to ship.** Better ten types that are
   right than 164 where a third mislead.
3. **One decision I cannot make for you:** when a food type is too broad, do we
   (a) drop it, (b) ship it with a visible warning, or (c) hold it back until a
   quality tier exists? I lean towards (a) for the first release, because a
   wrong price is worse than a missing one for the users you are aiming at.
