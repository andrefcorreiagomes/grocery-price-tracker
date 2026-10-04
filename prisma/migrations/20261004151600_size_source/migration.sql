-- Where a product's package size came from: "page", "listing", or NULL (name / unknown).
-- Only adds a nullable column; existing rows are untouched.
ALTER TABLE "CatalogueProduct" ADD COLUMN "sizeSource" TEXT;
