// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSwipePager, type SwipePagerOptions } from "./swipePager";

const pages = ["Players", "Courts", "Standings"];
let node: HTMLDivElement;
let width: number;
let resize: () => void;
let controller: ReturnType<typeof createSwipePager>;
let onChange: ReturnType<typeof vi.fn<(page: string) => void>>;
let options: SwipePagerOptions;
let reducedMotion: boolean;
let wide: boolean;
let mediaChanged: () => void;

function pointer(type: string, x: number, y = 30, target: Element = node, extra = {}) {
  const event = new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", isPrimary: true,
    clientX: x, clientY: y, ...extra,
  });
  target.dispatchEvent(event);
  return event;
}

function mount(overrides: Partial<SwipePagerOptions> = {}) {
  controller?.destroy();
  options = { pages, active: "Courts", onChange, ...overrides };
  controller = createSwipePager(node, options);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  reducedMotion = false;
  wide = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() { return query.includes("reduced-motion") ? reducedMotion : wide; },
    addEventListener: (_: string, callback: () => void) => { mediaChanged = callback; },
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  node = document.createElement("div");
  width = 390;
  Object.defineProperty(node, "clientWidth", { get: () => width });
  node.setPointerCapture = vi.fn();
  node.hasPointerCapture = vi.fn(() => false);
  node.innerHTML = '<button>Score</button><input /><div data-swipe-ignore>Chart</div>';
  document.body.append(node);
  onChange = vi.fn();
  mount();
});

