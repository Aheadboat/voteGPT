import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createDatabase } from "@/db";
import { getRuntimeAuth } from "@/lib/auth";
import { AccountControls } from "@/components/account-controls";
import { FederalOfficials } from "@/components/federal-officials";
import { GovernmentNavigation } from "@/components/government-navigation";
import { ResidencePreview } from "@/components/residence-preview";
import { StateOfficials } from "@/components/state-officials";
import { ElectionIndex } from "@/components/elections";
import { getRuntimeElectionService, getStatewideElections } from "@/lib/election-service";
import { fetchCongressRoster } from "@/lib/congress-gov";
import { federalJurisdictionFromDivisions } from "@/lib/federal-officials";
import {
  createFederalOfficialCacheRepository,
  createFederalOfficialsService,
} from "@/lib/federal-officials-service";
import { fetchCurrentHouseVacancies } from "@/lib/house-clerk-vacancy";
import { normalizeGovernmentNavigation } from "@/lib/government-navigation";
import type { GovernmentNavigationState } from "@/lib/government-navigation";
import { fetchStateLegislators } from "@/lib/openstates";
import { getSavedResidenceDivisions } from "@/lib/saved-residence";
import { stateJurisdictionFromDivisions } from "@/lib/state-officials";
import {
  createStateOfficialCacheRepository,
  createStateOfficialsService,
} from "@/lib/state-officials-service";

const signInURL = "/sign-in?next=%2Fdashboard";

type DashboardPageProperties = Readonly<{
  searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
}>;

export default async function DashboardPage({
  searchParams,
}: DashboardPageProperties = {}) {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");

  if (!cookie?.includes("better-auth.session_token=")) {
    redirect(signInURL);
  }

  const auth = await getRuntimeAuth();
  const currentSession = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!currentSession) {
    redirect(signInURL);
  }

  const navigation = normalizeGovernmentNavigation(await searchParams);
  const selectedPanel = await selectedGovernmentPanel(
    navigation,
    currentSession.user.id,
  );

  return (
    <main className="dashboard" id="main-content">
      <section aria-labelledby="dashboard-heading" className="dashboard-card">
        <p className="section-label">Account</p>
        <h1 id="dashboard-heading">Your dashboard</h1>
        <p>
          Signed in as <strong>{currentSession.user.email}</strong>
        </p>
        <p>
          Preview a residence below. You can optionally give explicit consent
          to save it to your account. Public information remains accessible
          from the home page.
        </p>
        <AccountControls>
          <GovernmentNavigation
            panels={{ [navigation.level]: selectedPanel }}
            searchParams={{ level: navigation.level, mode: navigation.mode }}
          />
          <ResidencePreview />
        </AccountControls>
      </section>
    </main>
  );
}

async function selectedGovernmentPanel(
  navigation: GovernmentNavigationState,
  userId: string,
) {
  if (navigation.mode === "elections") {
    return electionsFor(userId, navigation.level);
  }
  if (navigation.level === "local") {
    return (
      <p role="status">
        Local coverage is unavailable for verified display. Choose State or
        Federal for current coverage.
      </p>
    );
  }
  const officials =
    navigation.level === "state"
      ? await stateOfficialsFor(userId)
      : await federalOfficialsFor(userId);
  return (
    <section aria-labelledby="in-office-heading">
      <h2 id="in-office-heading">In office</h2>
      {officials}
    </section>
  );
}

async function electionsFor(userId: string, level: GovernmentNavigationState["level"]) {
  const browse = <a href="/elections">Browse elections</a>;
  if (level === "local") return <><p role="status">Local election coverage is unavailable. Public California contests can be browsed separately.</p>{browse}</>;
  const explanation = <p>District matching is not verified. Saved district identifiers do not include the boundary provenance needed for this election. Statewide contests alone may be selected from your saved state. <a href="https://www.sos.ca.gov/elections/california-redistricting">California district boundary information</a>.</p>;
  let content;
  try {
    const divisions = await getSavedResidenceDivisions(userId);
    if (divisions.length === 0) content = <p>Save a voting residence below to see statewide elections for your saved state.</p>;
    else {
      const service = await getRuntimeElectionService();
      const result = service ? await getStatewideElections(service, divisions, level) : { status: "unavailable" as const };
      if (result.status === "missing") content = <p>Save a voting residence below to see statewide elections for your saved state.</p>;
      else if (result.status === "invalid") content = <p>Your saved state could not be verified. Preview and save your residence again, or browse public elections.</p>;
      else if (result.status === "unsupported") content = <p>Election coverage is unavailable for your saved state or selected level. Public California contests remain browsable.</p>;
      else if (result.status === "unavailable") content = <p role="status">Election information is temporarily unavailable. Try again later or browse public elections.</p>;
      else if (result.status === "available") content = <ElectionIndex result={result} />;
    }
  } catch {
    content = <p role="status">Election information is temporarily unavailable. Try again later or browse public elections.</p>;
  }
  return <section aria-labelledby="elections-heading"><h2 id="elections-heading">Elections</h2>{explanation}{content}<p>{browse}</p><p><a href="https://www.sos.ca.gov/elections">California official election office</a></p></section>;
}

async function federalOfficialsFor(userId: string) {
  const divisions = await getSavedResidenceDivisions(userId);
  if (divisions.length === 0) {
    return <p>Save a voting residence to see federal officials</p>;
  }

  const jurisdiction = federalJurisdictionFromDivisions(divisions);
  if (jurisdiction.status === "invalid") {
    return (
      <p>
        Your saved residence has incomplete federal coverage. Preview and save
        it again to see federal officials.
      </p>
    );
  }
  if (jurisdiction.status === "policy_expired") {
    return (
      <p>
        Federal officials are temporarily unavailable while district coverage
        is updated for the new Congress. Your saved residence does not need to
        be changed.
      </p>
    );
  }
  if (jurisdiction.status === "unsupported") {
    return (
      <p>
        Federal official coverage is not available for this jurisdiction yet.
      </p>
    );
  }

  const database = await createDatabase(process.env.DATABASE_URL!);
  const service = createFederalOfficialsService({
    cache: createFederalOfficialCacheRepository(database),
    environment: {
      CONGRESS_GOV_API_KEY: process.env.CONGRESS_GOV_API_KEY,
    },
    fetch: globalThis.fetch,
    fetchCongressRoster,
    fetchCurrentHouseVacancies,
    now: () => new Date(),
  });
  const result = await service.getOfficials(jurisdiction.jurisdiction);
  return <FederalOfficials heading={null} result={result} />;
}

async function stateOfficialsFor(userId: string) {
  const divisions = await getSavedResidenceDivisions(userId);
  if (divisions.length === 0) {
    return <p>Save a voting residence to see state legislature officials.</p>;
  }

  const jurisdiction = stateJurisdictionFromDivisions(divisions);
  if (jurisdiction.status === "invalid") {
    return (
      <p>
        Your saved state-legislative coverage is incomplete. Preview and save
        it again to see state legislature officials.
      </p>
    );
  }

  const database = await createDatabase(process.env.DATABASE_URL!);
  const service = createStateOfficialsService({
    cache: createStateOfficialCacheRepository(database),
    environment: { OPENSTATES_API_KEY: process.env.OPENSTATES_API_KEY },
    fetch: globalThis.fetch,
    fetchStateLegislators,
    now: () => new Date(),
  });
  const result = await service.getOfficials(jurisdiction.jurisdiction);
  return <StateOfficials heading={null} result={result} />;
}
