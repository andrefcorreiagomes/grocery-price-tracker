"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { stripAccents } from "@/lib/matching";
import { STORE_LABELS } from "@/lib/stores";
import type { Store } from "@/generated/prisma/client";
import type { IndexEntry } from "@/lib/grupos";
import styles from "./FoodTypeFilter.module.css";

/**
 * Narrowing a list of 166 kinds of food down to the one you want.
 *
 * A filter over names already on the page, NOT a search over products - the
 * whole list arrives from the server and nothing is fetched again as you type.
 *
 * Matching is accent-blind, reusing `stripAccents` from the matching layer, so
 * "acucar" finds "Açúcar" and "cha" finds "Chá". Portuguese food names are full
 * of accents and nobody types them into a search box.
 */

const UNIT_LABEL: Record<string, string> = { kg: "kg", l: "L" };

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

  // A food sold both ways appears twice; the qualifier tells the two apart.
  const twiceListed = useMemo(() => {
    const seen = new Map<string, number>();
    for (const e of entries) seen.set(e.id, (seen.get(e.id) ?? 0) + 1);
    return seen;
  }, [entries]);

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
          {/* Kinds of food, not rows: a food sold both by weight and by volume
              (eggs, sauces) has a row for each, and counting rows said 166
              where there are 163. */}
          {shown.length === entries.length
            ? `${kinds(entries)} alimentos`
            : `${kinds(shown)} de ${kinds(entries)}`}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className={styles.empty}>
          Nada encontrado para “{query}”. Só aparecem aqui alimentos que as três
          cadeias vendem e que podemos comparar ao quilo ou ao litro.
        </p>
      ) : (
        <ul className={styles.list}>
          {shown.map((t) => (
            <li key={`${t.id}-${t.unit}`}>
              <Link href={`/grupos/${encodeURIComponent(t.id)}`} className={styles.row}>
                <span className={styles.name}>
                  {t.label}
                  {(twiceListed.get(t.id) ?? 0) > 1 && (
                    <span className={styles.qualifier}>
                      {t.unit === "kg" ? " (ao peso)" : " (ao volume)"}
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
      )}
    </>
  );
}
