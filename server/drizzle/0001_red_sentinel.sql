CREATE TABLE "game_secrets" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"secret" text NOT NULL,
	"commit_hash" text NOT NULL,
	"type" text DEFAULT 'arena' NOT NULL,
	"created_at" bigint NOT NULL,
	"revealed" boolean DEFAULT false
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_gs_round_type" ON "game_secrets" USING btree ("round_id","type");