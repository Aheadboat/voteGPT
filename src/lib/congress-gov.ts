import type {
  FederalJurisdiction,
  FederalSeat,
  FetchCongressRoster,
  ProviderFailure,
  SourceRef,
} from "./federal-officials";
import {
  bioguidePublicUrl,
  canonicalCongressIngestionUrl,
  CONGRESS_CALENDAR_POLICY,
  congressCurrentUrl,
  congressMemberDetailUrl,
  congressStateMemberListUrl,
  createCongressSnapshot,
  FEDERAL_OFFICIAL_FIELD_POLICY,
  FEDERAL_PROVIDER_RESPONSE_POLICY,
  FEDERAL_PROVIDER_URL_POLICY,
  isBioguideId,
} from "./federal-policy";

type JsonOutcome =
  | { status: "ok"; body: unknown }
  | { status: "failure"; reason: ProviderFailure };

type MemberSummary = {
  bioguideId: string;
  chamber: "House of Representatives" | "Senate";
  district: number | null;
  name: string;
  state: string;
  updateDate: string;
  url: string;
};

type NormalizedMember = {
  name: string;
  startYear: number;
  endYear: number | null;
  updateDate: string;
};

const senateChamber =
  FEDERAL_OFFICIAL_FIELD_POLICY.congressMember.chambers[1] as
    MemberSummary["chamber"];
const zero = CONGRESS_CALENDAR_POLICY.turnoverUtc.monthIndex;
const one = CONGRESS_CALENDAR_POLICY.epoch.firstCongressNumber;
const two = CONGRESS_CALENDAR_POLICY.termLengthYears;

export const fetchCongressRoster: FetchCongressRoster = async (
  jurisdiction,
  { apiKey, fetch, signal, snapshot },
) => {
  const retrievedAtDate = new Date(snapshot.checkedAt);
  const expectedSnapshot = createCongressSnapshot(retrievedAtDate);
  if (
    expectedSnapshot === null ||
    expectedSnapshot.checkedAt !== snapshot.checkedAt ||
    expectedSnapshot.currentCongress !== snapshot.currentCongress ||
    expectedSnapshot.startYear !== snapshot.startYear ||
    expectedSnapshot.endYear !== snapshot.endYear ||
    !FEDERAL_OFFICIAL_FIELD_POLICY.stateCodePattern.test(jurisdiction.stateCode) ||
    !Number.isInteger(jurisdiction.district) ||
    jurisdiction.district < zero ||
    jurisdiction.district > 99
  ) {
    return unavailable("malformed");
  }
  if (apiKey.trim() === "") {
    return unavailable("auth");
  }

  const retrievedAt = retrievedAtDate.toISOString();
  const requestOptions = { apiKey, fetch, signal };
  const currentResponse = await requestJson(
    congressCurrentUrl(apiKey),
    requestOptions,
  );
  if (currentResponse.status === "failure") {
    return unavailable(currentResponse.reason);
  }

  const currentCongress = parseCurrentCongress(
    currentResponse.body,
    retrievedAtDate,
  );
  if (currentCongress !== snapshot.currentCongress) {
    return unavailable("malformed");
  }

  const stateResponse = await requestJson(
    congressStateMemberListUrl(jurisdiction.stateCode, apiKey),
    requestOptions,
  );
  if (stateResponse.status === "failure") {
    return unavailable(stateResponse.reason);
  }
  const stateMembers = parseMemberList(
    stateResponse.body,
    retrievedAtDate,
    currentCongress,
  );
  if (stateMembers === null) {
    return unavailable("malformed");
  }
  const houseSummaries = stateMembers.filter(
    ({ chamber }) => chamber === "House of Representatives",
  ).filter(({ district }) => district === jurisdiction.district);
  if (
    houseSummaries.length > one
  ) {
    return unavailable("malformed");
  }

  const senateSummaries = stateMembers.filter(
    ({ chamber }) => chamber === senateChamber,
  );
  if (senateSummaries.length > two) {
    return unavailable("malformed");
  }

  const house: FederalSeat[] = [];
  for (const summary of houseSummaries) {
    const detail = await fetchMember(
      summary,
      "house",
      jurisdiction,
      currentCongress,
      retrievedAt,
      retrievedAtDate,
      requestOptions,
    );
    if (detail.status === "failure") {
      return unavailable(detail.reason);
    }
    house.push(detail.seat);
  }

  const senate: FederalSeat[] = [];
  for (const summary of senateSummaries) {
    const detail = await fetchMember(
      summary,
      "senate",
      jurisdiction,
      currentCongress,
      retrievedAt,
      retrievedAtDate,
      requestOptions,
    );
    if (detail.status === "failure") {
      return unavailable(detail.reason);
    }
    senate.push(detail.seat);
  }

  return { status: "available", currentCongress, house, senate };
};

