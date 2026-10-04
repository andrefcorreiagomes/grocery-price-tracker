---
name: run-catalogue-crawls
description: How to run the catalogue crawls for Continente, Pingo Doce and Auchan - which command to use for each store, how long each takes, how each saves, and what to do before, during and after. Use whenever a crawl, scrape or "new results" run is being planned or started, including phrasings like "run the crawlers", "refresh the prices", "start all crawlers", "crawl Continente", or an unattended overnight run. Every crawl needs the user's explicit go-ahead first.
---

# Running the catalogue crawls

## Why this exists

On 3 October 2026 an unattended run used the wrong Continente command. It was
chosen from its one-line description; it saved nothing until the very end, and
with `--discover` it had to open 107,351 pages - about 30 hours, which it
printed in its first lines of output. Nobody read them. This skill records
which command does what, so the choice is made from behaviour, not from a
description.

## The commands

| Store | Command | Saves | Report | Time (3 Oct 2026) |
|---|---|---|---|---|
| Auchan | `npm run crawl:auchan:nightly` | every batch | yes, with verdict | 39 min |
| Pingo Doce | `npm run crawl:pingodoce:nightly` (called `crawl:pingodoce:products` before 4 Oct 2026) | every batch | no - prints counts and warnings only | 2 h 52 min, 10,224 requests |
| Continente | `npm run crawl:continente:nightly` | every 500 products (~8 min) | yes, and a crash report if it dies | ~5 h refresh + up to 3,000 never-seen products (~50 min) |

**Do not use for a full unattended run:**

- `crawl:continente:products` - holds everything in memory and saves only at
  the end. Since 4 Oct 2026 it refuses to run without `--limit`, and refuses
  a limit above 2,000 (about 35 minutes, the most acceptable to lose), and
  points to the nightly command. Use it only for a test slice.
- `crawl:auchan` and `crawl:all` - deleted on 4 Oct 2026. Both read Auchan and
  saved only at the end. If an old note mentions them, use
  `crawl:auchan:nightly`.
- `crawl:continente` and `crawl:pingodoce` - despite the names, these are now
  short coverage checks (about a dozen and about twenty requests): they compare
  each store's published product counts with the catalogue. They used to be
  listing-grid crawlers, which those stores' robots.txt forbids. Useful, but
  they collect no prices.

When in doubt about any command, read its code: how it saves, what it
requests, how long it takes. Do not choose from the header comment alone.

## Before

1. **Ask the user.** No request to a store without an explicit go-ahead, test
   runs included.
2. **Check `CRAWLER_CONTACT` is set in `.env`.** Every request carries it, and
   every crawl command stops at once without it (before any request or
   database write). Never put an address in the code instead.
3. **Re-check robots.txt** for the three stores and compare with the last saved
   copy in `logs/robots-*.txt`. If a rule changed, stop and tell the user.
4. **Tell the user the plan in numbers**: which commands, in what order, the
   expected duration of each, and the finish time.
5. **Keep the computer awake.** The app's own keep-awake lets go a few minutes
   after the session goes quiet, which is too short. The runner used on 3 Oct
   held a Windows `SetThreadExecutionState` request in a helper process bound
   to the runner's lifetime - no setting changed. Closing the lid or choosing
   Sleep still sleeps; say so.
6. **One at a time.** SQLite accepts one writer. Never run two crawls together,
   and never query the database while a crawl runs - not even to check
   progress. `verify:nightly` writes test rows, so it waits too.

## During

- **Read the first lines of each crawl's output** as soon as it starts. Each
  prints its workload and an estimate. If either differs from what the user
  was told, stop and say so before it goes further.
- Check progress from the log files in `logs/`, never from the database.

## After

1. `npm run backfill:sizes`, then `npm run classify:food` - offline, minutes.
2. Read `reports/latest.md` and each store's report in `reports/`; for Pingo
   Doce, the end of its log. Explain every WARN or FAIL to the user in plain
   words.
3. `npm run verify:nightly` and `npm run validate:comparisons`.
4. Read the last section of `validate:comparisons`, the **known store errors**
   (`data/store-errors.ts`), and act on each entry:
   - `STORE DATA CHANGED` - the store's size is no longer the one judged
     wrong. Tell the user, ask to read that product's page, and propose
     removing the entry if the new size is believable.
   - `RE-CHECK DUE` - unchanged for over 30 days. Same: ask, read, then
     remove the entry or update its `checkedOn` date.
   - `NO LONGER IN THE CATALOGUE` - propose removing the entry.
   The program only notices change; deciding whether a size is right is
   always a person's call, with the user's approval.
5. Refresh the figures in the README if they are quoted there.
