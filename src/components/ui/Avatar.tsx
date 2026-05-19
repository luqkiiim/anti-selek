"use client";

import { useState } from "react";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const AVATAR_SIZE_CLASSES = {
  court: "h-8 w-8 text-[11px]",
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-2xl",
  hero: "h-28 w-28 text-4xl",
} as const;

const AVATAR_APPEARANCE_CLASSES = {
  default:
    "border border-[rgba(15,118,110,0.18)] bg-[linear-gradient(145deg,#d7f4ed,#eef9f6)] text-[var(--accent-strong)] shadow-[0_4px_14px_rgba(15,118,110,0.12)]",
  court:
    "border border-[rgba(15,118,110,0.12)] bg-[linear-gradient(145deg,#ebfbf6,#f7fcfa)] text-[var(--accent-strong)] shadow-none",
} as const;

export function getAvatarInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "P";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Avatar({
  name,
  avatarUrl,
  size = "md",
  appearance = "default",
  className,
  imageClassName,
  fallbackClassName,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof AVATAR_SIZE_CLASSES;
  appearance?: keyof typeof AVATAR_APPEARANCE_CLASSES;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const shouldShowImage = !!avatarUrl && failedImageUrl !== avatarUrl;

  return (
    <span
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
        AVATAR_SIZE_CLASSES[size],
        AVATAR_APPEARANCE_CLASSES[appearance],
        className
      )}
      data-avatar-state={shouldShowImage ? "image" : "fallback"}
      data-avatar-size={size}
      data-avatar-appearance={appearance}
    >
      {shouldShowImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={avatarUrl}
          alt={`${name} avatar`}
          className={cx("h-full w-full object-cover", imageClassName)}
          onError={() => setFailedImageUrl(avatarUrl)}
        />
      ) : (
        <span className={cx("select-none", fallbackClassName)}>
          {getAvatarInitials(name)}
        </span>
      )}
    </span>
  );
}
