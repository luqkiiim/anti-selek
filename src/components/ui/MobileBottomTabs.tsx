"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

export interface MobileBottomTabItem<T extends string> {
  id: T;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  disabled?: boolean;
}

interface MobileBottomTabsProps<T extends string> {
  items: Array<MobileBottomTabItem<T>>;
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel: string;
  visibilityClassName?: string;
}

function subscribeToClientPortal(onStoreChange: () => void) {
  let active = true;

  queueMicrotask(() => {
    if (active) {
      onStoreChange();
    }
  });

  return () => {
    active = false;
  };
}

function getClientPortalSnapshot() {
  return true;
}

function getServerPortalSnapshot() {
  return false;
}

export function MobileBottomTabs<T extends string>({
  items,
  activeId,
  onSelect,
  ariaLabel,
  visibilityClassName = "sm:hidden",
}: MobileBottomTabsProps<T>) {
  const canUsePortal = useSyncExternalStore(
    subscribeToClientPortal,
    getClientPortalSnapshot,
    getServerPortalSnapshot
  );

  if (items.length === 0) {
    return null;
  }

  const nav = (
    <nav
      aria-label={ariaLabel}
      className={`fixed inset-x-0 bottom-0 z-40 transform-gpu rounded-t-2xl border-t border-gray-200 bg-white/95 px-3 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-12px_28px_rgba(23,32,31,0.12)] backdrop-blur-md will-change-transform ${visibilityClassName}`}
    >
      <div className="mx-auto flex max-w-md items-center justify-around gap-1 px-2 py-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeId === item.id;

          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              title={item.label}
              disabled={item.disabled}
              onClick={() => onSelect(item.id)}
              className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 transition ${
                isActive
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              } ${item.disabled ? "cursor-not-allowed opacity-45" : ""}`}
            >
              <Icon aria-hidden="true" size={20} strokeWidth={2.15} />
              <span className="max-w-full truncate text-[10px] font-semibold">
                {item.shortLabel ?? item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );

  return canUsePortal ? createPortal(nav, document.body) : nav;
}
