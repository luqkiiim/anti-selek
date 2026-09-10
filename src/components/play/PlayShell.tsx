"use client";
import Image from "next/image";
import Link from "next/link";
import {
  House,
  CalendarBlank,
  UserCircle,
  CaretRight,
  ArrowLeft,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
export function PlayShell({
  children,
  header,
  clubId,
  active,
  backHref,
  title,
}: {
  children: ReactNode;
  header?: ReactNode;
  clubId?: string;
  active?: "club" | "sessions" | "profile";
  backHref?: string;
  title?: string;
}) {
  return (
    <div className="pc-app">
      <header className="pc-header">
        {header ?? (
          <>
            <Link
              href={backHref ?? "/?choose=1"}
              className="icon-button"
              aria-label="Back"
            >
              <ArrowLeft size={23} />
            </Link>
            <div>
              <strong>{title}</strong>
            </div>
            <span className="icon-button" aria-hidden="true" />
          </>
        )}
      </header>
      <main className="pc-content">{children}</main>
      {clubId && (
        <nav className="bottom-nav" aria-label="Main navigation">
          {(
            [
              { key: "club", label: "Club", icon: House, tab: "overview" },
              {
                key: "sessions",
                label: "Sessions",
                icon: CalendarBlank,
                tab: "tournaments",
              },
              {
                key: "profile",
                label: "Profile",
                icon: UserCircle,
                tab: "profile",
              },
            ] as const
          ).map(({ key, label, icon: Icon, tab }) => (
            <Link
              key={key}
              href={`/club/${clubId}?tab=${tab}`}
              className={active === key ? "active" : ""}
              aria-current={active === key ? "page" : undefined}
            >
              <Icon size={25} weight={active === key ? "fill" : "regular"} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
export function PlayRow({
  title,
  sub,
  icon,
  href,
  onClick,
}: {
  title: string;
  sub?: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      {icon}
      <span>
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
      </span>
      <CaretRight size={19} />
    </>
  );
  return href ? (
    <Link href={href} className="link-row">
      {content}
    </Link>
  ) : (
    <button type="button" className="link-row" onClick={onClick}>
      {content}
    </button>
  );
}
export function PlayAvatar({
  name,
  url,
}: {
  name: string;
  url?: string | null;
}) {
  return (
    <span className="avatar tone0">
      {url ? (
        <Image
          src={url}
          alt=""
          width={64}
          height={64}
          unoptimized
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            objectFit: "cover",
          }}
        />
      ) : (
        name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0])
          .join("")
      )}
    </span>
  );
}
