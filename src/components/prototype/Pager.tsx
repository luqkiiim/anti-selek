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
  useEffect(() => { callback.current = onChange; activeRef.current = active; }, [onChange, active]);
  const pagesKey = pages.join("|");
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const index = pagesKey.split("|").indexOf(active);
    node.scrollTo({ left: Math.max(0, index) * node.clientWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [active, pagesKey]);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const names = pagesKey.split("|");
    let timer: ReturnType<typeof setTimeout>;
    let touching = false;
    const settle = () => {
      if (touching) return;
      const next = names[Math.round(node.scrollLeft / node.clientWidth)];
      if (next && next !== activeRef.current) callback.current(next);
    };
    const scroll = () => { clearTimeout(timer); timer = setTimeout(settle, 150); };
    const down = () => { touching = true; };
    const up = () => { touching = false; scroll(); };
    const resize = new ResizeObserver(() => {
      node.scrollTo({ left: Math.max(0, names.indexOf(activeRef.current)) * node.clientWidth, behavior: "instant" });
    });
    resize.observe(node);
    node.addEventListener("scroll", scroll, { passive: true });
    node.addEventListener("touchstart", down, { passive: true });
    node.addEventListener("touchend", up, { passive: true });
    node.addEventListener("touchcancel", up, { passive: true });
    return () => { clearTimeout(timer); resize.disconnect(); node.removeEventListener("scroll", scroll); node.removeEventListener("touchstart", down); node.removeEventListener("touchend", up); node.removeEventListener("touchcancel", up); };
  }, [pagesKey]);
  return <div className="page-pager" ref={ref}>{pages.map(page => (
    <div className="pager-page" key={page} inert={page !== active} aria-hidden={page !== active}>
      <main className="pc-content">{children(page)}</main>
    </div>
  ))}</div>;
}
