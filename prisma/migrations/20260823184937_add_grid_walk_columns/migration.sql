-- AlterTable
ALTER TABLE "CrawlRun" ADD COLUMN "emptyCategory" INTEGER;
ALTER TABLE "CrawlRun" ADD COLUMN "publishedTotal" INTEGER;
ALTER TABLE "CrawlRun" ADD COLUMN "segmentTally" TEXT;
ALTER TABLE "CrawlRun" ADD COLUMN "tilesKept" INTEGER;
ALTER TABLE "CrawlRun" ADD COLUMN "tilesSeen" INTEGER;
ALTER TABLE "CrawlRun" ADD COLUMN "walkedTotal" INTEGER;
