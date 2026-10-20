import { decideKind, type KindDecision, type KindProduct } from "./kind-decisions";

/**
 * How sure are we of a product's kind of food? Decided from what was measured
 * by hand on 20 October 2026 (three samples, about 1,100 products):
 *
 *   head noun ......... about 4% wrong  -> high
 *   past a cut word ... about 13% wrong -> review
 *   by the shelf ...... about 10% wrong -> review
 *
 * plus two things that settle a doubt: review (data/kind-reviews.ts), and the
 * barcode - the same barcode at another chain names the same physical
 * product, so it must be the same kind.
 *
 *   high    decided in review; or the head noun decided it; or a cut-word or
 *           shelf decision is confirmed by the same barcode at another chain,
 *           decided there by head noun or in review
 *   review  a cut word or the shelf decided it, unconfirmed; or the same
 *           barcode got a different kind at another chain; or this product
 *           has no kind but the same barcode has one elsewhere
 *   none    no kind, and nothing suggests one - honest, not a review case
 *
 * Pure: the caller builds the barcode index once.
 */

export type Certainty = "high" | "review" | "none";

export interface CertaintyInput extends KindProduct {
  eanNormalized: string | null;
}

/** One product's decision, as the barcode index holds it. */
export interface BarcodePeer {
  store: string;
  d: KindDecision;
}

export interface CertaintyResult {
  level: Certainty;
  d: KindDecision;
  why: string;
}

/** Every product's decision, by barcode. */
export function barcodeIndex(products: CertaintyInput[]): Map<string, BarcodePeer[]> {
  const index = new Map<string, BarcodePeer[]>();
  for (const p of products) {
    if (!p.eanNormalized) continue;
    const peers = index.get(p.eanNormalized) ?? [];
    peers.push({ store: p.store, d: decideKind(p) });
    index.set(p.eanNormalized, peers);
  }
  return index;
}

/** A decision another can lean on: made by the head noun, or in review. */
const firm = (d: KindDecision) => d.reviewed !== null || d.e.step === "head";

export function certaintyOf(p: CertaintyInput, index: Map<string, BarcodePeer[]>): CertaintyResult {
  const d = decideKind(p);
  const others = (p.eanNormalized ? index.get(p.eanNormalized) ?? [] : []).filter((o) => o.store !== p.store);
  const otherKinds = new Set(others.map((o) => o.d.id).filter((id): id is string => id !== null));

  if (d.reviewed) {
    return { level: d.id ? "high" : "none", d, why: `decided in review, batch ${d.reviewed.batch}` };
  }
  if (!d.id) {
    if (otherKinds.size > 0) {
      return { level: "review", d, why: `no kind here, but the same barcode is ${[...otherKinds].join(" / ")} elsewhere` };
    }
    return { level: "none", d, why: "no kind" };
  }
  const conflicting = [...otherKinds].filter((k) => k !== d.id);
  if (conflicting.length > 0) {
    return { level: "review", d, why: `the same barcode is ${conflicting.join(" / ")} at another chain` };
  }
  if (d.e.step === "head") return { level: "high", d, why: "decided by the name's head noun" };
  const how = d.e.step === "cut" ? "a cut word" : "the shelf";
  if (others.some((o) => o.d.id === d.id && firm(o.d))) {
    return { level: "high", d, why: `decided by ${how}, confirmed by barcode` };
  }
  return { level: "review", d, why: `decided by ${how}, unconfirmed` };
}
