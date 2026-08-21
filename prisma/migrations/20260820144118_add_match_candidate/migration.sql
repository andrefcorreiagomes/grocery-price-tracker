-- CreateTable
CREATE TABLE "MatchCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,
    "storeA" TEXT NOT NULL,
    "storeB" TEXT NOT NULL,
    "nameSimilarity" REAL NOT NULL,
    "block" TEXT NOT NULL,
    "priceRatio" REAL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchCandidate_aId_fkey" FOREIGN KEY ("aId") REFERENCES "CatalogueProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchCandidate_bId_fkey" FOREIGN KEY ("bId") REFERENCES "CatalogueProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MatchCandidate_nameSimilarity_idx" ON "MatchCandidate"("nameSimilarity");

-- CreateIndex
CREATE INDEX "MatchCandidate_storeA_storeB_idx" ON "MatchCandidate"("storeA", "storeB");

-- CreateIndex
CREATE UNIQUE INDEX "MatchCandidate_aId_bId_key" ON "MatchCandidate"("aId", "bId");
