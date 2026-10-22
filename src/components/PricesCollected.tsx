import { lisbonDate } from "@/lib/dates";
import { storeName } from "@/lib/stores";

/**
 * "Preços recolhidos: Continente 22/10/2026 · Pingo Doce ... · Auchan ...",
 * the line at the foot of every page. Per chain, not one date: they genuinely
 * differ, and a price from today set against one from last week deserves to
 * say so. Written once since 22 October 2026 (code review L3); five pages each
 * had a copy. The page wraps it in its own element and style.
 */
export default function PricesCollected({ freshness }: { freshness: { store: string; lastSeenAt: Date }[] }) {
  return (
    <>
      Preços recolhidos:{" "}
      {freshness.map((f, i) => (
        <span key={f.store}>
          {i > 0 && " · "}
          {storeName(f.store)} {lisbonDate(f.lastSeenAt)}
        </span>
      ))}
    </>
  );
}
