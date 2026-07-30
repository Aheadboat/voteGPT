export const FEDERAL_PROVIDER_HOSTS = Object.freeze({
  congressApi: "api.congress.gov",
  clerk: "clerk.house.gov",
  bioguidePublic: "bioguide.congress.gov",
});

export const FEDERAL_E2E_BLOCKED_PROVIDER_HOSTS = Object.freeze([
  FEDERAL_PROVIDER_HOSTS.congressApi,
  FEDERAL_PROVIDER_HOSTS.clerk,
]);
