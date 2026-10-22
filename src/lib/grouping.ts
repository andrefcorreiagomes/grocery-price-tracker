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
  /** the product's usable barcode, when known */
  barcode?: string | null;
  /**
   * Whether its store publishes barcodes at all (Continente and Auchan do,
   * Pingo Doce does not). A missing barcode from such a store is something not
   * yet read, not something that cannot be known.
   */
  barcodeExpected?: boolean;
}

/** A pair the matcher examined and refused, e.g. same size with different barcodes. */
export interface RefusedPair {
  aId: string;
  bId: string;
}

export interface GroupLink {
  aId: string;
  bId: string;
  /** the rung that confirmed it; "ean"/"exact" are the strong ones */
  rung: string;
}

/**
 * What a guard found. Two of them keep a group off the site while it is kept
 * for review (HIDDEN_FLAGS); three stop it being a group at all (see `emit`).
 *
 *   duplicate-store       one store has two products in it, not proven the same
 *                         product by a shared barcode
 *   barcode-unconfirmed   a store that publishes barcodes has a product here
 *                         whose barcode is unknown, or two known barcodes differ
 *   weak-links-only       held together only by links a person confirmed
 *   oversized, size-spread, refused-pair   not emitted
 */
export type GroupFlag =
  | "duplicate-store"
  | "barcode-unconfirmed"
  | "weak-links-only"
  | "oversized"
  | "size-spread"
  | "refused-pair";

/**
 * The flags that keep a group off the site. Decided with the user on 22 October
 * 2026, from a sample of 60 rebuilt groups checked against the stores' own
 * pages: every wrong group carried one of these, or a refused pair.
 */
export const HIDDEN_FLAGS: ReadonlySet<GroupFlag> = new Set(["duplicate-store", "barcode-unconfirmed"]);

/** May a group with these stored flags (JSON, as in ProductGroup.flags) appear on the site? */
export function shownOnSite(storedFlags: string | null): boolean {
  if (!storedFlags) return true;
  try {
    return !(JSON.parse(storedFlags) as string[]).some((f) => HIDDEN_FLAGS.has(f as GroupFlag));
  } catch {
    return false; // unreadable flags prove nothing, so the group is not shown
  }
}

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
 * At most one product per store - or two or more that share one barcode, which
 * is one product the store lists twice (Pingo Doce lists the same Evian twice).
 */
function sameProductTwiceAtMost(group: GroupMemberInput[]): boolean {
  const byStore = new Map<string, GroupMemberInput[]>();
  for (const m of group) byStore.set(m.store, [...(byStore.get(m.store) ?? []), m]);
  for (const list of byStore.values()) {
    if (list.length < 2) continue;
    const codes = new Set(list.map((m) => m.barcode ?? null));
    if (codes.has(null) || codes.size > 1) return false;
  }
  return true;
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
  links: GroupLink[],
  refused: RefusedPair[] = []
): ProductGroupResult[] {
  const byId = new Map(members.map((m) => [m.productId, m]));
  const byRoot = components(members, links);
  const refusedKey = new Set(refused.flatMap((r) => [`${r.aId}|${r.bId}`, `${r.bId}|${r.aId}`]));

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

    // Two products from one store are the same product listed twice only when
    // a barcode says so; otherwise two different products may have been joined
    // (strawberry with strawberry-and-kiwi yoghurt, Gallo's regular olive oil
    // with its organic one - both in the sample of 22 October 2026).
    if (!sameProductTwiceAtMost(group)) flags.push("duplicate-store");

    // Every barcode we know must agree, and a store that publishes barcodes
    // must have shown us its product's. Pingo Doce publishes none, so its place
    // rests on brand, size and name. 5 of 24 Continente-Auchan pairs matched on
    // name alone carried different barcodes in that sample.
    const known = new Set(group.map((m) => m.barcode).filter((b): b is string => !!b));
    const missing = group.some((m) => m.barcodeExpected && !m.barcode);
    if (known.size > 1 || missing) flags.push("barcode-unconfirmed");

    // How this component is held together: every link inside it.
    const inside = linksByRoot.get(root) ?? [];
    const strong = inside.length > 0 && inside.every((l) => STRONG_RUNGS.has(l.rung));
    if (!strong) flags.push("weak-links-only");

    const oversized = group.length > stores.length * OVERSIZE_FACTOR;
    if (oversized) flags.push("oversized");

    const spreadOk = sizeSpreadOk(group);
    if (!spreadOk) flags.push("size-spread");

    // Two of its products were examined as a pair and REFUSED, yet chaining
    // joined them through a third: Continente and Auchan refused for different
    // barcodes, each matched to Pingo Doce on name. 72 such groups on 22
    // October 2026. A group holding a refused pair is not a group.
    const holdsRefused = productIds.some((a, i) => productIds.slice(i + 1).some((b) => refusedKey.has(`${a}|${b}`)));
    if (holdsRefused) flags.push("refused-pair");

    results.push({
      productIds: [...productIds].sort(),
      stores: stores.sort(),
      storeCount: stores.length,
      memberCount: group.length,
      strong,
      flags,
      // A duplicate store, an unconfirmed barcode or a weak link is worth
      // flagging, and the group is kept so a person can look (the site hides the
      // first two: HIDDEN_FLAGS). An oversized component, a size spread or a
      // refused pair means the chaining above has fused things that are not one
      // product, so it is not a group at all.
      emit: !oversized && spreadOk && !holdsRefused,
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
