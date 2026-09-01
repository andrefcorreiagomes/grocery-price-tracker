import Link from "next/link";
import { notFound } from "next/navigation";
import { getFoodTypePage, type Ranking } from "@/lib/grupos";
import { STORE_ORDER, STORE_LABELS } from "@/lib/stores";
import type { Cell } from "@/lib/comparison";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const UNIT_LABEL: Record<string, string> = { kg: "kg", l: "L" };

/**
 * One store's answer.
 *
 * The three kinds must LOOK different, which is the whole reason `Cell` is a
 * union rather than a nullable price. "Não vende" and "sem peso indicado" are
 * different facts - the first says the chain does not sell this food, the
 * second says it does but we cannot work out a price per kilo - and rendering
 * both as an empty cell would be the page's most frequent lie. They are common,
 * not rare: Continente publishes a size for 57% of its products.
 */
function StoreCell({ cell, unit, best }: { cell: Cell; unit: string; best: boolean }) {
  if (cell.kind === "not-stocked") {
    return (
      <div className={styles.cell}>
        <span className={styles.absent}>Não vende</span>
      </div>
    );
  }
  if (cell.kind === "no-size") {
    return (
      <div className={styles.cell}>
        <span className={styles.unknown}>Sem peso indicado</span>
        <span className={styles.product}>{cell.example.name}</span>
      </div>
    );
  }
  return (
    <div className={`${styles.cell} ${best ? styles.best : ""}`}>
      <span className={styles.figure}>
        {cell.unitPrice.toFixed(2)} €<span className={styles.per}>/{UNIT_LABEL[unit]}</span>
      </span>
      {/* The product is NAMED on purpose: a number alone cannot tell you that
          the cheapest "queijo" is a children's dessert. */}
      <span className={styles.product}>{cell.product.name}</span>
    </div>
  );
}

function Comparison({
  title,
  note,
  cells,
  unit,
  winner,
}: {
  title: string;
  note: string;
  cells: Map<string, Cell>;
  unit: string;
  winner: string | null;
}) {
  return (
    <section className={styles.group}>
      <h3>{title}</h3>
      <p className={styles.note}>{note}</p>
      <div className={styles.stores}>
        {STORE_ORDER.map((store) => (
          <div key={store} className={styles.store}>
            <span className={styles.storeName}>{STORE_LABELS[store]}</span>
            <StoreCell cell={cells.get(store) as Cell} unit={unit} best={winner === store} />
          </div>
        ))}
      </div>
    </section>
  );
}

function UnitBlock({ ranking, showUnit }: { ranking: Ranking; showUnit: boolean }) {
  return (
    <div className={styles.unitBlock}>
      {showUnit && (
        <h2 className={styles.unitHeading}>
          {ranking.unit === "kg" ? "Vendido ao peso" : "Vendido ao volume"}
        </h2>
      )}
      <Comparison
        title="O mais barato de cada loja"
        note="O produto mais barato deste alimento em cada cadeia, seja de que marca for. Responde a: onde compro isto barato?"
        cells={ranking.cheapest}
        unit={ranking.unit}
        winner={ranking.winner}
      />
      <Comparison
        title="Marca própria"
        note="A marca da própria cadeia. É a comparação mais parecida que existe entre lojas, e pode dar um vencedor diferente do de cima."
        cells={ranking.ownBrand}
        unit={ranking.unit}
        winner={null}
      />
    </div>
  );
}

export default async function FoodTypePage({
  params,
}: {
  params: Promise<{ foodType: string }>;
}) {
  const { foodType } = await params;
  const page = await getFoodTypePage(decodeURIComponent(foodType));
  if (!page) notFound();

  return (
    <main className={styles.main}>
      <Link href="/grupos" className={styles.back}>
        ← Todos os alimentos
      </Link>
      <h1>{page.label}</h1>
      <p className={styles.count}>
        {page.productCount} produto{page.productCount === 1 ? "" : "s"} nas três cadeias
      </p>

      {page.rankings.map((r) => (
        <UnitBlock key={r.unit} ranking={r} showUnit={page.rankings.length > 1} />
      ))}

      {page.rankings.length === 0 && (
        <p className={styles.note}>
          Nenhuma loja indica peso ou volume para este alimento, por isso não é
          possível calcular um preço por quilo.
        </p>
      )}
    </main>
  );
}
