import { resolve } from "node:path";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { authSchema } from "./schema";

export async function createDatabase(connectionString: string) {
  if (connectionString.startsWith("pglite://")) {
    const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
      import("@electric-sql/pglite"),
      import("drizzle-orm/pglite"),
      import("drizzle-orm/pglite/migrator"),
    ]);
    const dataDirectory = connectionString.slice("pglite://".length);
    const client =
      dataDirectory === "memory" ? new PGlite() : new PGlite(dataDirectory);
    const database = drizzle(client, { schema: authSchema });

    await migrate(database, {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
    });

    return database;
  }

  return drizzleNodePostgres(new Pool({ connectionString }), {
    schema: authSchema,
  });
}
