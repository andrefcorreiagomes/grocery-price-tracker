-- The days a product was out of stock, in its price history (the owner's
-- design, 1 November 2026). A period now also says whether the store sold the
-- product, and by what sign; the price may be empty, for a store that shows
-- none. Every period recorded before this is "assumed_for_sale": most were for
-- sale, but nobody looked (the owner's label, 1 November 2026).
--
-- SQLite cannot make a column nullable in place, so the table is rebuilt.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CataloguePrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "price" REAL,
    "availability" TEXT NOT NULL,
    "availabilitySign" TEXT,
    "firstSeenAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "CataloguePrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogueProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CataloguePrice" ("id", "productId", "price", "availability", "availabilitySign", "firstSeenAt", "lastSeenAt", "isOpen")
SELECT "id", "productId", "price", 'assumed_for_sale', NULL, "firstSeenAt", "lastSeenAt", "isOpen" FROM "CataloguePrice";
DROP TABLE "CataloguePrice";
ALTER TABLE "new_CataloguePrice" RENAME TO "CataloguePrice";
CREATE INDEX "CataloguePrice_productId_isOpen_idx" ON "CataloguePrice"("productId", "isOpen");
CREATE INDEX "CataloguePrice_productId_firstSeenAt_idx" ON "CataloguePrice"("productId", "firstSeenAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
