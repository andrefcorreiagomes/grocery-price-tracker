import Link from "next/link";
import type { Metadata } from "next";
import CabazBuilder, { type CabazBuilderProduct } from "@/components/CabazBuilder";
import { parseSelection } from "@/lib/cabaz";
import { getComparisonData, getLatestSnapshotDate } from "@/lib/queries";
import styles from "./page.module.css";

// Always read the latest prices from the database rather than a build-time snapshot.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "O meu cabaz — Comparador de Preços",
  description:
    "Escolha os seus produtos e veja quanto custa o mesmo cabaz no Continente, no Pingo Doce e no Auchan.",
};

export default async function CabazPage({
  searchParams,
}: {
  searchParams: Promise<{ itens?: string; ultimo?: string }>;
}) {
  const { itens, ultimo } = await searchParams;

  const [products, latestScrapeDate] = await Promise.all([
    getComparisonData(),
    getLatestSnapshotDate(),
  ]);

  // Trimmed to the fields the builder actually uses - the full rows carry ean,
  // urls and store ids that would just inflate the payload sent to the client.
  const trimmed: CabazBuilderProduct[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    unit: product.unit,
    category: product.category,
    subcategory: product.subcategory,
    listings: product.listings.map((listing) =>
      listing
        ? {
            packageSize: listing.packageSize,
            snapshots: listing.snapshots.map((snapshot) => ({
              date: snapshot.date,
              price: snapshot.price,
            })),
          }
        : undefined
    ),
  }));

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.back}>
        ← Voltar ao início
      </Link>
      <h1>O meu cabaz</h1>
      <p className={styles.intro}>
        Escolha os produtos que costuma comprar e veja quanto custa o mesmo cabaz em cada
        loja. Os preços são comparados por unidade (kg, L), para que embalagens de tamanhos
        diferentes sejam comparáveis.
      </p>

      <CabazBuilder
        products={trimmed}
        latestScrapeDate={latestScrapeDate}
        initialSelection={parseSelection(itens)}
        initialAllowStale={ultimo === "1"}
      />
    </main>
  );
}
