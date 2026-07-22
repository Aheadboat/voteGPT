import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";

export const E2E_DATABASE_MARKER_TABLE = "e2e_database_guard";
export const E2E_DATABASE_MARKER_QUERY =
  `SELECT "marker" FROM "${E2E_DATABASE_MARKER_TABLE}" WHERE "id" = 1`;

export async function requireE2eDatabase(
  environment = process.env,
  readTargetMarker = readE2eDatabaseMarker,
) {
  const ambientDatabaseUrl = environment.DATABASE_URL?.trim();
  const databaseUrl = environment.E2E_DATABASE_URL?.trim();
  const marker = environment.E2E_DATABASE_MARKER;

  if (environment.E2E_DESTRUCTIVE_OPT_IN !== "1") {
    throw new Error("E2E database requires explicit destructive opt-in.");
  }
  if (!databaseUrl) {
    throw new Error("E2E database URL is required.");
  }
  if (!marker || marker.trim().length < 32) {
    throw new Error("E2E database marker must be an unpredictable value.");
  }

  const normalizedTarget = normalizeDatabaseUrl(databaseUrl);
  if (
    ambientDatabaseUrl &&
    normalizeDatabaseUrl(ambientDatabaseUrl) === normalizedTarget
  ) {
    throw new Error("E2E database must differ from the ambient database.");
  }

  let targetMarker;
  try {
    targetMarker = await readTargetMarker(databaseUrl);
  } catch {
    throw new Error("E2E database marker could not be read from the target.");
  }
  if (targetMarker !== marker) {
    throw new Error("E2E database marker does not match the target.");
  }

  return databaseUrl;
}

export async function readE2eDatabaseMarker(databaseUrl) {
  if (databaseUrl.startsWith("pglite://")) {
    const dataDirectory = pgliteDirectory(databaseUrl);
    const target = await stat(dataDirectory);
    if (!target.isDirectory()) {
      throw new Error("E2E PGlite target is not a directory.");
    }
    const client = new PGlite(dataDirectory);
    try {
      const result = await client.query(E2E_DATABASE_MARKER_QUERY);
      return singleMarker(result.rows);
    } finally {
      await client.close();
    }
  }

  if (/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const result = await client.query(E2E_DATABASE_MARKER_QUERY);
      await client.query("ROLLBACK");
      return singleMarker(result.rows);
    } finally {
      client.release();
      await pool.end();
    }
  }

  throw new Error("E2E database must use PostgreSQL or PGlite.");
}

function normalizeDatabaseUrl(databaseUrl) {
  if (databaseUrl.startsWith("pglite://")) {
    return `pglite://${pgliteDirectory(databaseUrl)}`;
  }
  if (/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    const parsed = new URL(databaseUrl);
    if (
      parsed.searchParams.has("host") ||
      parsed.searchParams.has("port")
    ) {
      throw new Error(
        "E2E PostgreSQL database URL must not use routing parameters.",
      );
    }

    const hostname = parsed.hostname.toLowerCase();
    const database = decodeURI(parsed.pathname.slice(1));
    if (!hostname || !database) {
      throw new Error(
        "E2E PostgreSQL database URL must specify a host and database.",
      );
    }

    return `postgresql://${hostname}:${parsed.port || "5432"}/${database}`;
  }
  throw new Error("E2E database must use PostgreSQL or PGlite.");
}

function pgliteDirectory(databaseUrl) {
  const directory = databaseUrl.slice("pglite://".length);
  if (!directory || directory === "memory") {
    throw new Error("E2E PGlite database must be file-backed.");
  }

  const dataRoot = resolve(process.cwd(), ".data");
  const target = resolve(process.cwd(), directory);
  const fromDataRoot = relative(dataRoot, target);
  if (
    !fromDataRoot ||
    fromDataRoot === ".." ||
    fromDataRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromDataRoot)
  ) {
    throw new Error("E2E PGlite database must be inside .data.");
  }
  return process.platform === "win32" ? target.toLowerCase() : target;
}

function singleMarker(rows) {
  return rows.length === 1 && typeof rows[0]?.marker === "string"
    ? rows[0].marker
    : undefined;
}