afterEach(() => {
  controller.destroy();
  node.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("swipe pager", () => {
  it("follows the finger and finishes within 240 ms without a second settling phase", () => {
    expect(node.scrollLeft).toBe(390);
    pointer("pointerdown", 300);
    pointer("pointermove", 200);
    expect(node.scrollLeft).toBe(490);
    expect(node.dataset.swipeMoving).toBe("true");
    pointer("pointerup", 200);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("Standings");
    vi.advanceTimersByTime(112);
    expect(node.scrollLeft).toBeGreaterThan(490);
    expect(node.scrollLeft).toBeLessThan(780);
    vi.advanceTimersByTime(128);
    expect(node.scrollLeft).toBe(780);
    expect(node.dataset.swipeMoving).toBeUndefined();
    node.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(500);
    expect(node.scrollLeft).toBe(780);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("caps both the drag and destination to one adjacent tab", () => {
    mount({ active: "Players" });
    pointer("pointerdown", 350);
    pointer("pointermove", -900);
    expect(node.scrollLeft).toBe(390);
    pointer("pointerup", -900);
    vi.advanceTimersByTime(240);
    expect(node.scrollLeft).toBe(390);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("Courts");
  });

  it("returns a short swipe and advances a short fast flick", () => {
    pointer("pointerdown", 200);
    pointer("pointermove", 180);
    pointer("pointerup", 180);
    vi.advanceTimersByTime(240);
    expect(node.scrollLeft).toBe(390);
    expect(onChange).not.toHaveBeenCalled();
    pointer("pointerdown", 200);
    vi.advanceTimersByTime(32);
    pointer("pointermove", 170);
    pointer("pointerup", 170);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("Standings");
  });

  it("does not treat a swipe held still before release as a fast flick", () => {
    pointer("pointerdown", 200);
    vi.advanceTimersByTime(16);
    pointer("pointermove", 170);
    vi.advanceTimersByTime(150);
    pointer("pointerup", 170);
    vi.advanceTimersByTime(240);
    expect(node.scrollLeft).toBe(390);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([[190, 160], [145, 120]])("leaves vertical and diagonal gestures native (%s, %s)", (x, y) => {
    pointer("pointerdown", 200);
    expect(pointer("pointermove", x, y).defaultPrevented).toBe(false);
    pointer("pointerup", x, y);
    vi.advanceTimersByTime(240);
    expect(node.scrollLeft).toBe(390);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not write scrollLeft or disable snapping during a native vertical pan", () => {
    const write = vi.fn();
    Object.defineProperty(node, "scrollLeft", { get: () => 390, set: write, configurable: true });
    pointer("pointerdown", 200);
    expect(node.dataset.swipeMoving).toBeUndefined();
    pointer("pointermove", 198, 100);
    pointer("pointercancel", 198, 100);
    pointer("pointerup", 198, 100);
    expect(write).not.toHaveBeenCalled();
    expect(node.dataset.swipeMoving).toBeUndefined();
  });

  it("defers an interrupted horizontal finish until a native vertical touch ends", () => {
    controller.scrollToPage("Standings");
    vi.advanceTimersByTime(32);
    pointer("pointerdown", 200);
    const position = node.scrollLeft;
    pointer("pointermove", 198, 100);
    pointer("pointercancel", 198, 100);
    vi.advanceTimersByTime(240);
    expect(node.scrollLeft).toBe(position);
    node.dispatchEvent(new TouchEvent("touchend", { touches: [] }));
    vi.advanceTimersByTime(240);
    expect(node.scrollLeft).toBe(780);
  });

  it.each(["input", "[data-swipe-ignore]"])("protects %s interactions", (selector) => {
    const target = node.querySelector(selector)!;
    pointer("pointerdown", 300, 30, target);
    pointer("pointermove", 100, 30, target);
    pointer("pointerup", 100, 30, target);
    expect(node.scrollLeft).toBe(390);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("suppresses the click after dragging a button but allows the next intentional tap", () => {
    const button = node.querySelector("button")!;
    const clicked = vi.fn();
    button.addEventListener("click", clicked);
    pointer("pointerdown", 300, 30, button);
    pointer("pointermove", 200, 30, button);
    pointer("pointerup", 200, 30, button);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(clicked).not.toHaveBeenCalled();
    pointer("pointerdown", 200, 30, button);
    pointer("pointerup", 200, 30, button);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("clamps at the edge and returns cancelled drags to the starting tab", () => {
    mount({ active: "Players" });
    pointer("pointerdown", 100);
    pointer("pointermove", 300);
    pointer("pointerup", 300);
    expect(node.scrollLeft).toBe(0);
    pointer("pointerdown", 300);
    pointer("pointermove", 100);
    pointer("pointercancel", 100);
    vi.advanceTimersByTime(240);
    expect(node.scrollLeft).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores a child's capture loss when the pager takes over a real touch", () => {
    const child = node.querySelector("button")!;
    pointer("pointerdown", 300, 30, child);
    pointer("pointermove", 260, 30, child);
    pointer("lostpointercapture", 260, 30, child);
    pointer("pointermove", 200);
    expect(node.scrollLeft).toBe(490);
    pointer("pointerup", 200);
    vi.advanceTimersByTime(240);
    expect(node.scrollLeft).toBe(780);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("Standings");
  });

  it("returns to the starting tab when the pager itself loses capture", () => {
    pointer("pointerdown", 300);
    pointer("pointermove", 200);
    pointer("lostpointercapture", 200);
    vi.advanceTimersByTime(240);
    expect(node.scrollLeft).toBe(390);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not restart an animation on state updates or content-height changes", () => {
    pointer("pointerdown", 300);
    pointer("pointermove", 200);
    pointer("pointerup", 200);
    vi.advanceTimersByTime(112);
    controller.sync({ ...options, active: "Standings", pages: [...pages] });
    resize();
    controller.scrollToPage("Standings", "auto");
    vi.advanceTimersByTime(128);
    expect(node.scrollLeft).toBe(780);
    expect(controller.isInteracting()).toBe(false);
  });

  it("lets a tab tap redirect an in-flight animation from its current position", () => {
    controller.sync({ ...options, active: "Standings" });
    vi.advanceTimersByTime(80);
    const position = node.scrollLeft;
    controller.sync({ ...options, active: "Players" });
    expect(node.scrollLeft).toBe(position);
    vi.advanceTimersByTime(240);
    expect(node.scrollLeft).toBe(0);
  });

  it("lets a new drag interrupt from the visible position", () => {
    controller.scrollToPage("Standings");
    vi.advanceTimersByTime(32);
    const position = node.scrollLeft;
    pointer("pointerdown", 100);
    pointer("pointermove", 200);
    expect(node.scrollLeft).toBe(position - 100);
    pointer("pointerup", 200);
    vi.advanceTimersByTime(240);
    expect(node.scrollLeft).toBe(0);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("Players");
  });

  it("realigns instantly on width and page-list changes", () => {
    controller.scrollToPage("Standings");
    width = 700;
    resize();
    expect(node.scrollLeft).toBe(1400);
    expect(controller.isInteracting()).toBe(false);
    controller.sync({ ...options, pages: ["Players", "Results"], active: "Results" });
    expect(node.scrollLeft).toBe(700);
    controller.sync({ ...options, pages: ["Players"], active: "Players" });
    expect(node.scrollLeft).toBe(0);
  });

  it("respects reduced motion, modal disabling, and desktop layout changes", () => {
    reducedMotion = true;
    controller.scrollToPage("Standings");
    expect(node.scrollLeft).toBe(780);
    controller.sync({ ...options, active: "Standings", disabled: true });
    pointer("pointerdown", 100);
    pointer("pointermove", 300);
    pointer("pointerup", 300);
    expect(node.scrollLeft).toBe(780);
    mount({ disabledMedia: "(min-width: 80rem)" });
    wide = true;
    mediaChanged();
    expect(node.dataset.swipePager).toBeUndefined();
  });

  it("synchronizes native scrolling without requiring scrollend support", () => {
    node.scrollLeft = 780;
    node.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(80);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("Standings");
  });

  it("cancels scheduled work and removes listeners when destroyed", () => {
    controller.scrollToPage("Standings");
    controller.destroy();
    const position = node.scrollLeft;
    vi.advanceTimersByTime(1000);
    pointer("pointerdown", 300);
    pointer("pointermove", 100);
    expect(node.scrollLeft).toBe(position);
    expect(node.dataset.swipePager).toBeUndefined();
  });
});
