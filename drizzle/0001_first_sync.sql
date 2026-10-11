ALTER TABLE "accounts" ADD COLUMN "history_from" date;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "history_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "bank_count" smallint;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "sync_lease_until" timestamp with time zone;