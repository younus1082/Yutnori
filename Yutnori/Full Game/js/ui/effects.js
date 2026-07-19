// Sound effects and the victory effect (Phase 2, PRD §8). Sounds are
// synthesized with the Web Audio API rather than loaded from files, so
// local/AI play keeps working with no network. A muted flag gates all
// playback; `delay()` is a small helper used to sequence animations.

let audioCtx = null;
let soundEnabled = true;

function getContext() {
  if (!audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtor();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function isSoundEnabled() {
  return soundEnabled;
}

export function setSoundEnabled(on) {
  soundEnabled = on;
}

function tone({ freq, duration = 0.15, type = 'sine', gain = 0.15, delay: startDelay = 0 }) {
  if (!soundEnabled) return;
  const ctx = getContext();
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const startTime = ctx.currentTime + startDelay;
  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

export function playThrow() {
  tone({ freq: 200, duration: 0.1, type: 'triangle', gain: 0.14 });
  tone({ freq: 260, duration: 0.12, type: 'triangle', gain: 0.1, delay: 0.06 });
}

export function playMove() {
  tone({ freq: 440, duration: 0.07, type: 'square', gain: 0.05 });
}

export function playCapture() {
  tone({ freq: 200, duration: 0.18, type: 'sawtooth', gain: 0.14 });
  tone({ freq: 100, duration: 0.24, type: 'sawtooth', gain: 0.12, delay: 0.06 });
}

export function playFinish() {
  tone({ freq: 523.25, duration: 0.14, gain: 0.12 });
  tone({ freq: 659.25, duration: 0.2, gain: 0.12, delay: 0.12 });
}

export function playVictory() {
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    tone({ freq, duration: 0.32, gain: 0.14, delay: i * 0.15 });
  });
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CONFETTI_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d1a13a'];

/** Coded confetti burst absolutely positioned inside `container` (PRD §8: "distinct victory effect"). */
export function launchConfetti(container, count = 36) {
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDuration = `${1 + Math.random() * 0.9}s`;
    piece.style.animationDelay = `${Math.random() * 0.35}s`;
    piece.addEventListener('animationend', () => piece.remove());
    container.appendChild(piece);
  }
}
