-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StoreListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "storeProductId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ean" TEXT,
    "packageSize" REAL NOT NULL DEFAULT 1,
    CONSTRAINT "StoreListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StoreListing" ("ean", "id", "productId", "store", "storeProductId", "url") SELECT "ean", "id", "productId", "store", "storeProductId", "url" FROM "StoreListing";
DROP TABLE "StoreListing";
ALTER TABLE "new_StoreListing" RENAME TO "StoreListing";
CREATE UNIQUE INDEX "StoreListing_store_storeProductId_key" ON "StoreListing"("store", "storeProductId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
