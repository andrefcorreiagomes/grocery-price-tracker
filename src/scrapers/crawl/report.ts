/**
 * A shortfall has to clear both bars to be worth a warning: more than 5 products
 * AND more than 1% of what the category lists.
 *
 * Small gaps are normal. Stock changes while we page through a category, so a
 * few products slide across page boundaries on every run - the last full crawl
 * was short by 1 and by 3 in sections of several thousand. Warning about those
 * teaches us to ignore the warning, and this one exists to catch the bug that
 * once took 94 products of 1,436 while still exiting 0.
 *
 * Both bars are needed: a percentage alone would shout about one missing item
 * out of Ovos' 13, and a count alone would swallow a 30-product category whole.
 */
export function isMeaningfulShortfall(gap: number, expected: number): boolean {
  return gap > 5 && gap > expected * 0.01;
}
