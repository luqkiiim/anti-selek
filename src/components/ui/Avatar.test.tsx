import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar } from "@/components/ui/Avatar";

describe("Avatar", () => {
  it("renders initials when there is no image", () => {
    const markup = renderToStaticMarkup(
      <Avatar name="Alex Lee" avatarUrl={null} size="sm" />
    );

    expect(markup).toContain("AL");
    expect(markup).toContain('data-avatar-state="fallback"');
  });

  it("renders an img when avatarUrl exists", () => {
    const markup = renderToStaticMarkup(
      <Avatar
        name="Alex Lee"
        avatarUrl="https://cdn.test/avatars/alex.jpg"
        size="sm"
      />
    );

    expect(markup).toContain('<img');
    expect(markup).toContain('src="https://cdn.test/avatars/alex.jpg"');
    expect(markup).toContain('data-avatar-state="image"');
  });

  it("supports the court avatar treatment", () => {
    const markup = renderToStaticMarkup(
      <Avatar name="Alex Lee" avatarUrl={null} size="court" appearance="court" />
    );

    expect(markup).toContain('data-avatar-size="court"');
    expect(markup).toContain('data-avatar-appearance="court"');
  });
});
