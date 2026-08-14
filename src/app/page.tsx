import Link from "next/link";
import { getCategories } from "@/lib/queries";
import styles from "./page.module.css";

// Always read the latest categories from the database rather than a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function Home() {
  const categories = await getCategories();

  return (
    <main className={styles.main}>
      <h1>Comparador de Preços</h1>
      <p className={styles.subtitle}>
        Preços recolhidos diariamente no Continente, no Pingo Doce e no Auchan.
        Escolha uma categoria para comparar.
      </p>

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
