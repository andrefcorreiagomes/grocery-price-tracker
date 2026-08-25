import { prisma } from "../lib/db";
import { classifyCandidate, parseSize, type Candidate, type Rung } from "../lib/matching";
import { isOwnBrand } from "../lib/candidates";
import { buildGroups, type GroupLink, type GroupMemberInput } from "../lib/grouping";
import type { MatchVerdict, Store } from "@/generated/prisma/client";

/**
 * Decide every candidate pair, then assemble the confirmed ones into groups.
 *
 *   npm run match
 *   npm run match -- --sample=8     # show example decisions per rung
 *
 * Three passes, in order, because each depends on the one before:
 *
 *   1. revalidate  retire decisions whose products died or changed id
 *   2. decide      classify every candidate, record a verdict
 *   3. group       cluster the live confirmed pairs into n-store groups
 *
 * No network. Idempotent: re-running re-decides from current evidence, except
 * where a HUMAN has ruled, which is never overwritten.
 */

const CHUNK = 500;
/** Only these rungs are safe to confirm without a person looking. */
const AUTO_CONFIRM: ReadonlySet<Rung> = new Set<Rung>(["ean", "exact"]);

function arg(name: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

interface ProductRow {
  id: string;
  store: Store;
  name: string;
  brand: string | null;
  price: number | null;
  ean: string | null;
  packageSize: number | null;
  unit: string | null;
  delistedAt: Date | null;
  supersededById: string | null;
}

/**
 * The shape classifyCandidate wants.
 *
 * Size comes from the enriched column when we have it and from the NAME
 * otherwise - measured, Auchan writes the size into the name 85% of the time
 * while Continente and Pingo Doce essentially never do, so the fallback is the
 * only size most Auchan products have without a page fetch.
 */
function toCandidate(p: ProductRow): Candidate {
  const size =
    p.packageSize !== null && p.unit
      ? parseSize(`${p.packageSize} ${p.unit}`)
      : parseSize(p.name);
  return {
    name: p.name,
    brand: p.brand ?? "",
    ean: p.ean,
    size,
    unitPrice: size && p.price !== null && size.total > 0 ? p.price / size.total : null,
    ownBrand: isOwnBrand(p.brand, p.store),
  };
}

function verdictFor(rung: Rung, vetoed: boolean): MatchVerdict {
  if (rung === "reject") return "REJECTED";
  if (AUTO_CONFIRM.has(rung) && !vetoed) return "CONFIRMED";
  return "REVIEW";
}

async function main() {
  const sample = arg("sample") ? Number(arg("sample")) : 0;
  const started = Date.now();

  const products = await prisma.catalogueProduct.findMany({
    select: {
      id: true, store: true, name: true, brand: true, price: true,
      ean: true, packageSize: true, unit: true, delistedAt: true, supersededById: true,
    },
  });
  const byId = new Map<string, ProductRow>(products.map((p) => [p.id, p]));
  console.log(`${products.length.toLocaleString()} catalogue products loaded.`);

  // ------------------------------------------------------------ 1. revalidate
  // A match is not permanent: a product gets delisted or re-issued under a new
  // id, and the pair that was right yesterday is wrong today. Retire those
  // BEFORE deciding anything, so grouping never sees them and the surviving
  // member is free to be matched against something else.
  const existing = await prisma.matchDecision.findMany({
    where: { retiredAt: null },
    select: { id: true, aId: true, bId: true, verdict: true, source: true },
  });

  const now = new Date();
  let retired = 0;
  let repointed = 0;
  const reopened = new Set<string>();

  for (const d of existing) {
    const a = byId.get(d.aId);
    const b = byId.get(d.bId);

    // A member that changed id keeps its match: re-point at the successor
    // rather than retiring, so the crawler's barcode-continuity repair carries
    // through to matching instead of orphaning the pair.
    const aSucc = a?.supersededById ? byId.get(a.supersededById) : undefined;
    const bSucc = b?.supersededById ? byId.get(b.supersededById) : undefined;
    if ((aSucc && !aSucc.delistedAt) || (bSucc && !bSucc.delistedAt)) {
      const newA = aSucc && !aSucc.delistedAt ? aSucc.id : d.aId;
      const newB = bSucc && !bSucc.delistedAt ? bSucc.id : d.bId;
      const [x, y] = newA <= newB ? [newA, newB] : [newB, newA];
      // The successor pair may already exist; then this row is simply retired.
      const clash = await prisma.matchDecision.findUnique({ where: { aId_bId: { aId: x, bId: y } } });
      if (clash) {
        await prisma.matchDecision.update({
          where: { id: d.id },
          data: { retiredAt: now, retiredReason: "member superseded (successor already paired)" },
        });
      } else {
        await prisma.matchDecision.update({ where: { id: d.id }, data: { aId: x, bId: y } });
      }
      repointed++;
      continue;
    }

    const missing = !a || !b;
    const delisted = a?.delistedAt !== null || b?.delistedAt !== null;
    if (missing || delisted) {
      await prisma.matchDecision.update({
        where: { id: d.id },
        data: {
          retiredAt: now,
          retiredReason: missing ? "member no longer in catalogue" : "member delisted",
        },
      });
      retired++;
      // The survivor goes back in the pool: it can be confirmed against a
      // different product on this very run.
      if (a && !a.delistedAt) reopened.add(a.id);
      if (b && !b.delistedAt) reopened.add(b.id);
    }
  }

  console.log(
    `\n1. revalidate: ${retired.toLocaleString()} retired, ` +
      `${repointed.toLocaleString()} re-pointed to a successor, ` +
      `${reopened.size.toLocaleString()} product(s) re-opened for matching`
  );

  // --------------------------------------------------------------- 2. decide
  // nameSimilarity comes along: generation computed it with `productTokens`,
  // which strips the chain's own label and folds plurals. Recomputing it inside
  // classifyCandidate uses raw tokens and scores the same pair far lower.
  const candidates = await prisma.matchCandidate.findMany({
    select: { aId: true, bId: true, nameSimilarity: true },
  });

  // HUMAN verdicts are authoritative and are never recomputed.
  const human = new Map(
    (
      await prisma.matchDecision.findMany({
        where: { source: "HUMAN" },
        select: { aId: true, bId: true },
      })
    ).map((d) => [`${d.aId}|${d.bId}`, true])
  );

  const byRung = new Map<string, number>();
  const byVerdict = new Map<string, number>();
  let vetoedCount = 0;
  let skippedHuman = 0;
  let skippedDead = 0;
  const samples = new Map<string, string[]>();

  const rows: {
    aId: string; bId: string; verdict: MatchVerdict; rung: string; vetoed: boolean;
    nameSimilarity: number; sizeRatio: number | null; priceGap: number | null; reason: string;
  }[] = [];

  for (const c of candidates) {
    const [aId, bId] = c.aId <= c.bId ? [c.aId, c.bId] : [c.bId, c.aId];
    if (human.has(`${aId}|${bId}`)) {
      skippedHuman++;
      continue;
    }
    const a = byId.get(aId);
    const b = byId.get(bId);
    // A pair over a delisted product is not decided at all: it would only be
    // retired again on the next run.
    if (!a || !b || a.delistedAt !== null || b.delistedAt !== null) {
      skippedDead++;
      continue;
    }

    const result = classifyCandidate(toCandidate(a), toCandidate(b), {
      nameSimilarity: c.nameSimilarity,
    });
    const verdict = verdictFor(result.rung, result.vetoed);

    byRung.set(result.rung, (byRung.get(result.rung) ?? 0) + 1);
    byVerdict.set(verdict, (byVerdict.get(verdict) ?? 0) + 1);
    if (result.vetoed) vetoedCount++;

    if (sample > 0) {
      const bucket = samples.get(result.rung) ?? [];
      if (bucket.length < sample) {
        bucket.push(
          `    ${result.nameSimilarity.toFixed(2)} ${verdict.padEnd(9)} ` +
            `${a.store.slice(0, 4)} ${a.name.slice(0, 40).padEnd(40)} | ` +
            `${b.store.slice(0, 4)} ${b.name.slice(0, 40)}  (${result.reason})`
        );
        samples.set(result.rung, bucket);
      }
    }

    rows.push({
      aId, bId, verdict,
      rung: result.rung,
      vetoed: result.vetoed,
      nameSimilarity: result.nameSimilarity,
      sizeRatio: result.sizeRatio,
      priceGap: result.priceGap,
      reason: result.reason,
    });
  }

  // Upsert in chunks: a decision may already exist from a previous run.
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.$transaction(
      rows.slice(i, i + CHUNK).map((r) =>
        prisma.matchDecision.upsert({
          where: { aId_bId: { aId: r.aId, bId: r.bId } },
          create: { ...r, source: "AUTO" },
          update: { ...r, source: "AUTO", decidedAt: now, retiredAt: null, retiredReason: null },
        })
      )
    );
  }

  console.log(`\n2. decide: ${rows.length.toLocaleString()} pair(s) classified`);
  console.log(`   skipped: ${skippedHuman.toLocaleString()} human-decided, ${skippedDead.toLocaleString()} over a delisted product`);
  console.log("   by verdict:");
  for (const [v, n] of [...byVerdict].sort((x, y) => y[1] - x[1])) {
    console.log(`     ${v.padEnd(10)} ${n.toLocaleString().padStart(8)}`);
  }
  console.log("   by rung:");
  for (const [r, n] of [...byRung].sort((x, y) => y[1] - x[1])) {
    console.log(`     ${r.padEnd(10)} ${n.toLocaleString().padStart(8)}`);
  }
  console.log(`   vetoed: ${vetoedCount.toLocaleString()}`);

  // ---------------------------------------------------------------- 3. group
  const confirmed = await prisma.matchDecision.findMany({
    where: { verdict: "CONFIRMED", retiredAt: null },
    select: { aId: true, bId: true, rung: true },
  });

  const linkedIds = new Set(confirmed.flatMap((d) => [d.aId, d.bId]));
  const members: GroupMemberInput[] = [...linkedIds]
    .map((id) => byId.get(id))
    .filter((p): p is ProductRow => p !== undefined && p.delistedAt === null)
    .map((p) => ({
      productId: p.id,
      store: p.store,
      size:
        p.packageSize !== null && p.unit ? parseSize(`${p.packageSize} ${p.unit}`) : parseSize(p.name),
    }));

  const links: GroupLink[] = confirmed.map((d) => ({ aId: d.aId, bId: d.bId, rung: d.rung }));
  const groups = buildGroups(members, links);
  const emitted = groups.filter((g) => g.emit);

  await prisma.productGroupMember.deleteMany({});
  await prisma.productGroup.deleteMany({});
  for (const g of emitted) {
    await prisma.productGroup.create({
      data: {
        storeCount: g.storeCount,
        memberCount: g.memberCount,
        strong: g.strong,
        flags: g.flags.length > 0 ? JSON.stringify(g.flags) : null,
        members: {
          create: g.productIds.map((id) => ({
            productId: id,
            store: (byId.get(id) as ProductRow).store,
          })),
        },
      },
    });
  }

  const coverage = new Map<number, number>();
  for (const g of emitted) coverage.set(g.storeCount, (coverage.get(g.storeCount) ?? 0) + 1);
  const flagged = new Map<string, number>();
  for (const g of groups) for (const f of g.flags) flagged.set(f, (flagged.get(f) ?? 0) + 1);

  console.log(`\n3. group: ${emitted.length.toLocaleString()} group(s) built from ${confirmed.length.toLocaleString()} confirmed pair(s)`);
  console.log("   by store coverage:");
  for (const [n, count] of [...coverage].sort((a, b) => a[0] - b[0])) {
    const label = n === 2 ? "2 stores (pair)" : n === 3 ? "3 stores (triplet)" : `${n} stores`;
    console.log(`     ${label.padEnd(20)} ${count.toLocaleString().padStart(7)}`);
  }
  console.log(`   strong (all links barcode/brand+size+name): ${emitted.filter((g) => g.strong).length.toLocaleString()}`);
  if (flagged.size > 0) {
    console.log("   guard flags:");
    for (const [f, n] of [...flagged].sort((a, b) => b[1] - a[1])) {
      console.log(`     ${f.padEnd(18)} ${n.toLocaleString().padStart(7)}` + (f === "oversized" || f === "size-spread" ? "  (not emitted)" : ""));
    }
  }
  const rejected = groups.length - emitted.length;
  if (rejected > 0) console.log(`   ${rejected.toLocaleString()} component(s) refused as implausible`);

  await recallFloor(byId);

  if (sample > 0) {
    console.log("\nsample decisions by rung:");
    for (const [rung, lines] of samples) {
      console.log(`\n  ${rung}`);
      for (const line of lines) console.log(line);
    }
  }

  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
}

