import Link from "next/link";
import { getComparableFoodTypes, getFreshness } from "@/lib/grupos";
import { STORE_LABELS } from "@/lib/stores";
import type { Store } from "@/generated/prisma/client";
import styles from "./page.module.css";

// Prices change under us; read them live rather than from a build-time snapshot.
export const dynamic = "force-dynamic";

const UNIT_LABEL: Record<string, string> = { kg: "kg", l: "L" };

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

      <ul className={styles.list}>
        {types.map((t) => (
          <li key={`${t.id}-${t.unit}`}>
            <Link href={`/grupos/${encodeURIComponent(t.id)}?un=${t.unit}`} className={styles.row}>
              <span className={styles.name}>
                {t.label}
                {/* Only shown when a food is sold both ways, so the two entries
                    are told apart at a glance rather than looking duplicated. */}
                {types.filter((x) => x.id === t.id).length > 1 && (
                  <span className={styles.qualifier}>
                    {t.unit === "kg" ? " (ao peso)" : " (ao volume)"}
                  </span>
                )}
              </span>
              <span className={styles.price}>
                {t.cheapestPrice !== null && (
                  <>
                    desde <strong>{t.cheapestPrice.toFixed(2)} €</strong>
                    <span className={styles.per}>/{UNIT_LABEL[t.unit]}</span>
                  </>
                )}
              </span>
              <span className={styles.winner}>
                {t.winner ? STORE_LABELS[t.winner as Store] : "—"}
              </span>
            </Link>
          </li>
        ))}
      </ul>

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
