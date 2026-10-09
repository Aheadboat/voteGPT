import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("user_email_unique").on(table.email)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("session_token_unique").on(table.token),
    index("session_user_id_idx").on(table.userId),
  ],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("account_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
    index("account_user_id_idx").on(table.userId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const savedResidence = pgTable(
  "saved_residence",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    revision: uuid("revision").defaultRandom().notNull(),
    envelopeVersion: text("envelope_version").notNull(),
    keyVersion: text("key_version").notNull(),
    iv: text("iv").notNull(),
    ciphertext: text("ciphertext").notNull(),
    tag: text("tag").notNull(),
    resolutionStatus: text("resolution_status").notNull(),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceCheckedAt: timestamp("source_checked_at", {
      withTimezone: true,
    }).notNull(),
    sourceEffectiveAt: timestamp("source_effective_at", {
      withTimezone: true,
    }),
    sourceBenchmark: text("source_benchmark"),
    sourceVintage: text("source_vintage"),
    coverageNotes: jsonb("coverage_notes").$type<string[]>().notNull(),
    consentVersion: text("consent_version").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "saved_residence_envelope_version_check",
      sql`${table.envelopeVersion} = 'v1'`,
    ),
    check(
      "saved_residence_resolution_status_check",
      sql`${table.resolutionStatus} in ('matched', 'partial')`,
    ),
    check(
      "saved_residence_consent_version_check",
      sql`${table.consentVersion} = 'saved-residence-v1'`,
    ),
    check(
      "saved_residence_envelope_fields_nonempty_check",
      sql`length(${table.keyVersion}) > 0 and length(${table.iv}) > 0 and length(${table.ciphertext}) > 0 and length(${table.tag}) > 0`,
    ),
  ],
);

export const savedResidenceDivision = pgTable(
  "saved_residence_division",
  {
    userId: text("user_id")
      .notNull()
      .references(() => savedResidence.userId, { onDelete: "cascade" }),
    type: text("type").notNull(),
    idScheme: text("id_scheme").notNull(),
    divisionId: text("division_id").notNull(),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.userId,
        table.type,
        table.idScheme,
        table.divisionId,
      ],
      name: "saved_residence_division_pk",
    }),
    uniqueIndex("saved_residence_division_display_order_unique").on(
      table.userId,
      table.displayOrder,
    ),
    index("saved_residence_division_lookup_idx").on(
      table.idScheme,
      table.type,
      table.divisionId,
      table.userId,
    ),
  ],
);

export const federalOfficialCache = pgTable(
  "federal_official_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    refreshAfter: timestamp("refresh_after", { withTimezone: true }).notNull(),
    staleAfter: timestamp("stale_after", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "federal_official_cache_key_check",
      sql`${table.cacheKey} ~ '^(roster:v1:[A-Z]{2}:(AL|[0-9]{2})|profile:v2:[A-Z][0-9]{6})$'`,
    ),
    check(
      "federal_official_cache_refresh_after_check",
      sql`${table.refreshAfter} = ${table.retrievedAt} + interval '24 hours'`,
    ),
    check(
      "federal_official_cache_stale_after_check",
      sql`${table.staleAfter} = ${table.retrievedAt} + interval '72 hours'`,
    ),
  ],
);

export const stateOfficialCache = pgTable(
  "state_official_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    refreshAfter: timestamp("refresh_after", { withTimezone: true }).notNull(),
    staleAfter: timestamp("stale_after", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "state_official_cache_key_check",
      sql`${table.cacheKey} ~ '^state-roster:v1:[A-Z]{2}:U-[a-z0-9][a-z0-9_-]{0,199}(:L-[a-z0-9][a-z0-9_-]{0,199})?$'`,
    ),
    check(
      "state_official_cache_refresh_after_check",
      sql`${table.refreshAfter} = ${table.retrievedAt} + interval '24 hours'`,
    ),
    check(
      "state_official_cache_stale_after_check",
      sql`${table.staleAfter} = ${table.retrievedAt} + interval '72 hours'`,
    ),
  ],
);

const electionIdentityColumns = () => ({
  id: text("id").primaryKey(),
  issuer: text("issuer").notNull(),
  official_key: text("official_key").notNull(),
  revision: text("revision").notNull(),
});

export const election = pgTable("election", {
  ...electionIdentityColumns(),
  revision_of: text("revision_of").references((): AnyPgColumn => election.id),
  dataset_kind: text("dataset_kind").notNull(),
}, (table) => [uniqueIndex("election_official_revision_unique").on(table.issuer, table.official_key, table.revision)]);

export const electionStage = pgTable("election_stage", {
  ...electionIdentityColumns(),
  revision_of: text("revision_of").references((): AnyPgColumn => electionStage.id),
  election_id: text("election_id").notNull().references(() => election.id),
}, (table) => [uniqueIndex("election_stage_official_revision_unique").on(table.election_id, table.issuer, table.official_key, table.revision)]);

