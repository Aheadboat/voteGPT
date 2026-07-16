CREATE TABLE "saved_residence" (
	"user_id" text PRIMARY KEY NOT NULL,
	"envelope_version" text NOT NULL,
	"key_version" text NOT NULL,
	"iv" text NOT NULL,
	"ciphertext" text NOT NULL,
	"tag" text NOT NULL,
	"resolution_status" text NOT NULL,
	"source_name" text NOT NULL,
	"source_url" text NOT NULL,
	"source_checked_at" timestamp with time zone NOT NULL,
	"source_effective_at" timestamp with time zone,
	"source_benchmark" text,
	"source_vintage" text,
	"coverage_notes" jsonb NOT NULL,
	"consent_version" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "saved_residence_envelope_version_check" CHECK ("saved_residence"."envelope_version" = 'v1'),
	CONSTRAINT "saved_residence_resolution_status_check" CHECK ("saved_residence"."resolution_status" in ('matched', 'partial')),
	CONSTRAINT "saved_residence_consent_version_check" CHECK ("saved_residence"."consent_version" = 'saved-residence-v1'),
	CONSTRAINT "saved_residence_envelope_fields_nonempty_check" CHECK (length("saved_residence"."key_version") > 0 and length("saved_residence"."iv") > 0 and length("saved_residence"."ciphertext") > 0 and length("saved_residence"."tag") > 0)
);
--> statement-breakpoint
CREATE TABLE "saved_residence_division" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"id_scheme" text NOT NULL,
	"division_id" text NOT NULL,
	"name" text NOT NULL,
	"display_order" integer NOT NULL,
	CONSTRAINT "saved_residence_division_pk" PRIMARY KEY("user_id","type","id_scheme","division_id")
);
--> statement-breakpoint
ALTER TABLE "saved_residence" ADD CONSTRAINT "saved_residence_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_residence_division" ADD CONSTRAINT "saved_residence_division_user_id_saved_residence_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."saved_residence"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_residence_division_display_order_unique" ON "saved_residence_division" USING btree ("user_id","display_order");--> statement-breakpoint
CREATE INDEX "saved_residence_division_lookup_idx" ON "saved_residence_division" USING btree ("id_scheme","type","division_id","user_id");