# Candidate food types — pick the ones you want

Derived from **38,688 food-section products** across the three stores by taking
the head noun of each product name (chain labels stripped, plurals folded) and
keeping anything appearing in 2+ stores with 20+ products.

**How to use this:** delete the lines you don't want, or mark the ones you do.
Whatever survives becomes the initial `data/food-types.ts`.

---

## Decisions so far (2026-08-25)

1. **Keep every candidate below EXCEPT the "Snacks e doces" section**, which is
   dropped entirely — removed from this file, recorded here so the choice is not
   silently lost. Say the word if any of them should come back: they were
   `goma`, `tortita`, `granola`, `rebuçado`, `floco`, `drageia`, `tosta`,
   `caramelo`, `bombom`, `muesli`.

2. **`peito`, `lombo` and `lombinho` stay OUT as food types but their products
   must NOT be lost.** They are cuts of an animal, not foods in their own right.
   This has a real consequence for the classifier: the head noun of "Peito de
   Frango" is `peito`, so a naive head-only rule would drop a chicken product
   entirely. **The classifier must look past a known cut word to the next
   meaningful token** — "Peito de Frango" resolves to `frango`, "Lombo de Porco"
   to `porco`. Same for `posta`, `perna`, `tira`, `medalhão`, `costeleta`.

3. **`queijinho` is an ALIAS of `queijo`, not a drop.** It was already in the
   dropped list, but dropping it would lose the products. It becomes an extra
   entry in `queijo.heads` so those products classify as cheese.

4. **`proteína` stays dropped** — it was already in the list below; confirmed.

---

## Where sizes can come from (measured 2026-08-25)

Answering "can we get the missing sizes?" — yes, from three sources, and they
split cleanly by store:

| store | total | has size | from name | sold /kg | still needs a fetch |
|---|---|---|---|---|---|
| Auchan | 17,952 | 1,480 | **13,860** | 1,226 | 1,386 (8%) |
| Continente | 17,181 | 1,280 | 8 | 0 | **15,893 (92%)** |
| Pingo Doce | 3,555 | 5 | 12 | 9 | **3,529 (99%)** |
| **total** | **38,688** | 2,765 | 13,880 | 1,235 | **20,808 (54%)** |

**1. Parse the size out of the name — free, no requests.** `parseSize` already
exists in `src/lib/matching.ts`. Auchan writes the size into the name almost
always ("BATATA VERMELHA AUCHAN 3 KG"); Continente and Pingo Doce essentially
never do. This alone takes sized coverage from **2,765 to 17,880 (46%)** at zero
cost — a 6.5x gain for a parsing pass over data we already hold.

**2. The "sold by weight" convention — also free.** A name ending in `KG` or
saying `granel` is priced per kilo already, so its unit price *is* its price.
Another 1,235 products.

**3. Fetch the product page — 1 request each.** This already works:
`enrich-candidates.ts` does exactly this, and the measured split is that
Continente publishes both barcode and size on the page, while Pingo Doce
publishes size and no barcode at all. So the page is the *only* source for the
two stores that need it most.

Cost of closing the remaining 20,808: the enricher fetches the three stores
concurrently and rate-limits per host, so the run costs the slowest store, not
the sum — Continente's 15,893 at ~1/sec ≈ **4.4 hours**. It does not have to be
one run: it can be scoped to the food types picked here, and to products missing
a size, which is far fewer.

**The potato case makes it concrete:** 89 fresh potato products — 9 already
sized, 20 parseable from the name, 8 sold per kg, and **52 needing a fetch,
almost all Pingo Doce** ("Batata Vermelha", "Batata para Cozer Embalada" — no
size anywhere in the name).

Columns: `total` products · `sized` = how many have a package size (the ones a
€/kg comparison can actually use) · then per-store counts.

> **Note the `sized` column.** It is low almost everywhere — `batata` has 323
> products but only 30 with a size. Food types with a low `sized` count can be
> grouped and browsed, but **cannot yet be ranked by €/kg**. See "Where sizes can
> come from" below: most of this is fixable, roughly half of it for free.

