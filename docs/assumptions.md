# The assumptions behind the data

Started 23 October 2026, at the user's request. Every time the project takes
something as true without having proved it, it belongs here: what we assume,
why, how it could be wrong, and how we would notice. Add to this file whenever
a new assumption is made; mark one **checked** when it has been measured.

Status: **open** = assumed, not measured; **checked** = measured, with the
date and the figure; **known gap** = known to be wrong in places, accepted for
now.

---

## 1. Collecting the data - all three stores

| # | We assume | Why | It would be wrong if | How we would notice | Status |
|---|---|---|---|---|---|
| 1.1 | The price a store's website shows an anonymous visitor is the price in its shops. | It is the only price we can read. | Prices differ by region or shop, or online prices differ from shelf prices. | Only by comparing with receipts or shop visits; nothing in the crawl can see it. | open |
| 1.2 | Loyalty-card prices (Cartão Continente, Poupa Mais) are not part of the price. | The website shows them only to signed-in customers, and we never sign in. | A shopper with the card pays less than we show. | Not visible to the crawl. | known gap |
| 1.3 | Choosing no shop or postal code gives the store's normal national price. | The sites show a price without asking for a location. | A default shop or region is applied silently. | Not visible to the crawl. | open |
| 1.4 | A product's number in its address (e.g. 2597619) is the same product from night to night. | The stores use it as their product number. | A store gives an old number to a new product. | The barcode changing under the same number is detected and the old product is set aside ("replaced"). | checked for Continente (barcode swap check, every night) |
| 1.5 | A price of 0 or 0.01 means "not for sale", not a real price. | Measured: nothing real costs one cent; the next lowest price in the catalogue is 0.05. | A real product costs a few cents. | Would show as a missing price. | checked (October 2026) |
| 1.6 | A product shown without a price is "listed, not for sale today", not gone. | That is how the pages present out-of-stock products. | The store uses no price for something else. | — | open |
| 1.7 | A product whose page answers "gone" on 3 nights in a row is no longer sold. | One bad night must not delist; three in a row is strong evidence. | The product is only temporarily unavailable (seasonal fruit). | It is looked at again after 7 and 30 days, then every 90, and returns if back. | known gap at Continente (see 2.6) |
| 1.8 | A page that cannot be reached tells us nothing about the product. | A network problem is not the store's answer. | — | — | rule, not assumption |
| 1.9 | A "promotion" is a crossed-out earlier price above today's price; a price below the recommended price (PVPR) is not one. | The user's rule, 22 October 2026. | The store runs promotions without a crossed-out price (e.g. "buy 2, pay 1", card offers). | Those promotions are simply not counted. | known gap |
| 1.10 | The store's own list of products (sitemap) names every product it sells online. | Robots.txt points to it as the complete list. | A product is sold but left out of the list. | At Pingo Doce, the 14 products on each department page could be checked against it (not built yet). At Auchan, the listing walk is a second, independent source. | open |
| 1.11 | Too many changes at once in one night (dead pages, products leaving food, prices moving) mean our reading broke, not the store. | A store does not reprice a third of its range overnight. | A store really does reorganise at once. | The night fails loudly; a person looks. Limits in `src/scrapers/crawl/brakes.ts`. | open |

## 2. Continente

