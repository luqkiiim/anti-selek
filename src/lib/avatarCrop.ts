export const AVATAR_CROP_OUTPUT_SIZE = 512;

export interface AvatarCropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

type SupportedAvatarMimeType = "image/jpeg" | "image/png" | "image/webp";

const MIME_EXTENSION_MAP: Record<SupportedAvatarMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function normalizeAvatarOutputType(type: string): SupportedAvatarMimeType {
  if (
    type === "image/jpeg" ||
    type === "image/png" ||
    type === "image/webp"
  ) {
    return type;
  }

  return "image/png";
}

function replaceFileExtension(fileName: string, nextExtension: string) {
  const trimmedName = fileName.trim();
  const baseName =
    trimmedName.length > 0
      ? trimmedName.replace(/\.[^./\\]+$/, "")
      : "avatar";

  return `${baseName}.${nextExtension}`;
}

export async function loadAvatarCropImage(src: string) {
  const image = new Image();
  image.decoding = "async";

  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load the selected image."));
  });

  image.src = src;
  return loaded;
}

export async function createCroppedAvatarFile({
  src,
  crop,
  fileName,
  mimeType,
  outputSize = AVATAR_CROP_OUTPUT_SIZE,
  imageLoader = loadAvatarCropImage,
  createCanvas = () => document.createElement("canvas"),
}: {
  src: string;
  crop: AvatarCropArea;
  fileName: string;
  mimeType: string;
  outputSize?: number;
  imageLoader?: (src: string) => Promise<CanvasImageSource>;
  createCanvas?: () => HTMLCanvasElement;
}) {
  const normalizedType = normalizeAvatarOutputType(mimeType);
  const extension = MIME_EXTENSION_MAP[normalizedType];
  const image = await imageLoader(src);
  const canvas = createCanvas();
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Image cropping is not supported in this browser.");
  }

  canvas.width = outputSize;
  canvas.height = outputSize;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, outputSize, outputSize);
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outputSize,
    outputSize
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
          return;
        }

        reject(new Error("Failed to prepare the cropped avatar."));
      },
      normalizedType,
      normalizedType === "image/png" ? undefined : 0.92
    );
  });

  return new File([blob], replaceFileExtension(fileName, extension), {
    type: normalizedType,
    lastModified: Date.now(),
  });
}
