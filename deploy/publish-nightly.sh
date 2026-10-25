#!/bin/bash
# Run on the server after each nightly ends (systemd ExecStopPost, 25 October
# 2026, the owner's decision): publish the night's results to the private
# notes repository (poupa-facil-private), folder nightly/<date>/, where the
# daily cloud review reads them. The cloud review never reaches the server.
#
# Only reads the project; writes only into the private repository's copy at
# ~/poupa-facil-private and pushes it with that repository's own key. Never
# stops anything: a failure is logged and the next night tries again.

PROJECT="${PROJECT:-$(cd "$(dirname "$0")/.." && pwd)}"
NOTES="$HOME/poupa-facil-private"
cd "$PROJECT" || exit 0
mkdir -p logs
exec >>"logs/publish-nightly-$(date +%F).log" 2>&1
echo "=== $(date '+%F %T')"

NIGHT_DIR=$(ls -d logs/nightly-*-00-05 2>/dev/null | sort | tail -1)
[ -n "$NIGHT_DIR" ] || { echo "no nightly folder found"; exit 0; }
DAY=$(basename "$NIGHT_DIR" | sed -E 's/^nightly-([0-9]{4}-[0-9]{2}-[0-9]{2}).*/\1/')
OUT="$NOTES/nightly/$DAY"

git -C "$NOTES" pull -q --rebase || { echo "could not update the notes repository"; exit 0; }
mkdir -p "$OUT"

[ -f "$NIGHT_DIR/summary.md" ] && cp "$NIGHT_DIR/summary.md" "$OUT/summary.md" || echo "the night has no summary (still running, or stopped early)" > "$OUT/summary.md"

# Each store's newest report written since the night began (by the time each
# file was written; its NAME is in UTC). Not "newer than the night's log
# folder": the folder's time moves with every file added to it.
for store in continente pingo_doce auchan; do
  f=$(find reports -maxdepth 1 -name "${store}-*.md" -newermt "$DAY 00:00" 2>/dev/null | sort | tail -1)
  [ -n "$f" ] && cp "$f" "$OUT/$store.md" || echo "no report from $store for this night" > "$OUT/$store.md"
done

[ -f "$NIGHT_DIR/check-saves.log" ] && cp "$NIGHT_DIR/check-saves.log" "$OUT/check-saves.txt"
npm run -s sitemap:test > "$OUT/sitemap-test.txt" 2>&1
cat "logs/update-before-nightly-$DAY.log" > "$OUT/update.txt" 2>/dev/null || echo "no update log for $DAY" > "$OUT/update.txt"

{
  echo "night: $DAY"
  echo "products on sale, by store:"
  sqlite3 -readonly dev.db "SELECT '  ' || store || ': ' || COUNT(*) FROM CatalogueProduct WHERE delistedAt IS NULL GROUP BY store;"
  echo "groups of identical products (current): $(sqlite3 -readonly dev.db "SELECT COUNT(*) FROM ProductGroup WHERE retiredAt IS NULL;")"
  echo "database size: $(du -h dev.db | cut -f1)"
  echo "backup of this night: $(ls backups/nightly-$DAY-*.db 2>/dev/null | head -1 || echo none)"
} > "$OUT/facts.txt"

{
  for store in continente pingodoce auchan; do
    echo "--- $store: last lines"
    tail -n 30 "$NIGHT_DIR/$store.log" 2>/dev/null
  done
  # Only the store collections' warnings: the automatic checks print "!!" lines
  # too, from a pretend store on the server itself (127.0.0.1) that they block
  # on purpose, and a reader cannot tell those apart.
  echo "--- every warning line (!!) of the three store collections"
  grep -H "!!" "$NIGHT_DIR"/continente.log "$NIGHT_DIR"/pingodoce.log "$NIGHT_DIR"/auchan.log 2>/dev/null || echo "(none)"
  # Why a step "needs a look": the end of its own log (e.g. matching running
  # out of memory on 25 October 2026 - the summary alone does not say).
  for step in $(grep -o '^| [^|]* | \*\*needs a look\*\*' "$NIGHT_DIR/summary.md" 2>/dev/null | sed -E 's/^\| ([^|]*[^ ]) +\|.*/\1/' | sort -u); do
    for log in "$NIGHT_DIR/${step//:/-}.log" "$NIGHT_DIR/${step//:/-}-1.log" "$NIGHT_DIR/${step//:/-}-2.log"; do
      [ -f "$log" ] && { echo "--- $(basename "$log"): last lines (this step needs a look)"; tail -n 25 "$log"; }
    done
  done
} > "$OUT/logs-tail.txt"

cd "$NOTES" || exit 0
git add "nightly/$DAY"
git commit -q -m "nightly results of $DAY" || { echo "nothing new to publish"; exit 0; }
git push -q && echo "published nightly/$DAY" || echo "push failed; next night tries again"
exit 0
