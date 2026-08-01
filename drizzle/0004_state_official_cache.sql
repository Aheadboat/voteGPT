CREATE TABLE "state_official_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"refresh_after" timestamp with time zone NOT NULL,
	"stale_after" timestamp with time zone NOT NULL,
	CONSTRAINT "state_official_cache_key_check" CHECK ("state_official_cache"."cache_key" ~ '^state-roster:v1:[A-Z]{2}:U-[a-z0-9][a-z0-9_-]{0,199}(:L-[a-z0-9][a-z0-9_-]{0,199})?$'),
	CONSTRAINT "state_official_cache_refresh_after_check" CHECK ("state_official_cache"."refresh_after" = "state_official_cache"."retrieved_at" + interval '24 hours'),
	CONSTRAINT "state_official_cache_stale_after_check" CHECK ("state_official_cache"."stale_after" = "state_official_cache"."retrieved_at" + interval '72 hours')
);
