import Link from "next/link";
import type { Metadata } from "next";
import CabazBuilder, { type CabazBuilderProduct } from "@/components/CabazBuilder";
import { parseSelection } from "@/lib/cabaz";
import { getBasketLines, getFreshness } from "@/lib/grupos";
import { STORE_LABELS, STORE_ORDER } from "@/lib/stores";
import type { Store } from "@/lib/stores";
import styles from "./page.module.css";

// Always read the latest prices from the database rather than a build-time snapshot.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "O meu cabaz — Comparador de Preços",
  description:
    "Escolha os seus produtos e veja quanto custa o mesmo cabaz no Continente, no Pingo Doce e no Auchan.",
};

const UNIT_LABEL: Record<string, string> = { kg: "kg", l: "L", un: "unidade" };

export default async function CabazPage({
  searchParams,
}: {
  searchParams: Promise<{ itens?: string }>;
}) {
  const { itens } = await searchParams;
  const [lines, freshness] = await Promise.all([getBasketLines(), getFreshness()]);

  // Every price shown is current: the catalogue drops a product two weeks after
  // its chain last saw it (STALE_AFTER_DAYS). So each price is dated with its
  // chain's latest crawl, and the basket is given no "latest day" to call any
  // price stale against - the chains crawl on different days.
  const crawled = new Map(freshness.map((f) => [f.store, f.lastSeenAt]));

  const products: CabazBuilderProduct[] = lines.map((line) => ({
    id: line.id,
    name: line.name,
    unit: UNIT_LABEL[line.unit],
    categoryId: line.categoryId,
    categoryLabel: line.categoryLabel,
    kindId: line.kindId,
    kindLabel: line.kindLabel,
    listings: line.cells.map((cell, i) =>
      cell.kind === "not-stocked"
        ? undefined
        : {
            packageSize: 1,
            productName: cell.productName,
            promotion: cell.kind === "price" ? cell.promotion : null,
            snapshots:
              cell.kind === "price"
                ? [{ date: crawled.get(STORE_ORDER[i]) ?? new Date(), price: cell.unitPrice }]
                : [],
          }
    ),
  }));

  return (
    <main className={styles.main}>
      <Link href="/" className={styles.back}>
        ← Voltar ao início
      </Link>
      <h1>O meu cabaz</h1>
      <p className={styles.intro}>
        Escolha o que costuma comprar e veja quanto custa o mesmo cabaz em cada loja.
        Para cada alimento entra o produto mais barato de cada loja, comparado ao quilo,
        ao litro ou à unidade, e só entre produtos do mesmo tipo: o leite meio-gordo com
        o leite meio-gordo, o congelado com o congelado.
      </p>

      <CabazBuilder products={products} latestScrapeDate={null} initialSelection={parseSelection(itens)} />

      <p className={styles.freshness}>
        Preços recolhidos:{" "}
        {freshness.map((f, i) => (
          <span key={f.store}>
            {i > 0 && " · "}
            {STORE_LABELS[f.store as Store]} {f.lastSeenAt.toLocaleDateString("pt-PT")}
          </span>
        ))}
      </p>
    </main>
  );
}