---

## Frescos — fruta e legumes

| total | sized | CONT | PING | AUCH | food type |
|---|---|---|---|---|---|
| 323 | 30 | 117 | 71 | 135 | **batata** |
| 146 | 10 | 52 | 25 | 69 | **tomate** |
| 91 | 1 | 33 | 13 | 45 | cogumelo |
| 71 | 16 | 24 | 17 | 30 | **alho** |
| 69 | 3 | 20 | 10 | 39 | couve |
| 67 | 4 | 29 | 9 | 29 | **maçã** |
| 58 | 8 | 16 | 12 | 30 | ervilha |
| 52 | 8 | 19 | 9 | 24 | **cebola** |
| 41 | 0 | 24 | 3 | 14 | pera |
| 39 | 4 | 12 | 7 | 20 | pimento |
| 34 | 0 | 6 | 5 | 23 | melão |
| 34 | 1 | 8 | 9 | 17 | ameixa |
| 33 | 5 | 13 | 5 | 15 | uva |
| 30 | 7 | 9 | 8 | 13 | mirtilo |
| 30 | 2 | 9 | 7 | 14 | pêssego |
| 27 | 4 | 8 | 4 | 15 | manga |
| 26 | 0 | 10 | 5 | 11 | abóbora |
| 25 | 4 | 8 | 5 | 12 | espinafre |
| 24 | 5 | 9 | 3 | 12 | morango |
| 24 | 2 | 5 | 7 | 12 | **cenoura** |
| 24 | 4 | 6 | 4 | 14 | alface |
| 24 | 12 | 10 | 5 | 9 | framboesa |
| 24 | 0 | 5 | 4 | 15 | melancia |
| 23 | 1 | 7 | 4 | 12 | laranja |
| 23 | 1 | 7 | 2 | 14 | kiwi |
| 22 | 0 | 8 | 4 | 10 | pepino |
| 22 | 2 | 6 | 4 | 12 | ananás |
| 21 | 0 | 6 | 4 | 11 | beterraba |
| 135 | 29 | 60 | 17 | 58 | salada (saco preparado) |

## Talho — carne

| total | sized | CONT | PING | AUCH | food type |
|---|---|---|---|---|---|
| 261 | 2 | 97 | 47 | 117 | salsicha |
| 171 | 14 | 66 | 47 | 58 | fiambre |
| 139 | 9 | 42 | 23 | 74 | chouriço |
| 118 | 0 | 33 | 31 | 54 | presunto |
| 105 | 7 | 42 | 4 | 59 | hambúrguer |
| 99 | 3 | 27 | 17 | 55 | bife |
| 59 | 4 | 18 | 18 | 23 | bacon |
| 46 | 3 | 17 | 6 | 23 | almôndega |
| 45 | 0 | 12 | 11 | 22 | mortadela |
| 45 | 2 | 18 | 11 | 16 | nugget |
| 43 | 0 | 12 | 8 | 23 | paio |
| 42 | 0 | 13 | 6 | 23 | frango |
| 39 | 0 | 17 | 6 | 16 | salame |
| 38 | 6 | 16 | 7 | 15 | alheira |
| 33 | 0 | 12 | 4 | 17 | farinheira |
| 32 | 0 | 8 | 2 | 22 | carne (picada) |
| 26 | 4 | 9 | 5 | 12 | linguiça |
| 24 | 0 | 6 | 5 | 13 | picanha |
| 23 | 2 | 8 | 2 | 13 | salpicão |
| 22 | 0 | 6 | 4 | 12 | morcela |
| 21 | 0 | 10 | 2 | 9 | costeleta |

## Peixaria — peixe e marisco

