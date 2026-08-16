"use client";

import { useRef, type RefObject } from "react";
import { X } from "lucide-react";

interface SearchFieldProps {
  ariaLabel: string;
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
  ariaLabel,
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

  function focusInput() {
    resolvedInputRef.current?.focus();
    requestAnimationFrame(() => {
      resolvedInputRef.current?.focus();
    });
  }

  return (
    <div className={cx("relative", className)}>
      <input
        ref={resolvedInputRef}
        type="text"
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cx("field w-full px-3 py-2.5 pr-12 text-sm", inputClassName)}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            focusInput();
          }}
          className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition hover:text-[var(--accent-strong)]"
          aria-label={`Clear ${ariaLabel.toLowerCase()}`}
        >
          <X aria-hidden="true" size={16} strokeWidth={2.2} />
        </button>
      ) : null}
    </div>
  );
}
