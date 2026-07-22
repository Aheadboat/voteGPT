import { Client, Pool } from "pg";

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

  const normalizedTarget = normalizeDatabaseUrl(databaseUrl, environment);
  if (
    ambientDatabaseUrl &&
    normalizeDatabaseUrl(ambientDatabaseUrl, environment) === normalizedTarget
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

  throw new Error("E2E database must use PostgreSQL only.");
}

function normalizeDatabaseUrl(databaseUrl, environment) {
  if (/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    let parsed;
    let connection;
    try {
      parsed = new URL(databaseUrl);
      decodeURIComponent(parsed.hostname);
      decodeURI(parsed.pathname);
      connection = new Client({ connectionString: databaseUrl }).connectionParameters;
    } catch {
      throw new Error("E2E PostgreSQL database URL is invalid.");
    }
    if (
      parsed.searchParams.has("host") ||
      parsed.searchParams.has("port")
    ) {
      throw new Error(
        "E2E PostgreSQL database URL must not use routing parameters.",
      );
    }

    const hostname = connection.host?.toLowerCase();
    const database = connection.database;
    const port = Number.parseInt(
      parsed.port || environment.PGPORT || connection.port || "5432",
      10,
    );
    if (!hostname || !database || !Number.isInteger(port)) {
      throw new Error(
        "E2E PostgreSQL database URL must specify a host and database.",
      );
    }

    return `postgresql://${hostname}:${port}/${database}`;
  }
  throw new Error("E2E database must use PostgreSQL only.");
}

function singleMarker(rows) {
  return rows.length === 1 && typeof rows[0]?.marker === "string"
    ? rows[0].marker
    : undefined;
}
