"use client";

import { useEffect, type ReactNode } from "react";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
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
    const body = document.body;
    const root = document.documentElement;
    const scrollY = window.scrollY;
    const previousBody = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    const previousRootOverflow = root.style.overflow;

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    root.style.overflow = "hidden";

    return () => {
      body.style.position = previousBody.position;
      body.style.top = previousBody.top;
      body.style.left = previousBody.left;
      body.style.right = previousBody.right;
      body.style.width = previousBody.width;
      body.style.overflow = previousBody.overflow;
      root.style.overflow = previousRootOverflow;
      window.scrollTo(0, scrollY);
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
