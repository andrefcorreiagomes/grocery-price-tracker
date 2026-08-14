-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT,
    "ean" TEXT
);

-- CreateTable
CREATE TABLE "StoreListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "storeProductId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ean" TEXT,
    CONSTRAINT "StoreListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeListingId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "price" REAL NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceSnapshot_storeListingId_fkey" FOREIGN KEY ("storeListingId") REFERENCES "StoreListing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreListing_store_storeProductId_key" ON "StoreListing"("store", "storeProductId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSnapshot_storeListingId_date_key" ON "PriceSnapshot"("storeListingId", "date");
