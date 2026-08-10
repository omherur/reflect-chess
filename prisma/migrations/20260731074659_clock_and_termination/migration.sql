-- AlterTable
ALTER TABLE "Game" ADD COLUMN "terminationReason" TEXT;

-- AlterTable
ALTER TABLE "GameMove" ADD COLUMN "clockSeconds" INTEGER;
