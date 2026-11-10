"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { createSwipePager, type SwipePagerOptions } from "./swipePager";

export function useSwipePager(ref: RefObject<HTMLDivElement | null>, options: SwipePagerOptions) {
  const attached = useRef<{
    node: HTMLDivElement;
    controller: ReturnType<typeof createSwipePager>;
  } | null>(null);

  // Also handles pagers mounting after loading, without restarting on data refreshes.
  useLayoutEffect(() => {
    const node = ref.current;
    if (attached.current?.node !== node) {
      attached.current?.controller.destroy();
      attached.current = node ? { node, controller: createSwipePager(node, options) } : null;
    } else attached.current?.controller.sync(options);
  });

  useLayoutEffect(() => () => {
    attached.current?.controller.destroy();
    attached.current = null;
  }, []);

  const scrollToPage = useCallback((page: string, behavior: ScrollBehavior = "smooth") => {
    attached.current?.controller.scrollToPage(page, behavior);
  }, []);
  const isInteracting = useCallback(() => attached.current?.controller.isInteracting() ?? false, []);
  return { scrollToPage, isInteracting };
}
