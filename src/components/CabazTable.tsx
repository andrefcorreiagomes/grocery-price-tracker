import { formatEuros, shownQuantity, type Cabaz, type CabazCell, type CabazExclusion } from "@/lib/cabaz";
import { STORE_LABELS, STORE_ORDER, storeCountWord } from "@/lib/stores";
import { shortDay } from "@/lib/promotion";
import styles from "./CabazTable.module.css";

interface Props {
  cabaz: Cabaz;
  /** delta, not an absolute quantity - see adjustQuantity in CabazBuilder */
  onAdjustQuantity: (productId: string, delta: number) => void;
  onRemove: (productId: string) => void;
}

/*
 * Phrased to avoid gendered adjectives - food names run both ways ("a
 * bolacha", "o arroz") and "não vendido/vendida" would be wrong half the time.
 *
 * The same two facts the food pages state, in the same words. "Indisponível"
 * (the user's word, 22 October 2026) claims only what the data shows: the
 * chain's site has no price for it today, though its shops may sell it.
 */
function blockerPhrase(kind: CabazExclusion["blockers"][number]["kind"], storeLabel: string): string {
  return kind === "not-stocked" ? `indisponível no ${storeLabel}` : `o ${storeLabel} vende, mas sem peso indicado`;
}

function Cell({ cell, quantity, isLowest, store }: {
  cell: CabazCell;
  quantity: number;
  isLowest: boolean;
  /** the store's name, shown above the price on a phone, where there is no header row */
  store: string;
}) {
  // The two must LOOK different, as on the food pages: "does not sell it" and
  // "sells it, but gives no weight" are different facts.
  if (cell.kind === "not-stocked") {
    return (
      <td className={`${styles.storeCell} ${styles.missing}`} data-store={store}>
        <span className={styles.cross} title="Indisponível: sem preço no site da loja." aria-label="Indisponível nesta loja.">
          ✕
        </span>
      </td>
    );
  }
  if (cell.kind === "no-size") {
    return (
      <td className={styles.storeCell} data-store={store}>
        <span className={styles.noSize}>sem peso</span>
        <div className={styles.productName} title={cell.productName}>
          {cell.productName}
        </div>
      </td>
    );
  }

  // At quantity 0 the row is kept on screen precisely so its prices stay
  // readable, so show the price of one rather than a useless 0.00€.
  const shown = shownQuantity(quantity);

  return (
    <td className={isLowest ? `${styles.storeCell} ${styles.lowest}` : styles.storeCell} data-store={store}>
      {formatEuros(cell.unitPrice * shown)}
      {/* Named, as on the food pages: a price alone cannot say which product
          of the comparison it is. */}
      <div className={styles.productName} title={cell.productName}>
        {cell.productName}
      </div>
      {/* Amber, apart from the green "cheapest": a price can be both. */}
      {cell.promotion && (
        <div className={styles.promo}>
          promoção
          {cell.promotion.regularUnitPrice !== null && (
            <s className={styles.promoDetail}>{formatEuros(cell.promotion.regularUnitPrice * shown)}</s>
          )}
          {cell.promotion.endsOn && <span className={styles.promoDetail}>até {shortDay(cell.promotion.endsOn)}</span>}
        </div>
      )}
    </td>
  );
}

