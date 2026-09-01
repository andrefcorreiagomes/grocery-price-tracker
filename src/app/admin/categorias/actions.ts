"use server";

import { refresh } from "next/cache";
import { setFoodTypeCategory } from "@/lib/menu";

/**
 * Save one food type's heading.
 *
 * A Server Action rather than an API route: this is a mutation driven by a
 * form, which is what they are for, and `refresh()` re-renders the page in the
 * same response so the counter at the top updates without a second request.
 */
export async function saveCategory(formData: FormData) {
  const foodType = String(formData.get("foodType") ?? "");
  const category = String(formData.get("category") ?? "");
  await setFoodTypeCategory(foodType, category);
  refresh();
}
