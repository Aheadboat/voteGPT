import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createDatabase } from "@/db";
import { getRuntimeAuth } from "@/lib/auth";
import { AccountControls } from "@/components/account-controls";
import { FederalOfficials } from "@/components/federal-officials";
import { ResidencePreview } from "@/components/residence-preview";
import { fetchCongressRoster } from "@/lib/congress-gov";
import { federalJurisdictionFromDivisions } from "@/lib/federal-officials";
import {
  createFederalOfficialCacheRepository,
  createFederalOfficialsService,
} from "@/lib/federal-officials-service";
import { fetchCurrentHouseVacancies } from "@/lib/house-clerk-vacancy";
import { getSavedResidenceDivisions } from "@/lib/saved-residence";

const signInURL = "/sign-in?next=%2Fdashboard";

export default async function DashboardPage() {
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

  const federalOfficials = await federalOfficialsFor(
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
          <section aria-labelledby="federal-in-office-heading">
            <h2 id="federal-in-office-heading">In office</h2>
            {federalOfficials}
          </section>
          <ResidencePreview />
        </AccountControls>
      </section>
    </main>
  );
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
  return <FederalOfficials result={result} />;
}
