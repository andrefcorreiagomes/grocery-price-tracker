import FoodTypeFilter from "@/components/FoodTypeFilter";
import { getComparableFoodTypes, getFreshness } from "@/lib/grupos";
import { STORE_LABELS } from "@/lib/stores";
import type { Store } from "@/lib/stores";
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
          O preço por quilo, por litro ou por unidade de {new Set(types.map((t) => t.id)).size} tipos de
          alimento, arrumados por categoria. Cada um compara só produtos do mesmo
          tipo e vendidos da mesma forma (o peito com o peito, o congelado com o
          congelado) e mostra o produto mais barato de cada loja.
        </p>
      </header>

      {/* The list is rendered by a Client Component so it can be filtered as you
          type. The data still comes from the server - nothing is fetched again. */}
      <FoodTypeFilter entries={types} />

      <footer className={styles.footer}>
        <p>
          Só aparecem aqui os alimentos que pelo menos duas cadeias vendem e que
          podemos comparar ao quilo, ao litro ou à unidade. Um produto sem peso
          indicado não entra na comparação, porque sem o peso não há preço por quilo.
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
