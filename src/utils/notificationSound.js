// src/utils/notificationSound.js

let audioCtx = null;
let lastPlayedAt = 0;
const THROTTLE_MS = 800;

// Check user sound preference (default: enabled)
export const isSoundEnabled = () => {
  try {
    const pref = localStorage.getItem('orthocare_sound_enabled');
    return pref !== 'false';
  } catch (_) {
    return true;
  }
};

export const setSoundEnabled = (enabled) => {
  try {
    localStorage.setItem('orthocare_sound_enabled', enabled ? 'true' : 'false');
  } catch (_) {}
};

// Initialize / retrieve AudioContext
const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch (_) {
    return null;
  }
};

// Unlock AudioContext on first user interaction (browser autoplay policy)
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }
    } catch (_) {}
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { once: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: true, passive: true });
  window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
}

/**
 * Synthesizes a soft, elegant 3-tone notification chime using Web Audio API.
 * Notes: G5 (784Hz) -> C6 (1046.5Hz) -> E6 (1318.5Hz)
 */
const playSynthesizedChime = (ctx) => {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.18, now); // Gentle volume level
  masterGain.connect(ctx.destination);

  const notes = [
    { freq: 783.99, start: 0, duration: 0.28, gain: 0.5 },    // G5
    { freq: 1046.50, start: 0.08, duration: 0.32, gain: 0.6 }, // C6
    { freq: 1318.51, start: 0.16, duration: 0.35, gain: 0.4 }  // E6
  ];

  notes.forEach(({ freq, start, duration, gain }) => {
    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + start);

    // Envelope: quick attack to prevent clicks, then exponential decay
    noteGain.gain.setValueAtTime(0.0001, now + start);
    noteGain.gain.exponentialRampToValueAtTime(gain, now + start + 0.012);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);

    osc.connect(noteGain);
    noteGain.connect(masterGain);

    osc.start(now + start);
    osc.stop(now + start + duration + 0.05);
  });
};

/**
 * Fallback to HTML5 Audio element using the generated WAV asset.
 */
const playAudioFileFallback = () => {
  try {
    const audio = new Audio('./sounds/notification.wav');
    audio.volume = 0.25;
    audio.play().catch(() => {});
  } catch (_) {}
};

/**
 * Main export: plays notification sound for list notifications.
 * Throttled to avoid sound overlap if multiple notifications arrive simultaneously.
 */
export const playNotificationSound = () => {
  if (!isSoundEnabled()) return;

  const now = Date.now();
  if (now - lastPlayedAt < THROTTLE_MS) return;
  lastPlayedAt = now;

  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state !== 'closed') {
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => playSynthesizedChime(ctx)).catch(playAudioFileFallback);
      } else {
        playSynthesizedChime(ctx);
      }
    } else {
      playAudioFileFallback();
    }
  } catch (_) {
    playAudioFileFallback();
  }
};
