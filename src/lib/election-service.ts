import type { ElectionIndexResult, ElectionRepository, ElectionService } from "./elections";
import type { GovernmentLevel } from "./government-navigation";
import type { SavedResidenceDivision } from "./saved-residence";

export function createElectionService(options: { repository: ElectionRepository; now: () => Date }): ElectionService {
  void options;
  return {
    getContest: async () => ({ status: "unavailable" }),
    getUpcoming: async () => ({ status: "unavailable" }),
  };
}

export async function getStatewideElections(
  service: ElectionService,
  divisions: readonly SavedResidenceDivision[],
  level: GovernmentLevel,
): Promise<ElectionIndexResult | { status: "missing" | "invalid" }> {
  void service;
  void divisions;
  void level;
  return { status: "unsupported" };
}
