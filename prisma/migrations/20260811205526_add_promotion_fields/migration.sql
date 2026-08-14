-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeListingId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "price" REAL NOT NULL,
    "onPromotion" BOOLEAN NOT NULL DEFAULT false,
    "regularPrice" REAL,
    "promoEndsAt" DATETIME,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceSnapshot_storeListingId_fkey" FOREIGN KEY ("storeListingId") REFERENCES "StoreListing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PriceSnapshot" ("capturedAt", "date", "id", "price", "storeListingId") SELECT "capturedAt", "date", "id", "price", "storeListingId" FROM "PriceSnapshot";
DROP TABLE "PriceSnapshot";
ALTER TABLE "new_PriceSnapshot" RENAME TO "PriceSnapshot";
CREATE UNIQUE INDEX "PriceSnapshot_storeListingId_date_key" ON "PriceSnapshot"("storeListingId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
