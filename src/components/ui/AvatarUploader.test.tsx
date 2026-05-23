// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import {
  AVATAR_MAX_FILE_BYTES,
  AVATAR_MAX_SOURCE_FILE_BYTES,
} from "@/lib/avatar";

const mocks = vi.hoisted(() => ({
  createCroppedAvatarFile: vi.fn(),
  loadAvatarCropImage: vi.fn(),
}));

vi.mock("react-easy-crop", async () => {
  const React = await import("react");

  function MockCropper({
    onCropComplete,
  }: {
    onCropComplete?: (
      area: { x: number; y: number; width: number; height: number },
      areaPixels: { x: number; y: number; width: number; height: number }
    ) => void;
  }) {
    React.useEffect(() => {
      queueMicrotask(() => {
        onCropComplete?.(
          { x: 0, y: 0, width: 100, height: 100 },
          { x: 12, y: 18, width: 180, height: 180 }
        );
      });
      // The real cropper settles once after mount; the mock should not
      // retrigger crop state on every rerender.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div data-testid="mock-cropper">Cropper</div>;
  }

  return {
    default: MockCropper,
  };
});

vi.mock("@/lib/avatarCrop", () => ({
  createCroppedAvatarFile: mocks.createCroppedAvatarFile,
  loadAvatarCropImage: mocks.loadAvatarCropImage,
}));

function getButtonByText(text: string) {
  return Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text
  ) as HTMLButtonElement | undefined;
}

describe("AvatarUploader", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn((value?: Blob) => `blob:${value instanceof File ? value.name : "preview"}`),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    mocks.createCroppedAvatarFile.mockResolvedValue(
      new File([new Uint8Array([9, 8, 7])], "cropped.webp", {
        type: "image/webp",
      })
    );
    mocks.loadAvatarCropImage.mockResolvedValue({
      naturalWidth: 1600,
      naturalHeight: 900,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  async function renderUploader(props?: Partial<ComponentProps<typeof AvatarUploader>>) {
    const onUpload = props?.onUpload ?? vi.fn(async () => undefined);
    const onRemove = props?.onRemove ?? vi.fn(async () => undefined);

    await act(async () => {
      root.render(
        <AvatarUploader
          name="Alex Lee"
          avatarUrl={props?.avatarUrl}
          helperText={props?.helperText}
          onPreviewAvatar={props?.onPreviewAvatar}
          previewAvatarLabel={props?.previewAvatarLabel}
          onUpload={onUpload}
          onRemove={onRemove}
        />
      );
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    return { input, onUpload, onRemove };
  }

  async function chooseFile(input: HTMLInputElement, file: File) {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });

    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
  }

  it("opens the crop modal after selecting a valid file", async () => {
    const { input } = await renderUploader();

    await chooseFile(
      input,
      new File([new Uint8Array([1, 2, 3])], "avatar.png", {
        type: "image/png",
      })
    );

    expect(document.body.textContent).toContain("Crop photo");
    expect(document.body.textContent).toContain(
      "Adjust the framing if you want to, and we will keep the photo in its original shape."
    );
  });

  it("allows an 8MB source image to reach the crop modal", async () => {
    const { input, onUpload } = await renderUploader();

    await chooseFile(
      input,
      new File([new Uint8Array(8 * 1024 * 1024)], "avatar.png", {
        type: "image/png",
      })
    );

    expect(document.body.textContent).toContain("Crop photo");
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("closes the crop modal without uploading when canceled", async () => {
    const { input, onUpload } = await renderUploader();

    await chooseFile(
      input,
      new File([new Uint8Array([1, 2, 3])], "avatar.png", {
        type: "image/png",
      })
    );

    const cancelButton = getButtonByText("Cancel");
    expect(cancelButton).toBeTruthy();

    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onUpload).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Crop photo");
  });

  it("uploads the cropped file after confirming the crop", async () => {
    const { input, onUpload } = await renderUploader();

    await chooseFile(
      input,
      new File([new Uint8Array([1, 2, 3])], "avatar.png", {
        type: "image/png",
      })
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const confirmButton = getButtonByText("Use this crop");
    expect(confirmButton).toBeTruthy();
    expect(confirmButton?.disabled).toBe(false);

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.createCroppedAvatarFile).toHaveBeenCalledTimes(1);
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onUpload).toHaveBeenCalledWith(expect.any(File));
    const uploadedFile = vi.mocked(onUpload).mock.calls[0]?.[0] as File;
    expect(uploadedFile.name).toBe("cropped.webp");
    expect(document.body.textContent).not.toContain("Crop photo");
  });

  it("still supports removing an existing avatar", async () => {
    const { onRemove } = await renderUploader({
      avatarUrl: "https://blob.vercel-storage.com/avatars/alex.webp",
    });

    const removeButton = getButtonByText("Remove photo");
    expect(removeButton).toBeTruthy();

    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("supports avatar preview without blocking other actions when enabled", async () => {
    const onPreviewAvatar = vi.fn();
    const { onRemove } = await renderUploader({
      avatarUrl: "https://blob.vercel-storage.com/avatars/alex.webp",
      onPreviewAvatar,
    });

    const previewButton = container.querySelector(
      'button[aria-label="View profile photo of Alex Lee"]'
    ) as HTMLButtonElement | null;
    expect(previewButton).toBeTruthy();

    await act(async () => {
      previewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const removeButton = getButtonByText("Remove photo");
    expect(removeButton).toBeTruthy();

    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onPreviewAvatar).toHaveBeenCalledWith(
      "https://blob.vercel-storage.com/avatars/alex.webp"
    );
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("does not render a preview trigger unless preview support is enabled", async () => {
    await renderUploader({
      avatarUrl: "https://blob.vercel-storage.com/avatars/alex.webp",
    });

    expect(
      container.querySelector('button[aria-label="View profile photo of Alex Lee"]')
    ).toBeNull();
  });

  it("does not render a preview trigger when there is no uploaded photo", async () => {
    await renderUploader({
      onPreviewAvatar: vi.fn(),
    });

    expect(
      container.querySelector('button[aria-label="View profile photo of Alex Lee"]')
    ).toBeNull();
  });

  it("rejects invalid file types before opening the crop modal", async () => {
    const { input, onUpload } = await renderUploader();

    await chooseFile(
      input,
      new File([new Uint8Array([1, 2, 3])], "avatar.gif", {
        type: "image/gif",
      })
    );

    expect(document.body.textContent).toContain(
      "Only JPG, PNG, and WebP images are supported."
    );
    expect(document.body.textContent).not.toContain("Crop photo");
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("rejects source files above 20MB before opening the crop modal", async () => {
    const { input, onUpload } = await renderUploader();

    await chooseFile(
      input,
      new File([new Uint8Array(AVATAR_MAX_SOURCE_FILE_BYTES + 1)], "avatar.png", {
        type: "image/png",
      })
    );

    expect(document.body.textContent).toContain(
      "Choose an image smaller than 20MB before cropping."
    );
    expect(document.body.textContent).not.toContain("Crop photo");
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("rejects cropped files above 4MB before upload", async () => {
    mocks.createCroppedAvatarFile.mockResolvedValueOnce(
      new File([new Uint8Array(AVATAR_MAX_FILE_BYTES + 1)], "cropped.webp", {
        type: "image/webp",
      })
    );

    const { input, onUpload } = await renderUploader();

    await chooseFile(
      input,
      new File([new Uint8Array([1, 2, 3])], "avatar.png", {
        type: "image/png",
      })
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const confirmButton = getButtonByText("Use this crop");
    expect(confirmButton).toBeTruthy();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onUpload).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "Avatar images must be 4MB or smaller after cropping."
    );
  });
});
