import type { Cabaz, CabazCell, CellState } from "@/lib/cabaz";
import { STORE_LABELS, STORE_ORDER } from "@/lib/stores";
import styles from "./CabazTable.module.css";

interface Props {
  cabaz: Cabaz;
  allowStale: boolean;
  /** delta, not an absolute quantity - see adjustQuantity in CabazBuilder */
  onAdjustQuantity: (productId: string, delta: number) => void;
  onRemove: (productId: string) => void;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

/*
 * Phrased to avoid gendered adjectives - product names run both ways ("a
 * bolacha", "o arroz") and "não vendido/vendida" would be wrong half the time.
 *
 * The noListing wording is careful for a second reason: a missing listing only
 * tells us we have no record, not that the store does not stock the product.
 * Saying "o X não vende este produto" would assert something the data cannot
 * support.
 */
function blockerPhrase(state: CellState, storeLabel: string): string {
  switch (state) {
    case "noListing":
      return `não temos registo do ${storeLabel} vender este produto`;
    case "neverPriced":
      return `ainda não temos preço no ${storeLabel}`;
    case "stale":
      return `sem preço actual no ${storeLabel}`;
    default:
      return "";
  }
}

function Cell({ cell, quantity, allowStale }: {
  cell: CabazCell;
  quantity: number;
  allowStale: boolean;
}) {
  if (cell.unitPrice === null) {
    const label =
      cell.state === "noListing"
        ? "Não temos registo desta loja vender este produto."
        : "Ainda não temos preço para este produto nesta loja.";
    return (
      <td className={styles.missing}>
        <span className={styles.cross} title={label} aria-label={label}>
          ✕
        </span>
      </td>
    );
  }

  const withheld = cell.state === "stale" && !allowStale;
  const captured = cell.capturedOn ? formatDay(cell.capturedOn) : null;
  // At quantity 0 the row is kept on screen precisely so its prices stay
  // readable, so show the price of one rather than a useless 0.00€.
  const shown = quantity === 0 ? 1 : quantity;

  return (
    <td>
      {withheld ? (
        <span className={styles.withheld} title="Preço desactualizado — active a opção acima para o usar.">
          —
        </span>
      ) : (
        <>{(cell.unitPrice * shown).toFixed(2)}€</>
      )}
      {cell.state === "stale" && captured && (
        <div className={styles.staleNote}>de {captured}</div>
      )}
    </td>
  );
}

export default function CabazTable({
  cabaz,
  allowStale,
  onAdjustQuantity,
  onRemove,
}: Props) {
  if (cabaz.rows.length === 0) {
    return (
      <p className={styles.empty}>
        Ainda não escolheu nenhum produto. Use o menu acima para montar o seu cabaz.
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
                <td>
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
                {row.cells.map((cell, i) => (
                  <Cell key={i} cell={cell} quantity={row.quantity} allowStale={allowStale} />
                ))}
                <td>
                  {/* deliberately not a ✕: that glyph already means "esta loja
                      não vende este produto" in this same row */}
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
                Total
              </th>
              <td />
              {cabaz.totals.map((total, i) => {
                const store = STORE_ORDER[i];
                const isCheapest = cabaz.cheapestStores.includes(store);
                return (
                  <td
                    key={store}
                    className={isCheapest ? styles.cheapestTotal : styles.total}
                  >
                    {total === null ? "—" : `${total.toFixed(2)}€`}
                  </td>
                );
              })}
              <td />
            </tr>
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
          Nenhum dos produtos escolhidos tem preço actual nas três lojas, por isso não há
          comparação possível. Active a opção acima, ou retire os produtos assinalados
          em baixo.
        </p>
      ) : (
        <>
          {someExcluded && (
            <p className={styles.scope}>
              Estes totais incluem <strong>{cabaz.includedCount} dos {cabaz.selectedCount} artigos</strong>{" "}
              que seleccionou, para que as três lojas sejam comparadas sobre exactamente
              os mesmos produtos.
            </p>
          )}
          {cabaz.usesStalePrices && (
            <p className={styles.staleWarning}>
              Alguns totais usam preços de recolhas anteriores, assinalados na tabela.
            </p>
          )}
        </>
      )}

      {cabaz.exclusions.length > 0 && (
        <div className={styles.exclusions}>
          <h2 className={styles.exclusionsTitle}>Fora da comparação</h2>
          <ul>
            {cabaz.exclusions.map((exclusion) => (
              <li key={exclusion.product.id}>
                <strong>{exclusion.product.name}</strong> —{" "}
                {exclusion.blockers
                  .map(({ store, state }) => blockerPhrase(state, STORE_LABELS[store]))
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
