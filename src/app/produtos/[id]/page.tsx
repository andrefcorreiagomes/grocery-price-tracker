import Link from "next/link";
import { notFound } from "next/navigation";
import PriceHistoryChart, {
  type ChartSeries,
} from "@/components/PriceHistoryChart";
import { getProductHistory, STORE_LABELS, STORE_ORDER } from "@/lib/queries";
import { unitPrice } from "@/lib/pricing";
import type { Store } from "@/generated/prisma/client";
import styles from "./page.module.css";

// Always read the latest prices from the database rather than a build-time snapshot.
export const dynamic = "force-dynamic";

const STORE_COLORS: Record<Store, string> = {
  CONTINENTE: "#d62728",
  PINGO_DOCE: "#2ca02c",
  AUCHAN: "#1f77b4",
};

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductHistory(id);

  if (!product) {
    notFound();
  }

  const series: ChartSeries[] = STORE_ORDER.filter((store) =>
    product.listings.some((l) => l.store === store)
  ).map((store) => ({
    key: store,
    label: STORE_LABELS[store],
    color: STORE_COLORS[store],
  }));

  // A store can have more than one listing for the same product (e.g. a
  // promo SKU alongside a regular one) - take the cheapest of them per
  // store per day, so the line reflects what you'd actually pay there.
  const pointsByDate = new Map<string, Record<string, string | number>>();
  for (const listing of product.listings) {
    for (const snapshot of listing.snapshots) {
      const dateKey = snapshot.date.toISOString().slice(0, 10);
      const point = pointsByDate.get(dateKey) ?? { date: dateKey };
      const price = unitPrice(snapshot.price, listing.packageSize);
      const existing = point[listing.store];
      point[listing.store] = typeof existing === "number" ? Math.min(existing, price) : price;
      pointsByDate.set(dateKey, point);
    }
  }
  const chartData = [...pointsByDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.back}>
        ← Voltar ao início
      </Link>
      <h1>{product.name}</h1>
      <p className={styles.unit}>
        {product.unit ? `Preços comparados por ${product.unit}` : ""}
      </p>

      {chartData.length === 0 ? (
        <p>Ainda não há histórico de preços para este produto.</p>
      ) : (
        <PriceHistoryChart
          data={chartData}
          series={series}
          unitLabel={product.unit ?? undefined}
        />
      )}
    </main>
  );
}
