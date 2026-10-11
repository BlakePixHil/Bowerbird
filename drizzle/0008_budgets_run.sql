CREATE TYPE "public"."budgets_run" AS ENUM('monthly', 'payday', 'weekly');--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "budgets_run" "budgets_run" DEFAULT 'monthly' NOT NULL;