export default function CabazTable({
  cabaz,
  onAdjustQuantity,
  onRemove,
}: Props) {
  if (cabaz.rows.length === 0) {
    return (
      <p className={styles.empty}>
        Ainda não escolheu nenhum alimento. Use o menu acima para montar o seu cabaz.
      </p>
    );
  }

  const someExcluded = cabaz.includedCount < cabaz.selectedCount;

  return (
    <div>
      <div className={styles.scroller}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.productColumn}>Produto</th>
              <th>Qt.</th>
              {STORE_ORDER.map((store) => (
                <th key={store}>{STORE_LABELS[store]}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {cabaz.rows.map((row) => (
              <tr
                key={row.product.id}
                className={
                  !row.counted
                    ? styles.uncountedRow
                    : row.included
                      ? undefined
                      : styles.excludedRow
                }
              >
                <td className={styles.productColumn}>
                  {row.product.name}
                  {row.product.unit && (
                    <div className={styles.unit}>por {row.product.unit}</div>
                  )}
                </td>
                <td className={styles.qtyCell}>
                  <div className={styles.stepper}>
                    <button
                      type="button"
                      onClick={() => onAdjustQuantity(row.product.id, -1)}
                      disabled={row.quantity <= 0}
                      aria-label={`Menos um ${row.product.name}`}
                    >
                      −
                    </button>
                    <span className={styles.quantity}>{row.quantity}</span>
                    <button
                      type="button"
                      onClick={() => onAdjustQuantity(row.product.id, +1)}
                      aria-label={`Mais um ${row.product.name}`}
                    >
                      +
                    </button>
                  </div>
                </td>
                {row.product.cells.map((cell, i) => (
                  <Cell
                    key={i}
                    cell={cell}
                    quantity={row.quantity}
                    isLowest={row.lowestStores.includes(STORE_ORDER[i])}
                    store={STORE_LABELS[STORE_ORDER[i]]}
                  />
                ))}
                <td className={styles.removeCell}>
                  {/* deliberately not a ✕: that glyph already means "indisponível
                      nesta loja" in this same row */}
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() => onRemove(row.product.id)}
                    aria-label={`Remover ${row.product.name} do cabaz`}
                  >
                    remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className={styles.productColumn} scope="row">
                {someExcluded ? "Total comparável" : "Total"}
                {someExcluded && <div className={styles.unit}>o que todas as lojas têm</div>}
              </th>
              <td className={styles.spacer} />
              {cabaz.totals.map((total, i) => {
                const store = STORE_ORDER[i];
                const isCheapest = cabaz.cheapestStores.includes(store);
                return (
                  <td
                    key={store}
                    className={`${styles.storeCell} ${isCheapest ? styles.cheapestTotal : styles.total}`}
                    data-store={STORE_LABELS[store]}
                  >
                    {total === null ? "—" : formatEuros(total)}
                  </td>
                );
              })}
              <td className={styles.spacer} />
            </tr>
            {/* Only when it differs from the line above: each store's sum of
                everything it has, naming what it lacks. Never marked cheapest,
                because the columns no longer hold the same items. */}
            {someExcluded && (
              <tr>
                <th className={styles.productColumn} scope="row">
                  Total com tudo
                  <div className={styles.unit}>o que cada loja tem</div>
                </th>
                <td className={styles.spacer} />
                {cabaz.fullTotals.map((total, i) => {
                  const store = STORE_ORDER[i];
                  const lacks = cabaz.missing[i];
                  return (
                    <td key={store} className={`${styles.storeCell} ${styles.total}`} data-store={STORE_LABELS[store]}>
                      {total === null ? "—" : formatEuros(total)}
                      {lacks.length > 0 && (
                        <div className={styles.lacks} title={lacks.map((p) => p.name).join(", ")}>
                          falta: {lacks.map((p) => p.name).join(", ")}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className={styles.spacer} />
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {cabaz.selectedCount === 0 ? (
        /* Everything is at quantity 0 - nothing to add up, and saying "no
           current price at all three stores" here would be simply untrue. */
        <p className={styles.noComparison}>
          Todos os artigos estão com quantidade 0, por isso não há nada para somar.
        </p>
      ) : cabaz.includedCount === 0 ? (
        <p className={styles.noComparison}>
          Nenhum dos alimentos escolhidos tem preço nas {storeCountWord()} lojas, por isso não há total
          comparável. A linha &ldquo;Total com tudo&rdquo; mostra quanto custa em cada loja o que ela tem.
        </p>
      ) : (
        <>
          {someExcluded && (
            <p className={styles.scope}>
              O <strong>total comparável</strong> soma {cabaz.includedCount} dos {cabaz.selectedCount} artigos
              que escolheu: os que as {storeCountWord()} lojas têm, para que sejam comparadas sobre
              exactamente os mesmos produtos. O <strong>total com tudo</strong> soma, em cada loja, tudo o
              que ela tem, e diz o que lhe falta.
            </p>
          )}
        </>
      )}

      {cabaz.exclusions.length > 0 && (
        <div className={styles.exclusions}>
          <h2 className={styles.exclusionsTitle}>Só em algumas lojas</h2>
          <ul>
            {cabaz.exclusions.map((exclusion) => (
              <li key={exclusion.product.id}>
                <strong>{exclusion.product.name}</strong> —{" "}
                {exclusion.blockers
                  .map(({ store, kind }) => blockerPhrase(kind, STORE_LABELS[store]))
                  .join("; ")}
                {exclusion.pricedNowhere && (
                  <>
                    {" "}
                    <button
                      type="button"
                      className={styles.inlineRemove}
                      onClick={() => onRemove(exclusion.product.id)}
                    >
                      retirar do cabaz
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
