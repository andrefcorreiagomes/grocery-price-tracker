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

# Tonight's folder: the newest run started today. Not "-00-05" exactly: when
# the update before the night has new code to test, the night starts a minute
# later, and on 31 October 2026 its folder "-00-06" was missed and the night
# before published again. Nor only the hour after midnight: on 13 November
# 2026 an automatic system update restarted the night at 06:28, and the
# complete second run ("-06-28") was missed for the cut-off first one.
# NIGHT_DIR may be given, to publish a chosen run again by hand.
NIGHT_DIR="${NIGHT_DIR:-$(ls -d "logs/nightly-$(date +%F)-"* 2>/dev/null | sort | tail -1)}"
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

# The day's reading list for the AI review of the comparisons (the owner's plan,
# 6 November 2026). Reads the database and the AI's answers, opens no store page.
# The AI has only its own repository (REVIEW); its memory stays in the notes,
# which it cannot open (the owner, 8 November 2026). A failure here stops
# nothing: the night is still published, and the rows wait.
# Its output goes into the night's folder too (comparison-review.txt): lines
# starting "ALERT:" (answers over the size limits: someone may be disrupting the
# review, the owner's request of 9 November 2026) are read by the morning review
# of the night, which tells the owner's phone.
REVIEW="$HOME/poupa-facil-comparison-review"
if git -C "$REVIEW" pull -q --rebase; then
  if npm run -s comparison:review -- --notes="$NOTES" --review="$REVIEW" --day="$DAY" > "$OUT/comparison-review.txt" 2>&1; then
    cat "$OUT/comparison-review.txt"
    git -C "$REVIEW" add -A
    git -C "$REVIEW" commit -q -m "reading list of $DAY" && { git -C "$REVIEW" push -q && echo "reading list of $DAY published" || echo "reading list push failed"; }
  else
    cat "$OUT/comparison-review.txt"
    echo "ALERT: the comparison review step failed; no reading list today, the night is still published" | tee -a "$OUT/comparison-review.txt"
  fi
else
  echo "ALERT: could not update the comparison review repository; no reading list today" | tee "$OUT/comparison-review.txt"
fi

cd "$NOTES" || exit 0
git add "nightly/$DAY" comparison-review
git commit -q -m "nightly results of $DAY" || { echo "nothing new to publish"; exit 0; }
git push -q && echo "published nightly/$DAY" || echo "push failed; next night tries again"
exit 0
