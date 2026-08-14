import ProductNameCell from "@/components/ProductNameCell";
import { STORE_LABELS, STORE_ORDER, type getComparisonData } from "@/lib/queries";
import { unitPrice } from "@/lib/pricing";
import styles from "./ComparisonTable.module.css";

interface Props {
  products: Awaited<ReturnType<typeof getComparisonData>>;
  /** Newest snapshot day in the whole database - see getLatestSnapshotDate(). */
  latestScrapeDate: Date | null;
}

const DAY_MS = 86_400_000;

/** Calendar day as YYYY-MM-DD, so two dates compare by day and not by clock time. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

export default function ComparisonTable({ products, latestScrapeDate }: Props) {
  if (products.length === 0) {
    return <p className={styles.empty}>Ainda não há produtos nesta categoria.</p>;
  }

  // Compared against the *start* of today, not the current moment: promoEndsAt
  // is stored as midnight on the last day the promotion runs, so a promotion
  // ending today is still valid today.
  const startOfToday = new Date(new Date().toISOString().slice(0, 10)).getTime();

  // Two different comparisons, deliberately:
  //
  //   caption -> newest snapshot vs *today*        "did the scraper run?"
  //   cell    -> this snapshot vs *newest snapshot* "did this one listing fail
  //                                                  while the others worked?"
  //
  // Measuring cells against the newest snapshot rather than against today is
  // what keeps the markers quiet on a normal day and lights up exactly the
  // listings that are falling behind.
  const latestDay = latestScrapeDate ? dayKey(latestScrapeDate) : null;
  const scrapeAgeDays = latestScrapeDate
    ? Math.round((startOfToday - new Date(dayKey(latestScrapeDate)).getTime()) / DAY_MS)
    : null;
  // One missed night is normal (the scrape runs overnight, and the day it runs
  // counts as 0). Beyond that, every price on screen is suspect and the caption
  // has to say so rather than whisper it.
  const scrapeIsStale = scrapeAgeDays !== null && scrapeAgeDays > 2;

  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        {latestScrapeDate && (
          <caption
            className={scrapeIsStale ? `${styles.caption} ${styles.captionStale}` : styles.caption}
          >
            {scrapeIsStale
              ? `Os preços podem estar desactualizados — última actualização a ${formatDay(latestScrapeDate)} (há ${scrapeAgeDays} dia${scrapeAgeDays === 1 ? "" : "s"})`
              : `Última actualização: ${formatDay(latestScrapeDate)}`}
          </caption>
        )}
        <thead>
          <tr>
            <th className={styles.productColumn}>Produto</th>
            {STORE_ORDER.map((store) => (
              <th key={store}>{STORE_LABELS[store]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const unitPrices = product.listings.map((listing) =>
              listing?.snapshots[0]
                ? unitPrice(listing.snapshots[0].price, listing.packageSize)
                : null
            );
            const cheapestUnitPrice = Math.min(
              ...unitPrices.filter((p): p is number => p !== null)
            );

            return (
              <tr key={product.id}>
                <td className={styles.productColumn}>
                  <ProductNameCell
                    name={product.name}
                    unit={product.unit ? `por ${product.unit}` : ""}
                    historyHref={`/produtos/${product.id}`}
                    storeLinks={product.listings
                      .filter((listing) => listing !== undefined)
                      .map((listing) => ({
                        label: STORE_LABELS[listing.store],
                        url: listing.url,
                      }))}
                  />
                </td>
                {product.listings.map((listing, i) => {
                  if (!listing || !listing.snapshots[0]) {
                    return (
                      <td key={i} className={styles.noData}>
                        —
                      </td>
                    );
                  }

                  const latest = listing.snapshots[0];
                  const perUnit = unitPrices[i];
                  const isCheapest = perUnit === cheapestUnitPrice;

                  // The table shows the latest snapshot whatever its age, so a
                  // known end date already past is positive evidence the
                  // promotion is over - drop the badge, keep the price.
                  const endsAt = latest.promoEndsAt;
                  const expired = endsAt !== null && endsAt.getTime() < startOfToday;
                  const showPromo = latest.onPromotion && !expired;

                  const snapshotDay = dayKey(latest.date);
                  const isStale = latestDay !== null && snapshotDay < latestDay;

                  return (
                    <td key={i} className={isCheapest ? styles.cheapest : undefined}>
                      {latest.price.toFixed(2)}€
                      {perUnit !== null && product.unit && (
                        <div className={styles.unitPrice}>
                          {perUnit.toFixed(2)}€/{product.unit}
                        </div>
                      )}
                      {showPromo && (
                        <div className={styles.promoBadge}>
                          promo
                          {/* only Continente publishes the pre-promotion price */}
                          {latest.regularPrice !== null && (
                            <s className={styles.promoDetail}>
                              {latest.regularPrice.toFixed(2)}€
                            </s>
                          )}
                          {/* only Pingo Doce and Auchan publish an end date */}
                          {endsAt !== null && (
                            <span className={styles.promoDetail}>
                              até{" "}
                              {endsAt.toLocaleDateString("pt-PT", {
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                      )}
                      {isStale && (
                        <div
                          className={styles.stale}
                          title={`Este preço foi verificado pela última vez a ${formatDay(latest.date)}; os restantes foram actualizados mais recentemente.`}
                        >
                          de {formatDay(latest.date)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
