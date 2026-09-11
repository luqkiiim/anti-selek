"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Native scrolling keeps adjacent pages under the finger and preserves vertical scrolling. */
export function Pager({ pages, active, onChange, children }: {
  pages: readonly string[];
  active: string;
  onChange: (page: string) => void;
  children: (page: string) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onChange);
  const activeRef = useRef(active);
  const swipeSelection = useRef<string | null>(null);
  const navigationTarget = useRef<number | null>(null);
  useEffect(() => { callback.current = onChange; activeRef.current = active; }, [onChange, active]);
  const pagesKey = pages.join("|");
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (swipeSelection.current === active) {
      swipeSelection.current = null;
      return;
    }
    const index = pagesKey.split("|").indexOf(active);
    navigationTarget.current = Math.abs(node.scrollLeft - Math.max(0, index) * node.clientWidth) > 1
      ? Math.max(0, index) : null;
    node.scrollTo({ left: Math.max(0, index) * node.clientWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [active, pagesKey]);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const names = pagesKey.split("|");
    const selectVisiblePage = () => {
      if (!node.clientWidth) return;
      const position = node.scrollLeft / node.clientWidth;
      // Tab taps can cross several pages; keep their destination selected.
      if (navigationTarget.current !== null) {
        if (Math.abs(position - navigationTarget.current) > 0.01) return;
        navigationTarget.current = null;
      }
      const next = names[Math.round(position)];
      if (next && next !== activeRef.current) {
        activeRef.current = next;
        swipeSelection.current = next;
        callback.current(next);
      }
    };
    const down = () => { navigationTarget.current = null; selectVisiblePage(); };
    const resize = new ResizeObserver(() => {
      node.scrollTo({ left: Math.max(0, names.indexOf(activeRef.current)) * node.clientWidth, behavior: "instant" });
    });
    resize.observe(node);
    node.addEventListener("scroll", selectVisiblePage, { passive: true });
    node.addEventListener("touchstart", down, { passive: true });
    node.addEventListener("scrollend", selectVisiblePage, { passive: true });
    return () => { resize.disconnect(); node.removeEventListener("scroll", selectVisiblePage); node.removeEventListener("touchstart", down); node.removeEventListener("scrollend", selectVisiblePage); };
  }, [pagesKey]);
  return <div className="page-pager" ref={ref}>{pages.map(page => (
    <div className="pager-page" key={page} inert={page !== active} aria-hidden={page !== active}>
      <main className="pc-content">{children(page)}</main>
    </div>
  ))}</div>;
}
