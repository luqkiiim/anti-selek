// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuestDefinitionModal } from "./GuestDefinitionModal";
import { MixedSide, PlayerGender, SessionPool } from "@/types/enums";

function getProps() {
  return {
    open: true,
    name: "New Guest",
    initialElo: 1000,
    gender: PlayerGender.MALE,
    mixedSideOverride: null,
    pool: SessionPool.B,
    representingClubId: "club-1",
    isMixed: false,
    poolsEnabled: false,
    isInterclub: false,
    interclubClubOptions: [{ id: "club-1", name: "Club One" }],
    submitting: false,
    error: "",
    onNameChange: vi.fn(),
    onInitialEloChange: vi.fn(),
    onGenderChange: vi.fn(),
    onMixedSideOverrideChange: vi.fn(),
    onPoolChange: vi.fn(),
    onRepresentingClubChange: vi.fn(),
    onClose: vi.fn(),
    onSubmit: vi.fn(),
  };
}

describe("GuestDefinitionModal", () => {
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
    await act(async () => root.unmount());
    document.body.innerHTML = "";
  });

  it("defaults to the shared rating presets and hides irrelevant fields", async () => {
    await act(async () => {
      root.render(<GuestDefinitionModal {...getProps()} />);
    });

    expect(document.body.textContent).toContain("Beginner (850)");
    expect(document.body.textContent).toContain("Average (1000)");
    expect(document.body.textContent).toContain("Advanced (1200)");
    expect(
      document.body.querySelector('select[aria-label="Guest gender"]')
    ).toBeNull();
    expect(
      document.body.querySelector('select[aria-label="Guest game group"]')
    ).toBeNull();
    expect(
      document.body.querySelector('select[aria-label="Guest representing club"]')
    ).toBeNull();
  });

  it("shows contextual fields, errors, and the submitting state", async () => {
    await act(async () => {
      root.render(
        <GuestDefinitionModal
          {...getProps()}
          isMixed
          poolsEnabled
          isInterclub
          mixedSideOverride={MixedSide.UPPER}
          submitting
          error="Unable to add this guest."
        />
      );
    });

    expect(
      document.body.querySelector('select[aria-label="Guest gender"]')
    ).not.toBeNull();
    expect(
      document.body.querySelector('select[aria-label="Guest mixed doubles side"]')
    ).not.toBeNull();
    expect(
      document.body.querySelector('select[aria-label="Guest game group"]')
    ).not.toBeNull();
    expect(
      document.body.querySelector('select[aria-label="Guest representing club"]')
    ).not.toBeNull();
    expect(document.body.textContent).toContain("Unable to add this guest.");
    expect(document.body.textContent).toContain("Adding...");
    expect(
      Array.from(document.body.querySelectorAll("button")).find(
        (button) => button.textContent === "Adding..."
      )?.disabled
    ).toBe(true);
  });
});
