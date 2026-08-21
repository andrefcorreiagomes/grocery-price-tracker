-- CreateTable
CREATE TABLE "CrawlRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "CrawlSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "cgid" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "collected" INTEGER NOT NULL,
    "expected" INTEGER,
    CONSTRAINT "CrawlSection_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CrawlRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CrawlRun_store_startedAt_idx" ON "CrawlRun"("store", "startedAt");

-- CreateIndex
CREATE INDEX "CrawlSection_runId_idx" ON "CrawlSection"("runId");
