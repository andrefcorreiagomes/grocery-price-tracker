-- CreateTable
CREATE TABLE "FoodTypeCategory" (
    "foodType" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "decidedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "FoodTypeCategory_category_idx" ON "FoodTypeCategory"("category");

-- CreateIndex
CREATE INDEX "FoodTypeCategory_confirmed_idx" ON "FoodTypeCategory"("confirmed");
