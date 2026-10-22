-- Why a product left (code review M5, 22 October 2026).
ALTER TABLE "CatalogueProduct" ADD COLUMN "delistReason" TEXT;

-- Older rows, from what they show. Certain: an id taken over by another
-- product is renamed "...~retired-<date>", and a product that came back under
-- a new id carries its successor.
UPDATE "CatalogueProduct" SET "delistReason" = 'replaced'
WHERE "delistedAt" IS NOT NULL AND ("storeProductId" LIKE '%~retired-%' OR "supersededById" IS NOT NULL);

-- Three dead nights is the only way the counter reaches three.
UPDATE "CatalogueProduct" SET "delistReason" = 'gone'
WHERE "delistedAt" IS NOT NULL AND "delistReason" IS NULL AND "deadCount" >= 3;

-- The rest are left unknown here, and filled only after being measured.
