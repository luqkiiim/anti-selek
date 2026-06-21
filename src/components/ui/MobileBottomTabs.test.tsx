// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Home, Trophy, User } from "lucide-react";

import { MobileBottomTabs } from "./MobileBottomTabs";

describe("MobileBottomTabs", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  it("seals the fixed bottom surface while preserving tab behavior", async () => {
    const onSelect = vi.fn();

    await act(async () => {
      root.render(
        <MobileBottomTabs
          ariaLabel="Club navigation"
          activeId="tournaments"
          onSelect={onSelect}
          items={[
            {
              id: "overview",
              label: "Overview",
              icon: Home,
            },
            {
              id: "tournaments",
              label: "Tournaments",
              icon: Trophy,
            },
            {
              id: "profile",
              label: "Player profile",
              shortLabel: "Profile",
              icon: User,
              disabled: true,
            },
          ]}
        />
      );
    });

    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
    expect(nav?.getAttribute("aria-label")).toBe("Club navigation");
    expect(nav?.className).toContain("fixed");
    expect(nav?.className).toContain("bottom-0");
    expect(nav?.className).toContain("rounded-t-2xl");
    expect(nav?.className).toContain("border-t");
    expect(nav?.className).toContain("bg-white/95");
    expect(nav?.className).toContain(
      "shadow-[0_-12px_28px_rgba(23,32,31,0.12)]"
    );
    expect(nav?.className).toContain("backdrop-blur-md");
    expect(nav?.className).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(nav?.className).toContain("pt-1");

    const tabContent = nav?.querySelector("div");
    expect(tabContent?.className).toContain("mx-auto");
    expect(tabContent?.className).toContain("max-w-md");
    expect(tabContent?.className).toContain("py-1.5");
    expect(tabContent?.className).not.toContain("rounded-xl");
    expect(tabContent?.className).not.toContain("bg-white/95");
    expect(tabContent?.className).not.toContain("shadow-[0_12px");

    const activeTab = container.querySelector(
      'button[aria-label="Tournaments"]'
    );
    expect(activeTab?.getAttribute("aria-current")).toBe("page");
    expect(activeTab?.textContent).toContain("Tournaments");

    const disabledTab = container.querySelector(
      'button[aria-label="Player profile"]'
    ) as HTMLButtonElement | null;
    expect(disabledTab?.disabled).toBe(true);
    expect(disabledTab?.textContent).toContain("Profile");

    await act(async () => {
      activeTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith("tournaments");
  });
});
