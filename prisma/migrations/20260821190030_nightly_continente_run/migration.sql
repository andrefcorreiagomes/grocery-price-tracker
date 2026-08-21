-- AlterTable
ALTER TABLE "CrawlRun" ADD COLUMN "sitemapEntries" INTEGER;
ALTER TABLE "CrawlRun" ADD COLUMN "wireBytes" INTEGER;

-- CreateTable
CREATE TABLE "ProductCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "store" TEXT NOT NULL,
    "storeProductId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "categoryPath" TEXT,
    "name" TEXT,
    "checkedAt" DATETIME NOT NULL,
    "checkCount" INTEGER NOT NULL DEFAULT 1
);

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
    "ean" TEXT,
    "eanNormalized" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrichedAt" DATETIME,
    "lastCheckedAt" DATETIME,
    "deadCount" INTEGER NOT NULL DEFAULT 0,
    "delistedAt" DATETIME
);
INSERT INTO "new_CatalogueProduct" ("brand", "categoryPath", "ean", "eanNormalized", "enrichedAt", "firstSeenAt", "id", "lastSeenAt", "name", "packageSize", "price", "store", "storeProductId", "unit", "url") SELECT "brand", "categoryPath", "ean", "eanNormalized", "enrichedAt", "firstSeenAt", "id", "lastSeenAt", "name", "packageSize", "price", "store", "storeProductId", "unit", "url" FROM "CatalogueProduct";
DROP TABLE "CatalogueProduct";
ALTER TABLE "new_CatalogueProduct" RENAME TO "CatalogueProduct";
CREATE INDEX "CatalogueProduct_store_brand_idx" ON "CatalogueProduct"("store", "brand");
CREATE INDEX "CatalogueProduct_store_categoryPath_idx" ON "CatalogueProduct"("store", "categoryPath");
CREATE INDEX "CatalogueProduct_eanNormalized_idx" ON "CatalogueProduct"("eanNormalized");
CREATE INDEX "CatalogueProduct_store_delistedAt_lastCheckedAt_idx" ON "CatalogueProduct"("store", "delistedAt", "lastCheckedAt");
CREATE UNIQUE INDEX "CatalogueProduct_store_storeProductId_key" ON "CatalogueProduct"("store", "storeProductId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProductCheck_store_checkedAt_idx" ON "ProductCheck"("store", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCheck_store_storeProductId_key" ON "ProductCheck"("store", "storeProductId");
