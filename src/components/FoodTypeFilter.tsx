"use client";

import { useMemo, useState } from "react";
import { stripAccents } from "@/lib/text";
import type { IndexEntry } from "@/lib/grupos";
import FoodTypeRows from "./FoodTypeRows";
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
            <FoodTypeRows rows={c.rows} />
          </section>
        ))
      )}
    </>
  );
}
