import Link from "next/link";
import { notFound } from "next/navigation";
import FoodTypeRows from "@/components/FoodTypeRows";
import { getComparableFoodTypes, getFreshness } from "@/lib/grupos";
import { categoryById } from "@/lib/food-tree";
import { STORE_LABELS } from "@/lib/stores";
import type { Store } from "@/lib/stores";
import styles from "./page.module.css";

// Always read the latest prices from the database rather than a build-time snapshot.
export const dynamic = "force-dynamic";

/**
 * One category of the food tree (data/food-tree.ts): its kinds of food, each
 * with the cheapest price and chain of its main comparison - the same rows as
 * the full list on /grupos, one category at a time.
 */
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: id } = await params;
  const category = categoryById(decodeURIComponent(id));
  if (!category) notFound();

  const [entries, freshness] = await Promise.all([getComparableFoodTypes(), getFreshness()]);
  const rows = entries.filter((e) => e.categoryId === category.id);

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.back}>
        ← Voltar às categorias
      </Link>
      <header className={styles.header}>
        <h1>{category.label}</h1>
        <p className={styles.lede}>
          {rows.length === 0
            ? "Nenhum alimento desta categoria pode ser comparado para já."
            : `${rows.length} alimento${rows.length === 1 ? "" : "s"} comparado${rows.length === 1 ? "" : "s"} ao quilo, ao litro ou à unidade. Escolha um para ver o mais barato de cada loja.`}
        </p>
      </header>

      {rows.length > 0 && <FoodTypeRows rows={rows} />}

      <footer className={styles.footer}>
        Preços recolhidos:{" "}
        {freshness.map((f, i) => (
          <span key={f.store}>
            {i > 0 && " · "}
            {STORE_LABELS[f.store as Store]} {f.lastSeenAt.toLocaleDateString("pt-PT")}
          </span>
        ))}
      </footer>
    </main>
  );
}
