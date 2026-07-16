import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(repositoryRoot, "src");

function isInsideSource(path: string) {
  const fromSourceRoot = relative(sourceRoot, path);
  return (
    fromSourceRoot !== ".." &&
    !fromSourceRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromSourceRoot)
  );
}

function resolveSourceModule(path: string) {
  const unresolved = resolve(path);
  if (!isInsideSource(unresolved)) {
    throw new Error("Repository module path is invalid.");
  }

  for (const candidate of [
    unresolved,
    `${unresolved}.ts`,
    resolve(unresolved, "index.ts"),
  ]) {
    if (
      isInsideSource(candidate) &&
      existsSync(candidate) &&
      statSync(candidate).isFile()
    ) {
      return {
        format: "module-typescript",
        shortCircuit: true,
        url: pathToFileURL(candidate).href,
      };
    }
  }
  throw new Error("Repository module was not found.");
}

try {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@/")) {
        return resolveSourceModule(resolve(sourceRoot, specifier.slice(2)));
      }
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        context.parentURL?.startsWith("file:")
      ) {
        const parentPath = fileURLToPath(context.parentURL);
        if (isInsideSource(parentPath)) {
          return resolveSourceModule(
            fileURLToPath(new URL(specifier, context.parentURL)),
          );
        }
      }
      return nextResolve(specifier, context);
    },
  });

  const { rotateSavedResidenceKeys } = await import("@/lib/saved-residence");
  const { remaining, rotated, skipped } = await rotateSavedResidenceKeys();
  process.stdout.write(
    `${JSON.stringify({ rotated, skipped, remaining })}\n`,
    () => process.exit(0),
  );
} catch {
  process.stderr.write(
    "Saved residence key rotation failed.\n",
    () => process.exit(1),
  );
}
