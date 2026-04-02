"use client";

import { useEffect, type ReactNode } from "react";

type ScrollLockSnapshot = {
  bodyOverflow: string;
  bodyOverscrollBehavior: string;
  bodyPaddingRight: string;
  rootOverflow: string;
  rootOverscrollBehavior: string;
};

let activeScrollLocks = 0;
let previousScrollLockSnapshot: ScrollLockSnapshot | null = null;

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function lockDocumentScroll() {
  const body = document.body;
  const root = document.documentElement;
  const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);

  if (activeScrollLocks === 0) {
    previousScrollLockSnapshot = {
      bodyOverflow: body.style.overflow,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
      bodyPaddingRight: body.style.paddingRight,
      rootOverflow: root.style.overflow,
      rootOverscrollBehavior: root.style.overscrollBehavior,
    };

    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  activeScrollLocks += 1;

  return () => {
    activeScrollLocks = Math.max(0, activeScrollLocks - 1);

    if (activeScrollLocks !== 0 || !previousScrollLockSnapshot) {
      return;
    }

    body.style.overflow = previousScrollLockSnapshot.bodyOverflow;
    body.style.overscrollBehavior =
      previousScrollLockSnapshot.bodyOverscrollBehavior;
    body.style.paddingRight = previousScrollLockSnapshot.bodyPaddingRight;
    root.style.overflow = previousScrollLockSnapshot.rootOverflow;
    root.style.overscrollBehavior =
      previousScrollLockSnapshot.rootOverscrollBehavior;
    previousScrollLockSnapshot = null;
  };
}

interface ModalFrameProps {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  bodyScroll?: boolean;
  bodyClassName?: string;
  fullscreenUntilDesktop?: boolean;
}

export function ModalFrame({
  title,
  subtitle,
  onClose,
  children,
  footer,
  bodyScroll = true,
  bodyClassName,
  fullscreenUntilDesktop = false,
}: ModalFrameProps) {
  useEffect(() => {
    return lockDocumentScroll();
  }, []);

  return (
    <div
      className={cx(
        "app-modal-backdrop",
        fullscreenUntilDesktop && "app-modal-backdrop-fullscreen-tablet"
      )}
    >
      <div
        className={cx(
          "app-modal-frame",
          fullscreenUntilDesktop && "app-modal-frame-fullscreen-tablet"
        )}
      >
        <div className="border-b border-gray-100 px-4 py-4 sm:px-5">
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
        <div
          className={cx(
            bodyScroll
              ? "app-modal-scroll-region"
              : "flex-1 min-h-0 overflow-hidden",
            bodyClassName
          )}
        >
          {children}
        </div>
        {footer ? (
          <div className="border-t border-gray-100 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
