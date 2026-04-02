"use client";

import { useRef, type RefObject } from "react";

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

  function focusInput() {
    requestAnimationFrame(() => {
      resolvedInputRef.current?.focus();
    });
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
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange("");
            focusInput();
          }}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-semibold text-gray-500 transition hover:text-gray-700"
          aria-label="Clear search"
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}
