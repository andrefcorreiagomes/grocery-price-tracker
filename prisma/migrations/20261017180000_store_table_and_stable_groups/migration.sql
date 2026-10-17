-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "crawlMethod" TEXT NOT NULL,
    "barcodeSource" TEXT,
    "position" INTEGER NOT NULL
);

-- The three stores, before any table starts pointing at them. Kept equal to
-- src/lib/stores.ts, which syncStores() writes here.
INSERT INTO "Store" ("id", "name", "website", "crawlMethod", "barcodeSource", "position") VALUES
    ('CONTINENTE', 'Continente', 'https://www.continente.pt', 'sitemap and product pages', 'product page', 0),
    ('PINGO_DOCE', 'Pingo Doce', 'https://www.pingodoce.pt', 'sitemap and product pages', NULL, 1),
    ('AUCHAN', 'Auchan', 'https://www.auchan.pt', 'listing pages', 'product page', 2);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CatalogueProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store" TEXT NOT NULL,
    "storeProductId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "categoryPath" TEXT,
    "url" TEXT NOT NULL,
    "price" REAL,
    "packageSize" REAL,
    "unit" TEXT,
    "sizeSource" TEXT,
    "onPromotion" BOOLEAN,
    "regularPrice" REAL,
    "promoEndsAt" DATETIME,
    "shownUnitPrice" REAL,
    "shownUnitPriceUnit" TEXT,
    "ean" TEXT,
    "eanNormalized" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrichedAt" DATETIME,
    "lastCheckedAt" DATETIME,
    "deadCount" INTEGER NOT NULL DEFAULT 0,
    "foodType" TEXT,
    "unavailableAt" DATETIME,
    "delistedAt" DATETIME,
    "supersededById" TEXT,
    CONSTRAINT "CatalogueProduct_store_fkey" FOREIGN KEY ("store") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CatalogueProduct" ("brand", "categoryPath", "deadCount", "delistedAt", "ean", "eanNormalized", "enrichedAt", "firstSeenAt", "foodType", "id", "lastCheckedAt", "lastSeenAt", "name", "onPromotion", "packageSize", "price", "promoEndsAt", "regularPrice", "shownUnitPrice", "shownUnitPriceUnit", "sizeSource", "store", "storeProductId", "supersededById", "unavailableAt", "unit", "url") SELECT "brand", "categoryPath", "deadCount", "delistedAt", "ean", "eanNormalized", "enrichedAt", "firstSeenAt", "foodType", "id", "lastCheckedAt", "lastSeenAt", "name", "onPromotion", "packageSize", "price", "promoEndsAt", "regularPrice", "shownUnitPrice", "shownUnitPriceUnit", "sizeSource", "store", "storeProductId", "supersededById", "unavailableAt", "unit", "url" FROM "CatalogueProduct";
DROP TABLE "CatalogueProduct";
ALTER TABLE "new_CatalogueProduct" RENAME TO "CatalogueProduct";
CREATE INDEX "CatalogueProduct_store_brand_idx" ON "CatalogueProduct"("store", "brand");
CREATE INDEX "CatalogueProduct_store_categoryPath_idx" ON "CatalogueProduct"("store", "categoryPath");
CREATE INDEX "CatalogueProduct_eanNormalized_idx" ON "CatalogueProduct"("eanNormalized");
CREATE INDEX "CatalogueProduct_store_delistedAt_lastCheckedAt_idx" ON "CatalogueProduct"("store", "delistedAt", "lastCheckedAt");
CREATE INDEX "CatalogueProduct_store_supersededById_idx" ON "CatalogueProduct"("store", "supersededById");
CREATE INDEX "CatalogueProduct_foodType_store_idx" ON "CatalogueProduct"("foodType", "store");
CREATE UNIQUE INDEX "CatalogueProduct_store_storeProductId_key" ON "CatalogueProduct"("store", "storeProductId");
CREATE TABLE "new_CrawlRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" INTEGER NOT NULL,
    "requests" INTEGER,
    "bytes" INTEGER,
    "wireBytes" INTEGER,
    "fetchMs" INTEGER,
    "retries" INTEGER,
    "sitemapEntries" INTEGER,
    "sitemapFiles" INTEGER,
    "sitemapTrusted" BOOLEAN,
    "sitemapPerFile" TEXT,
    "sitemapUnparseable" INTEGER,
    "checkNotFood" INTEGER,
    "checkDead" INTEGER,
    "catalogueSizes" TEXT,
    "segmentTally" TEXT,
    "publishedTotal" INTEGER,
    "walkedTotal" INTEGER,
    "tilesSeen" INTEGER,
    "tilesKept" INTEGER,
    "tilesUnpriced" INTEGER,
    "tilesMalformed" INTEGER,
    "emptyCategory" INTEGER,
    CONSTRAINT "CrawlRun_store_fkey" FOREIGN KEY ("store") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CrawlRun" ("bytes", "catalogueSizes", "checkDead", "checkNotFood", "emptyCategory", "fetchMs", "id", "publishedTotal", "requests", "retries", "segmentTally", "sitemapEntries", "sitemapFiles", "sitemapPerFile", "sitemapTrusted", "sitemapUnparseable", "startedAt", "store", "tilesKept", "tilesMalformed", "tilesSeen", "tilesUnpriced", "total", "walkedTotal", "wireBytes") SELECT "bytes", "catalogueSizes", "checkDead", "checkNotFood", "emptyCategory", "fetchMs", "id", "publishedTotal", "requests", "retries", "segmentTally", "sitemapEntries", "sitemapFiles", "sitemapPerFile", "sitemapTrusted", "sitemapUnparseable", "startedAt", "store", "tilesKept", "tilesMalformed", "tilesSeen", "tilesUnpriced", "total", "walkedTotal", "wireBytes" FROM "CrawlRun";
