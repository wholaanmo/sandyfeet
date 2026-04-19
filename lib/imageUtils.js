export async function compressImage(file, options = {}) {
  const {
    maxSizeMB = 0.05,      // target max file size in MB
    maxDimension = 900,    // max width/height
    minQuality = 0.4,      // stop lowering quality below this
    qualityStep = 0.1,     // compression step
    convertPngToJpeg = true
  } = options;

  if (!(file instanceof File)) {
    throw new Error("Invalid file provided.");
  }

  const isIco =
    file.type === "image/x-icon" ||
    file.type === "image/vnd.microsoft.icon";

  if (isIco) {
    return file;
  }

  const outputType =
    convertPngToJpeg && file.type === "image/png"
      ? "image/jpeg"
      : file.type || "image/jpeg";

  const dataUrl = await readFileAsDataURL(file);
  const image = await loadImage(dataUrl);

  const { width, height } = getScaledDimensions(
    image.width,
    image.height,
    maxDimension
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context is not available.");
  }

  ctx.drawImage(image, 0, 0, width, height);

  const targetBytes = maxSizeMB * 1024 * 1024;

  let quality = 0.9;
  let bestBlob = null;

  while (quality >= minQuality) {
    const blob = await canvasToBlob(canvas, outputType, quality);

    if (!bestBlob || blob.size < bestBlob.size) {
      bestBlob = blob;
    }

    if (blob.size <= targetBytes) {
      bestBlob = blob;
      break;
    }

    quality -= qualityStep;
  }

  if (!bestBlob) {
    throw new Error("Image compression failed.");
  }

  return new File([bestBlob], replaceExtension(file.name, outputType), {
    type: outputType,
    lastModified: Date.now()
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file."));

    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image."));

    img.src = src;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to generate compressed image."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function getScaledDimensions(width, height, maxDimension) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  if (width > height) {
    return {
      width: maxDimension,
      height: Math.round((height * maxDimension) / width)
    };
  }

  return {
    width: Math.round((width * maxDimension) / height),
    height: maxDimension
  };
}

function replaceExtension(filename, mimeType) {
  const extMap = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
  };

  const newExt = extMap[mimeType] || "";
  return filename.replace(/\.[^/.]+$/, "") + newExt;
}
