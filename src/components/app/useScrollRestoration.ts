"use client";
import { useLayoutEffect, type RefObject } from "react";

export function useScrollRestoration(ref: RefObject<HTMLElement | null>, key: string) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const storageKey = `anti-selek:scroll:${key}`;
    let desired = 0;
    try { desired = Number(sessionStorage.getItem(storageKey)) || 0; } catch {}
    let restoring = desired > 0;
    const restore = () => {
      if (!restoring) return;
      node.scrollTop = desired;
      if (node.scrollHeight - node.clientHeight >= desired) restoring = false;
    };
    const save = () => {
      if (restoring) return;
      try { sessionStorage.setItem(storageKey, String(node.scrollTop)); } catch {}
    };
    const interact = () => { restoring = false; };
    restore();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(restore);
    if (node.firstElementChild) observer?.observe(node.firstElementChild);
    node.addEventListener("scroll", save, { passive: true });
    node.addEventListener("pointerdown", interact, { passive: true });
    node.addEventListener("keydown", interact);
    return () => { save(); observer?.disconnect(); node.removeEventListener("scroll", save); node.removeEventListener("pointerdown", interact); node.removeEventListener("keydown", interact); };
  }, [ref, key]);
}
