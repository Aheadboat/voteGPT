import type { SavedResidenceDivision } from "./saved-residence";

type StateChamber = "upper" | "lower";
type ParsedDistrict = Readonly<{
  chamber: StateChamber;
  district: string;
  divisionId: string;
  stateCode: string;
}>;

export type StateJurisdiction = Readonly<{
  stateCode: string;
  stateDivisionId: string;
  jurisdictionId: string;
  legislature: "bicameral" | "unicameral";
  districts: readonly Readonly<{
    chamber: StateChamber;
    district: string;
    divisionId: string;
  }>[];
}>;

export type StateJurisdictionResult =
  | Readonly<{ status: "available"; jurisdiction: StateJurisdiction }>
  | Readonly<{ status: "invalid" }>;

export type StateSource = Readonly<{
  sourceType: "official" | "vacancy";
  publicUrl: string;
  retrievedAt: string;
  effectiveAt: string | null;
}>;

export type StateFreshness = Readonly<{
  checkedAt: string;
  refreshAfter: string;
  staleAfter: string;
  state: "fresh" | "stale" | "expired";
}>;

export type StateOfficialPerson = Readonly<{
  id: string;
  name: string;
  sources: readonly StateSource[];
}>;

export type StateSeat = Readonly<{
  status: "serving" | "vacant" | "unknown";
  seat: string;
  people: readonly StateOfficialPerson[];
  sources: readonly StateSource[];
}>;

export type StateOfficialsView = Readonly<{
  jurisdiction: StateJurisdiction;
  freshness: StateFreshness;
  chambers: readonly Readonly<{
    chamber: StateChamber;
    districts: readonly Readonly<{
      district: string;
      seats: readonly StateSeat[];
    }>[];
  }>[];
}>;

export type StateRosterInput = Readonly<{
  freshness: StateFreshness;
  seats: readonly Readonly<{
    chamber: StateChamber;
    district: string;
    seat: string;
    people: readonly Readonly<{
      id: string;
      name: string;
      role: Readonly<{
        chamber: StateChamber;
        district: string;
        seat: string;
        current: boolean;
      }>;
      sources: readonly StateSource[];
    }>[];
    vacancySources: readonly StateSource[];
  }>[];
}>;

const stateIdPattern = /^ocd-division\/country:us\/state:([a-z]{2})$/;
const districtIdPattern =
  /^ocd-division\/country:us\/state:([a-z]{2})\/sld([ul]):([a-z0-9][a-z0-9-]*)$/;
const publicTextPattern = /^(?=.{1,200}$)[^\u0000-\u001f\u007f]+$/;
const identityPattern = /^(?=.{1,200}$)[^\s\u0000-\u001f\u007f]+$/;
const chambers: readonly StateChamber[] = ["upper", "lower"];
const unicameralStateCodes = new Set(["ne"]);

export function stateJurisdictionFromDivisions(
  divisions: readonly SavedResidenceDivision[],
): StateJurisdictionResult {
  const stateDivisions = divisions.filter(
    (division): division is SavedResidenceDivision & { type: "state" } =>
      division.type === "state",
  );
  const districtDivisions = divisions.filter(
    (
      division,
    ): division is SavedResidenceDivision & {
      type: "state_upper" | "state_lower";
    } => division.type === "state_upper" || division.type === "state_lower",
  );

  if (
    stateDivisions.length !== 1 ||
    districtDivisions.length === 0 ||
    districtDivisions.length > 2
  ) {
    return { status: "invalid" };
  }

  const state = parseStateDivision(stateDivisions[0]);
  const districts = districtDivisions.map(parseDistrictDivision);
  if (
    state === null ||
    districts.some((district) => district === null) ||
    new Set(districts.map((district) => district?.chamber)).size !==
      districts.length
  ) {
    return { status: "invalid" };
  }

  const selectedDistricts = districts as readonly ParsedDistrict[];
  if (
    selectedDistricts.some(
      (district) => district.stateCode !== state.stateCode,
    ) ||
    (selectedDistricts.length === 1 &&
      (!unicameralStateCodes.has(state.stateCode) ||
        selectedDistricts[0]?.chamber !== "upper"))
  ) {
    return { status: "invalid" };
  }

  const orderedDistricts = [...selectedDistricts]
    .sort((left, right) => chamberOrder(left.chamber) - chamberOrder(right.chamber))
    .map((district) => ({
      chamber: district.chamber,
      district: district.district,
      divisionId: district.divisionId,
    }));

  return {
    status: "available",
    jurisdiction: {
      stateCode: state.stateCode.toUpperCase(),
      stateDivisionId: state.divisionId,
      jurisdictionId: `ocd-jurisdiction/country:us/state:${state.stateCode}/government`,
      legislature: orderedDistricts.length === 2 ? "bicameral" : "unicameral",
      districts: orderedDistricts,
    },
  };
}