export const electionContest = pgTable("election_contest", {
  ...electionIdentityColumns(),
  revision_of: text("revision_of").references((): AnyPgColumn => electionContest.id),
  stage_id: text("stage_id").notNull().references(() => electionStage.id),
}, (table) => [uniqueIndex("election_contest_official_revision_unique").on(table.stage_id, table.issuer, table.official_key, table.revision)]);

export const electionCandidacy = pgTable("election_candidacy", {
  ...electionIdentityColumns(),
  revision_of: text("revision_of").references((): AnyPgColumn => electionCandidacy.id),
  contest_id: text("contest_id").notNull().references(() => electionContest.id),
}, (table) => [uniqueIndex("election_candidacy_official_revision_unique").on(table.contest_id, table.issuer, table.official_key, table.revision)]);

export const electionBallotLine = pgTable("election_ballot_line", {
  ...electionIdentityColumns(),
  revision_of: text("revision_of").references((): AnyPgColumn => electionBallotLine.id),
  candidacy_id: text("candidacy_id").notNull().references(() => electionCandidacy.id),
}, (table) => [uniqueIndex("election_ballot_line_official_revision_unique").on(table.candidacy_id, table.issuer, table.official_key, table.revision)]);

export const electionImportBatch = pgTable("election_import_batch", {
  package_sha256: text("package_sha256").primaryKey(),
  election_id: text("election_id").notNull().references(() => election.id),
  schema_version: text("schema_version").notNull(),
  policy_version: text("policy_version").notNull(),
  receipt_id: text("receipt_id").notNull(),
  canonical_package: text("canonical_package").notNull(),
  accepted_at: timestamp("accepted_at", { withTimezone: true }).notNull(),
}, (table) => [uniqueIndex("election_import_receipt_unique").on(table.receipt_id)]);

export const electionEvidence = pgTable("election_evidence", {
  id: text("id").primaryKey(),
  batch_sha256: text("batch_sha256").notNull().references(() => electionImportBatch.package_sha256),
  kind: text("kind").notNull(),
  election_id: text("election_id").references(() => election.id),
  stage_id: text("stage_id").references(() => electionStage.id),
  contest_id: text("contest_id").references(() => electionContest.id),
  candidacy_id: text("candidacy_id").references(() => electionCandidacy.id),
  ballot_line_id: text("ballot_line_id").references(() => electionBallotLine.id),
  assertion: jsonb("assertion").$type<unknown>().notNull(),
}, (table) => [
  check("election_evidence_one_subject", sql`num_nonnulls(${table.election_id}, ${table.stage_id}, ${table.contest_id}, ${table.candidacy_id}, ${table.ballot_line_id}) = 1`),
  check("election_evidence_subject_binding", sql`coalesce(
    jsonb_typeof(${table.assertion}) = 'object' and ${table.assertion}->>'id' = ${table.id} and ${table.assertion}->>'kind' = ${table.kind}
    and ${table.assertion}->'subject'->>'id' = coalesce(${table.election_id}, ${table.stage_id}, ${table.contest_id}, ${table.candidacy_id}, ${table.ballot_line_id})
    and ${table.assertion}->'subject'->>'kind' = case when ${table.election_id} is not null then 'election' when ${table.stage_id} is not null then 'stage'
      when ${table.contest_id} is not null then 'contest' when ${table.candidacy_id} is not null then 'candidacy' else 'ballot_line' end, false)`),
  check("election_evidence_required_provenance", sql`coalesce(
    ${table.assertion} ?& array['document_id','mapping_id','locator','original_term','retrieved_at','verified_at','effective','current_until']
    and jsonb_typeof(${table.assertion}->'locator') = 'string' and length(${table.assertion}->>'locator') between 1 and 500, false)`),
]);

export const electionEvidenceSupersession = pgTable("election_evidence_supersession", {
  replacement_id: text("replacement_id").notNull().references(() => electionEvidence.id),
  predecessor_id: text("predecessor_id").notNull().references(() => electionEvidence.id),
  batch_sha256: text("batch_sha256").notNull().references(() => electionImportBatch.package_sha256),
  reason: text("reason").notNull(),
}, (table) => [
  primaryKey({ columns: [table.replacement_id, table.predecessor_id], name: "election_evidence_supersession_pk" }),
  check("election_supersession_not_self", sql`${table.replacement_id} <> ${table.predecessor_id}`),
]);

export const authSchema = { account, session, user, verification };
export const databaseSchema = {
  ...authSchema,
  federalOfficialCache,
  stateOfficialCache,
  savedResidence,
  savedResidenceDivision,
  election, electionStage, electionContest, electionCandidacy, electionBallotLine,
  electionImportBatch, electionEvidence, electionEvidenceSupersession,
};
