export const SWIPE_SETTLE_MS = 220;

export interface SwipePagerOptions {
  pages: readonly string[];
  active: string;
  onChange: (page: string) => void;
  disabled?: boolean;
  disabledMedia?: string;
}

type Sample = { x: number; time: number };
type Gesture = {
  pointerId: number;
  x: number;
  y: number;
  left: number;
  index: number;
  horizontal: boolean;
  samples: Sample[];
};

/** Own horizontal touch movement so browser momentum cannot prolong settling. */
export function createSwipePager(node: HTMLDivElement, initial: SwipePagerOptions) {
  let options = initial;
  let selected = initial.active;
  let width = node.clientWidth;
  let gesture: Gesture | null = null;
  let frame: number | null = null;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressClick = false;
  let deferredSelection = false;
  const media = initial.disabledMedia ? matchMedia(initial.disabledMedia) : null;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const enabled = () => !options.disabled && !media?.matches && options.pages.length > 1;
  const clamp = (index: number) => Math.max(0, Math.min(options.pages.length - 1, index));
  const selectedIndex = () => Math.max(0, options.pages.indexOf(selected));

  function stopAnimation() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    clearTimeout(scrollTimer);
  }

  function align(index: number, animate: boolean) {
    stopAnimation();
    const from = node.scrollLeft;
    const target = index * width;
    node.dataset.swipeMoving = "true";
    const finish = () => {
      node.scrollLeft = target;
      frame = null;
      delete node.dataset.swipeMoving;
    };
    if (!animate || reducedMotion.matches || Math.abs(from - target) < 1) {
      finish();
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - start) / SWIPE_SETTLE_MS));
      node.scrollLeft = from + (target - from) * (1 - (1 - progress) ** 3);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else finish();
    };
    frame = requestAnimationFrame(tick);
  }

  function go(index: number, animate: boolean, notify: boolean) {
    const next = options.pages[clamp(index)];
    if (!next) return;
    const changed = selected !== next;
    selected = next;
    align(clamp(index), animate);
    if (notify && changed) options.onChange(next);
  }

  function releaseCapture(pointerId: number) {
    if (node.hasPointerCapture?.(pointerId)) node.releasePointerCapture(pointerId);
  }

  function resumeSelection() {
    if (Math.abs(node.scrollLeft - selectedIndex() * width) < 1) {
      // Even assigning the same scrollLeft can interrupt a native vertical pan.
      stopAnimation();
      delete node.dataset.swipeMoving;
    } else align(selectedIndex(), true);
  }

  function cancelGesture(deferResume = false) {
    const previous = gesture;
    gesture = null;
    if (previous?.horizontal) {
      suppressClick = true;
      go(previous.index, true, true);
    } else if (deferResume && Math.abs(node.scrollLeft - selectedIndex() * width) >= 1) {
      // A vertical pan may interrupt the last pixels of a horizontal animation.
      // Wait for touch release before resuming, so native panning can take over.
      deferredSelection = true;
    } else resumeSelection();
    if (previous) releaseCapture(previous.pointerId);
  }

  function down(event: PointerEvent) {
    suppressClick = false;
    if (gesture && !event.isPrimary) {
      cancelGesture();
      return;
    }
    if (!enabled() || !event.isPrimary || !["touch", "pen"].includes(event.pointerType)) return;
    if (event.target instanceof Element && event.target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"], [data-swipe-ignore]',
    )) return;
    stopAnimation();
    deferredSelection = false;
    gesture = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      left: node.scrollLeft, index: width > 0 ? clamp(Math.round(node.scrollLeft / width)) : 0,
      horizontal: false, samples: [{ x: event.clientX, time: performance.now() }],
    };
  }

  function sample(current: Gesture, x: number) {
    const time = performance.now();
    current.samples = current.samples.filter((point) => time - point.time <= 80);
    current.samples.push({ x, time });
  }

  function move(event: PointerEvent) {
    const current = gesture;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.horizontal) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dx) <= Math.abs(dy) * 1.25) {
        cancelGesture(true);
        return;
      }
      current.horizontal = true;
      node.dataset.swipeMoving = "true";
      node.setPointerCapture?.(event.pointerId);
    }
    if (event.cancelable) event.preventDefault();
    sample(current, event.clientX);
    node.scrollLeft = Math.max(clamp(current.index - 1) * width,
      Math.min(clamp(current.index + 1) * width, current.left - dx));
  }

  function up(event: PointerEvent) {
    const current = gesture;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture = null;
    if (!current.horizontal) {
      resumeSelection();
      return;
    }
    suppressClick = true;
    sample(current, event.clientX);
    const first = current.samples[0];
    const last = current.samples[current.samples.length - 1];
    const velocity = last.time > first.time ? (first.x - last.x) / (last.time - first.time) : 0;
    const delta = current.x - event.clientX;
    const flick = Math.abs(delta) >= 24 && Math.abs(velocity) > 0.45;
    const advance = flick || Math.abs(delta) >= Math.max(32, width * 0.16);
    go(current.index + (advance ? Math.sign(flick ? velocity : delta) : 0), true, true);
    releaseCapture(current.pointerId);
  }

  function cancelled(event: PointerEvent) {
    if (gesture?.pointerId === event.pointerId) cancelGesture(!gesture.horizontal);
  }

  function touchReleased(event: TouchEvent) {
    if (event.touches.length === 0 && deferredSelection) {
      deferredSelection = false;
      align(selectedIndex(), true);
    }
  }

  function lostCapture(event: PointerEvent) {
    // Taking capture from a touched child emits a bubbling loss on that child.
    // Only losing the pager's own capture interrupts the drag.
    if (event.target === node) cancelled(event);
  }

  function click(event: MouseEvent) {
    if (suppressClick && event.detail !== 0) {
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function settleNativeScroll() {
    clearTimeout(scrollTimer);
    if (!enabled() || gesture || frame !== null || width <= 0) return;
    const index = clamp(Math.round(node.scrollLeft / width));
    if (index !== selectedIndex() || Math.abs(node.scrollLeft - index * width) >= 1) go(index, true, true);
  }

  function scroll() {
    if (gesture || frame !== null || !enabled()) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(settleNativeScroll, 80);
  }

  function wheel(event: WheelEvent) {
    if (event.deltaX && frame !== null) {
      stopAnimation();
      delete node.dataset.swipeMoving;
    }
  }

  function clearGesture() {
    deferredSelection = false;
    const previous = gesture;
    gesture = null;
    if (previous) releaseCapture(previous.pointerId);
  }

  function syncEnabled() {
    stopAnimation();
    clearGesture();
    delete node.dataset.swipeMoving;
    if (enabled()) node.dataset.swipePager = "true";
    else delete node.dataset.swipePager;
    width = node.clientWidth;
    if (!media?.matches) align(selectedIndex(), false);
  }

  const resize = new ResizeObserver(() => {
    if (Math.abs(node.clientWidth - width) < 0.5) return;
    width = node.clientWidth;
    clearGesture();
    if (!media?.matches) align(selectedIndex(), false);
  });
  resize.observe(node);
  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move, { passive: false });
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", cancelled);
  node.addEventListener("lostpointercapture", lostCapture);
  node.addEventListener("touchend", touchReleased, { passive: true });
  node.addEventListener("touchcancel", touchReleased, { passive: true });
  node.addEventListener("click", click, true);
  node.addEventListener("scroll", scroll, { passive: true });
  node.addEventListener("scrollend", settleNativeScroll);
  node.addEventListener("wheel", wheel, { passive: true });
  media?.addEventListener("change", syncEnabled);
  reducedMotion.addEventListener("change", syncEnabled);
  syncEnabled();

  return {
    sync(next: SwipePagerOptions) {
      const pagesChanged = next.pages.length !== options.pages.length ||
        next.pages.some((page, index) => page !== options.pages[index]);
      const activeChanged = next.active !== options.active;
      const disabledChanged = next.disabled !== options.disabled;
      options = next;
      if (pagesChanged) {
        selected = options.pages.includes(next.active) ? next.active : options.pages[0] ?? "";
        syncEnabled();
      } else if (disabledChanged) {
        if (activeChanged) selected = next.active;
        syncEnabled();
      } else if (activeChanged && next.active !== selected) {
        clearGesture();
        selected = next.active;
        if (enabled()) align(selectedIndex(), true);
      }
    },
    scrollToPage(page: string, behavior: ScrollBehavior = "smooth") {
      const index = options.pages.indexOf(page);
      if (index < 0) return;
      if (selected === page && (frame !== null || gesture || deferredSelection)) return;
      clearGesture();
      selected = page;
      if (enabled()) align(index, behavior === "smooth");
    },
    isInteracting: () => gesture !== null || frame !== null || deferredSelection,
    destroy() {
      stopAnimation();
      clearGesture();
      resize.disconnect();
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancelled);
      node.removeEventListener("lostpointercapture", lostCapture);
      node.removeEventListener("touchend", touchReleased);
      node.removeEventListener("touchcancel", touchReleased);
      node.removeEventListener("click", click, true);
      node.removeEventListener("scroll", scroll);
      node.removeEventListener("scrollend", settleNativeScroll);
      node.removeEventListener("wheel", wheel);
      media?.removeEventListener("change", syncEnabled);
      reducedMotion.removeEventListener("change", syncEnabled);
      delete node.dataset.swipeMoving;
      delete node.dataset.swipePager;
    },
  };
}
