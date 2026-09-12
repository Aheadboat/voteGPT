CREATE TABLE "election" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"official_key" text NOT NULL,
	"revision" text NOT NULL,
	"revision_of" text,
	"dataset_kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_ballot_line" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"official_key" text NOT NULL,
	"revision" text NOT NULL,
	"revision_of" text,
	"candidacy_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_candidacy" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"official_key" text NOT NULL,
	"revision" text NOT NULL,
	"revision_of" text,
	"contest_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_contest" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"official_key" text NOT NULL,
	"revision" text NOT NULL,
	"revision_of" text,
	"stage_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_sha256" text NOT NULL,
	"kind" text NOT NULL,
	"election_id" text,
	"stage_id" text,
	"contest_id" text,
	"candidacy_id" text,
	"ballot_line_id" text,
	"assertion" jsonb NOT NULL,
	CONSTRAINT "election_evidence_one_subject" CHECK (num_nonnulls("election_evidence"."election_id", "election_evidence"."stage_id", "election_evidence"."contest_id", "election_evidence"."candidacy_id", "election_evidence"."ballot_line_id") = 1),
	CONSTRAINT "election_evidence_subject_binding" CHECK (coalesce(
    jsonb_typeof("election_evidence"."assertion") = 'object' and "election_evidence"."assertion"->>'id' = "election_evidence"."id" and "election_evidence"."assertion"->>'kind' = "election_evidence"."kind"
    and "election_evidence"."assertion"->'subject'->>'id' = coalesce("election_evidence"."election_id", "election_evidence"."stage_id", "election_evidence"."contest_id", "election_evidence"."candidacy_id", "election_evidence"."ballot_line_id")
    and "election_evidence"."assertion"->'subject'->>'kind' = case when "election_evidence"."election_id" is not null then 'election' when "election_evidence"."stage_id" is not null then 'stage'
      when "election_evidence"."contest_id" is not null then 'contest' when "election_evidence"."candidacy_id" is not null then 'candidacy' else 'ballot_line' end, false)),
	CONSTRAINT "election_evidence_required_provenance" CHECK (coalesce(
    "election_evidence"."assertion" ?& array['document_id','mapping_id','locator','original_term','retrieved_at','verified_at','effective','current_until']
    and jsonb_typeof("election_evidence"."assertion"->'locator') = 'string' and length("election_evidence"."assertion"->>'locator') between 1 and 500, false))
);
--> statement-breakpoint
CREATE TABLE "election_evidence_supersession" (
	"replacement_id" text NOT NULL,
	"predecessor_id" text NOT NULL,
	"batch_sha256" text NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "election_evidence_supersession_pk" PRIMARY KEY("replacement_id","predecessor_id"),
	CONSTRAINT "election_supersession_not_self" CHECK ("election_evidence_supersession"."replacement_id" <> "election_evidence_supersession"."predecessor_id")
);
--> statement-breakpoint
CREATE TABLE "election_import_batch" (
	"package_sha256" text PRIMARY KEY NOT NULL,
	"election_id" text NOT NULL,
	"schema_version" text NOT NULL,
	"policy_version" text NOT NULL,
	"receipt_id" text NOT NULL,
	"canonical_package" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_stage" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"official_key" text NOT NULL,
	"revision" text NOT NULL,
	"revision_of" text,
	"election_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "election" ADD CONSTRAINT "election_revision_of_election_id_fk" FOREIGN KEY ("revision_of") REFERENCES "public"."election"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_ballot_line" ADD CONSTRAINT "election_ballot_line_revision_of_election_ballot_line_id_fk" FOREIGN KEY ("revision_of") REFERENCES "public"."election_ballot_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_ballot_line" ADD CONSTRAINT "election_ballot_line_candidacy_id_election_candidacy_id_fk" FOREIGN KEY ("candidacy_id") REFERENCES "public"."election_candidacy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_candidacy" ADD CONSTRAINT "election_candidacy_revision_of_election_candidacy_id_fk" FOREIGN KEY ("revision_of") REFERENCES "public"."election_candidacy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_candidacy" ADD CONSTRAINT "election_candidacy_contest_id_election_contest_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."election_contest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_contest" ADD CONSTRAINT "election_contest_revision_of_election_contest_id_fk" FOREIGN KEY ("revision_of") REFERENCES "public"."election_contest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_contest" ADD CONSTRAINT "election_contest_stage_id_election_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."election_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_evidence" ADD CONSTRAINT "election_evidence_batch_sha256_election_import_batch_package_sha256_fk" FOREIGN KEY ("batch_sha256") REFERENCES "public"."election_import_batch"("package_sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_evidence" ADD CONSTRAINT "election_evidence_election_id_election_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."election"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_evidence" ADD CONSTRAINT "election_evidence_stage_id_election_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."election_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_evidence" ADD CONSTRAINT "election_evidence_contest_id_election_contest_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."election_contest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_evidence" ADD CONSTRAINT "election_evidence_candidacy_id_election_candidacy_id_fk" FOREIGN KEY ("candidacy_id") REFERENCES "public"."election_candidacy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_evidence" ADD CONSTRAINT "election_evidence_ballot_line_id_election_ballot_line_id_fk" FOREIGN KEY ("ballot_line_id") REFERENCES "public"."election_ballot_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_evidence_supersession" ADD CONSTRAINT "election_evidence_supersession_replacement_id_election_evidence_id_fk" FOREIGN KEY ("replacement_id") REFERENCES "public"."election_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_evidence_supersession" ADD CONSTRAINT "election_evidence_supersession_predecessor_id_election_evidence_id_fk" FOREIGN KEY ("predecessor_id") REFERENCES "public"."election_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_evidence_supersession" ADD CONSTRAINT "election_evidence_supersession_batch_sha256_election_import_batch_package_sha256_fk" FOREIGN KEY ("batch_sha256") REFERENCES "public"."election_import_batch"("package_sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_import_batch" ADD CONSTRAINT "election_import_batch_election_id_election_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."election"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_stage" ADD CONSTRAINT "election_stage_revision_of_election_stage_id_fk" FOREIGN KEY ("revision_of") REFERENCES "public"."election_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_stage" ADD CONSTRAINT "election_stage_election_id_election_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."election"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "election_official_revision_unique" ON "election" USING btree ("issuer","official_key","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "election_ballot_line_official_revision_unique" ON "election_ballot_line" USING btree ("candidacy_id","issuer","official_key","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "election_candidacy_official_revision_unique" ON "election_candidacy" USING btree ("contest_id","issuer","official_key","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "election_contest_official_revision_unique" ON "election_contest" USING btree ("stage_id","issuer","official_key","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "election_import_receipt_unique" ON "election_import_batch" USING btree ("receipt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "election_stage_official_revision_unique" ON "election_stage" USING btree ("election_id","issuer","official_key","revision");--> statement-breakpoint
CREATE FUNCTION election_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Election history is immutable';
END
$$;
--> statement-breakpoint
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['election', 'election_stage', 'election_contest', 'election_candidacy', 'election_ballot_line', 'election_import_batch', 'election_evidence', 'election_evidence_supersession'] LOOP
    EXECUTE format('CREATE TRIGGER election_no_mutation BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION election_history_immutable()', relation_name);
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE FUNCTION election_supersession_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE replacement election_evidence%ROWTYPE;
DECLARE predecessor election_evidence%ROWTYPE;
BEGIN
  SELECT * INTO STRICT replacement FROM election_evidence WHERE id = NEW.replacement_id;
  SELECT * INTO STRICT predecessor FROM election_evidence WHERE id = NEW.predecessor_id;
  IF replacement.kind <> predecessor.kind OR
    ROW(replacement.election_id, replacement.stage_id, replacement.contest_id, replacement.candidacy_id, replacement.ballot_line_id)
    IS DISTINCT FROM ROW(predecessor.election_id, predecessor.stage_id, predecessor.contest_id, predecessor.candidacy_id, predecessor.ballot_line_id) THEN
    RAISE EXCEPTION 'Election correction crosses subject or claim scope';
  END IF;
  PERFORM 1 FROM election WHERE id = (SELECT election_id FROM election_import_batch WHERE package_sha256 = NEW.batch_sha256) FOR UPDATE;
  IF EXISTS (
    WITH RECURSIVE predecessors(id) AS (
      SELECT NEW.predecessor_id
      UNION
      SELECT link.predecessor_id FROM election_evidence_supersession link JOIN predecessors prior ON link.replacement_id = prior.id
    ) SELECT 1 FROM predecessors WHERE id = NEW.replacement_id
  ) THEN
    RAISE EXCEPTION 'Election correction is cyclic';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER election_supersession_scope_check BEFORE INSERT ON election_evidence_supersession FOR EACH ROW EXECUTE FUNCTION election_supersession_scope();
