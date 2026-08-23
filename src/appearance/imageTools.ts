const MAX_BACKGROUND_WIDTH = 1920;
const MAX_BACKGROUND_HEIGHT = 1080;

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The selected image could not be decoded."));
    image.src = url;
  });
}

export async function prepareBackgroundImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a PNG, JPEG or WebP image.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(
      1,
      MAX_BACKGROUND_WIDTH / image.naturalWidth,
      MAX_BACKGROUND_HEIGHT / image.naturalHeight,
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this webview.");

    context.drawImage(image, 0, 0, width, height);
    return {
      dataUrl: canvas.toDataURL("image/webp", 0.84),
      name: file.name,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
