CREATE TABLE "ai_usage_history_points" (
	"tool_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"five_hour_used_percent" double precision,
	"weekly_used_percent" double precision,
	"model_weekly_used_percent" double precision,
	CONSTRAINT "ai_usage_history_points_tool_id_at_pk" PRIMARY KEY("tool_id","at")
);
--> statement-breakpoint
CREATE TABLE "ai_usage_snapshots" (
	"tool_id" text PRIMARY KEY NOT NULL,
	"snapshot" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_days" (
	"date" text PRIMARY KEY NOT NULL,
	"steps" double precision,
	"watch_steps" double precision,
	"phone_steps" double precision,
	"active_energy_kcal" double precision,
	"exercise_minutes" double precision,
	"stand_hours" double precision,
	"heart_rate" double precision,
	"resting_heart_rate" double precision,
	"walking_heart_rate" double precision,
	"blood_oxygen_percent" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_current" (
	"source" text NOT NULL,
	"metric" text NOT NULL,
	"value" jsonb NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signal_current_source_metric_pk" PRIMARY KEY("source","metric")
);
--> statement-breakpoint
CREATE TABLE "signal_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "signal_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source" text NOT NULL,
	"metric" text NOT NULL,
	"value" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spotify_albums" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"artist" text NOT NULL,
	"image_url" text,
	"url" text,
	"release_date" text,
	"release_date_precision" text,
	"total_tracks" integer,
	"total_duration_ms" integer,
	"album_type" text
);
--> statement-breakpoint
CREATE TABLE "spotify_artists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"url" text,
	"genres" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spotify_history_meta" (
	"id" integer PRIMARY KEY NOT NULL,
	"seeded_at" timestamp with time zone,
	"last_played_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "spotify_observed_plays" (
	"played_at" timestamp with time zone NOT NULL,
	"track_id" text NOT NULL,
	CONSTRAINT "spotify_observed_plays_played_at_track_id_pk" PRIMARY KEY("played_at","track_id")
);
--> statement-breakpoint
CREATE TABLE "spotify_snapshot" (
	"id" integer PRIMARY KEY NOT NULL,
	"snapshot" jsonb,
	"rate_limited_until" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spotify_tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"track" text NOT NULL,
	"artist" text NOT NULL,
	"artist_ids" text[] DEFAULT '{}' NOT NULL,
	"album" text,
	"album_id" text,
	"release_date" text,
	"duration_ms" integer,
	"image_url" text,
	"url" text,
	"play_count" integer NOT NULL,
	"verified" boolean
);
--> statement-breakpoint
CREATE INDEX "ai_usage_points_tool_at_idx" ON "ai_usage_history_points" USING btree ("tool_id","at");--> statement-breakpoint
CREATE INDEX "signal_history_source_metric_recorded_idx" ON "signal_history" USING btree ("source","metric","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "signal_history_change_dedupe_idx" ON "signal_history" USING btree ("source","metric","recorded_at");