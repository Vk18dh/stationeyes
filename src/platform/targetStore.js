/**
 * Remembers the active destination and settings so they survive browser refreshes.
 */

const KEY_TARGET = 'station_eyes_target';
const KEY_VIBRATION = 'station_eyes_vibration';

export const TargetStore = {
  getTarget() {
    try {
      return localStorage.getItem(KEY_TARGET) || null;
    } catch {
      return null;
    }
  },

  setTarget(value) {
    try {
      if (value) {
        localStorage.setItem(KEY_TARGET, value);
      } else {
        localStorage.removeItem(KEY_TARGET);
      }
    } catch {}
  },

  getVibration() {
    try {
      const v = localStorage.getItem(KEY_VIBRATION);
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  },

  setVibration(value) {
    try {
      localStorage.setItem(KEY_VIBRATION, String(value));
    } catch {}
  },
};
