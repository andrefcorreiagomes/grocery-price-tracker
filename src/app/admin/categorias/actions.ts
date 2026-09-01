"use server";

import { refresh } from "next/cache";
import { adminEnabled } from "@/lib/admin";
import { setFoodTypeCategory } from "@/lib/menu";

/**
 * Save one food type's heading.
 *
 * A Server Action rather than an API route: this is a mutation driven by a
 * form, which is what they are for, and `refresh()` re-renders the page in the
 * same response so the counter at the top updates without a second request.
 */
export async function saveCategory(formData: FormData) {
  // Checked here as well as in the Proxy, and not merely for belt and braces:
  // a Server Action is a POST, and a POST does not have to come from the page
  // it belongs to. Next's own documentation says Proxy is an optimistic check
  // and not an authorization solution, so the write guards itself.
  if (!adminEnabled()) throw new Error("admin is not enabled on this server");

  const foodType = String(formData.get("foodType") ?? "");
  const category = String(formData.get("category") ?? "");
  await setFoodTypeCategory(foodType, category);
  refresh();
}
