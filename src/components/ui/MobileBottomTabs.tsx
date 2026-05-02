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
      className={`fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 ${visibilityClassName}`}
    >
      <div className="mx-auto flex max-w-md items-center justify-around gap-1 rounded-[1.75rem] border border-white/70 bg-white/[0.92] px-2 py-2 shadow-[0_18px_48px_rgba(7,20,35,0.2)] backdrop-blur-xl">
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
              className={`flex h-12 w-12 items-center justify-center rounded-2xl transition ${
                isActive
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-500 hover:bg-blue-50 hover:text-blue-700"
              } ${item.disabled ? "cursor-not-allowed opacity-45" : ""}`}
            >
              <Icon aria-hidden="true" size={23} strokeWidth={2.25} />
              <span className="sr-only">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
