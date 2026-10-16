import { createWorker } from 'tesseract.js';
import { Box, OcrLine, OcrPage } from '../engine/model.js';

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * Preprocesses an image source onto a canvas with optimal dimensions and contrast
 * for railway boards and tickets.
 */
async function preprocessToCanvas(imageSource) {
  let imgElement;

  if (imageSource instanceof HTMLCanvasElement) {
    return imageSource;
  }

  if (imageSource instanceof HTMLImageElement || imageSource instanceof HTMLVideoElement) {
    imgElement = imageSource;
  } else if (imageSource instanceof Blob || imageSource instanceof File) {
    const url = URL.createObjectURL(imageSource);
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
    imgElement = img;
  } else if (typeof imageSource === 'string') {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = imageSource;
    });
    imgElement = img;
  }

  if (!imgElement) return imageSource;

  const natWidth = imgElement.videoWidth || imgElement.naturalWidth || imgElement.width || 1280;
  const natHeight = imgElement.videoHeight || imgElement.naturalHeight || imgElement.height || 720;

  // Scale down if enormous, or maintain crisp resolution (max 1600px)
  let targetWidth = natWidth;
  let targetHeight = natHeight;
  const maxDim = 1600;

  if (targetWidth > maxDim || targetHeight > maxDim) {
    if (targetWidth > targetHeight) {
      targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
      targetWidth = maxDim;
    } else {
      targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
      targetHeight = maxDim;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  // Slight contrast boost to make railway signs and ticket text stand out
  ctx.filter = 'contrast(1.2) brightness(1.05)';
  ctx.drawImage(imgElement, 0, 0, targetWidth, targetHeight);

  return canvas;
}

/**
 * Runs OCR on an image (HTMLImageElement, HTMLCanvasElement, ImageData, Blob, or URL/DataURL).
 * Returns an OcrPage with lines, bounding boxes, and confidence.
 */
export async function recognizeImage(imageSource) {
  try {
    const worker = await getWorker();
    const processedCanvas = await preprocessToCanvas(imageSource);

    const result = await worker.recognize(processedCanvas || imageSource);
    const data = result.data;

    const imgWidth = processedCanvas?.width || 1280;
    const imgHeight = processedCanvas?.height || 720;

    const lines = [];

    // Extract lines
    if (data.lines && data.lines.length > 0) {
      data.lines.forEach((line, index) => {
        const t = (line.text || '').trim();
        if (t.length > 0) {
          const b = line.bbox;
          const box = b ? new Box(b.x0, b.y0, b.x1, b.y1) : null;
          const conf = typeof line.confidence === 'number' ? line.confidence / 100 : 0.8;
          lines.push(new OcrLine(t, box, conf, index));
        }
      });
    }

    // Fallback or augment from text blocks if lines missed some content
    if (lines.length === 0 && data.text) {
      const splitLines = data.text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      splitLines.forEach((text, i) => {
        lines.push(new OcrLine(text, null, (data.confidence || 80) / 100, i));
      });
    }

    return new OcrPage(lines, imgWidth, imgHeight);
  } catch (error) {
    console.error('OCR recognition error:', error);
    return new OcrPage([], 1280, 720);
  }
}
