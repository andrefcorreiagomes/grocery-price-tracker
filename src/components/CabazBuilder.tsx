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

/** A basket line with its place in the food tree, for the chooser. */
export interface CabazBuilderProduct extends CabazProduct {
  categoryId: string;
  categoryLabel: string;
  kindId: string;
  kindLabel: string;
}

interface Props {
  /** in the food tree's order, which the chooser keeps */
  products: CabazBuilderProduct[];
  latestScrapeDate: Date | null;
  initialSelection: SelectedItem[];
}

/** First appearance order, so the chooser follows the tree rather than the alphabet. */
function distinct<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export default function CabazBuilder({ products, latestScrapeDate, initialSelection }: Props) {
  // A shared link can name a line that no longer exists (a comparison that
  // fell below two chains, or a basket from before the catalogue): dropped
  // here, so the count in the heading and the address match the table.
  const [selection, setSelection] = useState<SelectedItem[]>(() => {
    const known = new Set(products.map((p) => p.id));
    return initialSelection.filter((item) => known.has(item.productId));
  });
  const [category, setCategory] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);

  /*
   * The basket is kept in the address bar so it survives a refresh and can be
   * sent to someone else. Written with history.replaceState rather than
   * router.replace on purpose: this page is force-dynamic, so a router
   * navigation would round-trip to the server on every single tick of a
   * checkbox. The URL is built by hand rather than with URLSearchParams to keep
   * it readable - line ids use only letters, digits, "-", "." and "~", so
   * nothing needs escaping.
   */
  useEffect(() => {
    const query = selection.length > 0 ? `itens=${serializeSelection(selection)}` : "";
    window.history.replaceState(
      null,
      "",
      query ? `${window.location.pathname}?${query}` : window.location.pathname
    );
  }, [selection]);

  const categories = useMemo(
    () => distinct(products, (p) => p.categoryId).map((p) => ({ id: p.categoryId, label: p.categoryLabel })),
    [products]
  );

  const kinds = useMemo(() => {
    if (category === null) return [];
    return distinct(
      products.filter((p) => p.categoryId === category),
      (p) => p.kindId
    ).map((p) => ({ id: p.kindId, label: p.kindLabel }));
  }, [products, category]);

  const visibleProducts = useMemo(() => {
    if (category === null) return [];
    return products
      .filter((p) => p.categoryId === category)
      .filter((p) => kind === null || p.kindId === kind);
  }, [products, category, kind]);

  const selectedIds = useMemo(
    () => new Set(selection.map((item) => item.productId)),
    [selection]
  );

  // Every price the page receives is current (see the page), so stale prices
  // never come up and are never allowed.
  const cabaz = useMemo(
    () => buildCabaz(products, selection, latestScrapeDate, false),
    [products, selection, latestScrapeDate]
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

  const categoryLabel = categories.find((c) => c.id === category)?.label;
  const kindLabel = kinds.find((k) => k.id === kind)?.label;

  return (
    <div className={styles.wrapper}>
      <section className={styles.picker}>
        <nav className={styles.breadcrumb} aria-label="Navegação de categorias">
          <button
            type="button"
            className={styles.crumb}
            onClick={() => {
              setCategory(null);
              setKind(null);
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
                onClick={() => setKind(null)}
                disabled={kind === null}
              >
                {categoryLabel}
              </button>
            </>
          )}
          {kind !== null && (
            <>
              <span aria-hidden="true">›</span>
              <span className={styles.crumbCurrent}>{kindLabel}</span>
            </>
          )}
        </nav>

        {category === null ? (
          <div className={styles.grid}>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.categoryCard}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : (
          <>
            {kinds.length > 1 && (
              <div className={styles.chips}>
                <button
                  type="button"
                  className={kind === null ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                  onClick={() => setKind(null)}
                >
                  Todos
                </button>
                {kinds.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    className={kind === k.id ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                    onClick={() => setKind(k.id)}
                  >
                    {k.label}
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

        <CabazTable
          cabaz={cabaz}
          allowStale={false}
          onAdjustQuantity={adjustQuantity}
          onRemove={removeProduct}
        />
      </section>
    </div>
  );
}
