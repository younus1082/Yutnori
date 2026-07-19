// Coded cartoon-face fallback avatars (Phase 2, PRD §6: "cartoon avatar
// fallbacks if no photo is provided"). Fully generated as inline SVG — no
// binary asset files to source or license. One deterministic face per
// player slot (0-3), plus a couple of cosmetic touches so the four faces
// read as distinct beyond just their ring color.

function lighten(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + amount);
  const g = Math.min(255, ((n >> 8) & 0xff) + amount);
  const b = Math.min(255, (n & 0xff) + amount);
  return `rgb(${r}, ${g}, ${b})`;
}

// index 0: plain smile · 1: smile + blush · 2: smile + eyebrows · 3: open grin
function faceFeatures(index) {
  const blush = index === 1
    ? '<circle cx="19" cy="34" r="3.2" fill="#000" opacity="0.08"/><circle cx="45" cy="34" r="3.2" fill="#000" opacity="0.08"/>'
    : '';
  const brows = index === 2
    ? '<path d="M15 21 q5 -4 10 0" stroke="#000" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<path d="M39 21 q5 -4 10 0" stroke="#000" stroke-width="2" fill="none" stroke-linecap="round"/>'
    : '';
  const mouth = index === 3
    ? '<path d="M22 38 q10 10 20 0" stroke="#000" stroke-width="2.4" fill="#fff" stroke-linecap="round"/>'
    : '<path d="M22 36 q10 8 20 0" stroke="#000" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
  return blush + brows + mouth;
}

function buildSvg(color, index) {
  const face = lighten(color, 70);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="32" r="30" fill="${face}" stroke="${color}" stroke-width="2"/>` +
    `<circle cx="22" cy="26" r="3.4" fill="#222"/>` +
    `<circle cx="42" cy="26" r="3.4" fill="#222"/>` +
    faceFeatures(index) +
    `</svg>`;
}

const cache = new Map();

/** Deterministic data-URI cartoon avatar for a player slot; cached per (index, color). */
export function getFallbackAvatar(playerIndex, color) {
  const key = `${playerIndex}-${color}`;
  if (cache.has(key)) return cache.get(key);
  const svg = buildSvg(color, playerIndex % 4);
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  cache.set(key, dataUrl);
  return dataUrl;
}
