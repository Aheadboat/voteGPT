import { ElectionIndex } from "@/components/elections";
import { getRuntimeElectionService } from "@/lib/election-service";
import type { ElectionIndexResult } from "@/lib/elections";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ElectionsPage() {
  const service = await getRuntimeElectionService();
  const results: ElectionIndexResult[] = service ? await Promise.all((["state", "federal"] as const).map((level) => service.getUpcoming({
    level, jurisdiction_id: "ocd-division/country:us/state:ca", division_ids: ["ocd-division/country:us/state:ca"],
  }))) : [{ status: "unavailable" }];
  const available = results.filter((result) => result.status === "available");
  const result: ElectionIndexResult = available.length ? {
    status: "available", contests: available.flatMap((entry) => entry.contests),
    unverified_count: available.reduce((total, entry) => total + entry.unverified_count, 0),
  } : { status: "unavailable" };
  return <main id="main-content">
    <h1>Elections</h1>
    <p>Browse reviewed California election records without signing in. Coverage is limited to the admitted statewide and district contests shown below. Other jurisdictions are unavailable.</p>
    <p>Superintendent of Public Instruction write-in verification is pending. Judicial-retention questions are unavailable in this coverage.</p>
    <p>District matching is not verified. These public contests are not a personalized ballot. <a href="https://www.sos.ca.gov/elections/california-redistricting">California district boundary information</a>.</p>
    {available.length > 0 && results.some((entry) => entry.status !== "available") && <p role="status">Some election coverage is temporarily unavailable. Available records are shown below.</p>}
    <ElectionIndex result={result} />
    {result.status === "available" && <p><a href="https://www.sos.ca.gov/elections">California official election office</a></p>}
  </main>;
}
