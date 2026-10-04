import * as cheerio from "cheerio";
import { normalizePingoDoceBrand } from "../brand-normalize";
import type { SearchHit } from "./types";

/**
 * Reads product tiles out of a store's listing HTML. Shared with the catalogue
 * crawlers. The functions that once requested the stores' SEARCH pages were
 * removed on 3 October 2026: Continente's and Pingo Doce's robots.txt forbid
 * those pages and Auchan's evidently means to. Product discovery now searches
 * our own catalogue instead - see src/scripts/discover.ts.
 */

interface GtmItem {
  item_id?: string;
  item_name?: string;
  item_brand?: string;
  item_category?: string;
  item_category2?: string;
  price?: number;
}

const GTM_ATTR = "data-gtm-info=";
/** JSON string delimiters arrive HTML-encoded inside the attribute. */
const ENCODED_QUOTE = "&quot;";

/**
 * Pingo Doce writes each tile's JSON into a SINGLE-quoted HTML attribute but
 * leaves apostrophes in the data unescaped, so a brand like `Chave D'Ouro` or
 * `L'Or` closes the attribute early:
 *
 *   data-gtm-info='{&quot;item_brand&quot;:&quot;Chave D'Ouro&quot;,...}'
 *                                                        ^ attribute ends here
 *
 * Any HTML parser therefore hands back a truncated value, silently losing every
 * product of those brands (14 of 100 on one café page). So we do NOT read the
 * attribute through the DOM: we find its true end in the raw HTML by counting
 * braces, which the stray apostrophe cannot affect.
 */
function extractGtmPayloads(html: string): string[] {
  const payloads: string[] = [];
  let cursor = 0;

  for (;;) {
    const at = html.indexOf(GTM_ATTR, cursor);
    if (at === -1) break;

    // The value must open as <delimiter>{ - anything else is not a payload.
    const open = at + GTM_ATTR.length + 1;
    const delimiter = html[at + GTM_ATTR.length];
    if ((delimiter !== "'" && delimiter !== '"') || html[open] !== "{") {
      cursor = at + GTM_ATTR.length;
      continue;
    }

    const end = findClosingBrace(html, open);
    if (end === -1) break; // malformed tail: nothing further is trustworthy
    payloads.push(html.slice(open, end + 1));
    cursor = end + 1;
  }

  return payloads;
}

/**
 * Index of the `}` closing the object that opens at `start`. Braces inside
 * encoded JSON strings are skipped, so a `{` in a product name cannot unbalance
 * the scan.
 */
function findClosingBrace(s: string, start: number): number {
  let depth = 0;
  let inString = false;

  for (let i = start; i < s.length; i++) {
    if (s.startsWith(ENCODED_QUOTE, i)) {
      inString = !inString;
      i += ENCODED_QUOTE.length - 1;
      continue;
    }
    if (inString) {
      if (s[i] === "\\") i++; // escaped char inside a JSON string
      continue;
    }
    if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return i;
  }

  return -1;
}

/**
 * Decode the HTML entities (`&quot;`, `&aacute;`, ...) in every payload at once,
 * by round-tripping them through the HTML parser as attribute values. One parse
 * per page rather than one per tile.
 */
function decodeEntities(payloads: string[]): string[] {
  if (payloads.length === 0) return [];
  const doc = payloads.map((p) => `<i v="${p.replace(/"/g, ENCODED_QUOTE)}"></i>`).join("");
  const $ = cheerio.load(doc);
  return $("i")
    .map((_, el) => $(el).attr("v") ?? "")
    .get();
}

/**
 * Map every product id on the page to its URL, read from the id embedded in the
 * href (`...-920009.html`). Joining products to URLs on the id avoids depending
 * on where the anchor sits relative to the tile - some tiles have no anchor of
 * their own, and those products used to be dropped.
 */
function productUrlsById(html: string): Map<string, string> {
  const urls = new Map<string, string>();
  const href = /href=["']([^"']*?-(\d+)\.html[^"']*)["']/g;

  for (const match of html.matchAll(href)) {
    if (!urls.has(match[2])) urls.set(match[2], match[1]);
  }

  return urls;
}

/**
 * Parse Pingo Doce product tiles out of a listing HTML fragment, as the catalogue
 * crawler reads them. Each tile carries its
 * data in a `data-gtm-info` JSON attribute holding exactly one item; the page
 * also carries a few list-level payloads holding many items, which are skipped.
 * In-house department labels ("Nossa Peixaria" etc.) are folded to "Pingo Doce"
 * by `normalizePingoDoceBrand`.
 */
export function parsePingoDoceTiles(html: string): SearchHit[] {
  const urls = productUrlsById(html);
  const byId = new Map<string, SearchHit>();

  for (const json of decodeEntities(extractGtmPayloads(html))) {
    let parsed: { items?: GtmItem[] };
    try {
      parsed = JSON.parse(json);
    } catch {
      continue;
    }

    // A tile impression carries one item; the page-level list payloads carry the
    // whole grid and would otherwise smuggle in products from other pages.
    if (parsed.items?.length !== 1) continue;

    const item = parsed.items[0];
    if (!item.item_id || !item.item_name || item.price === undefined) continue;
    if (byId.has(item.item_id)) continue;

    const url = urls.get(item.item_id);
    if (!url) continue;

    byId.set(item.item_id, {
      id: item.item_id,
      name: item.item_name,
      price: item.price,
      brand: normalizePingoDoceBrand(item.item_brand),
      category: [item.item_category2, item.item_category].filter(Boolean).join("/"),
      url: url.startsWith("http") ? url : `https://www.pingodoce.pt${url}`,
    });
  }

  return [...byId.values()];
}

/**
 * The grid states how many products the category holds ("1,034 Results"). The
 * crawler paginates against this rather than guessing from page length, because
 * a full page does not always yield a full page of parseable products.
 */
export function parsePingoDoceTotal(html: string): number | null {
  const text = cheerio.load(html)(".result-count").first().text();
  const digits = text.replace(/[.,\s]/g, "").match(/\d+/);
  return digits ? Number(digits[0]) : null;
}
