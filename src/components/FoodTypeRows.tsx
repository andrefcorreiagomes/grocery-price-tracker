import Link from "next/link";
import { STORE_LABELS } from "@/lib/stores";
import type { Store } from "@/lib/stores";
import type { IndexEntry } from "@/lib/grupos";
import { euros } from "@/lib/money";
import styles from "./FoodTypeRows.module.css";

/**
 * Kinds of food as rows - name, cheapest price, cheapest chain - each linking
 * to its page. Shared by the full food list (/grupos) and a category's page
 * (/categoria/...), so the two can never describe a food differently.
 */

const UNIT_LABEL: Record<string, string> = { kg: "kg", l: "L", un: "un" };

export default function FoodTypeRows({ rows }: { rows: IndexEntry[] }) {
  return (
    <ul className={styles.list}>
      {rows.map((t) => (
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
                  desde <strong>{euros(t.cheapestPrice)} €</strong>
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
  );
}
