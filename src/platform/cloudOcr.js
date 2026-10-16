import { Box, OcrLine, OcrPage } from '../engine/model.js';
import { recognizeImage as localTesseractRecognize } from './ocr.js';

// Default free public testing keys for OCR.space
export const DEFAULT_OCRSPACE_KEY = 'K87899142388957';

/**
 * Converts any image source (File, Blob, Canvas, HTMLImageElement, or Data URL) into base64 Data URL.
 */
export async function imageSourceToDataUrl(imageSource) {
  if (typeof imageSource === 'string' && imageSource.startsWith('data:')) {
    return imageSource;
  }

  if (imageSource instanceof HTMLCanvasElement) {
    return imageSource.toDataURL('image/jpeg', 0.92);
  }

  if (imageSource instanceof Blob || imageSource instanceof File) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(imageSource);
    });
  }

  if (imageSource instanceof HTMLImageElement || imageSource instanceof HTMLVideoElement) {
    const canvas = document.createElement('canvas');
    canvas.width = imageSource.videoWidth || imageSource.naturalWidth || 1280;
    canvas.height = imageSource.videoHeight || imageSource.naturalHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageSource, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  throw new Error('Unsupported image source type');
}

/**
 * OCR.space Free API OCR extraction.
 */
export async function recognizeWithOcrSpace(imageSource, apiKey = DEFAULT_OCRSPACE_KEY) {
  const dataUrl = await imageSourceToDataUrl(imageSource);

  const keyToUse = (apiKey || '').trim() || DEFAULT_OCRSPACE_KEY;

  const formData = new URLSearchParams();
  formData.append('base64Image', dataUrl);
  formData.append('isOverlayRequired', 'true');
  formData.append('scale', 'true');
  formData.append('detectOrientation', 'true');
  formData.append('OCREngine', '2'); // OCREngine 2 is neural, optimized for signs & numbers
  formData.append('language', 'eng');

  const response = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: {
      apikey: keyToUse,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`OCR.space HTTP Error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();

  if (json.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage)
      ? json.ErrorMessage.join(', ')
      : json.ErrorMessage || 'OCR.space processing failed';
    throw new Error(msg);
  }

  const parsedResult = json.ParsedResults?.[0];
  if (!parsedResult) {
    return new OcrPage([], 1280, 720);
  }

  const lines = [];

  // Check lines overlay
  if (parsedResult.TextOverlay?.Lines && parsedResult.TextOverlay.Lines.length > 0) {
    parsedResult.TextOverlay.Lines.forEach((l, index) => {
      const text = (l.LineText || '').trim();
      if (text.length > 0) {
        let box = null;
        if (typeof l.MinTop === 'number' && typeof l.MaxHeight === 'number') {
          box = new Box(0, l.MinTop, 1000, l.MinTop + l.MaxHeight);
        }
        lines.push(new OcrLine(text, box, 0.95, index));
      }
    });
  }

  // Fallback to parsed text if lines overlay was empty
  if (lines.length === 0 && parsedResult.ParsedText) {
    const rawLines = parsedResult.ParsedText.split('\n').map((l) => l.trim()).filter(Boolean);
    rawLines.forEach((text, i) => {
      lines.push(new OcrLine(text, null, 0.95, i));
    });
  }

  return new OcrPage(lines, 1280, 720);
}

/**
 * Google Gemini 1.5 Flash Vision Free Multimodal API.
 */
export async function recognizeWithGemini(imageSource, apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Please enter your Gemini API Key in the settings below.');
  }

  const dataUrl = await imageSourceToDataUrl(imageSource);
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');

  const prompt = `You are an expert OCR and railway assistant.
Extract all visible text from this train ticket or railway station route board image.
List every single line of text clearly.
If it is a station board, include the board names, facilities (e.g. Foot Over Bridge, Waiting Room, Subway, Escalator), platform numbers (including ranges like 1-4 or PF 3), and any direction arrows (left, right, straight ahead, ->, <-).
If it is a ticket, include Train number, PNR, Platform number, coach, and seat.
Return each extracted text item on a new line.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: base64Data,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
  }

  const json = await response.json();
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const lines = rawText
    .split('\n')
    .map((l) => l.replace(/^[-*•\d.]\s*/, '').trim())
    .filter(Boolean)
    .map((text, i) => new OcrLine(text, null, 0.98, i));

  return new OcrPage(lines, 1280, 720);
}

/**
 * Master OCR function that routes to selected provider with automatic fallback.
 */
export async function performOcr(imageSource, { engine = 'ocrspace', apiKey = '' } = {}) {
  try {
    if (engine === 'gemini') {
      return await recognizeWithGemini(imageSource, apiKey);
    }
    if (engine === 'ocrspace') {
      return await recognizeWithOcrSpace(imageSource, apiKey);
    }
    return await localTesseractRecognize(imageSource);
  } catch (err) {
    console.warn(`Primary OCR (${engine}) failed, trying fallback:`, err.message);
    // If OCR.space or Gemini hit error, fallback to local Tesseract
    try {
      return await localTesseractRecognize(imageSource);
    } catch {
      throw err;
    }
  }
}
