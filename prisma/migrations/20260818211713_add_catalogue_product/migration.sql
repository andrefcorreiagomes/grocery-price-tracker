-- CreateTable
CREATE TABLE "CatalogueProduct" (
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
    "enrichedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "CatalogueProduct_store_brand_idx" ON "CatalogueProduct"("store", "brand");

-- CreateIndex
CREATE INDEX "CatalogueProduct_store_categoryPath_idx" ON "CatalogueProduct"("store", "categoryPath");

-- CreateIndex
CREATE INDEX "CatalogueProduct_eanNormalized_idx" ON "CatalogueProduct"("eanNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueProduct_store_storeProductId_key" ON "CatalogueProduct"("store", "storeProductId");
