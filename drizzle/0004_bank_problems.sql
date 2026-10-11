CREATE TABLE "connection_banks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "connection_status" DEFAULT 'ok' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"problem_since" timestamp with time zone,
	"consent_from" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connection_banks" ADD CONSTRAINT "connection_banks_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connection_banks_connection_name_key" ON "connection_banks" USING btree ("connection_id","name");