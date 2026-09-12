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

process.stderr.write(valid ? "Election import is unavailable.\n" : "Election import arguments are invalid.\n");
process.exitCode = 1;
