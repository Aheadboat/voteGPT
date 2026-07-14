import { defineConfig } from "drizzle-kit";

const databaseURL = process.env.DATABASE_URL;

if (!databaseURL) {
  throw new Error("DATABASE_URL is required for database migrations");
}

export default defineConfig({
  dbCredentials: {
    url: databaseURL,
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
});
