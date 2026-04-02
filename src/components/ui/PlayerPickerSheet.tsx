"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type PickerSheetLockSnapshot = {
  bodyOverflow: string;
  bodyOverscrollBehavior: string;
  bodyPaddingRight: string;
  rootOverflow: string;
  rootOverscrollBehavior: string;
  playerPickerOpenFlag: string | undefined;
};

let activePickerSheetLocks = 0;
let previousPickerSheetLockSnapshot: PickerSheetLockSnapshot | null = null;

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function lockPickerSheetDocument() {
  const body = document.body;
  const root = document.documentElement;
  const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);

  if (activePickerSheetLocks === 0) {
    previousPickerSheetLockSnapshot = {
      bodyOverflow: body.style.overflow,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
      bodyPaddingRight: body.style.paddingRight,
      rootOverflow: root.style.overflow,
      rootOverscrollBehavior: root.style.overscrollBehavior,
      playerPickerOpenFlag: body.dataset.playerPickerOpen,
    };

    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.dataset.playerPickerOpen = "true";

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  activePickerSheetLocks += 1;

  return () => {
    activePickerSheetLocks = Math.max(0, activePickerSheetLocks - 1);

    if (activePickerSheetLocks !== 0 || !previousPickerSheetLockSnapshot) {
      return;
    }

    body.style.overflow = previousPickerSheetLockSnapshot.bodyOverflow;
    body.style.overscrollBehavior =
      previousPickerSheetLockSnapshot.bodyOverscrollBehavior;
    body.style.paddingRight = previousPickerSheetLockSnapshot.bodyPaddingRight;
    root.style.overflow = previousPickerSheetLockSnapshot.rootOverflow;
    root.style.overscrollBehavior =
      previousPickerSheetLockSnapshot.rootOverscrollBehavior;

    if (previousPickerSheetLockSnapshot.playerPickerOpenFlag === undefined) {
      delete body.dataset.playerPickerOpen;
    } else {
      body.dataset.playerPickerOpen =
        previousPickerSheetLockSnapshot.playerPickerOpenFlag;
    }

    previousPickerSheetLockSnapshot = null;
  };
}

interface PlayerPickerSheetProps {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  toolbar?: ReactNode;
  children: ReactNode;
  bottomContent?: ReactNode;
  footer?: ReactNode;
  panelClassName?: string;
}

export function PlayerPickerSheet({
  open,
  title,
  subtitle,
  onClose,
  toolbar,
  children,
  bottomContent,
  footer,
  panelClassName,
}: PlayerPickerSheetProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const releaseScrollLock = lockPickerSheetDocument();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      releaseScrollLock();
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-[rgba(7,20,35,0.52)] backdrop-blur-md">
      <div className="flex h-full w-full items-stretch justify-center lg:p-4">
        <section
          role="dialog"
          aria-modal="true"
          className={cx(
            "flex h-full min-h-0 w-full flex-col bg-[var(--surface-strong)] shadow-[0_24px_72px_rgba(7,20,35,0.24)] lg:h-auto lg:max-h-[min(92vh,92dvh)] lg:max-w-[40rem] lg:rounded-[28px] lg:border lg:border-[color:var(--line)]",
            panelClassName
          )}
        >
          <div className="shrink-0 border-b border-gray-100 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-5 sm:pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                {subtitle ? (
                  <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-lg font-semibold text-gray-500 transition hover:text-gray-700"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
          </div>

          {toolbar ? (
            <div className="shrink-0 border-b border-gray-100 px-4 py-4 sm:px-5">
              {toolbar}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-5 [touch-action:pan-y]">
            {children}
          </div>

          {bottomContent ? (
            <div className="shrink-0 border-t border-gray-100 px-4 py-4 sm:px-5">
              {bottomContent}
            </div>
          ) : null}

          {footer ? (
            <div className="shrink-0 border-t border-gray-100 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-4">
              {footer}
            </div>
          ) : null}
        </section>
      </div>
    </div>,
    document.body
  );
}
