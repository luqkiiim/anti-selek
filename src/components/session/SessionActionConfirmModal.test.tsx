// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionActionConfirmModal } from "./SessionActionConfirmModal";

describe("SessionActionConfirmModal", () => {
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

  it("renders above player picker sheets", async () => {
    await act(async () => {
      root.render(
        <SessionActionConfirmModal
          title="Remove player?"
          subtitle="This will remove the player from the current session roster."
          confirmLabel="Confirm Remove Player"
          cancelLabel="Keep Player"
          isSubmitting={false}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );
    });

    const backdrop = document.body.querySelector(".app-modal-backdrop");

    expect(backdrop).not.toBeNull();
    expect(backdrop?.className).toContain("app-modal-backdrop-above-sheet");
  });
});