export function reconcileStateOfficials(
  jurisdiction: StateJurisdiction,
  value: unknown,
): StateOfficialsView | null {
  if (!isJurisdiction(jurisdiction) || !isRecord(value) || !hasExactKeys(value, ["freshness", "seats"])) {
    return null;
  }
  if (!isFreshness(value.freshness) || !Array.isArray(value.seats)) {
    return null;
  }

  const seatKeys = new Set<string>();
  const personIds = new Set<string>();
  const seats: Array<{
    chamber: StateChamber;
    district: string;
    seat: StateSeat;
  }> = [];

  for (const candidate of value.seats) {
    const seat = reconcileSeat(candidate, jurisdiction, seatKeys, personIds);
    if (seat === null) {
      return null;
    }
    seats.push(seat);
  }

  return {
    jurisdiction,
    freshness: value.freshness,
    chambers: chambers.flatMap((chamber) => {
      const chamberSeats = seats.filter((seat) => seat.chamber === chamber);
      if (chamberSeats.length === 0) {
        return [];
      }
      const byDistrict = new Map<string, StateSeat[]>();
      for (const entry of chamberSeats) {
        const districtSeats = byDistrict.get(entry.district) ?? [];
        districtSeats.push(entry.seat);
        byDistrict.set(entry.district, districtSeats);
      }
      return [
        {
          chamber,
          districts: [...byDistrict.entries()]
            .sort(([left], [right]) => comparePublicFields(left, right))
            .map(([district, districtSeats]) => ({
              district,
              seats: districtSeats.sort((left, right) =>
                comparePublicFields(left.seat, right.seat),
              ),
            })),
        },
      ];
    }),
  };
}

function parseStateDivision(
  division: SavedResidenceDivision,
): { stateCode: string; divisionId: string } | null {
  if (division.idScheme !== "ocd") {
    return null;
  }
  const match = stateIdPattern.exec(division.id);
  return match?.[1] ? { stateCode: match[1], divisionId: division.id } : null;
}

function parseDistrictDivision(
  division: SavedResidenceDivision,
): ParsedDistrict | null {
  if (division.idScheme !== "ocd") {
    return null;
  }
  const match = districtIdPattern.exec(division.id);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }
  const chamber = match[2] === "u" ? "upper" : "lower";
  if (
    (division.type === "state_upper" && chamber !== "upper") ||
    (division.type === "state_lower" && chamber !== "lower")
  ) {
    return null;
  }
  return {
    chamber,
    district: match[3],
    divisionId: division.id,
    stateCode: match[1],
  };
}

