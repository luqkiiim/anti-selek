"use client";

import type { LucideIcon } from "lucide-react";

export interface MobileBottomTabItem<T extends string> {
  id: T;
  label: string;
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

export function MobileBottomTabs<T extends string>({
  items,
  activeId,
  onSelect,
  ariaLabel,
  visibilityClassName = "sm:hidden",
}: MobileBottomTabsProps<T>) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label={ariaLabel}
      className={`fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-2 ${visibilityClassName}`}
    >
      <div className="mx-auto flex max-w-md items-center justify-around gap-1 rounded-2xl border border-gray-200 bg-white/95 px-2 py-2 shadow-[0_14px_34px_rgba(23,32,31,0.16)] backdrop-blur-md">
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
              className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 transition ${
                isActive
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "text-gray-500 hover:bg-blue-50 hover:text-blue-700"
              } ${item.disabled ? "cursor-not-allowed opacity-45" : ""}`}
            >
              <Icon aria-hidden="true" size={20} strokeWidth={2.15} />
              <span className="max-w-full truncate text-[10px] font-semibold">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
