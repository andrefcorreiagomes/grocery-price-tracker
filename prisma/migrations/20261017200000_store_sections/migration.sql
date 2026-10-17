-- CreateTable
CREATE TABLE "StoreSection" (
    "store" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "firstSeenAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "products" INTEGER,
    "example" TEXT,

    PRIMARY KEY ("store", "path"),
    CONSTRAINT "StoreSection_store_fkey" FOREIGN KEY ("store") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

