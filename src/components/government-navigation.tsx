"use client";

import { useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import styles from "./government-navigation.module.css";

const levels = ["local", "state", "federal"] as const;
const modes = ["in-office", "elections"] as const;

export type GovernmentLevel = (typeof levels)[number];
export type GovernmentMode = (typeof modes)[number];
export type GovernmentCategory = "legislature" | "congress";
export type GovernmentNavigationState = Readonly<{
  level: GovernmentLevel;
  mode: GovernmentMode;
  category: GovernmentCategory | null;
}>;
export type GovernmentNavigationSearchParams =
  | URLSearchParams
  | Readonly<Record<string, string | readonly string[] | undefined>>;
export type GovernmentNavigationPanels = Readonly<{
  local?: ReactNode;
  state?: ReactNode;
  federal?: ReactNode;
}>;

export function normalizeGovernmentNavigation(
  searchParams?: GovernmentNavigationSearchParams,
): GovernmentNavigationState {
  const requestedLevel = singleValue(searchParams, "level");
  const requestedMode = singleValue(searchParams, "mode");
  const level = isLevel(requestedLevel) ? requestedLevel : "federal";
  const mode = isMode(requestedMode) ? requestedMode : "in-office";

  return { level, mode, category: availableCategory(level, mode) };
}

export function GovernmentNavigation({
  panels,
  searchParams,
}: {
  panels: GovernmentNavigationPanels;
  searchParams?: GovernmentNavigationSearchParams;
}) {
  const state = normalizeGovernmentNavigation(searchParams);
  const tabs = useRef<Array<HTMLAnchorElement | null>>([]);
  const panelId = `government-level-${state.level}-panel`;

  function moveFocus(current: GovernmentLevel, key: string) {
    const currentIndex = levels.indexOf(current);
    const nextIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? levels.length - 1
          : (currentIndex + (key === "ArrowLeft" ? -1 : 1) + levels.length) %
            levels.length;
    tabs.current[nextIndex]?.focus();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLAnchorElement>, level: GovernmentLevel) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    moveFocus(level, event.key);
  }

  return (
    <section aria-label="Government officials" className={styles.shell}>
      <div aria-label="Government level" className={styles.tabs} role="tablist">
        {levels.map((level, index) => {
          const selected = level === state.level;
          return (
            <a
              aria-controls={selected ? panelId : undefined}
              aria-selected={selected}
              className={styles.tab}
              href={navigationHref({ ...state, level })}
              id={`government-level-${level}-tab`}
              key={level}
              onKeyDown={(event) => onTabKeyDown(event, level)}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              role="tab"
              tabIndex={selected ? 0 : -1}
            >
              {levelLabel(level)}
            </a>
          );
        })}
      </div>

      <nav aria-label="Official status" className={styles.modes}>
        {modes.map((mode) => (
          <a
            aria-current={mode === state.mode ? "page" : undefined}
            className={styles.mode}
            href={navigationHref({ ...state, mode })}
            key={mode}
          >
            {mode === "in-office" ? "In office" : "Elections"}
          </a>
        ))}
      </nav>

      {state.category ? (
        <p className={styles.category}>
          <span>Category</span> <strong>{categoryLabel(state.category)}</strong>
        </p>
      ) : null}

      <section
        aria-labelledby={`government-level-${state.level}-tab`}
        className={styles.panel}
        id={panelId}
        role="tabpanel"
      >
        {panels[state.level]}
      </section>
    </section>
  );
}

function singleValue(
  searchParams: GovernmentNavigationSearchParams | undefined,
  name: string,
) {
  if (!searchParams) {
    return undefined;
  }
  if (searchParams instanceof URLSearchParams) {
    const values = searchParams.getAll(name);
    return values.length === 1 ? values[0] : undefined;
  }
  const value = searchParams[name];
  return typeof value === "string" ? value : undefined;
}

function isLevel(value: string | undefined): value is GovernmentLevel {
  return levels.some((level) => level === value);
}

function isMode(value: string | undefined): value is GovernmentMode {
  return modes.some((mode) => mode === value);
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

function navigationHref(state: GovernmentNavigationState) {
  const query = new URLSearchParams({ level: state.level, mode: state.mode });
  const category = availableCategory(state.level, state.mode);
  if (category) {
    query.set("category", category);
  }
  return `?${query.toString()}`;
}

function levelLabel(level: GovernmentLevel) {
  return level[0].toUpperCase() + level.slice(1);
}

function categoryLabel(category: GovernmentCategory) {
  return category === "legislature" ? "Legislature" : "Congress";
}
