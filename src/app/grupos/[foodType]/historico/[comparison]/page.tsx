import Link from "next/link";
import { notFound } from "next/navigation";
import PriceHistoryChart, { type ChartSeries } from "@/components/PriceHistoryChart";
import { getComparisonHistory, getFreshness, HISTORY_SINCE, type HistoryPoint } from "@/lib/grupos";
import { euros } from "@/lib/money";
import { STORE_LABELS, STORE_ORDER } from "@/lib/stores";
import type { Store } from "@/lib/stores";
import styles from "./page.module.css";

// Prices change under us; read them live rather than from a build-time snapshot.
export const dynamic = "force-dynamic";

const UNIT_LABEL: Record<string, string> = { kg: "kg", l: "L", un: "un" };

/** The three chains' usual colours, so a line is recognised before its legend is read. */
const STORE_COLORS: Record<Store, string> = {
  CONTINENTE: "#d62728",
  PINGO_DOCE: "#2ca02c",
  AUCHAN: "#1f77b4",
};

/** "2026-10-03" -> "03/10/2026", the date format used everywhere else on the site. */
function shownDate(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * How the cheapest price of one comparison moved at each store since prices
 * became reliable (HISTORY_SINCE). Reached from the comparison on its food page.
 */
export default async function HistoryPage({
  params,
}: {
  params: Promise<{ foodType: string; comparison: string }>;
}) {
  const { foodType, comparison } = await params;
  const [history, freshness] = await Promise.all([
    getComparisonHistory(decodeURIComponent(foodType), decodeURIComponent(comparison)),
    getFreshness(),
  ]);
  if (!history) notFound();

  const unit = UNIT_LABEL[history.unit];
  const shown = STORE_ORDER.filter((s) => history.days.some((d) => d.stores[s]));
  const series: ChartSeries[] = shown.map((s) => ({ key: s, label: STORE_LABELS[s], color: STORE_COLORS[s] }));
  const data = history.days.map((d) => {
    const row: Record<string, string | number> = { date: d.date };
    for (const s of shown) {
      const p = d.stores[s];
      if (p) row[s] = p.unitPrice;
    }
    return row;
  });

  // Each store's first and latest point, for the summary under the chart.
  const ends = shown.map((s) => {
    const points = history.days.filter((d) => d.stores[s]);
    const first = points[0];
    const last = points[points.length - 1];
    return {
      store: s,
      firstDate: first.date,
      first: first.stores[s] as HistoryPoint,
      last: last.stores[s] as HistoryPoint,
    };
  });

  return (
    <main className={styles.main}>
      <Link href={`/grupos/${encodeURIComponent(history.kindId)}`} className={styles.back}>
        ← {history.kindLabel}
      </Link>
      {history.category && (
        <p className={styles.category}>
          <Link href={`/categoria/${history.category.id}`}>{history.category.label}</Link>
        </p>
      )}
      <h1>{history.name}</h1>
      <p className={styles.lede}>
        O preço mais baixo de cada loja nesta comparação, por {unit}, desde{" "}
        {shownDate(HISTORY_SINCE)}.
      </p>

      {history.days.length === 0 ? (
        <p className={styles.note}>Ainda não há histórico de preços para esta comparação.</p>
      ) : (
        <div className={styles.chart}>
          <PriceHistoryChart data={data} series={series} unitLabel={unit} height={320} />
        </div>
      )}

      {ends.length > 0 && (
        <table className={styles.summary}>
          <thead>
            <tr>
              <th>Loja</th>
              <th>Início</th>
              <th>Agora</th>
              <th>Variação</th>
            </tr>
          </thead>
          <tbody>
            {ends.map((e) => {
              const change = (e.last.unitPrice - e.first.unitPrice) / e.first.unitPrice;
              const pct = Math.round(change * 100);
              return (
                <tr key={e.store}>
                  <th scope="row">
                    <span className={styles.swatch} style={{ background: STORE_COLORS[e.store] }} aria-hidden="true" />
                    {STORE_LABELS[e.store]}
                  </th>
                  <td title={e.first.productName}>
                    <span className={styles.price}>{euros(e.first.unitPrice)} €</span>
                    <div className={styles.product}>{shownDate(e.firstDate).slice(0, 5)}</div>
                  </td>
                  <td title={e.last.productName}>
                    <span className={styles.price}>{euros(e.last.unitPrice)} €</span>
                    <div className={styles.product}>{e.last.productName}</div>
                  </td>
                  <td className={`${styles.price} ${pct < 0 ? styles.down : pct > 0 ? styles.up : ""}`}>
                    {pct === 0 ? "igual" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className={styles.note}>
        Cada ponto é um dia em que o preço mais baixo de uma loja mudou, ou em que a
        sua série começa; entre pontos, manteve-se. O produto mais barato pode mudar
        de um ponto para o outro; o de agora aparece na tabela. Antes de{" "}
        {shownDate(HISTORY_SINCE)} alguns preços ao quilo estavam mal calculados, por
        isso a série começa nesse dia.
      </p>

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