function reconcileSeat(
  value: unknown,
  jurisdiction: StateJurisdiction,
  seatKeys: Set<string>,
  personIds: Set<string>,
): { chamber: StateChamber; district: string; seat: StateSeat } | null {
  if (!isRecord(value) || !hasExactKeys(value, ["chamber", "district", "seat", "people", "vacancySources"])) {
    return null;
  }
  const { chamber, district, seat } = value;
  if (
    !isChamber(chamber) ||
    !isPublicText(district) ||
    !isPublicText(seat) ||
    !Array.isArray(value.people) ||
    !Array.isArray(value.vacancySources) ||
    !jurisdiction.districts.some(
      (jurisdictionDistrict) =>
        jurisdictionDistrict.chamber === chamber &&
        jurisdictionDistrict.district === district,
    )
  ) {
    return null;
  }

  const seatKey = `${chamber}\u0000${district}\u0000${seat}`;
  if (seatKeys.has(seatKey)) {
    return null;
  }
  seatKeys.add(seatKey);

  const vacancySources = parseSources(value.vacancySources, "vacancy");
  if (vacancySources === null) {
    return null;
  }

  const people = value.people.map((person) =>
    parsePerson(person, chamber, district, seat, personIds),
  );
  if (people.some((person) => person === null)) {
    return null;
  }
  const parsedPeople = people as Array<{
    person: StateOfficialPerson;
    currentOfficial: boolean;
    sources: readonly StateSource[];
  }>;
  if (parsedPeople.length > 0 && vacancySources.length > 0) {
    return null;
  }

  const servingPeople = parsedPeople.filter(({ currentOfficial }) => currentOfficial);
  if (servingPeople.length > 0) {
    return {
      chamber,
      district,
      seat: {
        status: "serving",
        seat,
        people: servingPeople
          .map(({ person }) => person)
          .sort((left, right) => comparePublicFields(left.name, right.name)),
        sources: deduplicateSources(servingPeople.flatMap(({ sources }) => sources)),
      },
    };
  }

  return {
    chamber,
    district,
    seat: {
      status: vacancySources.length > 0 ? "vacant" : "unknown",
      seat,
      people: [],
      sources:
        vacancySources.length > 0
          ? vacancySources
          : deduplicateSources(parsedPeople.flatMap(({ sources }) => sources)),
    },
  };
}

function parsePerson(
  value: unknown,
  chamber: StateChamber,
  district: string,
  seat: string,
  personIds: Set<string>,
): { person: StateOfficialPerson; currentOfficial: boolean; sources: readonly StateSource[] } | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "name", "role", "sources"])) {
    return null;
  }
  if (!isIdentity(value.id) || !isPublicText(value.name) || !Array.isArray(value.sources)) {
    return null;
  }
  if (
    !isRecord(value.role) ||
    !hasExactKeys(value.role, ["chamber", "district", "seat", "current"]) ||
    value.role.chamber !== chamber ||
    value.role.district !== district ||
    value.role.seat !== seat ||
    typeof value.role.current !== "boolean" ||
    personIds.has(value.id)
  ) {
    return null;
  }
  const sources = parseSources(value.sources);
  if (sources === null || sources.some(({ sourceType }) => sourceType !== "official")) {
    return null;
  }
  personIds.add(value.id);
  return {
    person: { id: value.id, name: value.name, sources },
    currentOfficial: value.role.current && sources.length > 0,
    sources,
  };
}

function parseSources(
  values: readonly unknown[],
  requiredType?: StateSource["sourceType"],
): readonly StateSource[] | null {
  const sources: StateSource[] = [];
  const keys = new Set<string>();
  for (const value of values) {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, ["sourceType", "publicUrl", "retrievedAt", "effectiveAt"]) ||
      (value.sourceType !== "official" && value.sourceType !== "vacancy") ||
      (requiredType !== undefined && value.sourceType !== requiredType) ||
      !isPublicSourceUrl(value.publicUrl) ||
      !isTime(value.retrievedAt) ||
      (value.effectiveAt !== null && !isTime(value.effectiveAt))
    ) {
      return null;
    }
    const source: StateSource = {
      sourceType: value.sourceType,
      publicUrl: value.publicUrl,
      retrievedAt: value.retrievedAt,
      effectiveAt: value.effectiveAt,
    };
    const key = `${source.sourceType}\u0000${source.publicUrl}\u0000${source.retrievedAt}\u0000${source.effectiveAt ?? ""}`;
    if (keys.has(key)) {
      return null;
    }
    keys.add(key);
    sources.push(source);
  }
  return sources;
}