| total | sized | CONT | PING | AUCH | food type |
|---|---|---|---|---|---|
| 215 | 11 | 75 | 41 | 99 | filete |
| 165 | 16 | 65 | 35 | 65 | **atum** |
| 132 | 9 | 46 | 16 | 70 | **bacalhau** |
| 83 | 0 | 32 | 12 | 39 | camarão |
| 80 | 4 | 25 | 16 | 39 | sardinha |
| 53 | 9 | 16 | 8 | 29 | salmão |
| 43 | 0 | 13 | 8 | 22 | pescada |
| 38 | 2 | 13 | 6 | 19 | lula |
| 36 | 4 | 9 | 8 | 19 | polvo |
| 33 | 0 | 12 | 7 | 14 | douradinho |
| 26 | 0 | 5 | 3 | 18 | pota |
| 22 | 0 | 6 | 5 | 11 | choco |
| 20 | 0 | 5 | 3 | 12 | amêijoa |

## Laticínios e ovos

| total | sized | CONT | PING | AUCH | food type |
|---|---|---|---|---|---|
| 1328 | 93 | 536 | 209 | 583 | **queijo** |
| 1190 | 215 | 367 | 373 | 450 | **iogurte** |
| 405 | 97 | 183 | 18 | 204 | **leite** |
| 163 | 38 | 70 | 18 | 75 | **manteiga** |
| 108 | 27 | 40 | 31 | 37 | kefir |
| 102 | 4 | 27 | 27 | 48 | pudim |
| 84 | 4 | 45 | 32 | 7 | vegurte |
| 79 | 13 | 39 | 1 | 39 | nata |
| 59 | 1 | 28 | 1 | 30 | **ovo** |
| 45 | 8 | 19 | 6 | 20 | requeijão |
| 45 | 5 | 15 | 9 | 21 | mousse |
| 65 | 4 | 41 | 0 | 24 | bífidus |

## Mercearia

| total | sized | CONT | PING | AUCH | food type |
|---|---|---|---|---|---|
| 1037 | 89 | 461 | 1 | 575 | bolacha |
| 570 | 82 | 156 | 62 | 352 | molho |
| 554 | 77 | 195 | 118 | 241 | **massa** |
| 293 | 0 | 18 | 3 | 272 | chocolate |
| 284 | 48 | 106 | 60 | 118 | **arroz** |
| 248 | 2 | 95 | 67 | 86 | gelatina |
| 229 | 8 | 75 | 36 | 118 | **farinha** |
| 218 | 79 | 92 | 41 | 85 | **azeite** |
| 197 | 49 | 99 | 1 | 97 | néctar |
| 196 | 20 | 69 | 36 | 91 | **feijão** |
| 168 | 40 | 59 | 17 | 92 | **vinagre** |
| 167 | 23 | 82 | 33 | 52 | noodles |
| 144 | 19 | 49 | 14 | 81 | paté |
| 127 | 23 | 50 | 11 | 66 | sopa |
| 115 | 6 | 43 | 3 | 69 | biscoito |
| 113 | 2 | 37 | 25 | 51 | caldo |
| 110 | 2 | 38 | 8 | 64 | tempero |
| 102 | 26 | 33 | 24 | 45 | maionese |
| 101 | 25 | 29 | 18 | 54 | polpa |
| 99 | 7 | 38 | 10 | 51 | azeitona |
| 93 | 17 | 30 | 21 | 42 | **açúcar** |
| 87 | 12 | 25 | 6 | 56 | pasta |
| 77 | 28 | 26 | 13 | 38 | **óleo** |
| 68 | 2 | 29 | 13 | 26 | mel |
| 67 | 8 | 24 | 14 | 29 | **sal** |
| 66 | 8 | 24 | 8 | 34 | pimenta |
| 56 | 0 | 22 | 10 | 24 | ketchup |
| 55 | 6 | 13 | 5 | 37 | pipoca |
| 55 | 0 | 19 | 7 | 29 | semente |
| 53 | 7 | 13 | 14 | 26 | amendoim |
| 50 | 6 | 15 | 11 | 24 | mostarda |
| 49 | 2 | 17 | 10 | 22 | milho |
| 49 | 4 | 14 | 11 | 24 | tortilha |
| 44 | 13 | 14 | 15 | 15 | caju |
| 42 | 0 | 20 | 12 | 10 | amêndoa |
| 41 | 0 | 19 | 7 | 15 | adoçante |
| 35 | 9 | 17 | 4 | 14 | quinoa |
| 35 | 6 | 14 | 1 | 21 | caril |
| 34 | 2 | 12 | 8 | 14 | marmelada |
| 31 | 2 | 13 | 5 | 13 | lentilha |
| 42 | 0 | 20 | 6 | 16 | grão |
| 30 | 2 | 12 | 2 | 16 | tremoço |
| 29 | 0 | 11 | 8 | 10 | fermento |
| 28 | 6 | 10 | 5 | 13 | canela |

