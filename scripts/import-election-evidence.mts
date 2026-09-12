import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const values = new Map<string, string>();
let mode: "dry-run" | "apply" | undefined;
let valid = true;
for (let index = 0; index < args.length; index++) {
  const argument = args[index];
  if (argument === "--dry-run" || argument === "--apply") {
    if (mode) valid = false;
    mode = argument === "--apply" ? "apply" : "dry-run";
  } else if (argument === "--file" || argument === "--receipt") {
    const value = args[++index];
    if (!value || value.startsWith("--") || values.has(argument)) valid = false;
    else values.set(argument, value);
  } else valid = false;
}
const file = values.get("--file");
const receipt = values.get("--receipt");
if (!mode || !file || !receipt || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(receipt) ||
    /^(?:[a-z][a-z\d+.-]*:\/\/|file:|\\\\|\/\/)/i.test(file)) valid = false;

if (!valid) {
  process.stderr.write("Election import arguments are invalid.\n");
  process.exitCode = 1;
} else {
  let text: string | undefined;
  try {
    text = readFileSync(file!, "utf8");
  } catch {
    process.stderr.write("Election import could not read the package.\n");
    process.exitCode = 1;
  }
  if (text !== undefined) {
    try {
      const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
      const insideSource = (path: string) => {
        const part = relative(sourceRoot, path);
        return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
      };
      registerHooks({
        resolve(specifier, context, nextResolve) {
          let path: string | undefined;
          if (specifier.startsWith("@/")) path = resolve(sourceRoot, specifier.slice(2));
          else if ((specifier.startsWith("./") || specifier.startsWith("../")) &&
            context.parentURL?.startsWith("file:") && insideSource(fileURLToPath(context.parentURL))) {
            path = fileURLToPath(new URL(specifier, context.parentURL));
          }
          if (path !== undefined) {
            if (!insideSource(path)) throw new Error("Invalid module path");
            for (const candidate of [path, `${path}.ts`, resolve(path, "index.ts")]) {
              if (existsSync(candidate) && statSync(candidate).isFile()) {
                return { format: "module-typescript", shortCircuit: true, url: pathToFileURL(candidate).href };
              }
            }
            throw new Error("Module unavailable");
          }
          return nextResolve(specifier, context);
        },
      });
      const { runElectionImport } = await import("@/lib/election-import");
      const { getElectionSourceOptions } = await import("@/lib/election-source-policy");
      const sourceOptions = getElectionSourceOptions();
      const reviewed = await runElectionImport(text, { mode: "dry-run", receiptId: receipt!, sourceOptions });
      // Validate before loading storage; dry-run never initializes a database.
      let result = reviewed;
      if (reviewed.status === "validated" && mode === "apply") {
        let databaseUrl = process.env.DATABASE_URL;
        if (["E2E_DESTRUCTIVE_OPT_IN", "E2E_DATABASE_URL", "E2E_DATABASE_MARKER"]
          .some((name) => process.env[name] !== undefined)) {
          const guardModule = "../e2e/database-guard.mjs";
          const { readE2eDatabaseMarker, requireE2eDatabase } = await import(guardModule);
          databaseUrl = await requireE2eDatabase(process.env, readE2eDatabaseMarker);
        }
        if (!databaseUrl) throw new Error("Storage unavailable");
        const { createDatabase } = await import("@/db");
        const { createElectionRepository } = await import("@/lib/election-repository");
        const database = await createDatabase(databaseUrl);
        try {
          result = await runElectionImport(text, {
            mode: "apply", receiptId: receipt!, sourceOptions,
            repository: createElectionRepository(database, sourceOptions),
          });
        } finally {
          const client = database.$client;
          if ("end" in client) await client.end();
          else await client.close();
        }
      }
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = ["validated", "imported", "unchanged"].includes(result.status) ? 0 : 1;
    } catch {
      process.stderr.write("Election import is unavailable.\n");
      process.exitCode = 1;
    }
  }
}
