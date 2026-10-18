"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { stripAccents } from "@/lib/matching";
import { STORE_LABELS } from "@/lib/stores";
import type { Store } from "@/lib/stores";
import type { IndexEntry } from "@/lib/grupos";
import styles from "./FoodTypeFilter.module.css";

/**
 * The food list, grouped under the categories of the food tree, and narrowed
 * as you type.
 *
 * A filter over names already on the page, NOT a search over products - the
 * whole list arrives from the server and nothing is fetched again as you type.
 *
 * Matching is accent-blind, reusing `stripAccents` from the matching layer, so
 * "acucar" finds "Açúcar" and "cha" finds "Chá". Portuguese food names are full
 * of accents and nobody types them into a search box.
 */

const UNIT_LABEL: Record<string, string> = { kg: "kg", l: "L", un: "un" };

/** How many kinds of food these rows cover. */
const kinds = (rows: IndexEntry[]) => new Set(rows.map((r) => r.id)).size;

export default function FoodTypeFilter({ entries }: { entries: IndexEntry[] }) {
  const [query, setQuery] = useState("");

  // Prepared once rather than per keystroke: 166 strings is small, but the work
  // is pointless to repeat and this keeps typing smooth on a phone.
  const prepared = useMemo(
    () => entries.map((e) => ({ entry: e, haystack: stripAccents(e.label).toLowerCase() })),
    [entries]
  );

  const needle = stripAccents(query).toLowerCase().trim();
  const shown = needle === "" ? entries : prepared.filter((p) => p.haystack.includes(needle)).map((p) => p.entry);

  // In the tree's category order, which the server already gives.
  const byCategory: { id: string; label: string; rows: IndexEntry[] }[] = [];
  for (const e of shown) {
    const last = byCategory[byCategory.length - 1];
    if (last && last.id === e.categoryId) last.rows.push(e);
    else byCategory.push({ id: e.categoryId, label: e.categoryLabel, rows: [e] });
  }

  return (
    <>
      <div className={styles.searchRow}>
        <input
          type="search"
          className={styles.search}
          placeholder="Procurar um alimento…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Procurar um alimento"
        />
        <span className={styles.count} aria-live="polite">
          {shown.length === entries.length ? `${kinds(entries)} alimentos` : `${kinds(shown)} de ${kinds(entries)}`}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className={styles.empty}>
          Nada encontrado para “{query}”. Só aparecem aqui alimentos que pelo menos
          duas cadeias vendem e que podemos comparar ao quilo, ao litro ou à unidade.
        </p>
      ) : (
        byCategory.map((c) => (
          <section key={c.id} className={styles.category}>
            <h2 className={styles.categoryHeading}>
              {c.label}
              <span className={styles.categoryCount}>{c.rows.length}</span>
            </h2>
            <ul className={styles.list}>
              {c.rows.map((t) => (
                <li key={t.id}>
                  <Link href={`/grupos/${encodeURIComponent(t.id)}`} className={styles.row}>
                    <span className={styles.name}>
                      {t.label}
                      {/* What the headline price compares, when the page holds
                          several comparisons: "desde 4.99 €/kg" for chicken is
                          the price of breast, not of chicken in general. */}
                      {t.comparisons > 1 && (
                        <span className={styles.qualifier}>
                          {" "}
                          {t.mainTitle !== t.label ? t.mainTitle.toLowerCase() : ""}
                          {t.mainTitle !== t.label ? " · " : ""}
                          {t.comparisons} comparações
                        </span>
                      )}
                    </span>
                    <span className={styles.price}>
                      {t.cheapestPrice !== null && (
                        <>
                          desde <strong>{t.cheapestPrice.toFixed(2)} €</strong>
                          <span className={styles.per}>/{UNIT_LABEL[t.unit]}</span>
                        </>
                      )}
                    </span>
                    <span className={styles.winner}>
                      {/* A tie names every store in it: naming one would say it
                          was cheaper. Three names do not fit a phone row. */}
                      {t.winners.length === 0
                        ? "—"
                        : t.winners.length === 3
                          ? "As três"
                          : t.winners.map((w) => STORE_LABELS[w as Store]).join(" · ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
