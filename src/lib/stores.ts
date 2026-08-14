import type { Store } from "@/generated/prisma/client";

/*
 * Store identity lives here rather than in queries.ts so that modules with no
 * business touching the database - the cabaz maths, any future pure helper -
 * can import it without dragging in the Prisma client. queries.ts re-exports
 * both names, so existing imports from there keep working.
 */

export const STORE_LABELS: Record<Store, string> = {
  CONTINENTE: "Continente",
  PINGO_DOCE: "Pingo Doce",
  AUCHAN: "Auchan",
};

export const STORE_ORDER: Store[] = ["CONTINENTE", "PINGO_DOCE", "AUCHAN"];
