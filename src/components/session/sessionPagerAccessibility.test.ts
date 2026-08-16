// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { syncSessionPagerAccessibility } from "./sessionPagerAccessibility";

describe("syncSessionPagerAccessibility", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("moves focus before making an outgoing mobile panel inert", () => {
    document.body.innerHTML = `
      <main id="pager">
        <section data-session-pager-section="session"><button id="overview-control">Start</button></section>
        <section data-session-pager-section="courts"><button>Score</button></section>
      </main>
      <button id="active-tab">Courts tab</button>
    `;
    const pager = document.querySelector("#pager") as HTMLElement;
    const overviewControl = document.querySelector(
      "#overview-control"
    ) as HTMLButtonElement;
    const activeTab = document.querySelector(
      "#active-tab"
    ) as HTMLButtonElement;
    overviewControl.focus();

    syncSessionPagerAccessibility({
      pager,
      activeSection: "courts",
      isWideLayout: false,
      focusFallback: activeTab,
    });

    const overview = pager.querySelector<HTMLElement>(
      '[data-session-pager-section="session"]'
    );
    const courts = pager.querySelector<HTMLElement>(
      '[data-session-pager-section="courts"]'
    );
    expect(document.activeElement).toBe(activeTab);
    expect(overview?.inert).toBe(true);
    expect(overview?.getAttribute("aria-hidden")).toBe("true");
    expect(courts?.inert).toBe(false);
    expect(courts?.hasAttribute("aria-hidden")).toBe(false);
  });

  it("keeps every stacked panel exposed on wide layouts", () => {
    document.body.innerHTML = `
      <main id="pager">
        <section data-session-pager-section="session"></section>
        <section data-session-pager-section="courts" inert aria-hidden="true"></section>
      </main>
    `;
    const pager = document.querySelector("#pager") as HTMLElement;

    syncSessionPagerAccessibility({
      pager,
      activeSection: "session",
      isWideLayout: true,
    });

    pager.querySelectorAll<HTMLElement>("section").forEach((panel) => {
      expect(panel.inert).toBe(false);
      expect(panel.hasAttribute("aria-hidden")).toBe(false);
    });
  });
});
