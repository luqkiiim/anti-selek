// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./Primitives";

describe("Sheet footer", () => {
  it("keeps the footer outside the scrolling content and disables both groups while busy", () => {
    const markup = renderToStaticMarkup(<Sheet title="Joining" busy onClose={() => {}} footer={<button>Send request</button>}><input aria-label="Search" /></Sheet>);
    expect(markup).toContain('class="sheet-panel has-footer"');
    expect(markup).toMatch(/<div class="sheet-content sheet-body-scroll"><fieldset disabled="" class="sheet-body-fields">.*<\/fieldset><\/div><fieldset disabled="" class="sheet-footer">/);
    expect(markup).toContain("Send request");
  });
  it("preserves the existing sheet structure when there is no footer", () => {
    const markup = renderToStaticMarkup(<Sheet title="Other" onClose={() => {}}>Content</Sheet>);
    expect(markup).toContain('class="sheet-panel"');
    expect(markup).not.toContain("sheet-footer");
  });
});

it("dismisses a sheet without cancelling its parent profile dialog", async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.open = false; } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  const onParentCancel = vi.fn();
  try {
    await act(async () => root.render(<dialog onCancel={onParentCancel}>
      <Sheet title="Matches with Sam" onClose={onClose}>Match history</Sheet>
    </dialog>));
    const event = new Event("cancel", { bubbles: true, cancelable: true });
    await act(async () => { container.querySelector('dialog[aria-label="Matches with Sam"]')!.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onParentCancel).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    if (showModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", showModal);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    if (close) Object.defineProperty(HTMLDialogElement.prototype, "close", close);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  }
});
