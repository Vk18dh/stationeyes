/**
 * VoiceGuide: Text-to-speech for senior citizens.
 * Clear pronunciation, interruptible, with speaking state notifications.
 */

class VoiceGuide {
  constructor() {
    this.ready = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.voice = null;
    this.onStateChange = null;

    if (this.ready) {
      this.initVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  initVoices() {
    if (!this.ready) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;

    // Prefer Indian English (en-IN), fallback to en-GB, en-US
    const preferred =
      voices.find((v) => v.lang === 'en-IN' || v.lang.startsWith('en-IN')) ||
      voices.find((v) => v.lang === 'en-GB' || v.lang.startsWith('en-GB')) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      voices[0];

    this.voice = preferred;
  }

  speak(text) {
    if (!this.ready || !text) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    if (this.voice) {
      utterance.voice = this.voice;
    }
    utterance.rate = 0.88; // Slightly slower, clear pace for seniors
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      if (this.onStateChange) this.onStateChange(true);
    };

    utterance.onend = () => {
      if (this.onStateChange) this.onStateChange(false);
    };

    utterance.onerror = () => {
      if (this.onStateChange) this.onStateChange(false);
    };

    window.speechSynthesis.speak(utterance);
  }

  stop() {
    if (!this.ready) return;
    window.speechSynthesis.cancel();
    if (this.onStateChange) this.onStateChange(false);
  }

  isSpeaking() {
    return this.ready && window.speechSynthesis.speaking;
  }
}

export const voiceGuide = new VoiceGuide();
