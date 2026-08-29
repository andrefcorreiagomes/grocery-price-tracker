-- AlterTable
ALTER TABLE "CatalogueProduct" ADD COLUMN "foodType" TEXT;

-- CreateIndex
CREATE INDEX "CatalogueProduct_foodType_store_idx" ON "CatalogueProduct"("foodType", "store");
