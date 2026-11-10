-- A tin's two weights and where each came from (the owner's choice, 10
-- November 2026). Empty until the nightly fills them: the page readers at
-- Continente and Pingo Doce, then npm run tins:weights.
ALTER TABLE "CatalogueProduct" ADD COLUMN "fullWeight" REAL;
ALTER TABLE "CatalogueProduct" ADD COLUMN "fullWeightSource" TEXT;
ALTER TABLE "CatalogueProduct" ADD COLUMN "drainedWeight" REAL;
ALTER TABLE "CatalogueProduct" ADD COLUMN "drainedWeightSource" TEXT;
