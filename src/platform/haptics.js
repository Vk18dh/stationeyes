import { Cue } from '../engine/model.js';

class Haptics {
  constructor() {
    this.enabled = true;
    this.audioCtx = null;
  }

  playAudioFeedback(cue) {
    try {
      if (!this.audioCtx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new Ctx();
      }
      if (!this.audioCtx || this.audioCtx.state === 'suspended') {
        this.audioCtx?.resume();
      }
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;
      if (cue === Cue.FOUND) {
        osc.frequency.setValueAtTime(587.33, now); // D5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (cue === Cue.CENTERED) {
        osc.frequency.setValueAtTime(880, now); // A5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (cue === Cue.WRONG) {
        osc.frequency.setValueAtTime(220, now); // A3
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (cue === Cue.LOST) {
        osc.frequency.setValueAtTime(330, now); // E4
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch {
      // Audio feedback is best-effort
    }
  }

  play(cue) {
    if (!this.enabled || !cue) return;

    // Mobile vibration API
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        switch (cue) {
          case Cue.FOUND:
            navigator.vibrate(300);
            break;
          case Cue.CENTERED:
            navigator.vibrate([0, 80, 100, 80]);
            break;
          case Cue.WRONG:
            navigator.vibrate(70);
            break;
          case Cue.LOST:
            navigator.vibrate([0, 50, 120, 50, 120, 50]);
            break;
        }
      } catch {}
    }

    // Play subtle audio cue as complement
    this.playAudioFeedback(cue);
  }
}

export const haptics = new Haptics();
