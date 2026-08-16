"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

const dialogStack: Array<{ id: symbol }> = [];

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(
    (element) =>
      !element.hidden && element.getAttribute("aria-hidden") !== "true"
  );
}

interface DialogFocusManagementOptions {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}

/**
 * Keeps keyboard focus inside the topmost dialog and restores focus to its
 * opener. The shared stack prevents nested dialogs from both handling a key.
 */
export function useDialogFocusManagement({
  open,
  containerRef,
  initialFocusRef,
  onClose,
}: DialogFocusManagementOptions) {
  const closeDialog = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open) {
      return;
    }

    const id = Symbol("dialog");
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogStack.push({ id });

    const container = containerRef.current;
    const requestedInitialFocus = initialFocusRef?.current;
    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const initialFocus =
      requestedInitialFocus && container?.contains(requestedInitialFocus)
        ? requestedInitialFocus
        : activeElement && container?.contains(activeElement)
          ? activeElement
        : container
          ? getFocusableElements(container)[0] ?? container
          : null;
    initialFocus?.focus();

    function isTopmost() {
      return dialogStack.at(-1)?.id === id;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!isTopmost()) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const currentContainer = containerRef.current;
      if (!currentContainer) {
        return;
      }

      const focusable = getFocusableElements(currentContainer);
      if (focusable.length === 0) {
        event.preventDefault();
        currentContainer.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !currentContainer.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !currentContainer.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const index = dialogStack.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        dialogStack.splice(index, 1);
      }
      if (opener?.isConnected) {
        opener.focus();
      }
    };
  }, [containerRef, initialFocusRef, open]);
}
