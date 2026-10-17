import { sizesMatch, type ParsedSize } from "./matching";

/**
 * Turning confirmed pairs into product GROUPS.
 *
 * A group is what the app shows: the same product across Continente, Auchan and
 * Pingo Doce, and later across more stores. Pairs are what the matcher decides
 * on, so the last step is assembling them.
 *
 * Groups are the CONNECTED COMPONENTS of the graph whose nodes are catalogue
 * products and whose edges are confirmed pairs. That is what makes the model
 * store-count-agnostic: a pair, a triplet and a future five-store group are the
 * same thing at different sizes, and adding a fourth store needs no change here.
 *
 * The danger is chaining. In ordinary speech "A is like B, B is like C, so A is
 * like C" sounds fine, and it is wrong here, because a match is a THRESHOLD on a
 * score and thresholds do not chain:
 *
 *     Nutella 400 g  --  Nutella 750 g  --  Nutella 1 kg
 *
 * Each link passes on its own. End to end the group holds a 400 g jar and a 1 kg
 * jar - 2.5x apart, exactly what we would reject if we scored those two
 * directly - and the app would show their prices side by side as the same
 * product. Names drift the same way: "Leite Meio Gordo", "Leite Meio Gordo
 * Mimosa", "Leite Mimosa Magro" - every step small, the ends whole milk versus
 * skimmed.
 *
 * So components are checked as a WHOLE, not link by link. Pure and I/O-free, so
 * every guard is tested without a database.
 */

/** How much bigger than one-product-per-store a component may get before it is implausible. */
export const OVERSIZE_FACTOR = 2;

export interface GroupMemberInput {
  productId: string;
  store: string;
  /** parsed package size, when known; null is "unknown", never "matches" */
  size: ParsedSize | null;
}

export interface GroupLink {
  aId: string;
  bId: string;
  /** the rung that confirmed it; "ean"/"exact" are the strong ones */
  rung: string;
}

export type GroupFlag =
  | "duplicate-store"
  | "weak-links-only"
  | "oversized"
  | "size-spread";

export interface ProductGroupResult {
  productIds: string[];
  stores: string[];
  storeCount: number;
  memberCount: number;
  /** every link holding it together was a barcode or brand+size+name match */
  strong: boolean;
  flags: GroupFlag[];
  /** false when a guard says this must not become a group at all */
  emit: boolean;
}

const STRONG_RUNGS = new Set(["ean", "exact"]);

/**
 * Union-find over the confirmed pairs. Chosen over a traversal because the input
 * is an edge list and components are all we want; it also keeps the code short
 * enough to read in one pass.
 */
function components(members: GroupMemberInput[], links: GroupLink[]): Map<string, string[]> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root) as string;
    // path compression, so a long chain does not cost the next lookup
    let cur = x;
    while ((parent.get(cur) ?? cur) !== cur) {
      const next = parent.get(cur) as string;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (x: string, y: string) => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  };

  const known = new Set(members.map((m) => m.productId));
  for (const m of members) parent.set(m.productId, m.productId);
  // A link naming a product we were not given is skipped rather than inventing a
  // node: the caller filters to live products, and a dangling edge would
  // resurrect a delisted one into a group.
  for (const l of links) {
    if (!known.has(l.aId) || !known.has(l.bId)) continue;
    union(l.aId, l.bId);
  }

  const byRoot = new Map<string, string[]>();
  for (const m of members) {
    const root = find(m.productId);
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(m.productId);
    else byRoot.set(root, [m.productId]);
  }
  return byRoot;
}

/**
 * Do all known sizes in a component agree?
 *
 * Compares the extremes rather than adjacent pairs, which is the whole point:
 * the Nutella chain passes every adjacent comparison and fails this one.
 * Unknown sizes are ignored, never treated as agreement - most of the catalogue
 * has no size until enrichment, and treating "unknown" as "fine" would disable
 * the guard exactly where it is needed.
 */
export function sizeSpreadOk(members: GroupMemberInput[]): boolean {
  const sized = members.filter((m) => m.size !== null).map((m) => m.size as ParsedSize);
  if (sized.length < 2) return true;

  // Mixed dimensions (kg against L) can never be the same product.
  if (new Set(sized.map((s) => s.unit)).size > 1) return false;

  let smallest = sized[0];
  let largest = sized[0];
  for (const s of sized) {
    if (s.total < smallest.total) smallest = s;
    if (s.total > largest.total) largest = s;
  }
  return sizesMatch(smallest, largest);
}

/**
 * Build groups from confirmed pairs.
 *
 * `members` must already be filtered to products that are live and eligible;
 * this function does not know about delisting. Returns one result per component
 * INCLUDING the ones it refuses to emit, so the caller can report what was
 * rejected rather than having it disappear silently.
 */
