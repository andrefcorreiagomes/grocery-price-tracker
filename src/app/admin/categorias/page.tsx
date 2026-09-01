import { getFoodTypeRows } from "@/lib/menu";
import { MENU_CATEGORIES } from "../../../../data/menu-categories";
import { saveCategory } from "./actions";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

/**
 * Filing each kind of food under a heading in the app's menu.
 *
 * The catalogue knows a product is `frango`; it has no idea that belongs under
 * Carne. Until someone says so, the app's Carne section holds only the 275
 * hand-picked products and none of the 44,000 catalogue ones.
 *
 * 166 decisions, so every one arrives with a PROPOSAL derived from the store's
 * own department. The work is correcting the wrong ones, not answering 166
 * blank questions - and the page is honest about which is which, because a
 * guess dressed as a decision is the failure worth avoiding here.
 */
export default async function CategoriasPage() {
  const rows = await getFoodTypeRows();
  const confirmed = rows.filter((r) => r.confirmed).length;

  // Grouped by heading so the reader judges "is everything here really Carne?"
  // rather than meeting the foods in alphabetical order with no context.
  const byCategory = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }

  return (
    <main className={styles.main}>
      <h1>Onde fica cada alimento</h1>
      <p className={styles.lede}>
        Cada um dos {rows.length} tipos de alimento precisa de uma secção do menu.
        Já vem com uma sugestão, tirada da secção onde o Pingo Doce o arruma —
        acertada na maior parte, e previsivelmente errada nalguns. Corrija o que
        estiver mal; o que não mexer fica por confirmar.
      </p>

      <p className={styles.progress}>
        <strong>{confirmed}</strong> de {rows.length} confirmados ·{" "}
        {rows.length - confirmed} ainda por rever
      </p>

      {[...byCategory.entries()].map(([category, items]) => (
        <section key={category} className={styles.group}>
          <h2>
            {category} <span className={styles.n}>{items.length}</span>
          </h2>
          <ul className={styles.list}>
            {items.map((row) => (
              <li key={row.id} className={row.confirmed ? styles.done : styles.pending}>
                <span className={styles.label}>
                  {row.label}
                  <span className={styles.meta}>
                    {row.productCount} produtos
                    {row.department && ` · ${row.department}`}
                  </span>
                </span>
                {/* One form per row: a change saves immediately, so nothing is
                    lost if the page is closed halfway through 166 of them. */}
                <form action={saveCategory} className={styles.form}>
                  <input type="hidden" name="foodType" value={row.id} />
                  <select
                    name="category"
                    defaultValue={row.category}
                    className={styles.select}
                    aria-label={`Secção de ${row.label}`}
                  >
                    {MENU_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={styles.save}>
                    {row.confirmed ? "Guardado" : "Confirmar"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
