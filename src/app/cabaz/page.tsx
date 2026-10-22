import Link from "next/link";
import type { Metadata } from "next";
import CabazBuilder, { type CabazBuilderProduct } from "@/components/CabazBuilder";
import { parseSelection } from "@/lib/cabaz";
import { getBasketLines, getFreshness } from "@/lib/grupos";
import styles from "./page.module.css";
import PricesCollected from "@/components/PricesCollected";

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
  // its chain last saw it (STALE_AFTER_DAYS), and each chain's date is in the
  // footer.
  const products: CabazBuilderProduct[] = lines.map((line) => ({
    id: line.id,
    name: line.name,
    unit: UNIT_LABEL[line.unit],
    categoryId: line.categoryId,
    categoryLabel: line.categoryLabel,
    kindId: line.kindId,
    kindLabel: line.kindLabel,
    cells: line.cells,
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

      <CabazBuilder products={products} initialSelection={parseSelection(itens)} />

      <p className={styles.freshness}>
        <PricesCollected freshness={freshness} />
      </p>
    </main>
  );
}
