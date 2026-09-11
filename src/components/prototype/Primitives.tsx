"use client";
import Image from "next/image";
import { useEffect, useRef, type ReactNode } from "react";
import { CaretRight, X, UsersThree, type Icon } from "@phosphor-icons/react";
export function Avatar({
  name,
  url,
  large = false,
}: {
  name: string;
  url?: string | null;
  large?: boolean;
}) {
  return (
    <span className={`avatar tone0 ${large ? "large" : ""}`}>
      {url ? <Image src={url} alt={name} width={72} height={72} unoptimized /> : name.slice(0, 1)}
    </span>
  );
}
export function Row({
  title,
  sub,
  icon: Icon = UsersThree,
  onClick,
}: {
  title: string;
  sub?: string;
  icon?: Icon;
  onClick: () => void;
}) {
  return (
    <button className="link-row" onClick={onClick}>
      <Icon size={25} weight="duotone" />
      <span>
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
      </span>
      <CaretRight size={18} />
    </button>
  );
}
export function Sheet({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="prototype-sheet"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="sheet-panel">
        <header>
          <h2>{title}</h2>
          <button
            disabled={busy}
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <fieldset disabled={busy} className="sheet-content">
          {children}
        </fieldset>
      </div>
    </dialog>
  );
}
export function ErrorText({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="prototype-error">
      {error}
    </p>
  ) : null;
}
