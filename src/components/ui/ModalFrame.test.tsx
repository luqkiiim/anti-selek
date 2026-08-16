// @vitest-environment jsdom

import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModalFrame } from "./ModalFrame";
import { PlayerPickerSheet } from "./PlayerPickerSheet";

function dispatchKey(key: string, shiftKey = false) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key, shiftKey, bubbles: true })
  );
}

describe("dialog focus management", () => {
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
    container.remove();
    document.body.innerHTML = "";
  });

  it("uses requested initial focus, traps Tab, closes on Escape, and restores the opener", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const [renderCount, setRenderCount] = useState(0);
      const inputRef = useRef<HTMLInputElement | null>(null);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open dialog
          </button>
          {open ? (
            <ModalFrame
              title="Edit player"
              subtitle="Update tournament details."
              initialFocusRef={inputRef}
              onClose={() => setOpen(false)}
              footer={<button type="button">Save</button>}
            >
              <input ref={inputRef} aria-label="Player name" />
              <button type="button" onClick={() => setRenderCount((value) => value + 1)}>
                Rerender {renderCount}
              </button>
            </ModalFrame>
          ) : null}
        </>
      );
    }

    await act(async () => root.render(<Harness />));
    const opener = container.querySelector("button") as HTMLButtonElement;
    opener.focus();
    await act(async () => opener.click());

    const input = document.querySelector(
      'input[aria-label="Player name"]'
    ) as HTMLInputElement;
    expect(document.activeElement).toBe(input);

    const rerenderButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.startsWith("Rerender")
    ) as HTMLButtonElement;
    rerenderButton.focus();
    await act(async () => rerenderButton.click());
    expect(document.activeElement).toBe(rerenderButton);

    const closeButton = document.querySelector(
      'button[aria-label="Close"]'
    ) as HTMLButtonElement;
    const saveButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Save"
    ) as HTMLButtonElement;

    saveButton.focus();
    await act(async () => dispatchKey("Tab"));
    expect(document.activeElement).toBe(closeButton);

    await act(async () => dispatchKey("Tab", true));
    expect(document.activeElement).toBe(saveButton);

    await act(async () => dispatchKey("Escape"));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("only lets the topmost nested dialog handle Escape", async () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();

    function Harness() {
      const [parentOpen, setParentOpen] = useState(false);
      const [childOpen, setChildOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setParentOpen(true)}>
            Open parent
          </button>
          {parentOpen ? (
            <ModalFrame
              title="Parent"
              onClose={() => {
                parentClose();
                setParentOpen(false);
              }}
            >
              <button type="button" onClick={() => setChildOpen(true)}>
                Open child
              </button>
              <PlayerPickerSheet
                open={childOpen}
                title="Child"
                onClose={() => {
                  childClose();
                  setChildOpen(false);
                }}
              >
                <button type="button">Child action</button>
              </PlayerPickerSheet>
            </ModalFrame>
          ) : null}
        </>
      );
    }

    await act(async () => root.render(<Harness />));
    const parentOpener = container.querySelector("button") as HTMLButtonElement;
    parentOpener.focus();
    await act(async () => parentOpener.click());
    const childOpener = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Open child"
    ) as HTMLButtonElement;
    childOpener.focus();
    await act(async () => childOpener.click());
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);

    await act(async () => dispatchKey("Escape"));
    expect(childClose).toHaveBeenCalledTimes(1);
    expect(parentClose).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.activeElement).toBe(childOpener);

    await act(async () => dispatchKey("Escape"));
    expect(parentClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(parentOpener);
  });

  it("preserves a control already focused by autoFocus", async () => {
    function Harness() {
      return (
        <ModalFrame title="Rename guest" onClose={vi.fn()}>
          <input autoFocus aria-label="Guest name" />
        </ModalFrame>
      );
    }

    await act(async () => root.render(<Harness />));

    expect(document.activeElement).toBe(
      document.querySelector('input[aria-label="Guest name"]')
    );
  });
});
