import Link from "next/link";
import type { ReactNode } from "react";

export { ModalFrame } from "./ModalFrame";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function FlashMessage({
  tone,
  children,
  className,
}: {
  tone: "success" | "error" | "warning";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "app-alert text-sm font-semibold",
        tone === "success" && "app-alert-success",
        tone === "error" && "app-alert-error",
        tone === "warning" && "app-alert-warning",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cx(
        "app-stat-card p-5",
        accent &&
          "bg-[linear-gradient(160deg,rgba(228,241,255,0.98),rgba(223,245,234,0.92)_55%,rgba(255,255,255,0.92))]"
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold leading-none text-gray-900">{value}</p>
      {detail ? <p className="mt-2 text-sm text-gray-600">{detail}</p> : null}
    </div>
  );
}

export function SectionCard({
  eyebrow,
  eyebrowClassName,
  title,
  description,
  action,
  children,
  className,
}: {
  eyebrow?: string;
  eyebrowClassName?: string;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const hasHeaderContent = Boolean(eyebrow) || Boolean(title) || Boolean(description);

  return (
    <section className={cx("app-panel p-5 sm:p-6", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        {hasHeaderContent ? (
          <div className="space-y-2">
            {eyebrow ? <p className={cx("app-eyebrow", eyebrowClassName)}>{eyebrow}</p> : null}
            {title || description ? (
              <div>
                {title ? <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">{title}</h2> : null}
                {description ? <p className="mt-2 text-sm text-gray-600">{description}</p> : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div />
        )}
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  detail,
  action,
  className,
}: {
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("app-empty px-5 py-9 text-center", className)}>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      {detail ? <p className="mt-2 text-sm text-gray-600">{detail}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function HeroCard({
  eyebrow,
  title,
  description,
  actions,
  actionsPosition = "side",
  backHref,
  onBack,
  backLabel = "Back",
  meta,
}: {
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  actionsPosition?: "side" | "below";
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
  meta?: ReactNode;
}) {
  const hasHeadingContent = Boolean(title) || Boolean(description);
  const showActionsBelow = actionsPosition === "below" && !!actions;
  const showActionsSide = actionsPosition === "side" && !!actions;

  return (
    <section className="app-panel relative overflow-hidden px-5 py-6 sm:px-6">
      <div className="pointer-events-none absolute inset-y-0 right-[-5rem] top-[-2rem] w-64 rounded-full bg-[radial-gradient(circle,_rgba(22,119,242,0.16),_transparent_65%)] blur-2xl" />
      <div className="pointer-events-none absolute bottom-[-4rem] left-[-2rem] h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(25,154,97,0.12),_transparent_68%)] blur-2xl" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {onBack ? (
              <button type="button" onClick={onBack} className="app-button-secondary px-4 py-2">
                {backLabel}
              </button>
            ) : backHref ? (
              <Link href={backHref} className="app-button-secondary px-4 py-2">
                {backLabel}
              </Link>
            ) : null}
            {eyebrow ? <p className="app-eyebrow">{eyebrow}</p> : null}
            {meta}
          </div>
          {hasHeadingContent ? (
            <div>
              {title ? <h1 className="app-title text-gray-900">{title}</h1> : null}
              {description ? (
                <p className="mt-3 max-w-3xl text-sm text-gray-600 sm:text-base">{description}</p>
              ) : null}
            </div>
          ) : null}
          {showActionsBelow ? actions : null}
        </div>
        {showActionsSide ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
