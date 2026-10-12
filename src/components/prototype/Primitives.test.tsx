import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
