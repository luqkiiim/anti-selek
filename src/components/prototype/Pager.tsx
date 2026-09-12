"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { swipeSettings } from "./swipeSettings";

/** Horizontal movement is controlled; vertical scrolling stays native. */
export function Pager({ pages, active, onChange, children }: {
  pages: readonly string[];
  active: string;
  onChange: (page: string) => void;
  children: (page: string) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const swipeSelection = useRef<string | null>(null);
  const frame = useRef<number>(0);
  const callback = useRef(onChange);
  const activeRef = useRef(active);
  useEffect(() => { callback.current = onChange; activeRef.current = active; }, [onChange, active]);
  const pagesKey = pages.join("|");
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (swipeSelection.current === active) {
      swipeSelection.current = null;
      return;
    }
    cancelAnimationFrame(frame.current);
    // Preserve the original browser-native transition for tab taps.
    node.scrollTo({ left: Math.max(0, pagesKey.split("|").indexOf(active)) * node.clientWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [active, pagesKey]);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const names = pagesKey.split("|");
    let gesture: { id: number; x: number; y: number; offset: number; horizontal: boolean; lastX: number; time: number; velocity: number } | null = null;
    let suppressClick = false;
    const settle = (index: number) => {
      cancelAnimationFrame(frame.current);
      const from = node.scrollLeft;
      const to = index * node.clientWidth;
      const started = performance.now();
      const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : swipeSettings.settleDurationMs;
      const step = (now: number) => {
        const progress = duration ? Math.min(1, (now - started) / duration) : 1;
        node.scrollTo({ left: from + (to - from) * (1 - Math.pow(1 - progress, 3)), behavior: "instant" });
        if (progress < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
      if (names[index] !== activeRef.current) {
        swipeSelection.current = names[index];
        activeRef.current = names[index];
        callback.current(names[index]);
      }
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      if ((event.target as Element).closest("input, select, textarea, [role=slider]")) return;
      suppressClick = false;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY,
        offset: -node.scrollLeft,
        horizontal: false, lastX: event.clientX, time: event.timeStamp, velocity: 0 };
    };
    const move = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (!gesture.horizontal) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < swipeSettings.directionLockPx) return;
        if (Math.abs(dy) >= Math.abs(dx)) { gesture = null; return; }
        gesture.horizontal = true;
        suppressClick = true;
        node.setPointerCapture(event.pointerId);
        cancelAnimationFrame(frame.current);
        node.scrollTo({ left: node.scrollLeft, behavior: "instant" });
      }
      gesture.velocity = (event.clientX - gesture.lastX) / Math.max(1, event.timeStamp - gesture.time);
      gesture.lastX = event.clientX;
      gesture.time = event.timeStamp;
      const offset = Math.max(-(names.length - 1) * node.clientWidth, Math.min(0, gesture.offset + dx));
      node.scrollTo({ left: -offset, behavior: "instant" });
    };
    const finish = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const current = gesture;
      gesture = null;
      if (!current.horizontal) return;
      const dx = event.clientX - current.x;
      const start = Math.round(-current.offset / node.clientWidth);
      const flick = event.timeStamp - current.time < swipeSettings.flickMaxAgeMs && Math.abs(current.velocity) > swipeSettings.flickVelocityPxPerMs && Math.abs(dx) > swipeSettings.flickMinDistancePx;
      const direction = flick ? -Math.sign(current.velocity) : -Math.sign(dx);
      const advance = event.type !== "pointercancel" && (Math.abs(dx) > node.clientWidth * swipeSettings.distanceThreshold || flick);
      settle(Math.max(0, Math.min(names.length - 1, start + (advance ? direction : 0))));
      if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    };
    const click = (event: MouseEvent) => {
      if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
    };
    const resize = new ResizeObserver(() => {
      gesture = null;
      cancelAnimationFrame(frame.current);
      node.scrollTo({ left: Math.max(0, names.indexOf(activeRef.current)) * node.clientWidth, behavior: "instant" });
    });
    resize.observe(node);
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", finish);
    node.addEventListener("pointercancel", finish);
    node.addEventListener("click", click, true);
    return () => {
      cancelAnimationFrame(frame.current);
      resize.disconnect();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", finish);
      node.removeEventListener("pointercancel", finish);
      node.removeEventListener("click", click, true);
    };
  }, [pagesKey]);
  return <div className="page-pager" ref={ref}><div className="pager-track">{pages.map(page => (
    <div className="pager-page" key={page} inert={page !== active} aria-hidden={page !== active}>
      <main className="pc-content">{children(page)}</main>
    </div>
  ))}</div></div>;
}
