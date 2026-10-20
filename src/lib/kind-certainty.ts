import { explainFoodType, type FoodTypeExplanation } from "./food-types";

/**
 * How sure are we of a product's kind of food? Decided from what was measured
 * by hand on 20 October 2026 (three samples, about 1,100 products):
 *
 *   head noun ......... about 4% wrong  -> high
 *   past a cut word ... about 13% wrong -> review
 *   by the shelf ...... about 10% wrong -> review
 *
 * plus the one independent check we have, the barcode: the same barcode at
 * another chain names the same physical product, so it must be the same kind.
 *
 *   high    the head noun decided it, or a review-level decision is confirmed
 *           by the same barcode at another chain, decided there by head noun
 *   review  a cut word or the shelf decided it, unconfirmed; or the same
 *           barcode got a different kind at another chain; or this product
 *           has no kind but the same barcode has one elsewhere
 *   none    no kind, and nothing suggests one - honest, not a review case
 *
 * Pure: the caller builds the barcode index once.
 */

export type Certainty = "high" | "review" | "none";

export interface CertaintyInput {
  store: string;
  name: string;
  categoryPath: string | null;
  eanNormalized: string | null;
}

/** One product's decision, as the barcode index holds it. */
export interface BarcodePeer {
  store: string;
  e: FoodTypeExplanation;
}

export interface CertaintyResult {
  level: Certainty;
  e: FoodTypeExplanation;
  why: string;
}

/** Every product's decision, by barcode. */
export function barcodeIndex(products: CertaintyInput[]): Map<string, BarcodePeer[]> {
  const index = new Map<string, BarcodePeer[]>();
  for (const p of products) {
    if (!p.eanNormalized) continue;
    const peers = index.get(p.eanNormalized) ?? [];
    peers.push({ store: p.store, e: explainFoodType(p.name, p.store, p.categoryPath) });
    index.set(p.eanNormalized, peers);
  }
  return index;
}

export function certaintyOf(p: CertaintyInput, index: Map<string, BarcodePeer[]>): CertaintyResult {
  const e = explainFoodType(p.name, p.store, p.categoryPath);
  const others = (p.eanNormalized ? index.get(p.eanNormalized) ?? [] : []).filter((o) => o.store !== p.store);
  const otherKinds = new Set(others.map((o) => o.e.id).filter((id): id is string => id !== null));

  if (!e.id) {
    if (otherKinds.size > 0) {
      return { level: "review", e, why: `no kind here, but the same barcode is ${[...otherKinds].join(" / ")} elsewhere` };
    }
    return { level: "none", e, why: "no kind" };
  }
  const conflicting = [...otherKinds].filter((k) => k !== e.id);
  if (conflicting.length > 0) {
    return { level: "review", e, why: `the same barcode is ${conflicting.join(" / ")} at another chain` };
  }
  if (e.step === "head") return { level: "high", e, why: "decided by the name's head noun" };
  if (others.some((o) => o.e.id === e.id && o.e.step === "head")) {
    return { level: "high", e, why: `decided by ${e.step === "cut" ? "a cut word" : "the shelf"}, confirmed by barcode` };
  }
  return { level: "review", e, why: `decided by ${e.step === "cut" ? "a cut word" : "the shelf"}, unconfirmed` };
}
