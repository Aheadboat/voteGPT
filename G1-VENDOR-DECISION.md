# G1 candidate-data vendor decision

## Current decision

Decision state: NO-GO (reopenable)

Vendor data access is disabled and not authorized. Production use is disabled. The official-source fallback remains the only authorized source path. This record uses public evidence only and no vendor score. Missing, unknown, or denied evidence remains NO-GO.

## Tested provider-neutral design

G1 is an offline, provider-neutral evaluation. T1 validates an official 100-record comparison fixture before vendor evidence is considered. T2 uses an exact match evaluator with fail-closed identity, contest, lifecycle, appearance, party-line, and provenance checks. T3 keeps technical, rights, operations, and quote gates separate so a technical pass cannot override another failed gate.

| Metric                                                | Threshold                   |
| ----------------------------------------------------- | --------------------------- |
| False Confirmed on ballot claims                      | 0                           |
| Unmatched vendor Confirmed claims in sampled contests | 0                           |
| Matched-row contradictions                            | 0; contradictions are fatal |
| Overall presence recall                               | >= 95/100                   |
| Positive recall                                       | >= 95%                      |
| Each edge-stratum recall                              | >= 9/10                     |
| Truth row-level provenance                            | 100%                        |
| Vendor row-level provenance                           | 100%                        |

## Primary-source evidence

The public pages below were retrieved read-only on 2026-08-29. A raw digest is recorded only when two immediate captures had the same final URL, byte length, and raw body. An `unknown` limit is not permission.

| ID          | Official page / version or effective date                                             | Exact final URL                                                                        | Retrieved UTC            | Raw SHA-256                                                      | Locator and bounded limit                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| BP-DICT     | Ballotpedia, Data dictionary: Candidates; exact update date not published             | https://developer.ballotpedia.org/dictionaries-and-terms/data-dictionary-candidates    | 2026-08-29T03:42:03.648Z | e20b87fef98b2c5b7c5a1adfc0c28f7eef97567b6e15bbeca903799abb1d2d0b | Basic information and Office/District fields establish technical vocabulary only.                                                                  |
| BP-EDGE     | Ballotpedia, About the Candidates data set; exact update date not published           | https://developer.ballotpedia.org/dictionaries-and-terms/about-the-candidates-data-set | 2026-08-29T03:42:04.199Z | e35721552c80c4e6979b5e5da17b70bb5dd7a8b7cb8c5373124265ea983f7466 | Common schema and edge-case examples establish technical fit only.                                                                                 |
| BP-TERMS    | Ballotpedia, Terms of Use; exact effective date not published                         | https://developer.ballotpedia.org/dictionaries-and-terms/terms-of-use                  | 2026-08-29T03:42:04.699Z | cdb46dce0afd6c828abbb17b3bf30b7e481e7578d70f0014e61588fdd4bc7083 | Licensed external products are bounded by precautions against third-party bulk download; legal review remains required.                            |
| BP-SCHEMA   | Ballotpedia, Getting started with geographic APIs; exact effective date not published | https://developer.ballotpedia.org/geographic-apis/getting-started-with-geographic-apis | 2026-08-29T03:42:05.098Z | 2e85728791ebf13d999c0c045b6f893a0d8e769155b65f987e1d14b7ac357b22 | Changes section states one-month small-change and three-month larger-change notice; returned fields depend on package.                             |
| BR-TIERS    | BallotReady Data Tiers; updated 2026-08-11                                            | https://support.ballotready.org/article/733-ballotready-data-tiers                     | 2026-08-29T03:42:05.466Z | 6989920120b380b0d857ed756e740b9be713a137acaa3cddee194b1ac23a3779 | Lines 2-3 and 27-46 document tier exclusions and add-ons, not exact sample coverage.                                                               |
| BR-RESEARCH | BallotReady Research Process; updated 2025-10-16                                      | https://www.ballotready.org/research-process                                           | 2026-08-29T03:42:05.939Z | afea34f9e8842d671a218e01818b96dbb72c661d1ab976a5576acd3746c6be6a | Lines 10-16 and 47-50 describe official-list research, omitted unprinted write-ins, and public-submission response, not a customer correction SLA. |
| BR-API      | BallotReady API & Data Exports; exact effective date not published                    | https://organizations.ballotready.org/ballotready-api                                  | 2026-08-29T03:42:06.591Z | e42da8e8d80bd87871073c956c832d24d985586dee5f3de37c2618b7ff72e4cd | Lines 45-59 and 79-97 describe candidate data, daily database refresh, and demo-routed pricing or test-key access.                                 |
| GOOGLE      | Google Developer Data Guidelines; updated 2026-07-02                                  | https://developers.google.com/civic-information/docs/data_guidelines                   | 2026-08-29T03:42:07.209Z | dynamic and localized; no raw digest promoted                    | Lines 54-76 require cache controls and describe address/election scope, withholding, short retention, and post-election expiry.                    |
| AP          | Associated Press, Our role in the U.S. elections; exact effective date not published  | https://www.ap.org/elections/our-role-in-the-u-s-elections/                            | 2026-08-29T03:42:09.790Z | 720690741cf775d5020c4d36029504709025a3824f55b6be22bf5f926ede0dfc | Lines 87-102 describe vote counting, winner declarations, and results coverage, not candidate-source rights.                                       |
| DDHQ        | Decision Desk HQ, API v4 race calls; exact effective date not published               | https://docs.decisiondeskhq.com/reference/get_api-v4-race-calls                        | 2026-08-29T03:42:10.502Z | b3ad41efd2977c4c6c39b9ab781d11869be24547197741c41138f722b2b6f9c9 | Lines 16-23 and 178-196 describe an authenticated results endpoint, not candidate qualification or rights coverage.                                |

