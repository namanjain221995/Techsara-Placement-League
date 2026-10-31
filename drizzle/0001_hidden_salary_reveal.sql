CREATE TYPE "public"."reveal_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE');--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "reveal_status" "reveal_status" DEFAULT 'NOT_STARTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "reveal_order" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "reveal_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "reveal_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "reveal_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "reveal_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "original_name" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "annual_salary" integer;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "salary_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "offer_letter_path" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "offer_letter_type" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "offer_letter_name" text;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_reveal_chk" CHECK ("auctions"."reveal_index" >= 0 AND "auctions"."reveal_step" BETWEEN 0 AND 4);--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_salary_chk" CHECK ("players"."annual_salary" IS NULL OR "players"."annual_salary" > 0);