-- CreateTable
CREATE TABLE "MatchDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rung" TEXT NOT NULL,
    "vetoed" BOOLEAN NOT NULL DEFAULT false,
    "nameSimilarity" REAL NOT NULL,
    "sizeRatio" REAL,
    "priceGap" REAL,
    "reason" TEXT NOT NULL,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" DATETIME,
    "retiredReason" TEXT
);

-- CreateTable
CREATE TABLE "ProductGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeCount" INTEGER NOT NULL,
    "memberCount" INTEGER NOT NULL,
    "strong" BOOLEAN NOT NULL DEFAULT false,
    "flags" TEXT,
    "builtAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProductGroupMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    CONSTRAINT "ProductGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MatchDecision_verdict_retiredAt_idx" ON "MatchDecision"("verdict", "retiredAt");

-- CreateIndex
CREATE INDEX "MatchDecision_aId_idx" ON "MatchDecision"("aId");

-- CreateIndex
CREATE INDEX "MatchDecision_bId_idx" ON "MatchDecision"("bId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchDecision_aId_bId_key" ON "MatchDecision"("aId", "bId");

-- CreateIndex
CREATE INDEX "ProductGroup_storeCount_idx" ON "ProductGroup"("storeCount");

-- CreateIndex
CREATE INDEX "ProductGroupMember_productId_idx" ON "ProductGroupMember"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductGroupMember_groupId_productId_key" ON "ProductGroupMember"("groupId", "productId");