async function fetchMember(
  summary: MemberSummary,
  chamber: "house" | "senate",
  jurisdiction: FederalJurisdiction,
  currentCongress: number,
  retrievedAt: string,
  retrievedAtDate: Date,
  requestOptions: {
    apiKey: string;
    fetch: typeof globalThis.fetch;
    signal: AbortSignal;
  },
): Promise<
  | { status: "ok"; seat: Extract<FederalSeat, { status: "serving" }> }
  | { status: "failure"; reason: ProviderFailure }
> {
  const response = await requestJson(
    congressMemberDetailUrl(summary.bioguideId, requestOptions.apiKey),
    requestOptions,
  );
  if (response.status === "failure") {
    return response;
  }

  const member = parseMemberDetail(
    response.body,
    summary,
    chamber,
    jurisdiction,
    currentCongress,
    retrievedAtDate,
  );
  if (member === null) {
    return { status: "failure", reason: "malformed" };
  }

  const officeId =
    chamber === "house"
      ? `federal:house:${jurisdiction.stateCode}:${jurisdiction.district}`
      : `federal:senate:${jurisdiction.stateCode}:${summary.bioguideId}`;
  const personId = `bioguide:${summary.bioguideId}` as const;
  const publicUrl = bioguidePublicUrl(summary.bioguideId);
  const ingestionUrl = canonicalCongressIngestionUrl(summary.url);
  if (publicUrl === null || ingestionUrl === null) {
    return { status: "failure", reason: "malformed" };
  }
  const source: SourceRef = {
    publisher: "Biographical Directory of the United States Congress",
    sourceType: "member",
    publicUrl,
    ingestionUrl,
    retrievedAt,
    recordUpdatedAt: member.updateDate,
    effectiveAt: null,
  };

  return {
    status: "ok",
    seat: {
      status: "serving",
      office: {
        id: officeId,
        chamber,
        stateCode: jurisdiction.stateCode,
        district: chamber === "house" ? jurisdiction.district : null,
        title: chamber === "house" ? "U.S. Representative" : "U.S. Senator",
      },
      person: {
        id: personId,
        bioguideId: summary.bioguideId,
        name: member.name,
      },
      term: {
        officeId,
        personId,
        congress: currentCongress,
        startYear: member.startYear,
        endYear: member.endYear,
        status: "serving",
      },
      sources: [source],
    },
  };
}

async function requestJson(
  url: URL,
  { fetch, signal }: { fetch: typeof globalThis.fetch; signal: AbortSignal },
): Promise<JsonOutcome> {
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: FEDERAL_PROVIDER_RESPONSE_POLICY.contentTypes.congress[0] },
      cache: "no-store",
      redirect: FEDERAL_PROVIDER_RESPONSE_POLICY.redirect,
      signal,
    });
  } catch (error) {
    return {
      status: "failure",
      reason:
        signal.aborted || isAbortError(error)
          ? "timeout"
          : "provider_error",
    };
  }

  if (!response.ok) {
    return { status: "failure", reason: failureFromStatus(response.status) };
  }
  const contentType = response.headers.get("content-type")?.toLowerCase();
  if (
    !contentType?.startsWith(
      FEDERAL_PROVIDER_RESPONSE_POLICY.contentTypes.congress[0],
    )
  ) {
    return { status: "failure", reason: "malformed" };
  }
  try {
    return await readJsonBody(response, signal);
  } catch (error) {
    return {
      status: "failure",
      reason:
        signal.aborted || isAbortError(error)
          ? "timeout"
          : "malformed",
    };
  }
}

