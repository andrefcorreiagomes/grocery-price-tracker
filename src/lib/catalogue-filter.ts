import { classifyFoodType } from "./food-types";
import { sectionOf } from "./store-sections";

/**
 * Should a product go into the catalogue? The one rule every crawl applies,
 * read from data/store-sections.ts:
 *
 *   food section      yes, unless it is under a skip path
 *   mixed section     only when its name is recognised as a kind of food
 *   non-food section  no
 *   unknown section   no - and the crawl reports the section
 *
 * Every "no" carries its reason, so a crawl can list what it left out.
 */
export type KeepDecision =
  | { keep: true }
  | {
      keep: false;
      reason: "non-food section" | "unknown section" | "skipped sub-section" | "mixed aisle, not recognised as food";
      /** for a skipped sub-section, the path and why it is skipped */
      detail?: string;
    };

export function keepInCatalogue(store: string, categoryPath: string | null, name: string): KeepDecision {
  const v = sectionOf(store, categoryPath);
  if (v.kind === "unknown") return { keep: false, reason: "unknown section" };
  if (v.kind === "non-food") return { keep: false, reason: "non-food section" };
  if (v.skip) return { keep: false, reason: "skipped sub-section", detail: `${v.skip.path} (${v.skip.why})` };
  if (v.kind === "mixed" && classifyFoodType(name, store, categoryPath) === null) {
    return { keep: false, reason: "mixed aisle, not recognised as food" };
  }
  return { keep: true };
}
