export function parseElectionImport(text: string):
  | Readonly<{ status: "parsed"; input: Record<string, unknown> }>
  | Readonly<{ status: "rejected"; reason: "invalid_package" }> {
  try {
    const input: unknown = JSON.parse(text);
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return { status: "rejected", reason: "invalid_package" };
    }
    return { status: "parsed", input: input as Record<string, unknown> };
  } catch {
    return { status: "rejected", reason: "invalid_package" };
  }
}