async function readJsonBody(
  response: Response,
  signal: AbortSignal,
): Promise<JsonOutcome> {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > FEDERAL_PROVIDER_RESPONSE_POLICY.maxBodyBytes
  ) {
    cancelResponseBestEffort(response);
    return { status: "failure", reason: "malformed" };
  }
  if (response.body === null) {
    return { status: "failure", reason: "malformed" };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = zero;
  let json = "";
  try {
    while (true) {
      const chunk = await readChunk(reader, signal);
      if (chunk.done) {
        json += decoder.decode();
        try {
          return { status: "ok", body: JSON.parse(json) as unknown };
        } catch {
          return { status: "failure", reason: "malformed" };
        }
      }
      byteCount += chunk.value.byteLength;
      if (byteCount > FEDERAL_PROVIDER_RESPONSE_POLICY.maxBodyBytes) {
        cancelReaderBestEffort(reader);
        return { status: "failure", reason: "malformed" };
      }
      json += decoder.decode(chunk.value, { stream: true });
    }
  } catch (error) {
    cancelReaderBestEffort(reader);
    return {
      status: "failure",
      reason:
        signal.aborted || isAbortError(error) ? "timeout" : "malformed",
    };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Cancellation is best-effort cleanup and never controls classification.
    }
  }
}

function cancelResponseBestEffort(response: Response) {
  try {
    void response.body?.cancel().catch(() => undefined);
  } catch {
    // Cancellation is best-effort cleanup and never controls classification.
  }
}

function cancelReaderBestEffort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
) {
  try {
    void reader.cancel().catch(() => undefined);
  } catch {
    // Cancellation is best-effort cleanup and never controls classification.
  }
}

