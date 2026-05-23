import { describe, expect, it, vi } from "vitest";
import {
  AVATAR_CROP_OUTPUT_SIZE,
  createCroppedAvatarFile,
} from "@/lib/avatarCrop";

describe("avatar crop utility", () => {
  it("renders a cropped square avatar file as webp by default", async () => {
    const drawImage = vi.fn();
    const clearRect = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback, type?: string) => {
      callback(new Blob(["avatar"], { type }));
    });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        clearRect,
        drawImage,
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
      })),
      toBlob,
    } as unknown as HTMLCanvasElement;
    const fakeImage = {} as CanvasImageSource;

    const file = await createCroppedAvatarFile({
      src: "blob:avatar",
      crop: { x: 16, y: 24, width: 220, height: 220 },
      fileName: "profile.png",
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
    expect(toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/webp",
      0.86
    );
    expect(file.name).toBe("profile.webp");
    expect(file.type).toBe("image/webp");
  });

  it("falls back to jpeg when webp export is unavailable", async () => {
    const toBlob = vi
      .fn()
      .mockImplementationOnce((callback: BlobCallback) => {
        callback(null);
      })
      .mockImplementationOnce((callback: BlobCallback, type?: string) => {
        callback(new Blob(["avatar"], { type }));
      });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
      })),
      toBlob,
    } as unknown as HTMLCanvasElement;

    const file = await createCroppedAvatarFile({
      src: "blob:avatar",
      crop: { x: 0, y: 0, width: 100, height: 100 },
      fileName: "profile.png",
      imageLoader: async () => ({} as CanvasImageSource),
      createCanvas: () => canvas,
    });

    expect(toBlob).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      "image/webp",
      0.86
    );
    expect(toBlob).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      "image/jpeg",
      0.86
    );
    expect(file.name).toBe("profile.jpg");
    expect(file.type).toBe("image/jpeg");
  });
});
