import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GovernmentNavigation } from "./government-navigation";

const panels = {
  local: <p>Local panel</p>,
  state: <p>State legislature panel</p>,
  federal: <p>Federal Congress panel</p>,
};

describe("GovernmentNavigation", () => {
  it("normalizes arbitrary, repeated, and unsupported query values to the safe Federal Congress view", () => {
    const { container } = render(
      <GovernmentNavigation
        panels={panels}
        searchParams={{
          level: ["state", "federal"],
          mode: "unknown",
          category: "not-a-category",
          address: "1 Private Road",
        }}
      />,
    );

    expect(screen.getByRole("tab", { name: "Federal" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Federal Congress panel");
    const local = screen.getByRole("tab", { name: "Local" });
    expect(local.tagName).toBe("A");
    expect(local).toHaveAttribute(
      "href",
      "?level=local&mode=in-office",
    );
    expect(screen.getByRole("tab", { name: "State" })).toHaveAttribute(
      "href",
      "?level=state&mode=in-office&category=legislature",
    );
    expect(screen.getByRole("tab", { name: "Federal" })).toHaveAttribute(
      "href",
      "?level=federal&mode=in-office&category=congress",
    );
    expect(container.innerHTML).not.toContain("1 Private Road");
    expect(container.innerHTML).not.toContain("not-a-category");
  });

  it("uses only level, mode, and available category in canonical native-link URLs", () => {
    render(
      <GovernmentNavigation
        panels={panels}
        searchParams={new URLSearchParams(
          "level=state&mode=in-office&category=legislature&userId=secret",
        )}
      />,
    );

    expect(screen.getByRole("tabpanel")).toHaveTextContent("State legislature panel");
    expect(screen.getByRole("link", { name: "In office" })).toHaveAttribute(
      "href",
      "?level=state&mode=in-office&category=legislature",
    );
    expect(screen.getByRole("link", { name: "Elections" })).toHaveAttribute(
      "href",
      "?level=state&mode=elections",
    );
    expect(screen.getByText("Legislature")).toBeInTheDocument();
    expect(screen.queryByText("Congress")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("removes unavailable categories for Local and Elections rather than showing disabled future controls", () => {
    const { rerender } = render(
      <GovernmentNavigation
        panels={panels}
        searchParams={new URLSearchParams(
          "level=local&mode=in-office&category=legislature",
        )}
      />,
    );

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Local panel");
    expect(screen.queryByText("Legislature")).toBeNull();
    expect(screen.queryByText("Congress")).toBeNull();
    expect(screen.queryByText(/unavailable/i)).toBeNull();

    rerender(
      <GovernmentNavigation
        panels={panels}
        searchParams={new URLSearchParams(
          "level=federal&mode=elections&category=congress",
        )}
      />,
    );

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Federal Congress panel");
    expect(screen.queryByText("Legislature")).toBeNull();
    expect(screen.queryByText("Congress")).toBeNull();
  });

  it("provides one selected tab and panel with roving Arrow, Home, and End focus", () => {
    render(<GovernmentNavigation panels={panels} />);

    const local = screen.getByRole("tab", { name: "Local" });
    const state = screen.getByRole("tab", { name: "State" });
    const federal = screen.getByRole("tab", { name: "Federal" });

    expect(screen.getByRole("tablist", { name: "Government level" })).toBeInTheDocument();
    expect(federal).toHaveAttribute("aria-selected", "true");
    expect(federal).toHaveAttribute("tabindex", "0");
    expect(local).toHaveAttribute("tabindex", "-1");
    expect(state).toHaveAttribute("tabindex", "-1");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);

    federal.focus();
    fireEvent.keyDown(federal, { key: "ArrowRight" });
    expect(local).toHaveFocus();
    fireEvent.keyDown(local, { key: "End" });
    expect(federal).toHaveFocus();
    fireEvent.keyDown(federal, { key: "Home" });
    expect(local).toHaveFocus();
    fireEvent.keyDown(local, { key: "ArrowLeft" });
    expect(federal).toHaveFocus();
  });

  it("keeps deep links usable in server markup without simulating JavaScript navigation", () => {
    const markup = renderToStaticMarkup(
      <GovernmentNavigation panels={panels} />,
    );

    expect(markup).toContain('href="?level=federal&amp;mode=in-office&amp;category=congress"');
    expect(markup).toContain("Federal Congress panel");
    expect(markup).not.toMatch(/<script|onClick=/i);
  });
});