## Provider decision matrix

Each state is the aggregate result for that dimension; a bounded public claim does not clear the remaining minima. The frozen reopening sequence is Ballotpedia first for later diligence and BallotReady/CivicEngine second for later diligence. That sequence is evidence-gathering order only, not a vendor ranking or recommendation.

| Provider                | Current suitability                                               | Rights                                                                                         | Operations                                                                                             | Package                                                                       | Price                                                                         |
| ----------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Ballotpedia             | First later diligence candidate                                   | unknown — bounded public redisplay and schema-notice claims do not establish all rights        | unknown — schema notice claims do not establish refresh, alert, correction, or disposition commitments | unknown — returned fields depend on an unproved package                       | unknown — exact production terms and price are not public                     |
| BallotReady/CivicEngine | Second later diligence candidate                                  | unknown — written storage, derived-use, correction, and termination rights are not established | unknown — daily refresh is claimed, but the remaining commitments are not established                  | unknown — tier exclusions and add-ons are not mapped to the sample            | unknown — pricing is routed through a demo request and no quote was requested |
| Google Civic            | Rejected as primary candidate-source; address-bound and ephemeral | denied — 24-hour cache limits and post-election expiry conflict with the frozen minima         | unknown — public revision behavior is not the required commitment                                      | denied — address/election scope and expiry cannot cover the historical sample | unknown — exact production price and limits are not established or approved   |
| AP Elections            | Rejected as results-first                                         | unknown — candidate-source redisplay and retention rights are not established                  | unknown — candidate-source commitments are not established                                             | unknown — a candidate-source package is not established                       | unknown — exact production price and limits are not established or approved   |
| Decision Desk HQ        | Rejected as results-first                                         | unknown — candidate-source redisplay and retention rights are not established                  | unknown — candidate-source commitments are not established                                             | unknown — a candidate-source package is not established                       | unknown — exact production price and limits are not established or approved   |

Google Civic remains a non-primary option only for its documented address/election-scoped use. AP Elections and Decision Desk HQ remain non-primary options only for documented results use. None is evidence of a replacement candidate source.

## Reopen criteria

Reopening requires written evidence that clears every minimum below; partial public claims do not combine into permission.

- Written rights must allow public redisplay of normalized candidate, contest, status, and source facts while bulk raw data extraction is prohibited and bulk raw exposure is prevented.
- Current-response cache retention must be at least 30 days.
- Normalized change history and audit retention must remain available for at least 24 months after certification.
- Written terms must allow derived normalized records and non-reconstructive metrics.
- Corrections and tombstones must retain an audit trail.
- On termination, raw data must be purged within 30 days, backups within 90 days, retaining only separately permitted normalized audit facts.
- Daily content refresh must be contractually committed.
- Status alert and tombstone delivery must occur within 24 hours after provider ingestion.
- Correction acknowledgement must occur within one business day.
- Correction reasoned disposition must occur within two business days.
- Nonbreaking schema changes require 30-day notice; breaking schema changes require 90-day notice.
- The purchased package must cover every sampled jurisdiction, stage, and stratum and provide package coverage with a provenance-field mapping.
- Written terms must establish contract-permitted sample handling and retention.
- Any approved credential handoff must use the authorized secret process.
- An approved quote must state the exact production price and limits, and the quote must be explicitly approved.
- Separate legal-terms approval is required in addition to quote approval.

## Authorization boundaries

T5 requires separate explicit authorization before vendor outreach, demo forms, credentials, or sample retrieval. T6 requires separate explicit authorization before terms acceptance, quote activity, spend, publication, or production use.

There are no secrets, credentials, vendor contact, quote, spend, or production enablement in the current scope. No account, trial, private sample, terms acceptance, purchase, publication, or other external action is authorized by this decision.
