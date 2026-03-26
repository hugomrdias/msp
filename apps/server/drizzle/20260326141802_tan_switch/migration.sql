CREATE TYPE "piece_copy_status" AS ENUM('pending', 'uploading', 'submitted', 'confirmed', 'finalized', 'failed', 'orphaned');--> statement-breakpoint
CREATE TABLE "piece_copies" (
	"source_dataset_id" bigint,
	"source_piece_id" bigint,
	"source_provider_id" bigint NOT NULL,
	"target_provider_id" bigint,
	"target_dataset_id" bigint,
	"target_piece_id" bigint,
	"cid" text NOT NULL,
	"size" bigint,
	"status" "piece_copy_status" NOT NULL,
	"error" text,
	"metadata" json,
	"requested_at" bigint NOT NULL,
	"created_at" bigint,
	"updated_at" bigint,
	"finalized_at" bigint,
	CONSTRAINT "piece_copies_pkey" PRIMARY KEY("source_dataset_id","source_piece_id","target_provider_id")
);
--> statement-breakpoint
CREATE INDEX "piece_copies_cid_index" ON "piece_copies" ("cid");--> statement-breakpoint
CREATE INDEX "piece_copies_status_index" ON "piece_copies" ("status");--> statement-breakpoint
CREATE INDEX "piece_copies_target_provider_id_index" ON "piece_copies" ("target_provider_id");