/**
 * How many of the pairs a human already accepted does the matcher CONFIRM?
 *
 * The same 95 hand-made groups `generate-candidates.ts` measures generation
 * against, asked one stage later: generation only has to surface a pair, the
 * matcher has to decide it. A floor rather than a score - those groups are
 * presumed correct rather than known correct - but a fall here is the clearest
 * signal the matcher has become too strict.
 */
async function recallFloor(byId: Map<string, ProductRow>) {
  const listings = await prisma.storeListing.findMany({
    select: { productId: true, store: true, storeProductId: true },
  });
  // StoreListing keys on the STORE's own product id, the catalogue on our cuid,
  // so the join goes through (store, storeProductId).
  const bySku = new Map<string, string>();
  for (const c of await prisma.catalogueProduct.findMany({ select: { id: true, store: true, storeProductId: true } })) {
    bySku.set(`${c.store}:${c.storeProductId}`, c.id);
  }

  const groups = new Map<string, string[]>();
  for (const l of listings) {
    const id = bySku.get(`${l.store}:${l.storeProductId}`);
    if (!id) continue;
    const bucket = groups.get(l.productId) ?? [];
    bucket.push(id);
    groups.set(l.productId, bucket);
  }

  const known = new Set<string>();
  for (const ids of groups.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = byId.get(ids[i]);
        const b = byId.get(ids[j]);
        if (!a || !b || a.store === b.store) continue; // same-store pairs are out of scope
        known.add([ids[i], ids[j]].sort().join("|"));
      }
    }
  }
  if (known.size === 0) return;

  const decided = await prisma.matchDecision.findMany({
    where: { retiredAt: null },
    select: { aId: true, bId: true, verdict: true },
  });
  const verdictOf = new Map(decided.map((d) => [`${d.aId}|${d.bId}`, d.verdict]));

  let confirmed = 0;
  let review = 0;
  let rejected = 0;
  let absent = 0;
  for (const k of known) {
    const v = verdictOf.get(k);
    if (v === "CONFIRMED") confirmed++;
    else if (v === "REVIEW") review++;
    else if (v === "REJECTED") rejected++;
    else absent++;
  }

  console.log(`\nagainst the ${groups.size} hand-made groups (${known.size} cross-store pairs):`);
  console.log(`   confirmed: ${confirmed}   review: ${review}   REJECTED: ${rejected}   never generated: ${absent}`);
  if (rejected > 0) {
    console.log(`   ^ the ${rejected} rejected are the ones to look at: a human accepted them and the matcher refused`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
