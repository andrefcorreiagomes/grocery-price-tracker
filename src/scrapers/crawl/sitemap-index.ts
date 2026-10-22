/**
 * The product files a sitemap index lists: the ones named `...-product.xml`.
 * Pingo Doce's index and Auchan's name them the same way. Pure, so it is
 * checked without a request.
 *
 * Pingo Doce's index also lists `sitemap_2.xml`, which is NOT a product
 * sitemap: its 543 entries are category LISTING pages
 * (`/produtos/limpeza/roupa/detergentes`, no `.html`, no id). Filtering the
 * index on the string "produtos" would sweep them in as 543 products with
 * unparseable ids. Auchan's lists image and category files beside its two
 * product files.
 */
export function productSitemapsFromIndex(xml: string): string[] {
  const files = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  return [...new Set(files.filter((url) => /-product\.xml(\?|$)/.test(url)))];
}
