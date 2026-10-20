import { REVIEWED_GROUPS, REVIEWED_PRODUCTS, type ReviewedGroup } from "../../data/kind-reviews";
import { explainFoodType, type FoodTypeExplanation } from "./food-types";

/**
 * A product's kind of food, all things considered: the classifier's answer
 * (src/lib/food-types.ts), corrected or confirmed by what review decided
 * (data/kind-reviews.ts). This is the kind that is stored and compared; the
 * classifier alone is what `measure:classifier` measures.
 */

export interface KindProduct {
  store: string;
  storeProductId: string;
  name: string;
  categoryPath: string | null;
}

export interface KindDecision {
  /** the kind to store, or null */
  id: string | null;
  /** what the classifier alone said */
  e: FoodTypeExplanation;
  /** set when review decided or confirmed it */
  reviewed: { by: "product" | "group"; batch: number } | null;
}

/** A shelf as the review list names it: the last two levels of the path. */
export function shelfKey(categoryPath: string | null): string {
  return (categoryPath ?? "(none)").split("/").slice(-2).join("/");
}

const products = new Map(REVIEWED_PRODUCTS.map((p) => [`${p.store}\t${p.id}`, p]));
const groups = new Map<string, ReviewedGroup>(
  REVIEWED_GROUPS.map((g) => [[g.store, g.shelf, g.kind, g.step].join("\t"), g])
);

export function decideKind(p: KindProduct): KindDecision {
  const e = explainFoodType(p.name, p.store, p.categoryPath);
  const own = products.get(`${p.store}\t${p.storeProductId}`);
  if (own) return { id: own.kind, e, reviewed: { by: "product", batch: own.batch } };
  if (e.id && e.step) {
    const group = groups.get([p.store, shelfKey(p.categoryPath), e.id, e.step].join("\t"));
    // `becomes: null` is a decision too - the group has no kind - so only an
    // absent `becomes` keeps the classifier's answer.
    if (group) return { id: group.becomes === undefined ? e.id : group.becomes, e, reviewed: { by: "group", batch: group.batch } };
  }
  return { id: e.id, e, reviewed: null };
}
