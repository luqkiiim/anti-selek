"use client";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import { CaretRight, X, UsersThree, type Icon } from "@phosphor-icons/react";
import {
  getHorizontalSwipeDirection,
  isSwipeProtectedTarget,
  type SwipeDirection,
} from "./gesture";

export function useHorizontalSwipe(
  onSwipe: (direction: SwipeDirection) => void,
): {
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
} {
  const start = useRef<{ x: number; y: number; pointerId: number } | null>(
    null,
  );

  return {
    onPointerDown: (event) => {
      if (
        event.pointerType === "mouse" ||
        isSwipeProtectedTarget(event.target)
      ) {
        start.current = null;
        return;
      }
      start.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      };
    },
    onPointerMove: (event) => {
      const initial = start.current;
      if (!initial || initial.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - initial.x;
      const deltaY = event.clientY - initial.y;
      if (Math.abs(deltaY) > Math.abs(deltaX) + 12) {
        start.current = null;
        return;
      }

      const direction = getHorizontalSwipeDirection(
        initial.x,
        initial.y,
        event.clientX,
        event.clientY,
      );
      if (direction) {
        start.current = null;
        event.preventDefault();
        onSwipe(direction);
      }
    },
    onPointerUp: (event) => {
      if (start.current?.pointerId === event.pointerId) start.current = null;
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}

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
      {url ? (
        <Image
          className="avatar-image"
          src={url}
          alt={name}
          width={72}
          height={72}
          unoptimized
        />
      ) : (
        name.slice(0, 1)
      )}
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
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const node = ref.current;
    node?.showModal();
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (node?.open) node.close();
    };
  }, []);
  function close() {
    if (busy || closing) return;
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(onClose, 220);
  }
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`prototype-sheet${closing ? " is-closing" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="sheet-panel">
        <header>
          <h2>{title}</h2>
          <button
            disabled={busy}
            className="icon-button"
            aria-label="Close"
            onClick={close}
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