DROP TABLE "CrawlRun";
ALTER TABLE "new_CrawlRun" RENAME TO "CrawlRun";
CREATE INDEX "CrawlRun_store_startedAt_idx" ON "CrawlRun"("store", "startedAt");
CREATE TABLE "new_ProductCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store" TEXT NOT NULL,
    "storeProductId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "categoryPath" TEXT,
    "name" TEXT,
    "checkedAt" DATETIME NOT NULL,
    "checkCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ProductCheck_store_fkey" FOREIGN KEY ("store") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProductCheck" ("categoryPath", "checkCount", "checkedAt", "id", "name", "store", "storeProductId", "url", "verdict") SELECT "categoryPath", "checkCount", "checkedAt", "id", "name", "store", "storeProductId", "url", "verdict" FROM "ProductCheck";
DROP TABLE "ProductCheck";
ALTER TABLE "new_ProductCheck" RENAME TO "ProductCheck";
CREATE INDEX "ProductCheck_store_checkedAt_idx" ON "ProductCheck"("store", "checkedAt");
CREATE UNIQUE INDEX "ProductCheck_store_storeProductId_key" ON "ProductCheck"("store", "storeProductId");
CREATE TABLE "new_ProductGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeCount" INTEGER NOT NULL,
    "memberCount" INTEGER NOT NULL,
    "strong" BOOLEAN NOT NULL DEFAULT false,
    "flags" TEXT,
    "builtAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" DATETIME,
    "retiredReason" TEXT,
    "mergedIntoId" TEXT
);
-- Existing groups were last checked, and last changed, when they were built.
INSERT INTO "new_ProductGroup" ("builtAt", "checkedAt", "changedAt", "flags", "id", "memberCount", "storeCount", "strong") SELECT "builtAt", "builtAt", "builtAt", "flags", "id", "memberCount", "storeCount", "strong" FROM "ProductGroup";
DROP TABLE "ProductGroup";
ALTER TABLE "new_ProductGroup" RENAME TO "ProductGroup";
CREATE INDEX "ProductGroup_storeCount_idx" ON "ProductGroup"("storeCount");
CREATE INDEX "ProductGroup_retiredAt_idx" ON "ProductGroup"("retiredAt");
CREATE TABLE "new_StoreListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "storeProductId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ean" TEXT,
    "packageSize" REAL NOT NULL DEFAULT 1,
    CONSTRAINT "StoreListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StoreListing_store_fkey" FOREIGN KEY ("store") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StoreListing" ("ean", "id", "packageSize", "productId", "store", "storeProductId", "url") SELECT "ean", "id", "packageSize", "productId", "store", "storeProductId", "url" FROM "StoreListing";
DROP TABLE "StoreListing";
ALTER TABLE "new_StoreListing" RENAME TO "StoreListing";
CREATE UNIQUE INDEX "StoreListing_store_storeProductId_key" ON "StoreListing"("store", "storeProductId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

