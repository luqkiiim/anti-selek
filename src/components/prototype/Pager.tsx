"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Horizontal movement is controlled; vertical scrolling stays native. */
export function Pager({ pages, active, onChange, children }: {
  pages: readonly string[];
  active: string;
  onChange: (page: string) => void;
  children: (page: string) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const callback = useRef(onChange);
  const activeRef = useRef(active);
  useEffect(() => { callback.current = onChange; activeRef.current = active; }, [onChange, active]);
  const pagesKey = pages.join("|");
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "none" : "transform 220ms cubic-bezier(.22, 1, .36, 1)";
    track.style.transform = `translate3d(${-Math.max(0, pagesKey.split("|").indexOf(active)) * 100}%, 0, 0)`;
  }, [active, pagesKey]);
  useEffect(() => {
    const node = ref.current;
    const track = trackRef.current;
    if (!node || !track) return;
    const names = pagesKey.split("|");
    let gesture: { id: number; x: number; y: number; offset: number; horizontal: boolean; lastX: number; time: number; velocity: number } | null = null;
    let suppressClick = false;
    const settle = (index: number) => {
      track.style.transition = matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "none" : "transform 220ms cubic-bezier(.22, 1, .36, 1)";
      track.style.transform = `translate3d(${-index * 100}%, 0, 0)`;
      if (names[index] !== activeRef.current) {
        activeRef.current = names[index];
        callback.current(names[index]);
      }
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      if ((event.target as Element).closest("input, select, textarea, [role=slider]")) return;
      suppressClick = false;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY,
        offset: new DOMMatrixReadOnly(getComputedStyle(track).transform).m41,
        horizontal: false, lastX: event.clientX, time: event.timeStamp, velocity: 0 };
    };
    const move = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (!gesture.horizontal) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
        if (Math.abs(dy) >= Math.abs(dx)) { gesture = null; return; }
        gesture.horizontal = true;
        suppressClick = true;
        node.setPointerCapture(event.pointerId);
        track.style.transition = "none";
      }
      gesture.velocity = (event.clientX - gesture.lastX) / Math.max(1, event.timeStamp - gesture.time);
      gesture.lastX = event.clientX;
      gesture.time = event.timeStamp;
      const offset = Math.max(-(names.length - 1) * node.clientWidth, Math.min(0, gesture.offset + dx));
      track.style.transform = `translate3d(${offset}px, 0, 0)`;
    };
    const finish = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const current = gesture;
      gesture = null;
      if (!current.horizontal) return;
      const dx = event.clientX - current.x;
      const start = Math.round(-current.offset / node.clientWidth);
      const flick = event.timeStamp - current.time < 100 && Math.abs(current.velocity) > .45 && Math.abs(dx) > 24;
      const direction = flick ? -Math.sign(current.velocity) : -Math.sign(dx);
      const advance = event.type !== "pointercancel" && (Math.abs(dx) > node.clientWidth * .25 || flick);
      settle(Math.max(0, Math.min(names.length - 1, start + (advance ? direction : 0))));
      if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    };
    const click = (event: MouseEvent) => {
      if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
    };
    const resize = new ResizeObserver(() => {
      gesture = null;
      track.style.transition = "none";
      track.style.transform = `translate3d(${-Math.max(0, names.indexOf(activeRef.current)) * 100}%, 0, 0)`;
    });
    resize.observe(node);
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", finish);
    node.addEventListener("pointercancel", finish);
    node.addEventListener("click", click, true);
    return () => {
      resize.disconnect();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", finish);
      node.removeEventListener("pointercancel", finish);
      node.removeEventListener("click", click, true);
    };
  }, [pagesKey]);
  return <div className="page-pager" ref={ref}><div className="pager-track" ref={trackRef}>{pages.map(page => (
    <div className="pager-page" key={page} inert={page !== active} aria-hidden={page !== active}>
      <main className="pc-content">{children(page)}</main>
    </div>
  ))}</div></div>;
}
