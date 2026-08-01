import type { SavedResidenceDivision } from "./saved-residence";
import { validateStateLegislativeSourceUrl } from "./state-source-policy";

type StateChamber = "upper" | "lower";
type ProviderTarget = Readonly<{ label: string; divisionId: string }>;
type ProviderTargets = readonly [ProviderTarget, ...ProviderTarget[]];
type ParsedDistrict = Readonly<{
  chamber: StateChamber;
  district: string;
  providerTargets: ProviderTargets;
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
    providerTargets: ProviderTargets;
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
  /^ocd-division\/country:us\/state:([a-z]{2})\/sld([ul]):([a-z0-9][a-z0-9_-]{0,199})$/;
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
      providerTargets: district.providerTargets,
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
  const providerTargets = providerTargetsFromOcd(
    match[1],
    chamber,
    match[3],
    division.id,
  );
  if (
    (division.type === "state_upper" && chamber !== "upper") ||
    (division.type === "state_lower" && chamber !== "lower") ||
    providerTargets === null
  ) {
    return null;
  }
  return {
    chamber,
    district: match[3],
    providerTargets,
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
        jurisdictionDistrict.providerTargets.some((target) => target.label === district),
    )
  ) {
    return null;
  }

  const seatKey = `${chamber}\u0000${district}\u0000${seat}`;
  if (seatKeys.has(seatKey)) {
    return null;
  }
  seatKeys.add(seatKey);

  const vacancySources = parseSources(
    value.vacancySources,
    jurisdiction.stateCode,
    "vacancy",
  );
  if (vacancySources === null) {
    return null;
  }

  const people = value.people.map((person) =>
    parsePerson(
      person,
      chamber,
      district,
      seat,
      jurisdiction.stateCode,
      personIds,
    ),
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
          .sort(comparePeople),
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
  stateCode: string,
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
  const sources = parseSources(value.sources, stateCode);
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
  stateCode: string,
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
      typeof value.publicUrl !== "string" ||
      validateStateLegislativeSourceUrl(value.publicUrl, stateCode).status !== "allowed" ||
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
    hasExactKeys(value, ["chamber", "district", "providerTargets", "divisionId"]) &&
    isChamber(value.chamber) &&
    isPublicText(value.district) &&
    isProviderTargets(value.providerTargets) &&
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
        hasSameProviderTargets(
          district.providerTargets,
          right.districts[index]?.providerTargets ?? [],
        ) &&
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

function isProviderTargets(value: unknown): value is ProviderTargets {
  if (!Array.isArray(value) || value.length === 0 || value.length > 2) {
    return false;
  }
  const labels = new Set<string>();
  const divisions = new Set<string>();
  for (const target of value) {
    if (
      !isRecord(target) ||
      !hasExactKeys(target, ["label", "divisionId"]) ||
      !isPublicText(target.label) ||
      !isIdentity(target.divisionId) ||
      labels.has(target.label) ||
      divisions.has(target.divisionId)
    ) {
      return false;
    }
    labels.add(target.label);
    divisions.add(target.divisionId);
  }
  return true;
}

function hasSameProviderTargets(
  left: readonly ProviderTarget[],
  right: readonly ProviderTarget[],
): boolean {
  return left.length === right.length && left.every((target, index) =>
    target.label === right[index]?.label &&
    target.divisionId === right[index]?.divisionId,
  );
}

function providerTargetsFromOcd(
  state: string,
  chamber: StateChamber,
  district: string,
  canonicalDivisionId: string,
): ProviderTargets | null {
  if (state === "ak" && chamber === "upper") {
    return /^[a-t]$/.test(district)
      ? [{ label: district.toUpperCase(), divisionId: canonicalDivisionId }]
      : null;
  }
  if (state === "id" && chamber === "lower") {
    const number = parseBoundedDistrictNumber(district, 35);
    return number === null
      ? null
      : [
          {
            label: `${number}A`,
            divisionId: `ocd-division/country:us/state:id/sldl:${number}a`,
          },
          {
            label: `${number}B`,
            divisionId: `ocd-division/country:us/state:id/sldl:${number}b`,
          },
        ];
  }
  if (state === "ma") {
    const label = massachusettsProviderLabel(chamber, district);
    return label === null ? null : [{ label, divisionId: canonicalDivisionId }];
  }
  if (state === "me" && chamber === "lower" && !/^\d+$/.test(district)) {
    return district === "passamaquoddy_tribe"
      ? [{
          label: "Passamaquoddy Tribe",
          divisionId: "ocd-division/country:us/state:me/sldl:passamaquoddy-tribe",
        }]
      : null;
  }
  if (state === "nh" && chamber === "lower") {
    return /^[a-z]+_[1-9]\d{0,2}$/.test(district)
      ? [{ label: titleDistrict(district, "-"), divisionId: canonicalDivisionId }]
      : null;
  }
  if (state === "vt") {
    if (chamber === "upper") {
      const exceptionalLabel = Object.hasOwn(vermontUpperDistrictLabels, district)
        ? vermontUpperDistrictLabels[district]
        : undefined;
      const label = exceptionalLabel ?? (/^[a-z]+$/.test(district) ? titleWord(district) : null);
      return label === null || label === undefined
        ? null
        : [{
            label,
            divisionId: district === "grand_isle-chittenden"
              ? "ocd-division/country:us/state:vt/sldu:grand_isle"
              : canonicalDivisionId,
          }];
    }
    if (!/^[a-z]+(?:_[a-z]+)*(?:-[a-z0-9]+)*$/.test(district)) return null;
    const divisionId = district === "windham-windsor-bennington"
      ? "ocd-division/country:us/state:vt/sldl:windham-bennington-windsor"
      : canonicalDivisionId;
    return [{
      label: titleDistrict(district, "-"),
      divisionId,
    }];
  }
  if (chamber === "lower") {
    const suffix = /^([1-9]\d{0,2})([a-z])$/.exec(district);
    if (suffix?.[1] && suffix[2]) {
      const number = Number(suffix[1]);
      const letter = suffix[2];
      const supported =
        (state === "md" && isMarylandSubdistrict(number, letter)) ||
        (state === "mn" && number <= 67 && (letter === "a" || letter === "b")) ||
        (state === "nd" && number === 4 && (letter === "a" || letter === "b")) ||
        (state === "sd" && (number === 26 || number === 28) && (letter === "a" || letter === "b"));
      return supported
        ? [{ label: district.toUpperCase(), divisionId: canonicalDivisionId }]
        : null;
    }
  }
  return /^[1-9]\d{0,2}$/.test(district)
    ? [{ label: district, divisionId: canonicalDivisionId }]
    : null;
}

const massachusettsUpperOrdinals: Readonly<Record<string, string>> = {
  "1st": "First",
  "2nd": "Second",
  "3rd": "Third",
  "4th": "Fourth",
  "5th": "Fifth",
};
const massachusettsCommaDistricts: Readonly<Record<string, string>> = {
  hampden_hampshire_and_worcester: "Hampden, Hampshire and Worcester",
  hampshire_franklin_and_worcester: "Hampshire, Franklin and Worcester",
  berkshire_hampden_franklin_and_hampshire: "Berkshire, Hampden, Franklin and Hampshire",
  norfolk_plymouth_and_bristol: "Norfolk, Plymouth and Bristol",
  norfolk_worcester_and_middlesex: "Norfolk, Worcester and Middlesex",
};
const massachusettsDistrictWords = new Set([
  "and", "barnstable", "berkshire", "bristol", "cape", "essex", "franklin",
  "hampden", "hampshire", "islands", "middlesex", "norfolk", "plymouth",
  "suffolk", "worcester",
]);
const vermontUpperDistrictLabels: Readonly<Record<string, string>> = {
  "chittenden-central": "Chittenden Central",
  "chittenden-north": "Chittenden North",
  "chittenden-southeast": "Chittenden Southeast",
  "grand_isle-chittenden": "Grand Isle",
};

function massachusettsProviderLabel(
  chamber: StateChamber,
  district: string,
): string | null {
  if (chamber === "lower") {
    if (district === "barnstable_dukes_and_nantucket") {
      return "Barnstable, Dukes and Nantucket";
    }
    const match = /^([^_]+)_([a-z]+)$/.exec(district);
    return match?.[1] && match[2] &&
      isNumericOrdinal(match[1], 37) && massachusettsDistrictWords.has(match[2])
      ? `${match[1]} ${titleWord(match[2])}`
      : null;
  }

  const commaLabel = massachusettsCommaDistricts[district];
  if (commaLabel !== undefined) return commaLabel;
  const parts = district.split("_");
  const ordinal = massachusettsUpperOrdinals[parts[0] ?? ""];
  if (ordinal !== undefined) parts[0] = ordinal;
  if (
    parts.length === 0 ||
    parts.some((part, index) =>
      index === 0 && ordinal !== undefined
        ? false
        : !massachusettsDistrictWords.has(part)
    )
  ) {
    return null;
  }
  const andIndex = parts.indexOf("and");
  if (
    andIndex !== -1 &&
    (parts.lastIndexOf("and") !== andIndex ||
      parts.length !== (ordinal === undefined ? 3 : 4) ||
      andIndex !== (ordinal === undefined ? 1 : 2))
  ) {
    return null;
  }
  if (andIndex === -1 && parts.length !== (ordinal === undefined ? 1 : 2)) {
    return null;
  }
  return parts.map((part) =>
    part === "and" || Object.values(massachusettsUpperOrdinals).includes(part)
      ? part
      : titleWord(part)
  ).join(" ");
}

function isMarylandSubdistrict(number: number, letter: string): boolean {
  const abDistricts = new Set([1, 2, 7, 9, 11, 12, 27, 29, 30, 33, 34, 35, 37, 38, 42, 43, 44, 47]);
  const cDistricts = new Set([1, 27, 29, 33, 38, 42]);
  return (letter === "a" || letter === "b")
    ? abDistricts.has(number)
    : letter === "c" && cDistricts.has(number);
}

function parseBoundedDistrictNumber(value: string, maximum: number): number | null {
  if (!/^[1-9]\d{0,2}$/.test(value)) return null;
  const number = Number(value);
  return number <= maximum ? number : null;
}

function isNumericOrdinal(value: string, maximum: number): boolean {
  const match = /^([1-9]\d?)(st|nd|rd|th)$/.exec(value);
  if (!match?.[1] || !match[2]) return false;
  const number = Number(match[1]);
  const remainder = number % 100;
  const expected = remainder >= 11 && remainder <= 13
    ? "th"
    : number % 10 === 1
      ? "st"
      : number % 10 === 2
        ? "nd"
        : number % 10 === 3
          ? "rd"
          : "th";
  return number <= maximum && match[2] === expected;
}

function titleDistrict(value: string, hyphenSeparator: "-" | " "): string {
  return value
    .split("_")
    .map((part) =>
      part
        .split("-")
        .map(titleWord)
        .join(hyphenSeparator),
    )
    .join(" ");
}

function titleWord(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
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

function comparePeople(
  left: StateOfficialPerson,
  right: StateOfficialPerson,
): number {
  const nameOrder = comparePublicFields(left.name, right.name);
  if (nameOrder !== 0) {
    return nameOrder;
  }
  if (left.id < right.id) {
    return -1;
  }
  return left.id > right.id ? 1 : 0;
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
