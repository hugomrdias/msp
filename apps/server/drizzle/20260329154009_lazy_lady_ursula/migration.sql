ALTER TYPE "piece_copy_status" ADD VALUE 'finalized' BEFORE 'failed';--> statement-breakpoint
ALTER TABLE "pieceCopies" ADD COLUMN "target_block_number" bigint;--> statement-breakpoint
ALTER TABLE "pieceCopies" ADD COLUMN "finalized_at" bigint;