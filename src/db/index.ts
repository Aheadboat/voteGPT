import { resolve } from "node:path";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseSchema } from "./schema";

const databasePromises = new Map<
  string,
  ReturnType<typeof initializeDatabase>
>();

export function createDatabase(connectionString: string) {
  if (connectionString === "pglite://memory") {
    return initializeDatabase(connectionString);
  }

  const existing = databasePromises.get(connectionString);
  if (existing) {
    return existing;
  }

  const initialization = initializeDatabase(connectionString);
  databasePromises.set(connectionString, initialization);
  void initialization.catch(() => {
    if (databasePromises.get(connectionString) === initialization) {
      databasePromises.delete(connectionString);
    }
  });
  return initialization;
}

async function initializeDatabase(connectionString: string) {
  if (connectionString.startsWith("pglite://")) {
    const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
      import("@electric-sql/pglite"),
      import("drizzle-orm/pglite"),
      import("drizzle-orm/pglite/migrator"),
    ]);
    const dataDirectory = connectionString.slice("pglite://".length);
    const client =
      dataDirectory === "memory" ? new PGlite() : new PGlite(dataDirectory);
    const database = drizzle(client, { schema: databaseSchema });

    await migrate(database, {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
    });

    return database;
  }

  return drizzleNodePostgres(new Pool({ connectionString }), {
    schema: databaseSchema,
  });
}
