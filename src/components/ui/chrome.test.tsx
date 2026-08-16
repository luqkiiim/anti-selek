import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlashMessage } from "./chrome";

describe("FlashMessage", () => {
  it("announces errors assertively and preserves native div props", () => {
    const markup = renderToStaticMarkup(
      <FlashMessage tone="error" id="club-error" data-testid="feedback">
        Unable to join
      </FlashMessage>
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-live="assertive"');
    expect(markup).toContain('aria-atomic="true"');
    expect(markup).toContain('id="club-error"');
    expect(markup).toContain('data-testid="feedback"');
  });

  it("announces success and warning feedback politely", () => {
    const successMarkup = renderToStaticMarkup(
      <FlashMessage tone="success">Saved</FlashMessage>
    );
    const warningMarkup = renderToStaticMarkup(
      <FlashMessage tone="warning">Check this</FlashMessage>
    );

    expect(successMarkup).toContain('role="status"');
    expect(successMarkup).toContain('aria-live="polite"');
    expect(warningMarkup).toContain('role="status"');
    expect(warningMarkup).toContain('aria-live="polite"');
  });
});
