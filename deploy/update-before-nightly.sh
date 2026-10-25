#!/bin/bash
# Run on the server just before each nightly (systemd ExecStartPre, 25 October
# 2026, the owner's request): bring the code up to date with GitHub, safely.
#
#   - only a fast-forward to what GitHub holds; nothing local is merged
#   - if the update changes the database's structure (a new migration), it is
#     NOT applied unattended: the old code stays and the log says a person is
#     needed
#   - if the packages changed, they are installed; if the new code does not
#     type-check, or fails the automatic checks, the old code is put back
#
# Whatever happens, the night then runs - on the new code or on the old - and
# the log says which. It never stops the nightly.

# This file can be replaced by the very update it performs, and bash reads a
# script as it runs: so it runs from a fixed copy.
if [ -z "$UPDATE_COPY" ]; then
  COPY=$(mktemp /tmp/update-before-nightly.XXXXXX)
  cp "$0" "$COPY"
  UPDATE_COPY=1 PROJECT="$(cd "$(dirname "$0")/.." && pwd)" exec bash "$COPY"
fi
cd "$PROJECT" || exit 0
mkdir -p logs
LOG="logs/update-before-nightly-$(date +%F).log"
exec >>"$LOG" 2>&1
echo "=== $(date '+%F %T')"

PREV=$(git rev-parse HEAD)
if ! git fetch -q origin; then echo "could not reach GitHub: running on $(git rev-parse --short HEAD)"; exit 0; fi
NEXT=$(git rev-parse origin/main)
if [ "$PREV" = "$NEXT" ]; then echo "already up to date: $(git rev-parse --short HEAD)"; exit 0; fi

if git diff --name-only "$PREV" "$NEXT" | grep -q '^prisma/migrations/'; then
  echo "the update changes the database structure (a migration): NOT applied unattended; running on $(git rev-parse --short HEAD)"
  exit 0
fi

if ! git merge -q --ff-only "$NEXT"; then
  echo "could not fast-forward (local changes on the server?): running on $(git rev-parse --short HEAD)"
  exit 0
fi

rollback() {
  echo "$1 - putting back $(git rev-parse --short "$PREV")"
  git reset -q --hard "$PREV"
  if git diff --name-only "$PREV" "$NEXT" | grep -q '^package-lock.json$'; then npm ci --no-audit --no-fund >/dev/null 2>&1; fi
  npx prisma generate >/dev/null 2>&1
  exit 0
}

if git diff --name-only "$PREV" "$NEXT" | grep -q '^package-lock.json$'; then
  npm ci --no-audit --no-fund >/dev/null 2>&1 || rollback "installing the packages failed"
fi
if git diff --name-only "$PREV" "$NEXT" | grep -q '^prisma/schema.prisma$'; then
  npx prisma generate >/dev/null 2>&1 || rollback "generating the database client failed"
fi
npx tsc --noEmit >/dev/null 2>&1 || rollback "the new code does not type-check"
# The full automatic checks (about 1,000, on a copy of the database, no store
# requests; about 2 minutes) - the owner's choice, 25 October 2026.
npm run -s verify:nightly >"logs/update-before-nightly-checks-$(date +%F).log" 2>&1 || rollback "the new code fails the automatic checks (see logs/update-before-nightly-checks-$(date +%F).log)"

echo "updated $(git rev-parse --short "$PREV") -> $(git rev-parse --short HEAD): $(git log -1 --format=%s)"
exit 0
