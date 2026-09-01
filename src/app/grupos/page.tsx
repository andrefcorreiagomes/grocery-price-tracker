import FoodTypeFilter from "@/components/FoodTypeFilter";
import { getComparableFoodTypes, getFreshness } from "@/lib/grupos";
import { STORE_LABELS } from "@/lib/stores";
import type { Store } from "@/generated/prisma/client";
import styles from "./page.module.css";

// Prices change under us; read them live rather than from a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function GruposPage() {
  const [types, freshness] = await Promise.all([getComparableFoodTypes(), getFreshness()]);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>Onde é mais barato?</h1>
        <p className={styles.lede}>
          O preço por quilo ou por litro de {types.length} tipos de alimento, nas três
          cadeias. Cada um mostra o produto mais barato de cada loja, e não apenas o
          número.
        </p>
      </header>

      {/* The list is rendered by a Client Component so it can be filtered as you
          type. The data still comes from the server - nothing is fetched again. */}
      <FoodTypeFilter entries={types} />

      <footer className={styles.footer}>
        <p>
          Só aparecem aqui os alimentos que as três cadeias vendem e que podemos
          comparar ao quilo ou ao litro. Um produto sem peso indicado não entra na
          comparação, porque sem o peso não há preço por quilo.
        </p>
        <p className={styles.freshness}>
          Preços recolhidos:{" "}
          {freshness.map((f, i) => (
            <span key={f.store}>
              {i > 0 && " · "}
              {STORE_LABELS[f.store as Store]}{" "}
              {f.lastSeenAt.toLocaleDateString("pt-PT")}
            </span>
          ))}
        </p>
      </footer>
    </main>
  );
}
