CREATE TABLE "federal_official_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"refresh_after" timestamp with time zone NOT NULL,
	"stale_after" timestamp with time zone NOT NULL,
	CONSTRAINT "federal_official_cache_key_check" CHECK ("federal_official_cache"."cache_key" ~ '^(roster:v1:[A-Z]{2}:(AL|[0-9]{2})|profile:v2:[A-Z][0-9]{6})$'),
	CONSTRAINT "federal_official_cache_refresh_after_check" CHECK ("federal_official_cache"."refresh_after" = "federal_official_cache"."retrieved_at" + interval '24 hours'),
	CONSTRAINT "federal_official_cache_stale_after_check" CHECK ("federal_official_cache"."stale_after" = "federal_official_cache"."retrieved_at" + interval '72 hours')
);
