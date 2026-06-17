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
    expect(markup).toContain("aspect-square");
    expect(markup).toContain("rounded-full");
    expect(markup).toContain("object-cover");
  });

  it("passes through optional image loading hints", () => {
    const markup = renderToStaticMarkup(
      <Avatar
        name="Alex Lee"
        avatarUrl="https://cdn.test/avatars/alex.jpg"
        size="sm"
        imageLoading="eager"
        imageFetchPriority="high"
      />
    );

    expect(markup).toContain('loading="eager"');
    expect(markup).toContain('fetchPriority="high"');
    expect(markup).toContain('decoding="async"');
  });

  it("supports the court avatar treatment", () => {
    const markup = renderToStaticMarkup(
      <Avatar name="Alex Lee" avatarUrl={null} size="court" appearance="court" />
    );

    expect(markup).toContain('data-avatar-size="court"');
    expect(markup).toContain('data-avatar-appearance="court"');
    expect(markup).toContain("h-10 w-10 text-[13px]");
    expect(markup).toContain("sm:h-12");
    expect(markup).toContain("md:h-14");
    expect(markup).toContain("xl:h-10");
  });
});