| # | We assume | Why | It would be wrong if | How we would notice | Status |
|---|---|---|---|---|---|
| 2.1 | **A product on a shelf marked "not food" contains no food for people.** Not-food shelves: Cultura e Lazer, Beleza e Higiene, Beleza, Higiene e Cuidado Pessoal, Limpeza, Animais, Consumíveis, Papelaria, Brinquedos e Jogos, Casa e Jardim. | The shelf names describe non-food. | Continente files a food there (e.g. a gift box with chocolates under Cultura e Lazer, sweets for children under Brinquedos). | The products set aside keep their names; they can be searched for food words. Not done yet. | open |
| 2.2 | "Bebé" holds no food we compare. | Baby food is a separate piece of work, not done yet. | — | — | known gap (baby food missing) |
| 2.3 | The shelf a product page names is right. | It is Continente's own filing. | A product is misfiled. | Odd prices in the comparison check sometimes reveal it. | open |
| 2.4 | On a "mixed" shelf (Destaques, Sugestões Continente, Folhetos Pesquisa) a product is food only if our classifier recognises its name. | These shelves hold anything. | A real food with a name the classifier does not know is set aside. | About 22 products set aside this way so far; can be listed. | open |
| 2.5 | Supplements and sports nutrition are not compared. | Decided with the user. | — | — | decision |
| 2.6 | A page that sends the visitor to the home page means "gone". | Continente answers that way for products it no longer sells. | Measured 22 October: it also answers that way for products only temporarily unavailable (seasonal fruit); 1 of 10 such products was back on sale. | Products are looked at again after 7 and 30 days. The nightly report counts "answered gone but still in the sitemap" (8 on 23 October). | known gap |
| 2.7 | A product judged "not food" stays not food; it is looked at again only every 90 days. | Products rarely move from non-food to food. | Continente moves a product into a food shelf. | Found within 90 days. | open |
| 2.8 | An empty brand means Continente's own range. | Its fresh products carry no brand. | A third-party product has no brand filled in. | — | open |
| 2.9 | The size comes from the page's unit line, or, failing that, from the price per kilo or litre the page shows. | That is where Continente prints it. | The two disagree, or the line means something else (e.g. drained weight). | Odd prices per kilo in the comparison check. | open |
| 2.10 | Continente's list (sitemap) is complete; 68,336 addresses had never been opened on 23 October, and are being opened once each. | — | — | 2,000 opened on 23 October: 415 food, 222 not food, 1,363 gone. | in progress |
| 2.11 | The sitemap's "last modified" date changes when the page changes (e.g. the price). | Unknown - being measured. | The date moves for other reasons, or not at all. | The test recording dates and page changes, started 23 October 2026. | open, being measured |

## 3. Pingo Doce

| # | We assume | Why | It would be wrong if | How we would notice | Status |
|---|---|---|---|---|---|
| 3.1 | **The department in a product's address says whether it is food**, so non-food products are never opened. Not-food departments include Limpeza, Higiene Pessoal e Beleza, Casa e Eletrodomésticos, Livraria e Papelaria, Parafarmácia, Animais, Bebé e Criança. | The address carries the department. | A food sits in a non-food department, or the address names a different department from the page. | Not checked. | open |
| 3.2 | In mixed aisles (Promoções, As Nossas Marcas, seasonal: Natal, Páscoa) a product is food only if its name is recognised. | These aisles hold anything. | A real food with an unrecognised name is set aside (425 left out on 17 October; about half real food). | Listed in the nightly report under "left out". | known gap |
| 3.3 | "Nosso / Nossa ..." brands (Nossa Padaria, Nosso Talho) are Pingo Doce's own brand. | They name Pingo Doce's own counters. | A real brand starts with "Nosso". | — | open |
| 3.4 | "0,00 €" or "Indisponível" means listed but not for sale. | That is how the pages show it. | — | — | checked (pages read 22 October) |
| 3.5 | Pingo Doce publishes no barcodes, so its products are matched to the other stores by brand, size and name only. | No barcode anywhere on its site. | Two different products share brand, size and a similar name. | The checked sample of 22 October: 6 of 60 groups wrong, mostly where one store had two candidates; such groups are now hidden. | checked (sample of 60) |
| 3.6 | The department page counts include products listed in two departments, so they cannot be compared with ours one by one. | Measured: they disagree both ways. | — | — | checked |

## 4. Auchan

