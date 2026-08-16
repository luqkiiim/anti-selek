// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SearchField } from "./SearchField";

describe("SearchField", () => {
  it("uses a durable input label and a 44px clear target", () => {
    const markup = renderToStaticMarkup(
      <SearchField
        ariaLabel="Search players"
        value="alex"
        onChange={vi.fn()}
      />
    );

    expect(markup).toContain('aria-label="Search players"');
    expect(markup).toContain('aria-label="Clear search players"');
    expect(markup).toContain("h-11 w-11");
  });

  it("restores input focus after the clear action removes its button", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    function Harness() {
      const [value, setValue] = useState("alex");
      return (
        <SearchField
          ariaLabel="Search players"
          value={value}
          onChange={setValue}
        />
      );
    }

    await act(async () => root.render(<Harness />));
    const clearButton = container.querySelector("button") as HTMLButtonElement;
    clearButton.focus();
    await act(async () => clearButton.click());

    expect(document.activeElement).toBe(container.querySelector("input"));
    await act(async () => root.unmount());
    container.remove();
  });
});
