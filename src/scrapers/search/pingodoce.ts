import * as cheerio from "cheerio";
import { normalizePingoDoceBrand } from "../brand-normalize";
import { fetchHtml } from "../http";
import { collectHits, SEARCH_LIMIT } from "./paginate";
import type { SearchHit } from "./types";

interface GtmItem {
  item_id?: string;
  item_name?: string;
  item_brand?: string;
  item_category?: string;
  item_category2?: string;
  price?: number;
}

/** Unlike Continente, Pingo Doce honours `start`/`sz` directly on Search-Show. */
const SEARCH_URL =
  "https://www.pingodoce.pt/on/demandware.store/Sites-pingo-doce-Site/pt_PT/Search-Show";

export async function searchPingoDoce(
  term: string,
  limit = SEARCH_LIMIT
): Promise<SearchHit[]> {
  // asking for `sz = limit` means one request covers the whole cap
  return collectHits(
    (start) => fetchPage(term, start, limit),
    (hit) => hit.id,
    limit,
    limit
  );
}

async function fetchPage(term: string, start: number, size: number): Promise<SearchHit[]> {
  const html = await fetchHtml(
    `${SEARCH_URL}?q=${encodeURIComponent(term)}&start=${start}&sz=${size}`
  );
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];

  $("[data-gtm-info]").each((_, el) => {
    const raw = $(el).attr("data-gtm-info");
    if (!raw) return;

    let parsed: { items?: GtmItem[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const item = parsed.items?.[0];
    if (!item?.item_id || !item.item_name || item.price === undefined) return;

    const link = $(el).find('a[href*=".html"]').first().attr("href");
    if (!link) return;

    hits.push({
      id: item.item_id,
      name: item.item_name,
      price: item.price,
      brand: normalizePingoDoceBrand(item.item_brand),
      category: [item.item_category2, item.item_category].filter(Boolean).join("/"),
      url: link.startsWith("http") ? link : `https://www.pingodoce.pt${link}`,
    });
  });

  return hits;
}
