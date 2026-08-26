# Hand-made groups flagged for review

Three hand-made groups (in `Product` / `StoreListing`) that the matcher now
**rejects** after enrichment gave both sides a barcode. In each, the two SKUs
share brand, size, price and name but carry **different barcodes**, which the
matcher treats as different products (`same-size barcodes differ`). Looking at
the neighbouring candidates showed the matcher is mostly being *more* correct
than the hand-made group — so these need a human to re-confirm the grouping, not
a change to the matcher.

Flagged 2026-08-25. Decide per group: keep, re-point, or split.

---

### 1. Iogurte Grego Natural Oikos (4-pack) — likely KEEP
- CONT `Iogurte Grego Natural Oikos Danone` €2.59 · 0.44 kg · ean `…036541`
- AUCH `IOGURTE OÎKOS DANONE GREGO NATURAL 4X110G` €2.59 · 0.44 kg · ean `…208276`
- Same Danone prefix `5601050`. Within that range the item-reference digit encodes
  **flavour** (`…036558` = açucarado, `…036572` = morango, …). So the barcode is
  discriminating variants, not noise — the two "natural" codes are plausibly the
  same product reissued/repackaged across chains.
- **Action:** confirm both barcodes are the *natural* variant (not one a flavour),
  then keep the group. The matcher also offers a clean cross-size match to the
  Continente 900 g Oikos, sitting in review.

### 2. Leite de Pastagem Meio Gordo — likely RE-POINT
- CONT `Leite Meio Gordo Pastagem Terra Nostra` €1.42 · 1 L · ean `…500162`
- AUCH `LEITE TERRA NOSTRA PASTAGEM MEIO GORDO 1L` €0.89 · 1 L · ean `…500063`
- The matcher **rejected this pair** but **CONFIRMED** a *different* Auchan Terra
  Nostra meio-gordo at **€1.42** (matching price, brand+size+name `exact`). The
  €0.89 SKU is a genuinely different product (different barcode, 60% cheaper).
- **Action:** the hand-made group probably picked the wrong Auchan SKU. Re-point
  it to the confirmed €1.42 Auchan match, or verify which €/L is real.

### 3. Bolacha Maria Cuétara (200 g) — likely SPLIT
- CONT `Bolachas Maria Cuétara` €0.99 · 0.2 kg · ean `8434165446984`
- AUCH `BOLACHA CUÉTARA MARIA 200G` €0.99 · 0.2 kg · ean `8410120500038`
- Barcodes from **different GS1 company prefixes** (`8434165` vs `8410120`).
  Continente's `8434165` range also contains "Maria d'Oro", so it looks like a
  different manufacturer's line than Auchan's genuine Cuétara (`8410120`).
- **Action:** likely two different biscuits sharing the generic "Maria" name.
  Verify the Continente item's real manufacturer; the matcher's rejection looks
  correct.