function isJurisdiction(value: StateJurisdiction): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["stateCode", "stateDivisionId", "jurisdictionId", "legislature", "districts"]) ||
    typeof value.stateCode !== "string" ||
    !Array.isArray(value.districts) ||
    !value.districts.every(isJurisdictionDistrict) ||
    value.stateCode !== value.stateCode.toUpperCase()
  ) {
    return false;
  }
  const parsed = stateJurisdictionFromDivisions(
    [
      {
        type: "state",
        name: "state",
        id: value.stateDivisionId as string,
        idScheme: "ocd",
      },
      ...value.districts.map((district) => ({
        type: district.chamber === "upper" ? "state_upper" : "state_lower",
        name: "district",
        id: district.divisionId,
        idScheme: "ocd",
      })),
    ] as readonly SavedResidenceDivision[],
  );
  return (
    parsed.status === "available" &&
    hasSameJurisdiction(parsed.jurisdiction, value)
  );
}

function isJurisdictionDistrict(
  value: unknown,
): value is StateJurisdiction["districts"][number] {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["chamber", "district", "divisionId"]) &&
    isChamber(value.chamber) &&
    isPublicText(value.district) &&
    isPublicText(value.divisionId)
  );
}

function hasSameJurisdiction(
  left: StateJurisdiction,
  right: StateJurisdiction,
): boolean {
  return (
    left.stateCode === right.stateCode &&
    left.stateDivisionId === right.stateDivisionId &&
    left.jurisdictionId === right.jurisdictionId &&
    left.legislature === right.legislature &&
    left.districts.length === right.districts.length &&
    left.districts.every(
      (district, index) =>
        district.chamber === right.districts[index]?.chamber &&
        district.district === right.districts[index]?.district &&
        district.divisionId === right.districts[index]?.divisionId,
    )
  );
}

function isFreshness(value: unknown): value is StateFreshness {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["checkedAt", "refreshAfter", "staleAfter", "state"]) &&
    isTime(value.checkedAt) &&
    isTime(value.refreshAfter) &&
    isTime(value.staleAfter) &&
    (value.state === "fresh" || value.state === "stale" || value.state === "expired") &&
    Date.parse(value.checkedAt) <= Date.parse(value.refreshAfter) &&
    Date.parse(value.refreshAfter) <= Date.parse(value.staleAfter)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isChamber(value: unknown): value is StateChamber {
  return value === "upper" || value === "lower";
}

function isPublicText(value: unknown): value is string {
  return typeof value === "string" && publicTextPattern.test(value) && value === value.trim();
}

function isIdentity(value: unknown): value is string {
  return typeof value === "string" && identityPattern.test(value);
}

function isPublicSourceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_000) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hash === "" &&
      url.toString() === value
    );
  } catch {
    return false;
  }
}

function isTime(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const time = new Date(value);
  return !Number.isNaN(time.getTime()) && time.toISOString() === value;
}

function chamberOrder(chamber: StateChamber): number {
  return chamber === "upper" ? 0 : 1;
}

function comparePublicFields(left: string, right: string): number {
  return left.localeCompare(right, "en", { numeric: true, sensitivity: "variant" });
}

function deduplicateSources(sources: readonly StateSource[]): readonly StateSource[] {
  return [...sources]
    .sort((left, right) =>
      comparePublicFields(
        `${left.sourceType}\u0000${left.publicUrl}\u0000${left.retrievedAt}\u0000${left.effectiveAt ?? ""}`,
        `${right.sourceType}\u0000${right.publicUrl}\u0000${right.retrievedAt}\u0000${right.effectiveAt ?? ""}`,
      ),
    )
    .filter(
      (source, index, ordered) =>
        index === 0 ||
        source.sourceType !== ordered[index - 1]?.sourceType ||
        source.publicUrl !== ordered[index - 1]?.publicUrl ||
        source.retrievedAt !== ordered[index - 1]?.retrievedAt ||
        source.effectiveAt !== ordered[index - 1]?.effectiveAt,
    );
}
