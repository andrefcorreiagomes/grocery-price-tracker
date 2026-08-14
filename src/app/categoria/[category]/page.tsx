import Link from "next/link";
import ComparisonTable from "@/components/ComparisonTable";
import { getComparisonData, getLatestSnapshotDate, getSubcategories } from "@/lib/queries";
import styles from "./page.module.css";

// Always read the latest prices from the database rather than a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ sub?: string }>;
}) {
  const { category: rawCategory } = await params;
  const { sub } = await searchParams;
  const category = decodeURIComponent(rawCategory);

  const [subcategories, products, latestScrapeDate] = await Promise.all([
    getSubcategories(category),
    getComparisonData({ category, subcategory: sub }),
    getLatestSnapshotDate(),
  ]);

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.back}>
        ← Voltar às categorias
      </Link>
      <h1>{category}</h1>

      {subcategories.length > 1 && (
        <div className={styles.chips}>
          <Link
            href={`/categoria/${encodeURIComponent(category)}`}
            className={sub ? styles.chip : `${styles.chip} ${styles.chipActive}`}
          >
            Todos
          </Link>
          {subcategories.map((subcategory) => (
            <Link
              key={subcategory}
              href={`/categoria/${encodeURIComponent(category)}?sub=${encodeURIComponent(subcategory)}`}
              className={
                sub === subcategory ? `${styles.chip} ${styles.chipActive}` : styles.chip
              }
            >
              {subcategory}
            </Link>
          ))}
        </div>
      )}

      <ComparisonTable products={products} latestScrapeDate={latestScrapeDate} />
    </main>
  );
}