function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
) {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Request timed out.", "AbortError"));
  }
  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const abort = () => reject(new DOMException("Request timed out.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    reader.read().then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

function parseCurrentCongress(body: unknown, retrievedAt: Date): number | null {
  if (
    !isRecord(body) ||
    !validRequest(body.request) ||
    hasUnexpectedPagination(body.pagination) ||
    !isRecord(body.congress)
  ) {
    return null;
  }
  const congress = body.congress;
  const number = congress.number;
  const startYear =
    typeof congress.startYear === "string" && /^\d{4}$/.test(congress.startYear)
      ? Number(congress.startYear)
      : null;
  const endYear =
    typeof congress.endYear === "string" && /^\d{4}$/.test(congress.endYear)
      ? Number(congress.endYear)
      : null;
  const expectedSnapshot = createCongressSnapshot(retrievedAt);
  if (
    expectedSnapshot === null ||
    startYear !== expectedSnapshot.startYear ||
    endYear !== expectedSnapshot.endYear ||
    expectedSnapshot.currentCongress !== number ||
    typeof congress.name !== "string" ||
    congress.name.trim() === "" ||
    !Array.isArray(congress.sessions) ||
    timestamp(congress.updateDate, retrievedAt) === null ||
    !canonicalItemUrl(congress.url, `/v3/congress/${number}`)
  ) {
    return null;
  }
  return number as number;
}

function parseMemberList(
  body: unknown,
  retrievedAt: Date,
  currentCongress: number,
): MemberSummary[] | null {
  if (
    !isRecord(body) ||
    !validRequest(body.request) ||
    !Array.isArray(body.members) ||
    body.members.length > 250 ||
    !isRecord(body.pagination) ||
    !Number.isInteger(body.pagination.count) ||
    body.pagination.count !== body.members.length ||
    hasUnexpectedPagination(body.pagination)
  ) {
    return null;
  }

  const summaries: MemberSummary[] = [];
  const bioguideIds = new Set<string>();
  const houseSeats = new Set<string>();
  for (const value of body.members) {
    if (!isRecord(value) || !isBioguideId(String(value.bioguideId))) {
      return null;
    }
    const bioguideId = value.bioguideId as string;
    if (bioguideIds.has(bioguideId)) {
      return null;
    }
    bioguideIds.add(bioguideId);

    if (
      value.currentMember !== true ||
      typeof value.name !== "string" ||
      value.name.trim() === "" ||
      typeof value.state !== "string" ||
      value.state.trim() === "" ||
      !isRecord(value.terms) ||
      !Array.isArray(value.terms.item) ||
      value.terms.item.length === zero ||
      value.terms.item.length > 64 ||
      !value.terms.item.every(isSummaryTerm) ||
      !canonicalItemUrl(value.url, `/v3/member/${bioguideId}`)
    ) {
      return null;
    }
    const updateDate = timestamp(value.updateDate, retrievedAt);
    if (updateDate === null) {
      return null;
    }

    const district =
      value.district === undefined || value.district === null
        ? null
        : value.district;
    if (
      (district !== null &&
        (!Number.isInteger(district) ||
          (district as number) < zero ||
          (district as number) > 99))
    ) {
      return null;
    }
    const expectedChamber =
      district === null ? senateChamber : "House of Representatives";
    const currentTerms = value.terms.item.filter((term) =>
      isCurrentSummaryTerm(term, expectedChamber, currentCongress),
    );
    if (currentTerms.length !== one) {
      return null;
    }
    const chamber = expectedChamber;
    if (chamber === "House of Representatives") {
      const seatKey = `${value.state}:${district}`;
      if (houseSeats.has(seatKey)) {
        return null;
      }
      houseSeats.add(seatKey);
    }

    summaries.push({
      bioguideId,
      chamber,
      district: district as number | null,
      name: value.name.trim(),
      state: value.state.trim(),
      updateDate,
      url: value.url as string,
    });
  }
  return summaries;
}

function parseMemberDetail(
  body: unknown,
  summary: MemberSummary,
  chamber: "house" | "senate",
  jurisdiction: FederalJurisdiction,
  currentCongress: number,
  retrievedAt: Date,
): NormalizedMember | null {
  if (
    !isRecord(body) ||
    !validRequest(body.request) ||
    hasUnexpectedPagination(body.pagination) ||
    !isRecord(body.member)
  ) {
    return null;
  }
  const member = body.member;
  const expectedChamber =
    chamber === "house" ? "House of Representatives" : senateChamber;
  const expectedMemberType = chamber === "house" ? "Representative" : "Senator";
  const district =
    member.district === undefined || member.district === null
      ? null
      : member.district;
  if (
    member.bioguideId !== summary.bioguideId ||
    member.currentMember !== true ||
    typeof member.directOrderName !== "string" ||
    member.directOrderName.trim() === "" ||
    member.directOrderName.length > 200 ||
    typeof member.state !== "string" ||
    member.state.trim() !== summary.state ||
    (chamber === "house" && district !== jurisdiction.district) ||
    (chamber === "senate" && district !== null) ||
    !Array.isArray(member.terms) ||
    member.terms.length > 64 ||
    !member.terms.every(
      (term) =>
        isRecord(term) &&
        isSafePositiveInteger(term.congress) &&
        validTermYears(term.startYear, term.endYear),
    )
  ) {
    return null;
  }

  const currentTerms = member.terms.filter(
    (term) =>
      isRecord(term) &&
      term.congress === currentCongress &&
      term.chamber === expectedChamber &&
      term.memberType === expectedMemberType &&
      term.stateCode === jurisdiction.stateCode &&
      term.stateName === summary.state &&
      (chamber === "house"
        ? term.district === jurisdiction.district
        : term.district === undefined || term.district === null),
  );
  if (currentTerms.length !== one || !isRecord(currentTerms[zero])) {
    return null;
  }
  const term = currentTerms[zero];
  const endYear =
    term.endYear === undefined || term.endYear === null ? null : term.endYear;
  const currentSnapshot = createCongressSnapshot(retrievedAt);
  if (currentSnapshot === null) {
    return null;
  }
  const currentStartYear = currentSnapshot.startYear;
  const currentEndYear = currentSnapshot.endYear;
  if (
    term.chamber !== expectedChamber ||
    term.memberType !== expectedMemberType ||
    term.stateCode !== jurisdiction.stateCode ||
    term.stateName !== summary.state ||
    !validTermYears(term.startYear, endYear) ||
    (term.startYear as number) > currentEndYear ||
    (endYear !== null && (endYear as number) < currentStartYear) ||
    (chamber === "house" && term.district !== jurisdiction.district) ||
    (chamber === "senate" && term.district !== undefined && term.district !== null)
  ) {
    return null;
  }
  const updateDate = timestamp(member.updateDate, retrievedAt);
  if (updateDate === null) {
    return null;
  }

  return {
    name: member.directOrderName.trim(),
    startYear: term.startYear as number,
    endYear: endYear as number | null,
    updateDate,
  };
}

function isSummaryTerm(value: unknown) {
  return (
    isRecord(value) &&
    (value.chamber === "House of Representatives" ||
      value.chamber === senateChamber) &&
    validTermYears(value.startYear, value.endYear)
  );
}

function isCurrentSummaryTerm(
  value: unknown,
  expectedChamber: MemberSummary["chamber"],
  currentCongress: number,
) {
  if (!isRecord(value) || value.chamber !== expectedChamber) {
    return false;
  }
  const startYear =
    CONGRESS_CALENDAR_POLICY.epoch.startYearUtc +
    (currentCongress - CONGRESS_CALENDAR_POLICY.epoch.firstCongressNumber) *
      CONGRESS_CALENDAR_POLICY.termLengthYears;
  const endYear =
    startYear +
    CONGRESS_CALENDAR_POLICY.termLengthYears -
    CONGRESS_CALENDAR_POLICY.epoch.firstCongressNumber;
  return (
    (value.startYear as number) <= endYear &&
    (value.endYear === undefined ||
      value.endYear === null ||
      (value.endYear as number) >= startYear)
  );
}

function validTermYears(startYear: unknown, endYear: unknown) {
  return (
    isSafePositiveInteger(startYear) &&
    (endYear === undefined ||
      endYear === null ||
      (isSafePositiveInteger(endYear) && endYear >= startYear))
  );
}

function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > zero;
}

function validRequest(value: unknown) {
  return (
    isRecord(value) &&
    value.contentType ===
      FEDERAL_PROVIDER_RESPONSE_POLICY.contentTypes.congress[0] &&
    value.format === FEDERAL_PROVIDER_URL_POLICY.congress.formatQueryValue
  );
}

function hasUnexpectedPagination(value: unknown) {
  if (value === undefined || value === null) {
    return false;
  }
  return (
    !isRecord(value) ||
    (value.next !== undefined && value.next !== null) ||
    (value.previous !== undefined && value.previous !== null)
  );
}

function canonicalItemUrl(value: unknown, expectedPath: string) {
  if (typeof value !== "string" || value.length > 2_048) {
    return false;
  }
  try {
    const url = new URL(value);
    const keys = [...url.searchParams.keys()];
    return (
      url.origin === FEDERAL_PROVIDER_URL_POLICY.congress.origin &&
      url.pathname === expectedPath &&
      url.username === "" &&
      url.password === "" &&
      url.hash === "" &&
      (keys.length === zero ||
        (keys.length === one &&
          keys[zero] === FEDERAL_PROVIDER_URL_POLICY.congress.formatQueryName &&
          url.searchParams.get(
            FEDERAL_PROVIDER_URL_POLICY.congress.formatQueryName,
          ) === FEDERAL_PROVIDER_URL_POLICY.congress.formatQueryValue))
    );
  } catch {
    return false;
  }
}

function timestamp(value: unknown, retrievedAt: Date): string | null {
  const match =
    typeof value === "string"
      ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(
          value,
        )
      : null;
  if (!match) {
    return null;
  }
  const date = new Date(match[0]);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  const normalized = date.toISOString();
  const expected = `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`;
  return normalized === expected && date.getTime() <= retrievedAt.getTime()
    ? normalized
    : null;
}

function failureFromStatus(status: number): ProviderFailure {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 429) {
    return "quota";
  }
  return "provider_error";
}

function unavailable(reason: ProviderFailure) {
  return { status: "unavailable" as const, reason };
}

function isAbortError(value: unknown) {
  return isRecord(value) && value.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
