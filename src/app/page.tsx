import Link from "next/link";
import { getCategories } from "@/lib/queries";
import { getComparableFoodTypes } from "@/lib/grupos";
import styles from "./page.module.css";

// Always read the latest categories from the database rather than a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function Home() {
  const categories = await getCategories();
  // Counted, not written in: the number changes whenever a kind of food is
  // added or set aside.
  const foodCount = new Set((await getComparableFoodTypes()).map((e) => e.id)).size;

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
          O preço de {foodCount} alimentos, das batatas ao azeite, nas três cadeias
        </span>
      </Link>

      <Link href="/cabaz" className={styles.cabazCard}>
        <span className={styles.cabazTitle}>Montar o meu cabaz</span>
        <span className={styles.cabazSubtitle}>
          Escolha vários produtos e compare o total nas três lojas
        </span>
      </Link>

      <div className={styles.grid}>
        {categories.map((category) => (
          <Link
            key={category}
            href={`/categoria/${encodeURIComponent(category)}`}
            className={styles.card}
          >
            {category}
          </Link>
        ))}
      </div>
    </main>
  );
}
