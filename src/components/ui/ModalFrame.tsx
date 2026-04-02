"use client";

import { useEffect, useRef, type ReactNode } from "react";

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
  const frameRef = useRef<HTMLDivElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  useEffect(() => {
    return lockDocumentScroll();
  }, []);

  useEffect(() => {
    function getAllowedScrollContainer(target: EventTarget | null) {
      if (!(target instanceof Element) || !frameRef.current) {
        return null;
      }

      const scrollContainer = target.closest(".app-modal-scroll-region");

      if (!(scrollContainer instanceof HTMLElement)) {
        return null;
      }

      if (!frameRef.current.contains(scrollContainer)) {
        return null;
      }

      return scrollContainer;
    }

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) {
        touchStartYRef.current = null;
        return;
      }

      touchStartYRef.current = event.touches[0]?.clientY ?? null;
    }

    function handleTouchMove(event: TouchEvent) {
      if (event.touches.length !== 1) {
        return;
      }

      const frame = frameRef.current;
      const target = event.target;

      if (!frame || !(target instanceof Node) || !frame.contains(target)) {
        event.preventDefault();
        return;
      }

      const scrollContainer = getAllowedScrollContainer(target);

      if (!scrollContainer) {
        event.preventDefault();
        return;
      }

      const currentTouchY = event.touches[0]?.clientY ?? 0;
      const previousTouchY = touchStartYRef.current ?? currentTouchY;
      const deltaY = currentTouchY - previousTouchY;
      touchStartYRef.current = currentTouchY;

      if (scrollContainer.scrollHeight <= scrollContainer.clientHeight + 1) {
        event.preventDefault();
        return;
      }

      const atTop = scrollContainer.scrollTop <= 0;
      const atBottom =
        scrollContainer.scrollTop + scrollContainer.clientHeight >=
        scrollContainer.scrollHeight - 1;

      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        event.preventDefault();
      }
    }

    function resetTouchTracking() {
      touchStartYRef.current = null;
    }

    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
      capture: true,
    });
    document.addEventListener("touchmove", handleTouchMove, {
      passive: false,
      capture: true,
    });
    document.addEventListener("touchend", resetTouchTracking, {
      passive: true,
      capture: true,
    });
    document.addEventListener("touchcancel", resetTouchTracking, {
      passive: true,
      capture: true,
    });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart, true);
      document.removeEventListener("touchmove", handleTouchMove, true);
      document.removeEventListener("touchend", resetTouchTracking, true);
      document.removeEventListener("touchcancel", resetTouchTracking, true);
    };
  }, []);

  return (
    <div
      className={cx(
        "app-modal-backdrop",
        fullscreenUntilDesktop && "app-modal-backdrop-fullscreen-tablet"
      )}
    >
      <div
        ref={frameRef}
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
