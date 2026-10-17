-- Promotion state and the store's own displayed price per kilo, litre or unit.
-- Only adds nullable columns; existing rows are untouched (null = not known yet).
ALTER TABLE "CatalogueProduct" ADD COLUMN "onPromotion" BOOLEAN;
ALTER TABLE "CatalogueProduct" ADD COLUMN "regularPrice" REAL;
ALTER TABLE "CatalogueProduct" ADD COLUMN "promoEndsAt" DATETIME;
ALTER TABLE "CatalogueProduct" ADD COLUMN "shownUnitPrice" REAL;
ALTER TABLE "CatalogueProduct" ADD COLUMN "shownUnitPriceUnit" TEXT;
