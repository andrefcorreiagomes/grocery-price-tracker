import { prisma } from "../lib/db";
import { isTin, nameTinWeights, placeFrom, type Weights } from "../lib/tin-weights";
import { reviewedTinWeight } from "../../data/tin-weights";

/**
 * A tin's two weights, worked out again every night after the crawls and the
 * matcher (the owner's choice, 10 November 2026; src/lib/tin-weights.ts). No
 * store requests.
 *
 *   npm run tins:weights            writes
 *   npm run tins:weights -- --dry   counts only
 *
 * The page readers (Continente, Pingo Doce) have already written what each page
 * labels, as source "page". This adds:
 *   - Auchan's names, which give both weights ("840 (480)G"): source "name";
 *   - for a tin missing a weight, the label of the same product at another
 *     store that gives both - the same barcode first ("barcode:<STORE>"), then
 *     the product our matcher grouped with it ("same-product:<STORE>");
 *   - then a judgement checked by hand (data/tin-weights.ts): "reviewed".
 * Only a store's own label is used to place another's, never a weight placed
 * this way, so nothing is built on a deduction. Everything but "page" is
 * recomputed each night, so a placement goes when its grounds go.
 */

type Row = {
  id: string; store: string; storeProductId: string; name: string; labels: string | null;
  packageSize: number | null; unit: string | null; eanNormalized: string | null;
  fullWeight: number | null; fullWeightSource: string | null;
  drainedWeight: number | null; drainedWeightSource: string | null;
};
type Placed = { fullWeight: number | null; fullWeightSource: string | null; drainedWeight: number | null; drainedWeightSource: string | null };

/** What the product's own store labels: its page, or (Auchan) its name. */
function labelled(r: Row): { weights: Weights; source: string | null } {
  if (r.store === "AUCHAN") {
    const w = nameTinWeights(r.name);
    return { weights: w ?? { full: null, drained: null }, source: w ? "name" : null };
  }
  return {
    weights: {
      full: r.fullWeightSource === "page" ? r.fullWeight : null,
      drained: r.drainedWeightSource === "page" ? r.drainedWeight : null,
    },
    source: "page",
  };
}

