"use client";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
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
}: SearchFieldProps) {
  return (
    <div className={cx("relative", className)}>
      <input
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
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-base font-semibold text-gray-500 transition hover:text-gray-700"
          aria-label="Clear search"
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}
