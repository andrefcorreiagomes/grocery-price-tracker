import Link from "next/link";
import { getComparableFoodTypes } from "@/lib/grupos";
import { storeCountWord } from "@/lib/stores";
import styles from "./page.module.css";

// Always read the latest prices from the database rather than a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function Home() {
  const entries = await getComparableFoodTypes();
  // Counted, not written in: the number changes whenever a kind of food is
  // added or set aside.
  const foodCount = new Set(entries.map((e) => e.id)).size;

  // The categories of the food tree, in its order, each with how many of its
  // kinds can be compared today. A category with none is left out rather than
  // shown as an empty page.
  const categories: { id: string; label: string; kinds: number }[] = [];
  for (const e of entries) {
    const last = categories[categories.length - 1];
    if (last && last.id === e.categoryId) last.kinds++;
    else categories.push({ id: e.categoryId, label: e.categoryLabel, kinds: 1 });
  }

  return (
    <main className={styles.main}>
      <h1>Comparador de Preços</h1>
      <p className={styles.subtitle}>
        Preços recolhidos diariamente no Continente, no Pingo Doce e no Auchan.
        Escolha uma categoria para comparar.
      </p>

      <Link href="/grupos" className={styles.cabazCard}>
        <span className={styles.cabazTitle}>Onde é mais barato?</span>
        <span className={styles.cabazSubtitle}>
          O preço de {foodCount} alimentos, das batatas ao azeite, nas {storeCountWord()} cadeias
        </span>
      </Link>

      <Link href="/cabaz" className={styles.cabazCard}>
        <span className={styles.cabazTitle}>Montar o meu cabaz</span>
        <span className={styles.cabazSubtitle}>
          Escolha vários produtos e compare o total nas {storeCountWord()} lojas
        </span>
      </Link>

      <div className={styles.grid}>
        {categories.map((category) => (
          <Link key={category.id} href={`/categoria/${category.id}`} className={styles.card}>
            {category.label}
            <span className={styles.cardCount}>
              {category.kinds} alimento{category.kinds === 1 ? "" : "s"}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
