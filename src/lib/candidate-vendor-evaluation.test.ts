import { describe, expect, it } from "vitest";

import { validateCandidateParticipation } from "./candidate-vendor-evaluation";

describe("validateCandidateParticipation", () => {
  it("rejects FEC registration as ballot-qualification evidence", () => {
    expect(
      validateCandidateParticipation({
        record_key: "us-ca-12-2024-general-avery-example",
        contest_key: "us-ca-12-2024-general",
        candidate_name: "Avery Example",
        official_ids: [
          {
            issuer: "Federal Election Commission",
            namespace: "candidate_id",
            value: "H4CA12000",
          },
        ],
        reviewed_aliases: [],
        jurisdiction: "ocd-division/country:us/state:ca/cd:12",
        election_date: "2024-11-05",
        office: "United States Representative",
        district: "12",
        level: "federal",
        stage: "general",
        sample_stratum: "ordinary",
        lifecycle_status: "qualified",
        ballot_appearance: "printed",
        party_lines: ["Democratic"],
        sources: [
          {
            url: "https://www.fec.gov/data/candidate/H4CA12000/",
            source_type: "fec_registration",
            retrieved_at: "2026-08-15T12:00:00Z",
            effective_at: null,
            effective_time_reason: "not_published",
            locator: "candidate filing",
            sha256:
              "0000000000000000000000000000000000000000000000000000000000000000",
          },
        ],
      }),
    ).toBe(false);
  });
});
