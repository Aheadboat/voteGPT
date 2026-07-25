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
      columns: [table.userId, table.type, table.idScheme, table.divisionId],
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

export const authSchema = { account, session, user, verification };
export const databaseSchema = {
  ...authSchema,
  savedResidence,
  savedResidenceDivision,
};
