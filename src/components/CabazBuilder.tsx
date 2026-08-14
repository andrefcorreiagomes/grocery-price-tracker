"use client";

import { useEffect, useMemo, useState } from "react";
import CabazTable from "@/components/CabazTable";
import {
  buildCabaz,
  MAX_QUANTITY,
  serializeSelection,
  type CabazProduct,
  type SelectedItem,
} from "@/lib/cabaz";
import styles from "./CabazBuilder.module.css";

export interface CabazBuilderProduct extends CabazProduct {
  category: string | null;
  subcategory: string | null;
}

interface Props {
  products: CabazBuilderProduct[];
  latestScrapeDate: Date | null;
  initialSelection: SelectedItem[];
  initialAllowStale: boolean;
}

export default function CabazBuilder({
  products,
  latestScrapeDate,
  initialSelection,
  initialAllowStale,
}: Props) {
  const [selection, setSelection] = useState<SelectedItem[]>(initialSelection);
  const [allowStale, setAllowStale] = useState(initialAllowStale);
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);

  /*
   * The basket is kept in the address bar so it survives a refresh and can be
   * sent to someone else. Written with history.replaceState rather than
   * router.replace on purpose: this page is force-dynamic, so a router
   * navigation would round-trip to the server on every single tick of a
   * checkbox. The URL is built by hand rather than with URLSearchParams to keep
   * the commas readable - cuids are alphanumeric, so nothing needs escaping.
   */
  useEffect(() => {
    const parts: string[] = [];
    if (selection.length > 0) parts.push(`itens=${serializeSelection(selection)}`);
    if (allowStale) parts.push("ultimo=1");
    const query = parts.join("&");
    window.history.replaceState(
      null,
      "",
      query ? `${window.location.pathname}?${query}` : window.location.pathname
    );
  }, [selection, allowStale]);

  const categories = useMemo(
    () =>
      [...new Set(products.map((p) => p.category).filter((c): c is string => c !== null))].sort(
        (a, b) => a.localeCompare(b, "pt-PT")
      ),
    [products]
  );

  const subcategories = useMemo(() => {
    if (category === null) return [];
    return [
      ...new Set(
        products
          .filter((p) => p.category === category)
          .map((p) => p.subcategory)
          .filter((s): s is string => s !== null)
      ),
    ].sort((a, b) => a.localeCompare(b, "pt-PT"));
  }, [products, category]);

  const visibleProducts = useMemo(() => {
    if (category === null) return [];
    return products
      .filter((p) => p.category === category)
      .filter((p) => subcategory === null || p.subcategory === subcategory)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-PT"));
  }, [products, category, subcategory]);

  const selectedIds = useMemo(
    () => new Set(selection.map((item) => item.productId)),
    [selection]
  );

  const cabaz = useMemo(
    () => buildCabaz(products, selection, latestScrapeDate, allowStale),
    [products, selection, latestScrapeDate, allowStale]
  );

  // Only offer the toggle when it would actually change something.
  const hasStaleCandidates = useMemo(
    () => cabaz.rows.some((row) => row.cells.some((cell) => cell.state === "stale")),
    [cabaz]
  );

  function toggleProduct(productId: string) {
    setSelection((current) =>
      current.some((item) => item.productId === productId)
        ? current.filter((item) => item.productId !== productId)
        : [...current, { productId, quantity: 1 }]
    );
  }

  /*
   * Takes a delta and applies it to the *current* quantity inside the state
   * updater, rather than taking an absolute value computed during render. Two
   * clicks landing in the same render both read the same stale quantity and the
   * second increment is silently lost - easy to hit by double-clicking "+".
   */
  function adjustQuantity(productId: string, delta: number) {
    setSelection((current) =>
      current.map((item) =>
        item.productId === productId
          ? {
              ...item,
              // floor is 0, not 1: zero keeps the row (and its prices) on screen
              // while excluding it from every total
              quantity: Math.min(Math.max(item.quantity + delta, 0), MAX_QUANTITY),
            }
          : item
      )
    );
  }

  function removeProduct(productId: string) {
    setSelection((current) => current.filter((item) => item.productId !== productId));
  }

  return (
    <div className={styles.wrapper}>
      <section className={styles.picker}>
        <nav className={styles.breadcrumb} aria-label="Navegação de categorias">
          <button
            type="button"
            className={styles.crumb}
            onClick={() => {
              setCategory(null);
              setSubcategory(null);
            }}
            disabled={category === null}
          >
            Categorias
          </button>
          {category !== null && (
            <>
              <span aria-hidden="true">›</span>
              <button
                type="button"
                className={styles.crumb}
                onClick={() => setSubcategory(null)}
                disabled={subcategory === null}
              >
                {category}
              </button>
            </>
          )}
          {subcategory !== null && (
            <>
              <span aria-hidden="true">›</span>
              <span className={styles.crumbCurrent}>{subcategory}</span>
            </>
          )}
        </nav>

        {category === null ? (
          <div className={styles.grid}>
            {categories.map((name) => (
              <button
                key={name}
                type="button"
                className={styles.categoryCard}
                onClick={() => setCategory(name)}
              >
                {name}
              </button>
            ))}
          </div>
        ) : (
          <>
            {subcategories.length > 1 && (
              <div className={styles.chips}>
                <button
                  type="button"
                  className={subcategory === null ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                  onClick={() => setSubcategory(null)}
                >
                  Todos
                </button>
                {subcategories.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={subcategory === name ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                    onClick={() => setSubcategory(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            <ul className={styles.productList}>
              {visibleProducts.map((product) => (
                <li key={product.id}>
                  <label className={styles.productRow}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(product.id)}
                      onChange={() => toggleProduct(product.id)}
                    />
                    <span className={styles.productName}>{product.name}</span>
                    {product.unit && <span className={styles.productUnit}>por {product.unit}</span>}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className={styles.results} aria-live="polite">
        <div className={styles.resultsHeader}>
          <h2 className={styles.resultsTitle}>
            O meu cabaz{selection.length > 0 && ` (${selection.length})`}
          </h2>
          {selection.length > 0 && (
            <button type="button" className={styles.clear} onClick={() => setSelection([])}>
              Limpar
            </button>
          )}
        </div>

        {hasStaleCandidates && (
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={allowStale}
              onChange={(event) => setAllowStale(event.target.checked)}
            />
            Usar o último preço conhecido quando não há preço actual
          </label>
        )}

        <CabazTable
          cabaz={cabaz}
          allowStale={allowStale}
          onAdjustQuantity={adjustQuantity}
          onRemove={removeProduct}
        />
      </section>
    </div>
  );
}
