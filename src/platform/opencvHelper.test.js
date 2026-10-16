import { describe, it, expect } from 'vitest';
import {
  isOpenCvLoaded,
  waitForOpenCv,
  checkBlur,
  enhanceSignboardImage,
} from './opencvHelper.js';

describe('opencvHelper', () => {
  it('detects OpenCV availability gracefully in test environment', () => {
    expect(typeof isOpenCvLoaded()).toBe('boolean');
  });

  it('handles blur check gracefully without crashing when OpenCV is not present', () => {
    const result = checkBlur(null);
    expect(result.isBlurry).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('resolves waitForOpenCv quickly when timeout occurs in Node', async () => {
    const res = await waitForOpenCv(50);
    expect(res).toBeNull();
  });

  it('enhanceSignboardImage returns source gracefully without throwing', async () => {
    const dummy = { src: 'data:image/png;base64,123' };
    const res = await enhanceSignboardImage(dummy);
    expect(res).toBeDefined();
  });
});
