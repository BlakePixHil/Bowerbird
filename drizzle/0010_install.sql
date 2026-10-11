ALTER TABLE "members" ADD COLUMN "installed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "install_prompt_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "app_link_sent_at" timestamp with time zone;