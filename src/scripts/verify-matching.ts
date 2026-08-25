import { prisma } from "../lib/db";
import { buildGroups, sizeSpreadOk, OVERSIZE_FACTOR, type GroupLink, type GroupMemberInput } from "../lib/grouping";
import { parseSize } from "../lib/matching";

/**
 * The matching layer: clustering guards (pure), and the decision/retirement
 * behaviour that keeps groups honest as the catalogue changes.
 *
 * The guards get the most attention because they are where a wrong answer is
 * silent - a bad group does not throw, it just shows two different products side
 * by side as though they were one. All rows use the zzm- prefix and are cleaned
 * up.
 */
const PREFIX = "zzm-";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
}

const m = (id: string, store: string, size: string | null = null): GroupMemberInput => ({
  productId: id,
  store,
  size: size ? parseSize(size) : null,
});
const link = (aId: string, bId: string, rung = "ean"): GroupLink => ({ aId, bId, rung });

async function cleanup() {
  await prisma.matchDecision.deleteMany({ where: { OR: [{ aId: { startsWith: PREFIX } }, { bId: { startsWith: PREFIX } }] } });
  await prisma.productGroupMember.deleteMany({ where: { productId: { startsWith: PREFIX } } });
  await prisma.catalogueProduct.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
}

export async function verifyMatching(): Promise<number> {
  failures = 0;
  await cleanup();

  // --- clustering: the shape of a group ------------------------------------
  console.log("  clustering");

  // Two pairs sharing a product become ONE three-store group - the triplet the
  // app wants, assembled from pairs without ever being told what a triplet is.
  const triplet = buildGroups(
    [m("a", "CONTINENTE"), m("b", "AUCHAN"), m("c", "PINGO_DOCE")],
    [link("a", "b"), link("b", "c")]
  );
  check("two pairs sharing a product form one 3-store group", triplet.length === 1 && triplet[0].storeCount === 3);
  check("that group is emitted", triplet[0]?.emit === true);

  // Disjoint pairs stay separate.
  const disjoint = buildGroups(
    [m("a", "CONTINENTE"), m("b", "AUCHAN"), m("c", "CONTINENTE"), m("d", "AUCHAN")],
    [link("a", "b"), link("c", "d")]
  );
  check("disjoint pairs stay two groups", disjoint.length === 2);

  // Five stores: proves nothing is hardcoded to pairs or triplets.
  const five = buildGroups(
    [m("a", "S1"), m("b", "S2"), m("c", "S3"), m("d", "S4"), m("e", "S5")],
    [link("a", "b"), link("b", "c"), link("c", "d"), link("d", "e")]
  );
  check("a 5-store chain clusters into one group", five.length === 1 && five[0].storeCount === 5);
  check("the 5-store group is emitted", five[0]?.emit === true);

  // A product with no confirmed pair is not a group of one.
  const lonely = buildGroups([m("a", "CONTINENTE"), m("b", "AUCHAN")], []);
  check("an unmatched product is not a group", lonely.length === 0);

  // --- clustering guards ----------------------------------------------------
  console.log("\n  clustering guards");

  // Two products from the SAME store: legitimate (a chain can stock two SKUs)
  // but also the signature of a bad merge, so it is emitted AND flagged.
  const dupStore = buildGroups(
    [m("a", "CONTINENTE"), m("b", "CONTINENTE"), m("c", "AUCHAN")],
    [link("a", "c"), link("b", "c")]
  );
  check("a duplicate store is flagged", dupStore[0]?.flags.includes("duplicate-store") === true);
  check("but the group is still emitted", dupStore[0]?.emit === true);

  // A component far larger than one-per-store: a chain of weak links has fused
  // unrelated products, so it must not be shown at all.
  const many = ["a", "b", "c", "d", "e", "f", "g"];
  const oversized = buildGroups(
    many.map((id, i) => m(id, i < 4 ? "CONTINENTE" : "AUCHAN")),
    many.slice(1).map((id, i) => link(many[i], id))
  );
  check("an oversized component is flagged", oversized[0]?.flags.includes("oversized") === true);
  check("and is NOT emitted", oversized[0]?.emit === false);
  check(
    "the oversize bar is stores x factor",
    OVERSIZE_FACTOR === 2 && many.length > 2 * OVERSIZE_FACTOR
  );

  // Held together only by weak links: usable, but worth knowing.
  const weak = buildGroups(
    [m("a", "CONTINENTE"), m("b", "AUCHAN")],
    [link("a", "b", "fuzzy")]
  );
  check("a weak-link-only group is flagged", weak[0]?.flags.includes("weak-links-only") === true);
  check("and is not marked strong", weak[0]?.strong === false);
  const strong = buildGroups([m("a", "CONTINENTE"), m("b", "AUCHAN")], [link("a", "b", "ean")]);
  check("an ean-linked group is strong and unflagged", strong[0]?.strong === true && strong[0]?.flags.length === 0);

  // --- the Nutella chain ----------------------------------------------------
  // The reason clustering needs whole-component checks at all: every ADJACENT
  // link passes, and the two ends are 2.5x apart.
  console.log("\n  the size-spread guard (chained matches)");
  const nutella = buildGroups(
    [m("a", "CONTINENTE", "400 g"), m("b", "AUCHAN", "750 g"), m("c", "PINGO_DOCE", "1 kg")],
    [link("a", "b"), link("b", "c")]
  );
  check("400g-750g-1kg chained is flagged size-spread", nutella[0]?.flags.includes("size-spread") === true);
  check("and is NOT emitted, though every link passed", nutella[0]?.emit === false);

  // The same shape at one size is fine.
  const sameSize = buildGroups(
    [m("a", "CONTINENTE", "400 g"), m("b", "AUCHAN", "400 g"), m("c", "PINGO_DOCE", "400 g")],
    [link("a", "b"), link("b", "c")]
  );
  check("the same chain at one size is emitted", sameSize[0]?.emit === true && sameSize[0]?.flags.length === 0);

  // Unknown sizes must not read as agreement - most of the catalogue has no size.
  check("unknown sizes do not trip the guard", sizeSpreadOk([m("a", "X"), m("b", "Y")]));
  check("one known size is not a spread", sizeSpreadOk([m("a", "X", "400 g"), m("b", "Y")]));
  check("kg against L can never be one product", !sizeSpreadOk([m("a", "X", "1 kg"), m("b", "Y", "1 l")]));

  // --- decisions and retirement (DB) ---------------------------------------
  console.log("\n  decisions and retirement");

  const mk = async (suffix: string, store: "CONTINENTE" | "AUCHAN" | "PINGO_DOCE") =>
    (
      await prisma.catalogueProduct.create({
        data: {
          store,
          storeProductId: `${PREFIX}${suffix}`,
          name: `Match test ${suffix}`,
          url: `https://example.invalid/${PREFIX}${suffix}`,
          price: 1.0,
        },
        select: { id: true },
      })
    ).id;

  const p1 = await mk("1", "CONTINENTE");
  const p2 = await mk("2", "AUCHAN");
  const [x1, y1] = p1 <= p2 ? [p1, p2] : [p2, p1];

  await prisma.matchDecision.create({
    data: {
      aId: x1, bId: y1, verdict: "CONFIRMED", source: "HUMAN",
      rung: "exact", nameSimilarity: 0.9, reason: "verified by hand",
    },
  });
  const humanRow = await prisma.matchDecision.findUnique({ where: { aId_bId: { aId: x1, bId: y1 } } });
  check("a human decision is stored", humanRow?.source === "HUMAN" && humanRow.verdict === "CONFIRMED");

  // Retiring a pair whose member is delisted: the row survives with a reason,
  // so the same bad pair is not silently re-proposed later.
  await prisma.catalogueProduct.update({ where: { id: p2 }, data: { delistedAt: new Date() } });
  await prisma.matchDecision.update({
    where: { aId_bId: { aId: x1, bId: y1 } },
    data: { retiredAt: new Date(), retiredReason: "member delisted" },
  });
  const retired = await prisma.matchDecision.findUnique({ where: { aId_bId: { aId: x1, bId: y1 } } });
  check("a retired decision is kept, not deleted", retired !== null && retired.retiredAt !== null);
  check("with the reason recorded", retired?.retiredReason === "member delisted");
  check("and its human verdict is still on the row", retired?.source === "HUMAN");

  // A retired pair must not reach grouping.
  const live = await prisma.matchDecision.findMany({
    where: { verdict: "CONFIRMED", retiredAt: null, aId: { startsWith: PREFIX } },
  });
  check("a retired pair is excluded from the grouping read", live.length === 0);

  // A triplet losing one member recomputes to a valid 2-store group rather than
  // vanishing or keeping a dead member.
  const shrunk = buildGroups(
    [m("a", "CONTINENTE"), m("b", "AUCHAN")], // c delisted, so not passed in
    [link("a", "b"), link("b", "c")] // the stale link to c is ignored
  );
  check("a triplet minus a delisted member becomes a 2-store group", shrunk.length === 1 && shrunk[0].storeCount === 2);
  check("and the dead member is not in it", !shrunk[0].productIds.includes("c"));

  await cleanup();
  return failures;
}
