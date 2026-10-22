/**
 * Dates as the site shows them, always on Portugal's clock.
 *
 * `toLocaleDateString` uses the clock of whatever computer serves the page. On
 * MSI that is Lisbon; on a rented server it is usually UTC, where a crawl that
 * started at 00:05 in Lisbon in summer is still the previous day, so every
 * "Preços recolhidos" date would read a day early (code review M14,
 * 22 October 2026). The history page already counted days in Lisbon time.
 */

const LISBON_DATE = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "Europe/Lisbon",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const LISBON_DAY_MONTH = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "Europe/Lisbon",
  day: "2-digit",
  month: "2-digit",
});

/** "22/10/2026", the day in Portugal. */
export function lisbonDate(d: Date): string {
  return LISBON_DATE.format(d);
}

/** "22/10", the day in Portugal. */
export function lisbonDayMonth(d: Date): string {
  return LISBON_DAY_MONTH.format(d);
}
