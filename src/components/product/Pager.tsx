"use client";
import { useImperativeHandle, useRef, type ReactNode, type Ref } from "react";
import { useScrollRestoration } from "@/components/app/useScrollRestoration";
import { useSwipePager } from "@/components/ui/useSwipePager";

export interface PagerNavigation {
  navigate: (page: string) => void;
}

export function Pager({ pages, active, onChange, children, navigationRef }: {
  pages: readonly string[];
  active: string;
  onChange: (page: string) => void;
  children: (page: string) => ReactNode;
  navigationRef?: Ref<PagerNavigation>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollToPage } = useSwipePager(ref, { pages, active, onChange });
  useImperativeHandle(navigationRef, () => ({
    navigate(page) {
      // Start the clock in the tap handler, before rendering the selected panel.
      scrollToPage(page);
      onChange(page);
    },
  }), [onChange, scrollToPage]);
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
