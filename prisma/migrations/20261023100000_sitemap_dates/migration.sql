-- The sitemap-date test (agreed with the user, 22 October 2026).
CREATE TABLE "SitemapDate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store" TEXT NOT NULL,
    "storeProductId" TEXT NOT NULL,
    "lastmod" DATETIME NOT NULL,
    "firstSeenAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "SitemapDate_store_storeProductId_lastmod_key" ON "SitemapDate"("store", "storeProductId", "lastmod");
CREATE INDEX "SitemapDate_store_firstSeenAt_idx" ON "SitemapDate"("store", "firstSeenAt");

CREATE TABLE "PageChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store" TEXT NOT NULL,
    "storeProductId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "seenAt" DATETIME NOT NULL
);
CREATE INDEX "PageChange_store_seenAt_idx" ON "PageChange"("store", "seenAt");
CREATE INDEX "PageChange_store_storeProductId_idx" ON "PageChange"("store", "storeProductId");
