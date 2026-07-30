import { FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS } from "../src/lib/federal-provider-host-policy.mjs";

const blockedHosts = new Set(FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS);
const unguardedFetch = globalThis.fetch;

globalThis.fetch = function guardedProviderFetch(input, init) {
  let request;
  try {
    request = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
  } catch {
    return unguardedFetch(input, init);
  }
  if (blockedHosts.has(request.hostname)) {
    process.stderr.write(
      `E2E blocked server-side provider fetch: ${request.hostname}\n`,
    );
    process.exit(1);
  }
  return unguardedFetch(input, init);
};