## Padaria e pastelaria

| total | sized | CONT | PING | AUCH | food type |
|---|---|---|---|---|---|
| 525 | 41 | 190 | 102 | 233 | **pão** |
| 227 | 13 | 75 | 49 | 103 | bolo |
| 73 | 1 | 30 | 13 | 30 | croissant |
| 43 | 0 | 16 | 7 | 20 | tarte |
| 40 | 0 | 12 | 10 | 18 | madalena |
| 39 | 2 | 24 | 2 | 13 | broa |
| 30 | 2 | 12 | 6 | 12 | torta |
| 25 | 0 | 14 | 2 | 9 | baguete |

## Congelados e refeições

| total | sized | CONT | PING | AUCH | food type |
|---|---|---|---|---|---|
| 694 | 73 | 254 | 172 | 268 | gelado |
| 207 | 12 | 91 | 34 | 82 | pizza |
| 37 | 9 | 18 | 2 | 17 | lasanha |
| 35 | 0 | 10 | 2 | 23 | refeição |
| 32 | 2 | 12 | 2 | 18 | wrap |
| 31 | 0 | 15 | 3 | 13 | folhado |
| 25 | 2 | 10 | 6 | 9 | rissol |
| 23 | 2 | 7 | 2 | 14 | panqueca |
| 20 | 2 | 6 | 3 | 11 | empada |

## Bebidas

> ⚠ **Pingo Doce reads 0 across this whole section.** That is a bug in my
> food-section filter, not a real absence — its drinks live under a top-level
> category my rule does not match yet. Fix before trusting these counts.

| total | sized | CONT | PING | AUCH | food type |
|---|---|---|---|---|---|
| 1611 | 241 | 9 | 0 | 1602 | vinho |
| 402 | 14 | 140 | 0 | 262 | cerveja |
| 367 | 6 | 166 | 0 | 201 | refrigerante |
| 330 | 35 | 138 | 0 | 192 | **água** |
| 286 | 33 | 114 | 0 | 172 | cereais |
| 247 | 1 | 79 | 0 | 168 | chá |
| 240 | 28 | 95 | 0 | 145 | **café** |
| 238 | 0 | 81 | 0 | 157 | sumo |
| 238 | 0 | 121 | 0 | 117 | infusão |
| 185 | 7 | 6 | 0 | 179 | espumante |
| 112 | 17 | 6 | 0 | 106 | licor |
| 102 | 2 | 16 | 0 | 86 | whisky |
| 74 | 19 | 3 | 0 | 71 | gin |
| 67 | 0 | 30 | 0 | 37 | sidra |
| 43 | 6 | 9 | 0 | 34 | aguardente |
| 38 | 3 | 7 | 0 | 31 | batido |
| 25 | 5 | 1 | 0 | 24 | vodka |
| 22 | 9 | 2 | 0 | 20 | rum |

## Snacks e doces — DROPPED (decision 1)

Removed at your request. Was: `goma`, `tortita`, `granola`, `rebuçado`,
`floco`, `drageia`, `tosta`, `caramelo`, `bombom`, `muesli`.

---

## Dropped as not-a-food-type

These describe a **cut, format or packaging** rather than a food, so they are
not food types. Say if you want any back.

**Animal cuts — the products must still be classified** (decision 2): the
classifier reads past these to the animal that follows. **The list below is
empirical, not guessed** — see "Meat and fish cuts" further down, which found
144 such words against my hand-written five.

**Formats and packaging — nothing to preserve:**

