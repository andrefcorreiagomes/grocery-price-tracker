-- AlterTable
ALTER TABLE "CatalogueProduct" ADD COLUMN "supersededById" TEXT;

-- CreateIndex
CREATE INDEX "CatalogueProduct_store_supersededById_idx" ON "CatalogueProduct"("store", "supersededById");
