import { electionScopeFromDivisions, projectContest } from "./elections";
import type { ContestView, ElectionIndexResult, ElectionRepository, ElectionService } from "./elections";
import type { GovernmentLevel } from "./government-navigation";
import type { SavedResidenceDivision } from "./saved-residence";

export function createElectionService(options: { repository: ElectionRepository; now: () => Date }): ElectionService {
  return {
    async getContest(id, historyPage = { offset: 0, limit: 100 }) {
      if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(id) ||
        !Number.isSafeInteger(historyPage.offset) || historyPage.offset < 0 ||
        !Number.isSafeInteger(historyPage.limit) || historyPage.limit < 1 || historyPage.limit > 100) return { status: "missing" };
      try {
        const graph = await options.repository.readContest(id, historyPage);
        return graph ? projectContest(graph, options.now()) : { status: "missing" };
      } catch {
        return { status: "unavailable" };
      }
    },
    async getUpcoming(scope) {
      if (scope.jurisdiction_id !== "ocd-division/country:us/state:ca" ||
        !["state", "federal"].includes(scope.level)) return { status: "unsupported" };
      try {
        const now = options.now();
        const graphs = await options.repository.readUpcoming(scope, now);
        const contests: ContestView[] = [];
        let unverified_count = 0;
        for (const graph of graphs) {
          const contest = projectContest(graph, now);
          if (contest.status !== "available" || contest.upcoming === null) unverified_count++;
          else if (contest.upcoming) contests.push(contest);
        }
        contests.sort((a, b) => {
          const dateA = a.stage.state === "verified" ? a.stage.value.date ?? "" : "";
          const dateB = b.stage.state === "verified" ? b.stage.value.date ?? "" : "";
          const officeA = a.contest.state === "verified" ? a.contest.value.office : "";
          const officeB = b.contest.state === "verified" ? b.contest.value.office : "";
          return dateA.localeCompare(dateB, "en") || officeA.localeCompare(officeB, "en") || a.contest_id.localeCompare(b.contest_id, "en");
        });
        return { status: "available", contests, unverified_count };
      } catch {
        return { status: "unavailable" };
      }
    },
  };
}

export async function getStatewideElections(
  service: ElectionService,
  divisions: readonly SavedResidenceDivision[],
  level: GovernmentLevel,
): Promise<ElectionIndexResult | { status: "missing" | "invalid" }> {
  const selection = electionScopeFromDivisions(divisions, level);
  if (selection.status !== "available") return { status: selection.status };
  const state = selection.scope.jurisdiction_id;
  // Saved districts lack the election-boundary provenance needed for a personal match.
  const result = await service.getUpcoming({ level, jurisdiction_id: state, division_ids: [state] });
  if (result.status !== "available") return result;
  return { ...result, contests: result.contests.filter((contest) => contest.contest.state === "verified" &&
    contest.contest.value.level === level && contest.contest.value.jurisdiction_id === state &&
    contest.contest.value.division_ids.length === 1 && contest.contest.value.division_ids[0] === state) };
}