async function main() {
  const dry = process.argv.includes("--dry");
  const rows: Row[] = await prisma.catalogueProduct.findMany({
    where: { delistedAt: null },
    select: {
      id: true, store: true, storeProductId: true, name: true, labels: true, packageSize: true, unit: true, eanNormalized: true,
      fullWeight: true, fullWeightSource: true, drainedWeight: true, drainedWeightSource: true,
    },
  });
  const tins = rows.filter((r) => isTin(r));
  const tinIds = new Set(tins.map((r) => r.id));

  const own = new Map(tins.map((r) => [r.id, labelled(r)]));
  const both = (r: Row) => {
    const w = own.get(r.id)?.weights;
    return w && w.full !== null && w.drained !== null ? { full: w.full, drained: w.drained } : null;
  };
  const byEan = new Map<string, Row[]>();
  for (const r of tins) {
    if (!r.eanNormalized || !both(r)) continue;
    byEan.set(r.eanNormalized, [...(byEan.get(r.eanNormalized) ?? []), r]);
  }
  const live = new Set((await prisma.productGroup.findMany({ where: { retiredAt: null }, select: { id: true } })).map((g) => g.id));
  const members = (await prisma.productGroupMember.findMany({ select: { groupId: true, productId: true } })).filter((m) => live.has(m.groupId));
  const groupOf = new Map<string, string[]>();
  const inGroup = new Map<string, string[]>();
  for (const m of members) {
    groupOf.set(m.productId, [...(groupOf.get(m.productId) ?? []), m.groupId]);
    inGroup.set(m.groupId, [...(inGroup.get(m.groupId) ?? []), m.productId]);
  }
  const byId = new Map(tins.map((r) => [r.id, r]));

  const counts = { tins: tins.length, labelledBoth: 0, barcode: 0, sameProduct: 0, reviewed: 0, oneLabelled: 0, unplaced: 0, written: 0, cleared: 0 };
  const updates: { id: string; data: Placed }[] = [];

  for (const r of rows) {
    let next: Placed = { fullWeight: null, fullWeightSource: null, drainedWeight: null, drainedWeightSource: null };
    if (tinIds.has(r.id)) {
      const { weights, source } = own.get(r.id) as { weights: Weights; source: string | null };
      next = {
        fullWeight: weights.full, fullWeightSource: weights.full === null ? null : source,
        drainedWeight: weights.drained, drainedWeightSource: weights.drained === null ? null : source,
      };
      if (weights.full !== null && weights.drained !== null) {
        counts.labelledBoth++;
      } else {
        const candidates: { how: string; other: Row }[] = [
          ...(r.eanNormalized ? byEan.get(r.eanNormalized) ?? [] : []).map((o) => ({ how: "barcode", other: o })),
          ...(groupOf.get(r.id) ?? []).flatMap((g) => (inGroup.get(g) ?? []).map((id) => byId.get(id)).filter((o): o is Row => !!o && !!both(o)).map((o) => ({ how: "same-product", other: o }))),
        ].filter((c) => c.other.store !== r.store);
        let placed = false;
        for (const c of candidates) {
          const got = placeFrom(weights, r.packageSize, both(c.other) as { full: number; drained: number });
          if (!got) continue;
          const tag = `${c.how}:${c.other.store}`;
          next = {
            fullWeight: got.full, fullWeightSource: weights.full !== null ? source : tag,
            drainedWeight: got.drained, drainedWeightSource: weights.drained !== null ? source : tag,
          };
          if (c.how === "barcode") counts.barcode++;
          else counts.sameProduct++;
          placed = true;
          break;
        }
        if (!placed && weights.full === null && weights.drained === null) {
          const judged = reviewedTinWeight(r.store, r.storeProductId, r.packageSize);
          if (judged) {
            if (judged.is !== "drained") next = { ...next, fullWeight: judged.shows, fullWeightSource: "reviewed" };
            if (judged.is !== "full") next = { ...next, drainedWeight: judged.shows, drainedWeightSource: "reviewed" };
            counts.reviewed++;
            placed = true;
          }
        }
        if (!placed) {
          if (weights.full === null && weights.drained === null) counts.unplaced++;
          else counts.oneLabelled++;
        }
      }
    } else if (r.fullWeightSource === "page" || r.drainedWeightSource === "page") {
      // Not a tin, but its page labels a drained weight (an olive jar the tree
      // does not call a tin): kept as read.
      next = { fullWeight: r.fullWeight, fullWeightSource: r.fullWeightSource, drainedWeight: r.drainedWeight, drainedWeightSource: r.drainedWeightSource };
    }
    const same =
      next.fullWeight === r.fullWeight && next.fullWeightSource === r.fullWeightSource &&
      next.drainedWeight === r.drainedWeight && next.drainedWeightSource === r.drainedWeightSource;
    if (!same) {
      updates.push({ id: r.id, data: next });
      if (next.fullWeight === null && next.drainedWeight === null) counts.cleared++;
      else counts.written++;
    }
  }

  if (!dry) {
    for (let i = 0; i < updates.length; i += 200) {
      await prisma.$transaction(updates.slice(i, i + 200).map((u) => prisma.catalogueProduct.update({ where: { id: u.id }, data: u.data })));
    }
  }
  console.log(
    `tins on sale or listed: ${counts.tins}; both weights from the store's own label ${counts.labelledBoth}; ` +
      `placed from another store's label: by barcode ${counts.barcode}, by the same matched product ${counts.sameProduct}; ` +
      `by a checked judgement ${counts.reviewed}; one weight labelled, the other unknown ${counts.oneLabelled}; ` +
      `a single number nobody labels ${counts.unplaced}`
  );
  console.log(`${dry ? "would write" : "wrote"} ${counts.written} product(s), cleared ${counts.cleared}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