`mix`, `tira`, `tábua`, `cubo`, `flor`, `bola`, `rolo`, `delícia`, `crocante`,
`espetada`, `barrinha`, `palito`, `salteado`, `concentrado`, `condimento`,
`aroma`, `mini`, `preparado`, `mistura`, `saqueta`, `tablete`, `barra`,
`cápsula`, `pastilha`, `snack`, `bebida`, `creme`, `doce`, `suplemento`,
**`proteína`** (confirmed, decision 4)

**Aliases — folded into another type, NOT dropped:**

- `queijinho` → **`queijo`** (decision 3)
- `hamburguere`, `hamburger` → **`hambúrguer`** (spelling variants, found empirically)

---

## Meat and fish cuts (measured 2026-08-25)

Scanning 10,076 meat/fish/frescos products for names whose head noun is not an
animal but which mention one later found **144 such words**. My hand-written
list had five. This is why it had to be measured.

**It also proved the naive rule wrong.** The top hits are not cuts at all:

| hides an animal | head word | example |
|---|---|---|
| 152 | `queijo` | Queijo Fresco **de Vaca** |
| 84 | `fiambre` | Fiambre de Peito **de Peru** |
| 29 | `salsicha` | Salsicha **de Frango** |
| 18 | `arroz` | Arroz **de Pato** |
| 11 | `pizza` | Pizza **de Atum** |

These are genuine food types that merely name an animal. "Read past the head
whenever an animal follows" would file cheese under `vaca`. Hence the ordered
rule: **curated food type first, cut list second, `null` otherwise.**

### Cuts that should resolve to the animal

Anatomical: `peito`, `lombo`, `lombinho`, `posta`, `perna`, `pernil`,
`perninha`, `asa`, `asinha`, `coxa`, `coxinha`, `costeleta`, `entrecosto`,
`entrecote`, `cachaço`, `maminha`, `vazia`, `lagarto`, `fraldinha`, `secreto`,
`pluma`, `presa`, `paleta`, `entremeada`, `barriga`, `bochecha`, `orelha`,
`rabo`, `cauda`, `cabeça`, `cara`, `mão`, `pata`, `língua`, `fígado`, `moela`,
`miúdo`, `toucinho`, `painho`, `tentáculo`, `ova`, `boca`, `dobrada`

Cut formats: `bife`, `bifinho`, `tira`, `tranche`, `medalhão`, `escalope`,
`rodela`, `cubo`, `pedaço`, `porção`, `metade`, `suprema`, `atado`

Preparations naming their meat: `strogonoff`, `jardineira`, `caldeirada`,
`feijoada`, `bifana`, `rojão`, `patanisca`, `canjinha`, `moqueca`, `carpaccio`,
`tataki`, `roti`, `grelhada`, `panado`, `panadinho`, `empanada`, `cordon`

> ⚠ **Needs your eye.** Two judgement calls I have made provisionally:
> - `picanha`, `entrecosto`, `secreto`, `alheira` are cuts people shop for *by
>   name*; I kept `picanha` as its own food type and treated the rest as cuts.
> - The "preparations" group is genuinely ambiguous — is *Strogonoff de Vitela*
>   a strogonoff or a vitela? I resolved them to the animal; say if you would
>   rather they be their own types.

### Head words that are food types, NOT cuts

Must be matched as themselves even though an animal follows: `queijo`,
`fiambre`, `salsicha`, `chouriço`, `presunto`, `mortadela`, `paio`,
`farinheira`, `alheira`, `salpicão`, `salsichão`, `bacon`, `pizza`, `arroz`,
`sopa`, `caldo`, `salada`, `massa`, `paté`, `empada`, `empadão`, `rissol`,
`folhado`, `lasanha`, `croquete`, `quiche`, `wrap`, `baguete`, `sande`,
`mousse`, `broa`, `requeijão`, `ravioli`, `noodles`, `gelado`, `filete`,
`douradinho`, `nugget`, `almôndega`, `hambúrguer`, `pastel`, `pastéis`.
