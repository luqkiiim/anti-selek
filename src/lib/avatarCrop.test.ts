import { describe, expect, it, vi } from "vitest";
import {
  AVATAR_CROP_OUTPUT_SIZE,
  createCroppedAvatarFile,
} from "@/lib/avatarCrop";

describe("avatar crop utility", () => {
  it("renders a cropped square avatar file at the expected output size", async () => {
    const drawImage = vi.fn();
    const clearRect = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        clearRect,
        drawImage,
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
      })),
      toBlob: vi.fn((callback: BlobCallback, type?: string) => {
        callback(new Blob(["avatar"], { type }));
      }),
    } as unknown as HTMLCanvasElement;
    const fakeImage = {} as CanvasImageSource;

    const file = await createCroppedAvatarFile({
      src: "blob:avatar",
      crop: { x: 16, y: 24, width: 220, height: 220 },
      fileName: "profile.png",
      mimeType: "image/webp",
      imageLoader: async () => fakeImage,
      createCanvas: () => canvas,
    });

    expect(canvas.width).toBe(AVATAR_CROP_OUTPUT_SIZE);
    expect(canvas.height).toBe(AVATAR_CROP_OUTPUT_SIZE);
    expect(clearRect).toHaveBeenCalledWith(
      0,
      0,
      AVATAR_CROP_OUTPUT_SIZE,
      AVATAR_CROP_OUTPUT_SIZE
    );
    expect(drawImage).toHaveBeenCalledWith(
      fakeImage,
      16,
      24,
      220,
      220,
      0,
      0,
      AVATAR_CROP_OUTPUT_SIZE,
      AVATAR_CROP_OUTPUT_SIZE
    );
    expect(file.name).toBe("profile.webp");
    expect(file.type).toBe("image/webp");
  });
});
