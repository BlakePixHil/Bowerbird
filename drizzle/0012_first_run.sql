CREATE TYPE "public"."setup_step" AS ENUM('welcome', 'bring');--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "setup_step" "setup_step";