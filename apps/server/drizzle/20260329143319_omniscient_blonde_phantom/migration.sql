ALTER TABLE "pieceCopies" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "piece_copy_status";--> statement-breakpoint
CREATE TYPE "piece_copy_status" AS ENUM('pending', 'processing', 'confirmed', 'failed', 'orphaned');--> statement-breakpoint
ALTER TABLE "pieceCopies" ALTER COLUMN "status" SET DATA TYPE "piece_copy_status" USING "status"::"piece_copy_status";--> statement-breakpoint
ALTER TABLE "pieceCopies" DROP COLUMN "metadata";--> statement-breakpoint
ALTER TABLE "pieceCopies" DROP COLUMN "requested_at";--> statement-breakpoint
ALTER TABLE "pieceCopies" DROP COLUMN "finalized_at";--> statement-breakpoint
ALTER TABLE "pieceCopies" ALTER COLUMN "created_at" SET NOT NULL;