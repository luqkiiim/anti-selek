import { describe, expect, it } from "vitest";
import {
  buildShareAvatarUrl,
  isAllowedShareAvatarSource,
} from "./shareAvatar";

describe("share avatar helpers", () => {
  it("builds a same-origin proxy URL for share-only avatar images", () => {
    expect(
      buildShareAvatarUrl(
        "https://store.public.blob.vercel-storage.com/avatars/user-1/photo.png"
      )
    ).toBe(
      "/api/share-avatar?source=https%3A%2F%2Fstore.public.blob.vercel-storage.com%2Favatars%2Fuser-1%2Fphoto.png"
    );
    expect(buildShareAvatarUrl(null)).toBeNull();
  });

  it("allows only HTTPS Vercel Blob avatar objects", () => {
    expect(
      isAllowedShareAvatarSource(
        "https://store.public.blob.vercel-storage.com/avatars/user-1/photo.png"
      )
    ).toBe(true);
    expect(
      isAllowedShareAvatarSource(
        "https://blob.vercel-storage.com/avatars/user-1/photo.png"
      )
    ).toBe(true);
    expect(
      isAllowedShareAvatarSource(
        "https://store.public.blob.vercel-storage.com/documents/report.png"
      )
    ).toBe(false);
    expect(
      isAllowedShareAvatarSource("https://example.com/avatars/user-1/photo.png")
    ).toBe(false);
    expect(
      isAllowedShareAvatarSource(
        "http://store.public.blob.vercel-storage.com/avatars/user-1/photo.png"
      )
    ).toBe(false);
  });
});