| # | We assume | Why | It would be wrong if | How we would notice | Status |
|---|---|---|---|---|---|
| 4.1 | **The shelf named on each listing tile says whether it is food.** Not-food shelves include eletrodomésticos, casa, beleza, animais, bebé (baby food moved there around 31 August). | The tile carries the store's shelf. | A food sits on a non-food shelf. | Not checked. | open |
| 4.2 | Walking the full listing, plus each department's listing, shows every product on sale. | Robots.txt allows it and the store prints its own count per listing. | Products reachable only through deep sub-shelves or search. | Known: a handful (38 on 21 October). Since 23 October Auchan's own list (sitemap) is a second check. | known gap |
| 4.3 | A tile without a price is out of stock, and is skipped. | That is how the listing shows it. | — | A product out of stock the first time it is seen never enters the catalogue. Measured 22 October: 2,209 food products in Auchan's own list were never in our catalogue. | known gap |
| 4.4 | The size written in the name (e.g. "500G", "2X75G") is the pack size; the tile's price per kilo is used when the name has none. | Auchan writes sizes into 86% of its names. | The name's figure is a range or a grade (fish graded by weight). | Ranges are recognised and refused. | checked (October 2026) |
| 4.5 | A product missing from the walk and from Auchan's own list, whose page does not say "out of stock", is going. | Two independent store sources agree. | Auchan's list lags behind. | Counted nightly in the report. | open |

## 5. Deciding what kind of food a product is

| # | We assume | Why | It would be wrong if | How we would notice | Status |
|---|---|---|---|---|---|
| 5.1 | The first noun of a product's name is the food ("Queijo Fresco de Vaca" is cheese). | True for most Portuguese grocery names. | The name starts with a brand or a description. | Hand checks: about 4% wrong by this step (20 October). | checked (sample) |
| 5.2 | After a cut word ("Peito de Frango", "Lombos de Bacalhau") the next food word is the food. | Cuts name their animal. | A prepared dish or a snack (fixed for many: cold cuts, ready meals, coated, cooked). | Hand checks: about 13% wrong by this step. | checked (sample) |
| 5.3 | A shelf that names exactly one food decides the kind when the name does not. | The store filed it there. | The shelf is broader than its name. | Hand checks: about 10% wrong by this step. | checked (sample) |
| 5.4 | A product with no recognised kind is not compared. | Unknown is better than a wrong guess. | — | 9,054 of 45,120 products had no kind on 22 October. | known gap |
| 5.5 | Sweets, desserts and most drinks are kept but not shown. | The user's decision for now. | — | — | decision |

## 6. Comparing prices

| # | We assume | Why | It would be wrong if | How we would notice | Status |
|---|---|---|---|---|---|
| 6.1 | Products of the same kind, sub-kind and labels (e.g. "Leite · Meio-gordo", frozen vs fresh) can be compared by price per kilo, litre or unit. | That is what a shopper compares. | Quality differs a lot within a kind. | — | open |
| 6.2 | The pack size is the net weight we should divide by. | It is what the store prints. | Tins and jars: drained weight differs from net weight. | Not handled. | known gap |
| 6.3 | A comparison needs at least two chains. | One chain alone is not a comparison. | — | — | decision |
| 6.4 | A product not seen for 14 days is no longer on sale. | The crawls run nightly. | — | — | rule |
| 6.5 | Today's price, promotion included, is the price compared. | It is what the shopper pays today. | — | — | decision |
| 6.6 | Two products are the same product if they share a barcode (Continente, Auchan); at Pingo Doce, if brand, size and name agree. | Barcodes identify a product. | Restricted barcodes (starting with 2) are the store's own and are never matched. | — | checked |

## 7. The basket

| # | We assume | Why | It would be wrong if | How we would notice | Status |
|---|---|---|---|---|---|
| 7.1 | For each item, the basket takes the cheapest product of each store in that comparison. | A shopper picks the cheapest. | The shopper wants a particular brand. | — | decision |
| 7.2 | The fair total is the one over items every store has; the second total shows each store's own sum with what it lacks. | The user's design, 22 October 2026. | — | — | decision |
