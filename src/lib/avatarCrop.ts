export const AVATAR_CROP_OUTPUT_SIZE = 512;
const AVATAR_CROP_OUTPUT_QUALITY = 0.86;

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

const AVATAR_CROP_OUTPUT_TYPES: readonly SupportedAvatarMimeType[] = [
  "image/webp",
  "image/jpeg",
  "image/png",
];

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
  outputSize = AVATAR_CROP_OUTPUT_SIZE,
  imageLoader = loadAvatarCropImage,
  createCanvas = () => document.createElement("canvas"),
}: {
  src: string;
  crop: AvatarCropArea;
  fileName: string;
  outputSize?: number;
  imageLoader?: (src: string) => Promise<CanvasImageSource>;
  createCanvas?: () => HTMLCanvasElement;
}) {
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

  let blob: Blob | null = null;
  let outputType: SupportedAvatarMimeType | null = null;

  for (const nextOutputType of AVATAR_CROP_OUTPUT_TYPES) {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (result) => {
          resolve(result);
        },
        nextOutputType,
        nextOutputType === "image/png" ? undefined : AVATAR_CROP_OUTPUT_QUALITY
      );
    });

    if (blob) {
      outputType = nextOutputType;
      break;
    }
  }

  if (!blob || !outputType) {
    throw new Error("Failed to prepare the cropped avatar.");
  }

  return new File(
    [blob],
    replaceFileExtension(fileName, MIME_EXTENSION_MAP[outputType]),
    {
      type: outputType,
      lastModified: Date.now(),
    }
  );
}
