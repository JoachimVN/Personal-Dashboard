CREATE TABLE "steam_playtime_history" (
	"date" text PRIMARY KEY NOT NULL,
	"total_playtime_minutes" double precision NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
