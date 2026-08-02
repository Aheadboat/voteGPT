export type StateSourceUrlValidation =
  | Readonly<{ status: "allowed" }>
  | Readonly<{ status: "untrusted" }>
  | Readonly<{ status: "invalid" }>;

const MAX_SOURCE_URL_LENGTH = 2_048;
const MAX_SOURCE_QUERY_LENGTH = 1_024;
const MAX_SOURCE_QUERY_PARAMETERS = 20;
const PUBLIC_LEGISLATIVE_QUERY_KEYS: ReadonlySet<string> = new Set([
  "body",
  "chamber",
  "code",
  "ddbienniumsession",
  "district",
  "ga",
  "id",
  "legislativetermid",
  "member",
  "memberid",
  "memid",
  "personid",
  "pid",
  "session",
  "sessionid",
  "sessionselect",
  "sid",
  "year",
]);

// Conservative institutional baseline verified 2026-07-31 against current
// OpenStates people scrapers and the Congress.gov state-legislature directory.
// Party, caucus, social, reference, and personal hosts are intentionally absent.
const OFFICIAL_LEGISLATIVE_HOSTS = {
  ak: ["akleg.gov"],
  al: ["legislature.state.al.us"],
  ar: ["arkleg.state.ar.us"],
  az: ["azleg.gov"],
  ca: ["assembly.ca.gov", "senate.ca.gov"],
  co: ["leg.colorado.gov"],
  ct: ["cga.ct.gov"],
  de: ["legis.delaware.gov"],
  fl: ["flsenate.gov", "myfloridahouse.gov", "flhouse.gov"],
  ga: ["legis.ga.gov", "house.ga.gov", "senate.ga.gov"],
  hi: ["capitol.hawaii.gov"],
  ia: ["legis.iowa.gov", "senate.iowa.gov"],
  id: ["legislature.idaho.gov"],
  il: ["ilga.gov"],
  in: ["iga.in.gov"],
  ks: ["kslegislature.gov", "kslegislature.org"],
  ky: ["legislature.ky.gov", "lrc.ky.gov"],
  la: ["house.louisiana.gov", "senate.la.gov"],
  ma: ["malegislature.gov"],
  md: ["mgaleg.maryland.gov"],
  me: ["legislature.maine.gov"],
  mi: ["house.mi.gov", "senate.michigan.gov"],
  mn: ["house.mn.gov", "house.leg.state.mn.us", "senate.mn"],
  mo: ["house.mo.gov", "senate.mo.gov"],
  ms: ["billstatus.ls.state.ms.us", "legislature.ms.gov"],
  mt: ["leg.mt.gov", "legmt.gov"],
  nc: ["ncleg.gov", "ncga.state.nc.us"],
  nd: ["legis.nd.gov", "ndlegis.gov"],
  ne: ["nebraskalegislature.gov"],
  nh: ["gencourt.state.nh.us", "gc.nh.gov"],
  nj: ["njleg.state.nj.us"],
  nm: ["nmlegis.gov"],
  nv: ["leg.state.nv.us"],
  ny: ["assembly.state.ny.us", "nyassembly.gov", "nysenate.gov"],
  oh: ["legislature.ohio.gov", "ohiohouse.gov", "ohiosenate.gov"],
  ok: ["okhouse.gov", "oksenate.gov", "oklegislature.gov"],
  or: ["oregonlegislature.gov"],
  pa: ["legis.state.pa.us", "palegis.us"],
  ri: ["rilegislature.gov", "rilin.state.ri.us"],
  sc: ["scstatehouse.gov"],
  sd: ["sdlegislature.gov", "legis.sd.gov"],
  tn: ["capitol.tn.gov", "legislature.state.tn.us"],
  tx: ["house.texas.gov", "senate.texas.gov", "capitol.texas.gov"],
  ut: ["le.utah.gov", "house.utah.gov", "house.utleg.gov", "senate.utah.gov"],
  va: ["virginiageneralassembly.gov", "lis.virginia.gov", "senate.virginia.gov", "house.vga.virginia.gov"],
  vt: ["legislature.vermont.gov"],
  wa: ["leg.wa.gov"],
  wi: ["legis.wisconsin.gov"],
  wv: ["wvlegislature.gov", "legis.state.wv.us"],
  wy: ["wyoleg.gov", "legisweb.state.wy.us"],
} as const;

