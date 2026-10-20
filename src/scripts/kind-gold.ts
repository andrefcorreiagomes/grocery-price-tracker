import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { decideKind } from "../lib/kind-decisions";
import { isFoodSection } from "../lib/food-types";

/**
 * The products whose kind of food has been verified, and a check that rule
 * changes keep them. Asked for by the user on 20 October 2026: a change to the
 * classifier must not break products already classified correctly.
 *
 *   npm run kinds:gold -- write    snapshot every product settled in review
 *                                  (a reviewed product, or a member of a
 *                                  reviewed group) with its kind, into
 *                                  data/kind-gold.json
 *   npm run kinds:gold             check today's rules give each the same kind
 *
 * Alongside it, data/kind-gold-hand.json: the products judged correct by hand.
 * Write it again after recording a review batch, so the newly settled
 * products are protected too. A product no longer on sale is skipped.
 * `verify:nightly` runs the check.
 */

const FILE = "data/kind-gold.json";

interface Gold {
  store: string;
  id: string;
  name: string;
  kind: string | null;
}

async function rows() {
  return prisma.catalogueProduct.findMany({
    where: { delistedAt: null },
    select: { store: true, storeProductId: true, name: true, categoryPath: true },
  });
}

export async function writeGold(): Promise<number> {
  const gold: Gold[] = [];
  for (const r of await rows()) {
    if (!isFoodSection(r.store, r.categoryPath)) continue;
    const d = decideKind(r);
    if (d.reviewed) gold.push({ store: r.store, id: r.storeProductId, name: r.name, kind: d.id });
  }
  gold.sort((a, b) => a.store.localeCompare(b.store) || a.id.localeCompare(b.id));
  writeFileSync(FILE, JSON.stringify(gold, null, 0).replace(/\},\{/g, "},\n{") + "\n");
  return gold.length;
}

/**
 * Products judged correct by hand in the three samples of 20 October 2026
 * (976, plus 26 whose kind had since changed by approved decisions, at their
 * new kind). Fixed: `write` never touches it.
 */
const HAND_FILE = "data/kind-gold-hand.json";

/** Returns the products whose kind today differs from the verified one. */
export async function checkGold(): Promise<{ checked: number; broken: string[] }> {
  const gold = [FILE, HAND_FILE].flatMap((f) => JSON.parse(readFileSync(f, "utf8")) as Gold[]);
  const now = new Map((await rows()).map((r) => [`${r.store}\t${r.storeProductId}`, r]));
  const broken: string[] = [];
  let checked = 0;
  for (const g of gold) {
    const r = now.get(`${g.store}\t${g.id}`);
    if (!r) continue;
    checked++;
    const kind = decideKind(r).id;
    if (kind !== g.kind) broken.push(`${g.store} ${g.id} ${g.name}: verified ${g.kind ?? "no kind"}, now ${kind ?? "no kind"}`);
  }
  return { checked, broken };
}

async function main() {
  if (process.argv[2] === "write") {
    console.log(`${await writeGold()} verified products written to ${FILE}`);
    return;
  }
  const { checked, broken } = await checkGold();
  console.log(`${checked} verified products checked, ${broken.length} changed`);
  for (const b of broken) console.log(`  ${b}`);
  if (broken.length) process.exitCode = 1;
}

// Run directly, not when imported by verify-nightly.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("kind-gold.ts")) {
  main().then(() => prisma.$disconnect());
}
