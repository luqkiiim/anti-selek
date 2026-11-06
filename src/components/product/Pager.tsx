"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useScrollRestoration } from "@/components/app/useScrollRestoration";

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
  const programmaticTarget = useRef<number | null>(null);
  useEffect(() => { callback.current = onChange; activeRef.current = active; }, [onChange, active]);
  const pagesKey = pages.join("|");
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const index = pagesKey.split("|").indexOf(active);
    programmaticTarget.current = Math.max(0, index) * node.clientWidth;
    node.scrollTo({ left: programmaticTarget.current,
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
      if (programmaticTarget.current !== null) {
        if (Math.abs(node.scrollLeft - programmaticTarget.current) < 2) programmaticTarget.current = null;
        return;
      }
      const next = names[Math.round(node.scrollLeft / node.clientWidth)];
      if (next && next !== activeRef.current) callback.current(next);
    };
    const scroll = () => { clearTimeout(timer); timer = setTimeout(settle, 150); };
    const down = () => { touching = true; programmaticTarget.current = null; };
    const up = () => { touching = false; scroll(); };
    const resize = new ResizeObserver(() => {
      programmaticTarget.current = Math.max(0, names.indexOf(activeRef.current)) * node.clientWidth;
      node.scrollTo({ left: programmaticTarget.current, behavior: "instant" });
    });
    resize.observe(node);
    node.addEventListener("scroll", scroll, { passive: true });
    node.addEventListener("touchstart", down, { passive: true });
    node.addEventListener("touchend", up, { passive: true });
    node.addEventListener("touchcancel", up, { passive: true });
    return () => { clearTimeout(timer); resize.disconnect(); node.removeEventListener("scroll", scroll); node.removeEventListener("touchstart", down); node.removeEventListener("touchend", up); node.removeEventListener("touchcancel", up); };
  }, [pagesKey]);
  return <div className="page-pager" ref={ref}>{pages.map(page => (
    <PagerPage key={page} page={page} active={page === active}>
      <main className={`pc-content pc-content--${page}`}>{children(page)}</main>
    </PagerPage>
  ))}</div>;
}

function PagerPage({ page, active, children }: { page: string; active: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = typeof location === "undefined" ? page : `${location.pathname}#${page}`;
  useScrollRestoration(ref, key);
  return <div ref={ref} className="pager-page" inert={!active} aria-hidden={!active}>{children}</div>;
}
