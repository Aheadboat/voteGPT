export const GOVERNMENT_LEVELS = ["local", "state", "federal"] as const;
export const GOVERNMENT_MODES = ["in-office", "elections"] as const;

export type GovernmentLevel = (typeof GOVERNMENT_LEVELS)[number];
export type GovernmentMode = (typeof GOVERNMENT_MODES)[number];
export type GovernmentCategory = "legislature" | "congress";
export type GovernmentNavigationState = Readonly<{
  level: GovernmentLevel;
  mode: GovernmentMode;
  category: GovernmentCategory | null;
}>;
export type GovernmentNavigationSearchParams =
  | Readonly<Record<string, string | readonly string[] | undefined>>
  | Readonly<{ getAll(name: string): readonly string[] }>;

export function normalizeGovernmentNavigation(
  searchParams?: GovernmentNavigationSearchParams,
): GovernmentNavigationState {
  const requestedLevel = singleValue(searchParams, "level");
  const requestedMode = singleValue(searchParams, "mode");
  const level = isLevel(requestedLevel) ? requestedLevel : "federal";
  const mode = isMode(requestedMode) ? requestedMode : "in-office";

  return { level, mode, category: availableCategory(level, mode) };
}

export function governmentNavigationHref(state: GovernmentNavigationState) {
  const category = availableCategory(state.level, state.mode);
  const categoryQuery = category ? `&category=${category}` : "";
  return `?level=${state.level}&mode=${state.mode}${categoryQuery}`;
}

export function governmentLevelLabel(level: GovernmentLevel) {
  return level[0].toUpperCase() + level.slice(1);
}

export function governmentCategoryLabel(category: GovernmentCategory) {
  return category === "legislature" ? "Legislature" : "Congress";
}

function singleValue(
  searchParams: GovernmentNavigationSearchParams | undefined,
  name: string,
) {
  if (!searchParams) {
    return undefined;
  }
  if (hasGetAll(searchParams)) {
    const values = searchParams.getAll(name);
    return values.length === 1 ? values[0] : undefined;
  }
  const value = searchParams[name];
  return typeof value === "string" ? value : undefined;
}

function hasGetAll(
  searchParams: GovernmentNavigationSearchParams,
): searchParams is Readonly<{ getAll(name: string): readonly string[] }> {
  return "getAll" in searchParams && typeof searchParams.getAll === "function";
}

function isLevel(value: string | undefined): value is GovernmentLevel {
  return GOVERNMENT_LEVELS.some((level) => level === value);
}

function isMode(value: string | undefined): value is GovernmentMode {
  return GOVERNMENT_MODES.some((mode) => mode === value);
}

function availableCategory(level: GovernmentLevel, mode: GovernmentMode) {
  if (mode !== "in-office") {
    return null;
  }
  if (level === "state") {
    return "legislature";
  }
  return level === "federal" ? "congress" : null;
}
