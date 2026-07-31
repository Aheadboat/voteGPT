"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import {
  GOVERNMENT_LEVELS,
  GOVERNMENT_MODES,
  governmentCategoryLabel,
  governmentLevelLabel,
  governmentNavigationHref,
  normalizeGovernmentNavigation,
} from "@/lib/government-navigation";
import type {
  GovernmentNavigationState,
  GovernmentNavigationSearchParams,
} from "@/lib/government-navigation";

import styles from "./government-navigation.module.css";

export type GovernmentNavigationPanels = Readonly<{
  local?: ReactNode;
  state?: ReactNode;
  federal?: ReactNode;
}>;

export function GovernmentNavigation({
  panels,
  searchParams,
}: {
  panels: GovernmentNavigationPanels;
  searchParams?: GovernmentNavigationSearchParams;
}) {
  const state = normalizeGovernmentNavigation(searchParams);
  const panelId = `government-level-${state.level}-panel`;

  return (
    <section aria-label="Government officials" className={styles.shell}>
      <GovernmentLevelTabs key={state.level} panelId={panelId} state={state} />

      <nav aria-label="Official status" className={styles.modes}>
        {GOVERNMENT_MODES.map((mode) => (
          <a
            aria-current={mode === state.mode ? "page" : undefined}
            className={styles.mode}
            href={governmentNavigationHref({ ...state, mode })}
            key={mode}
          >
            {mode === "in-office" ? "In office" : "Elections"}
          </a>
        ))}
      </nav>

      {state.category ? (
        <p className={styles.category}>
          <span>Category</span> <strong>{governmentCategoryLabel(state.category)}</strong>
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

function GovernmentLevelTabs({
  panelId,
  state,
}: {
  panelId: string;
  state: GovernmentNavigationState;
}) {
  const tabs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [rovingLevel, setRovingLevel] = useState(state.level);
  const hydrated = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  function moveFocus(key: string) {
    const currentIndex = GOVERNMENT_LEVELS.indexOf(rovingLevel);
    const nextIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? GOVERNMENT_LEVELS.length - 1
          : (currentIndex + (key === "ArrowLeft" ? -1 : 1) + GOVERNMENT_LEVELS.length) %
            GOVERNMENT_LEVELS.length;
    setRovingLevel(GOVERNMENT_LEVELS[nextIndex]);
    tabs.current[nextIndex]?.focus();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    moveFocus(event.key);
  }

  return (
    <div aria-label="Government level" className={styles.tabs} role="tablist">
      {GOVERNMENT_LEVELS.map((level, index) => {
        const selected = level === state.level;
        return (
          <a
            aria-controls={selected ? panelId : undefined}
            aria-selected={selected}
            className={styles.tab}
            href={governmentNavigationHref({ ...state, level })}
            id={`government-level-${level}-tab`}
            key={level}
            onFocus={() => setRovingLevel(level)}
            onKeyDown={onTabKeyDown}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            role="tab"
            tabIndex={hydrated ? (level === rovingLevel ? 0 : -1) : undefined}
          >
            {governmentLevelLabel(level)}
          </a>
        );
      })}
    </div>
  );
}

function subscribe() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}
