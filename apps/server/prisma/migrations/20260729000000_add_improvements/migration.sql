-- AlterTable
ALTER TABLE "StockCountLine" ADD COLUMN "countNotes" TEXT;

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN "quantityDifference" DECIMAL(18,4);
