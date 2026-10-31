CREATE TYPE "public"."auction_status" AS ENUM('DRAFT', 'LOCKED', 'LIVE', 'PAUSED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."lot_result" AS ENUM('OPEN', 'SOLD', 'UNSOLD', 'SKIPPED', 'DISQUALIFIED');--> statement-breakpoint
CREATE TYPE "public"."player_status" AS ENUM('POOL', 'SOLD', 'UNSOLD', 'DISQUALIFIED');--> statement-breakpoint
CREATE TYPE "public"."pool_order" AS ENUM('RANDOM', 'SEQUENTIAL');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "auctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "auction_status" DEFAULT 'DRAFT' NOT NULL,
	"currency_symbol" text DEFAULT '$' NOT NULL,
	"purse" integer DEFAULT 25000 NOT NULL,
	"base_price" integer DEFAULT 1000 NOT NULL,
	"bid_increment" integer DEFAULT 1000 NOT NULL,
	"min_squad" integer DEFAULT 3 NOT NULL,
	"max_squad" integer DEFAULT 9 NOT NULL,
	"timer_enabled" boolean DEFAULT false NOT NULL,
	"timer_seconds" integer DEFAULT 30 NOT NULL,
	"pool_order" "pool_order" DEFAULT 'RANDOM' NOT NULL,
	"roles" jsonb NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"lot_sequence" integer DEFAULT 0 NOT NULL,
	"current_lot_id" uuid,
	"last_lot_id" uuid,
	"announcement" text,
	"announcement_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"live_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "auctions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "auctions_squad_chk" CHECK ("auctions"."min_squad" >= 0 AND "auctions"."max_squad" >= 1 AND "auctions"."min_squad" <= "auctions"."max_squad"),
	CONSTRAINT "auctions_money_chk" CHECK ("auctions"."purse" > 0 AND "auctions"."base_price" > 0 AND "auctions"."bid_increment" > 0),
	CONSTRAINT "auctions_timer_chk" CHECK ("auctions"."timer_seconds" BETWEEN 5 AND 600),
	CONSTRAINT "auctions_round_chk" CHECK ("auctions"."round" >= 1)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"auction_id" uuid,
	"actor_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"auction_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"placed_by" uuid,
	"command_id" uuid,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bids_command_id_unique" UNIQUE("command_id"),
	CONSTRAINT "bids_amount_chk" CHECK ("bids"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"round" integer NOT NULL,
	"result" "lot_result" DEFAULT 'OPEN' NOT NULL,
	"base_price" integer NOT NULL,
	"current_bid" integer,
	"leading_team_id" uuid,
	"final_amount" integer,
	"winning_team_id" uuid,
	"timer_ends_at" timestamp with time zone,
	"timer_remaining_ms" integer,
	"time_up" boolean DEFAULT false NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"photo_path" text,
	"photo_url" text,
	"base_price" integer,
	"status" "player_status" DEFAULT 'POOL' NOT NULL,
	"sold_price" integer,
	"sold_to_team_id" uuid,
	"sold_round" integer,
	"sold_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_sold_consistency_chk" CHECK (("players"."status" = 'SOLD') = ("players"."sold_to_team_id" IS NOT NULL AND "players"."sold_price" IS NOT NULL)),
	CONSTRAINT "players_money_chk" CHECK (("players"."base_price" IS NULL OR "players"."base_price" > 0) AND ("players"."sold_price" IS NULL OR "players"."sold_price" > 0))
);
--> statement-breakpoint
CREATE TABLE "processed_commands" (
	"command_id" uuid PRIMARY KEY NOT NULL,
	"auction_id" uuid NOT NULL,
	"type" text NOT NULL,
	"result_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" uuid NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"color" text NOT NULL,
	"logo_path" text,
	"members" jsonb NOT NULL,
	"purse" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"disqualified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_purse_chk" CHECK ("teams"."purse" > 0)
);
--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_admins_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_placed_by_admins_id_fk" FOREIGN KEY ("placed_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_leading_team_id_teams_id_fk" FOREIGN KEY ("leading_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_winning_team_id_teams_id_fk" FOREIGN KEY ("winning_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_sold_to_team_id_teams_id_fk" FOREIGN KEY ("sold_to_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_commands" ADD CONSTRAINT "processed_commands_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_auction_idx" ON "audit_logs" USING btree ("auction_id","created_at");--> statement-breakpoint
CREATE INDEX "bids_lot_idx" ON "bids" USING btree ("lot_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "lots_one_open_per_auction_uq" ON "lots" USING btree ("auction_id") WHERE "lots"."result" = 'OPEN';--> statement-breakpoint
CREATE UNIQUE INDEX "lots_auction_sequence_uq" ON "lots" USING btree ("auction_id","sequence");--> statement-breakpoint
CREATE INDEX "lots_player_idx" ON "lots" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_auction_number_uq" ON "players" USING btree ("auction_id","number");--> statement-breakpoint
CREATE INDEX "players_auction_status_idx" ON "players" USING btree ("auction_id","status");--> statement-breakpoint
CREATE INDEX "processed_commands_auction_idx" ON "processed_commands" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX "sessions_admin_idx" ON "sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "teams_auction_idx" ON "teams" USING btree ("auction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_auction_name_uq" ON "teams" USING btree ("auction_id",lower("name"));