export function buildGroups(
  members: GroupMemberInput[],
  links: GroupLink[]
): ProductGroupResult[] {
  const byId = new Map(members.map((m) => [m.productId, m]));
  const byRoot = components(members, links);

  // Which component each product landed in, so links can be bucketed by
  // component in ONE pass. Filtering all links per component instead is
  // components x links, which on the real ~85,000-candidate input is slow enough
  // to notice.
  const rootOf = new Map<string, string>();
  for (const [root, ids] of byRoot) for (const id of ids) rootOf.set(id, root);

  const linksByRoot = new Map<string, GroupLink[]>();
  for (const l of links) {
    const root = rootOf.get(l.aId);
    if (root === undefined || root !== rootOf.get(l.bId)) continue;
    const bucket = linksByRoot.get(root);
    if (bucket) bucket.push(l);
    else linksByRoot.set(root, [l]);
  }

  const results: ProductGroupResult[] = [];

  for (const [root, productIds] of byRoot) {
    // A product with no confirmed pair is not a group of one; it is unmatched.
    if (productIds.length < 2) continue;

    const group = productIds.map((id) => byId.get(id) as GroupMemberInput);
    const stores = [...new Set(group.map((m) => m.store))];
    const flags: GroupFlag[] = [];

    if (stores.length < group.length) flags.push("duplicate-store");

    // How this component is held together: every link inside it.
    const inside = linksByRoot.get(root) ?? [];
    const strong = inside.length > 0 && inside.every((l) => STRONG_RUNGS.has(l.rung));
    if (!strong) flags.push("weak-links-only");

    const oversized = group.length > stores.length * OVERSIZE_FACTOR;
    if (oversized) flags.push("oversized");

    const spreadOk = sizeSpreadOk(group);
    if (!spreadOk) flags.push("size-spread");

    results.push({
      productIds: [...productIds].sort(),
      stores: stores.sort(),
      storeCount: stores.length,
      memberCount: group.length,
      strong,
      flags,
      // A duplicate store or a weak link is worth flagging but still usable. An
      // oversized component or a size spread means the chaining above has fused
      // things that are not one product, so it must not be shown at all.
      emit: !oversized && spreadOk,
    });
  }

  return results;
}

/**
 * A group already in the database, with its current members.
 */
export interface ExistingGroup {
  id: string;
  productIds: string[];
}

export type RetiredReason = "merged" | "dissolved" | "refused";

export interface GroupPlan {
  /** clusters that carry on an existing group, under that group's id */
  kept: { id: string; group: ProductGroupResult; changed: boolean }[];
  /** clusters that overlap no existing group, or lost every one to a bigger overlap */
  created: ProductGroupResult[];
  /** existing groups no cluster carried on */
  retired: { id: string; reason: RetiredReason; mergedIntoId: string | null }[];
}

/**
 * Decide which new cluster carries on which existing group, so a group keeps
 * its id from one matcher run to the next.
 *
 * Each emitted cluster takes over the existing group it shares the most
 * products with. Taken greedily, biggest overlap first, and one-to-one: when
 * two groups merge, the one sharing more products keeps its id and the other is
 * retired as "merged" into it; when a group splits, the bigger part keeps the id
 * and the rest is a new group. A group whose products are all in no cluster any
 * more is "dissolved"; one whose cluster failed a guard is "refused". Ties are
 * broken by the older id, which sorts first, so the result never depends on the
 * order the clusters arrive in.
 */
export function reconcileGroups(existing: ExistingGroup[], clusters: ProductGroupResult[]): GroupPlan {
  const emitted = clusters.filter((c) => c.emit);

  const groupOf = new Map<string, string>();
  for (const g of existing) for (const id of g.productIds) groupOf.set(id, g.id);

  // Every (cluster, group) pair that shares a product, with how many it shares.
  const overlaps: { cluster: number; group: string; shared: number }[] = [];
  for (const [i, c] of emitted.entries()) {
    const shared = new Map<string, number>();
    for (const id of c.productIds) {
      const g = groupOf.get(id);
      if (g !== undefined) shared.set(g, (shared.get(g) ?? 0) + 1);
    }
    for (const [group, n] of shared) overlaps.push({ cluster: i, group, shared: n });
  }
  overlaps.sort(
    (a, b) =>
      b.shared - a.shared ||
      (a.group < b.group ? -1 : a.group > b.group ? 1 : 0) ||
      a.cluster - b.cluster
  );

  const idOfCluster = new Map<number, string>();
  const claimed = new Set<string>();
  for (const o of overlaps) {
    if (idOfCluster.has(o.cluster) || claimed.has(o.group)) continue;
    idOfCluster.set(o.cluster, o.group);
    claimed.add(o.group);
  }

  const before = new Map(existing.map((g) => [g.id, [...g.productIds].sort().join(" ")]));
  const kept: GroupPlan["kept"] = [];
  const created: ProductGroupResult[] = [];
  const clusterOf = new Map<string, number>();
  for (const [i, c] of emitted.entries()) {
    for (const id of c.productIds) clusterOf.set(id, i);
    const id = idOfCluster.get(i);
    if (id === undefined) created.push(c);
    else kept.push({ id, group: c, changed: before.get(id) !== c.productIds.join(" ") });
  }

  // Products sitting in a cluster that a guard refused to emit.
  const refused = new Set(clusters.filter((c) => !c.emit).flatMap((c) => c.productIds));

  const retired: GroupPlan["retired"] = [];
  for (const g of existing) {
    if (claimed.has(g.id)) continue;
    // Where did most of its products go?
    const into = new Map<string, number>();
    for (const id of g.productIds) {
      const i = clusterOf.get(id);
      const target = i === undefined ? undefined : idOfCluster.get(i);
      if (target !== undefined) into.set(target, (into.get(target) ?? 0) + 1);
    }
    const best = [...into].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    if (best) retired.push({ id: g.id, reason: "merged", mergedIntoId: best[0] });
    else if (g.productIds.some((id) => refused.has(id))) retired.push({ id: g.id, reason: "refused", mergedIntoId: null });
    else retired.push({ id: g.id, reason: "dissolved", mergedIntoId: null });
  }

  return { kept, created, retired };
}
