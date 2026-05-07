"use client";

import { useRef, type RefObject } from "react";
import { X } from "lucide-react";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function SearchField({
  value,
  onChange,
  placeholder = "Search...",
  className,
  inputClassName,
  autoFocus = false,
  inputRef,
}: SearchFieldProps) {
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const resolvedInputRef = inputRef ?? fallbackInputRef;
  const shouldRestoreFocusRef = useRef(false);

  function focusInput() {
    resolvedInputRef.current?.focus();
    requestAnimationFrame(() => {
      resolvedInputRef.current?.focus();
    });
  }

  function captureFocusIntent() {
    shouldRestoreFocusRef.current = document.activeElement === resolvedInputRef.current;
  }

  function restoreFocusIfNeeded() {
    const shouldRestoreFocus = shouldRestoreFocusRef.current;
    shouldRestoreFocusRef.current = false;

    if (!shouldRestoreFocus) {
      return;
    }

    focusInput();
  }

  return (
    <div className={cx("relative", className)}>
      <input
        ref={resolvedInputRef}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cx("field w-full px-3 py-2.5 pr-12 text-sm", inputClassName)}
      />
      {value ? (
        <button
          type="button"
          onPointerDownCapture={captureFocusIntent}
          onMouseDownCapture={captureFocusIntent}
          onClick={() => {
            onChange("");
            restoreFocusIfNeeded();
          }}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition hover:text-[var(--accent-strong)]"
          aria-label="Clear search"
        >
          <X aria-hidden="true" size={16} strokeWidth={2.2} />
        </button>
      ) : null}
    </div>
  );
}
