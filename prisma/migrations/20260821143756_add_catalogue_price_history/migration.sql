-- CreateTable
CREATE TABLE "CataloguePrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "firstSeenAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "CataloguePrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogueProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CataloguePrice_productId_isOpen_idx" ON "CataloguePrice"("productId", "isOpen");

-- CreateIndex
CREATE INDEX "CataloguePrice_productId_firstSeenAt_idx" ON "CataloguePrice"("productId", "firstSeenAt");