export function validateStateLegislativeSourceUrl(
  value: unknown,
  stateCode: string,
): StateSourceUrlValidation {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_SOURCE_URL_LENGTH) {
    return { status: "invalid" };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { status: "invalid" };
  }
  if (
    url.toString() !== value ||
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search.length > MAX_SOURCE_QUERY_LENGTH ||
    [...url.searchParams].length > MAX_SOURCE_QUERY_PARAMETERS
  ) {
    return { status: "invalid" };
  }
  const normalizedQueryKeys = [...url.searchParams.keys()].map(normalizeSourceQueryKey);
  if (normalizedQueryKeys.some(isPrivateSourceQueryKey)) {
    return { status: "untrusted" };
  }
  if (!/^(?:[a-z]{2}|[A-Z]{2})$/.test(stateCode)) {
    return { status: "untrusted" };
  }
  const state = stateCode.toLowerCase();
  if (!isSupportedState(state)) {
    return { status: "untrusted" };
  }
  const pinnedRoute = validatePinnedProfileRoute(url, state);
  if (url.hash !== "") {
    return pinnedRoute === "allowed"
      ? { status: "allowed" }
      : { status: "untrusted" };
  }
  if (pinnedRoute === "denied") {
    return { status: "untrusted" };
  }
  const trustedHost = OFFICIAL_LEGISLATIVE_HOSTS[state].some(
    (allowedHost) => url.hostname === allowedHost || url.hostname.endsWith(`.${allowedHost}`),
  );
  if (!trustedHost) {
    return { status: "untrusted" };
  }
  if (pinnedRoute === "allowed") {
    return { status: "allowed" };
  }
  return normalizedQueryKeys.every((key) => PUBLIC_LEGISLATIVE_QUERY_KEYS.has(key))
    ? { status: "allowed" }
    : { status: "untrusted" };
}

export function isSupportedStateLegislativeSourceState(value: string): boolean {
  return /^(?:[a-z]{2}|[A-Z]{2})$/.test(value) &&
    isSupportedState(value.toLowerCase());
}

function normalizeSourceQueryKey(key: string): string {
  return key.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isPrivateSourceQueryKey(key: string): boolean {
  return /address|street|location|latitude|longitude|coordinates|postal|zipcode|gps/.test(key) ||
    /^(?:lat|lng|user|userid|email|account|apikey|token|secret|auth|password)$/.test(key);
}

function validatePinnedProfileRoute(
  url: URL,
  state: keyof typeof OFFICIAL_LEGISLATIVE_HOSTS,
): "allowed" | "denied" | null {
  const arizonaPath = url.pathname === "/house-member/" || url.pathname === "/senate-member/";
  if (state === "az" && (
    arizonaPath ||
    hasAnyQueryKey(url, ["legislature", "legislator"])
  )) {
    const queryAllowed = hasExactQueryKeys(
      url,
      ["legislature", "legislator"],
      ["session"],
    ) &&
      url.searchParams.get("legislature") === "57" &&
      /^[1-9]\d{3}$/.test(url.searchParams.get("legislator") ?? "") &&
      (!url.searchParams.has("session") || url.searchParams.get("session") === "129");
    return url.hostname === "www.azleg.gov" && arizonaPath && url.hash === "" && queryAllowed
      ? "allowed"
      : "denied";
  }
  const kentuckyPath = url.pathname === "/Legislators/Pages/Legislator-Profile.aspx";
  if (state === "ky" && (
    kentuckyPath ||
    hasAnyQueryKey(url, ["DistrictNumber"])
  )) {
    return url.hostname === "legislature.ky.gov" &&
      kentuckyPath &&
      url.hash === "" &&
      hasExactQueryKeys(url, ["DistrictNumber"]) &&
      /^[1-9]\d*$/.test(url.searchParams.get("DistrictNumber") ?? "")
      ? "allowed"
      : "denied";
  }
  if (state === "mt" && (
    (url.hostname === "legislators.legmt.gov" && url.pathname === "/") ||
    url.hash !== ""
  )) {
    return url.hostname === "legislators.legmt.gov" &&
      url.pathname === "/" &&
      url.search === "" &&
      /^#\/legislator\/[1-9]\d*$/.test(url.hash)
      ? "allowed"
      : "denied";
  }
  const newMexicoPath = url.pathname.toLowerCase() === "/members/legislator";
  if (state === "nm" && (
    newMexicoPath ||
    hasAnyQueryKey(url, ["SponCode"])
  )) {
    const exactPath = url.pathname === "/Members/Legislator" ||
      url.pathname === "/members/Legislator";
    return url.hostname === "www.nmlegis.gov" &&
      exactPath &&
      url.hash === "" &&
      hasExactQueryKeys(url, ["SponCode"]) &&
      /^[HS][A-Z]{4}$/.test(url.searchParams.get("SponCode") ?? "")
      ? "allowed"
      : "denied";
  }
  const texasPath = url.pathname === "/member.php";
  if (state === "tx" && (
    texasPath ||
    hasAnyQueryKey(url, ["d"])
  )) {
    return (url.hostname === "senate.texas.gov" ||
      url.hostname === "www.senate.texas.gov") &&
      texasPath &&
      url.hash === "" &&
      hasExactQueryKeys(url, ["d"]) &&
      /^(?:[1-9]|[12]\d|3[01])$/.test(url.searchParams.get("d") ?? "")
      ? "allowed"
      : "denied";
  }
  return null;
}

function hasExactQueryKeys(
  url: URL,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): boolean {
  const keys = [...url.searchParams.keys()];
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  return new Set(keys).size === keys.length &&
    requiredKeys.every((key) => keys.includes(key)) &&
    keys.every((key) => allowedKeys.has(key));
}

function hasAnyQueryKey(url: URL, keys: readonly string[]): boolean {
  return keys.some((key) => url.searchParams.has(key));
}

function isSupportedState(
  value: string,
): value is keyof typeof OFFICIAL_LEGISLATIVE_HOSTS {
  return Object.hasOwn(OFFICIAL_LEGISLATIVE_HOSTS, value);
}
