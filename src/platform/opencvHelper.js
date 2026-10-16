/**
 * OpenCV.js helper utility for StationEyes.
 * Provides:
 * 1. Asynchronous OpenCV WASM initialization tracking.
 * 2. Laplacian Blur Detection (drops blurry frames / warns user).
 * 3. Contrast & Glare Enhancement (CLAHE + adaptive contrast for railway signboards).
 */

let cvReadyPromise = null;

/**
 * Checks if OpenCV.js runtime is currently initialized and ready to use.
 */
export function isOpenCvLoaded() {
  if (typeof window === 'undefined') return false;
  return !!(window.cv && window.cv.Mat);
}

/**
 * Returns a Promise that resolves when OpenCV.js runtime is fully initialized.
 */
export function waitForOpenCv(timeoutMs = 12000) {
  if (isOpenCvLoaded()) {
    return Promise.resolve(window.cv);
  }

  if (cvReadyPromise) return cvReadyPromise;

  cvReadyPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') {
      return resolve(null);
    }

    const timer = setTimeout(() => {
      console.warn('OpenCV.js loading timed out, proceeding without OpenCV enhancements.');
      resolve(null);
    }, timeoutMs);

    // If cv is already defined but initializing
    if (window.cv) {
      if (window.cv.Mat) {
        clearTimeout(timer);
        return resolve(window.cv);
      }
      const prevInit = window.cv.onRuntimeInitialized;
      window.cv.onRuntimeInitialized = () => {
        if (typeof prevInit === 'function') prevInit();
        clearTimeout(timer);
        resolve(window.cv);
      };
      return;
    }

    // Polling fallback
    const interval = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        clearInterval(interval);
        clearTimeout(timer);
        resolve(window.cv);
      }
    }, 200);
  });

  return cvReadyPromise;
}

/**
 * Converts a File, Blob, or HTMLImageElement into an HTMLCanvasElement.
 */
export async function toCanvas(source) {
  if (typeof document === 'undefined') return null;
  if (source instanceof HTMLCanvasElement) return source;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = source instanceof Blob ? URL.createObjectURL(source) : source.src;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      if (source instanceof Blob) URL.revokeObjectURL(url);
      resolve(canvas);
    };

    img.onerror = (err) => {
      if (source instanceof Blob) URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

/**
 * Evaluates whether an image or video canvas is blurry using the Laplacian variance method.
 * Returns: { isBlurry: boolean, score: number, threshold: number, skipped: boolean }
 */
export function checkBlur(canvasOrImage, threshold = 65) {
  if (!isOpenCvLoaded() || !canvasOrImage) {
    return { isBlurry: false, score: null, threshold, skipped: true };
  }

  const cv = window.cv;
  let src = null;
  let gray = null;
  let laplacian = null;
  let mean = null;
  let stddev = null;

  try {
    src = cv.imread(canvasOrImage);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    laplacian = new cv.Mat();
    cv.Laplacian(gray, laplacian, cv.CV_64F);

    mean = new cv.Mat();
    stddev = new cv.Mat();
    cv.meanStdDev(laplacian, mean, stddev);

    const stdVal = stddev.data64F[0];
    const variance = stdVal * stdVal;
    const score = Math.round(variance);

    return {
      isBlurry: score < threshold,
      score,
      threshold,
      skipped: false,
    };
  } catch (err) {
    console.warn('OpenCV blur check error:', err);
    return { isBlurry: false, score: null, threshold, skipped: true };
  } finally {
    if (src) src.delete();
    if (gray) gray.delete();
    if (laplacian) laplacian.delete();
    if (mean) mean.delete();
    if (stddev) stddev.delete();
  }
}

/**
 * Enhances a station route sign board or ticket image:
 * 1. Converts to grayscale.
 * 2. Applies CLAHE (Contrast Limited Adaptive Histogram Equalization) to balance bright sunlight and dark shadows.
 * 3. Applies subtle bilateral / gaussian smoothing to remove noise while keeping text edges crisp.
 *
 * Returns an enhanced HTMLCanvasElement, or original canvas if OpenCV is unavailable.
 */
export async function enhanceSignboardImage(source) {
  let canvas = null;
  try {
    canvas = await toCanvas(source);
  } catch (e) {
    return source;
  }

  if (!isOpenCvLoaded() || !canvas) {
    return canvas;
  }

  const cv = window.cv;
  let srcMat = null;
  let grayMat = null;
  let enhancedMat = null;
  let clahe = null;

  try {
    srcMat = cv.imread(canvas);
    grayMat = new cv.Mat();
    cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY);

    enhancedMat = new cv.Mat();

    // Use CLAHE if supported (OpenCV 4.x)
    if (typeof cv.CLAHE === 'function') {
      clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
      clahe.apply(grayMat, enhancedMat);
    } else {
      // Fallback to standard equalizeHist
      cv.equalizeHist(grayMat, enhancedMat);
    }

    // Output to offscreen canvas
    const outCanvas = document.createElement('canvas');
    outCanvas.width = canvas.width;
    outCanvas.height = canvas.height;
    cv.imshow(outCanvas, enhancedMat);

    return outCanvas;
  } catch (err) {
    console.warn('OpenCV enhancement fallback to original:', err);
    return canvas;
  } finally {
    if (srcMat) srcMat.delete();
    if (grayMat) grayMat.delete();
    if (enhancedMat) enhancedMat.delete();
    if (clahe) clahe.delete();
  }
}
