// Draws the board, stations, and tokens into the game screen's SVG. Pure
// rendering + input capture — reads game state, never mutates it.

import { FINISH } from '../engine/board.js';
import { getFallbackAvatar } from './avatars.js';

const MARGIN = 10;
const MAX = 90;
const CENTER = [50, 50];
const CORNER_COORD = { A: [MARGIN, MAX], B: [MARGIN, MARGIN], C: [MAX, MARGIN], D: [MAX, MAX] };
const PLAYER_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad'];

// Off-board "home" and "finished" yards, one per player slot, tucked just
// outside each corner of the board.
const HOME_YARD = [
  [3, 97], [3, 3], [97, 3], [97, 97],
];
const FINISH_YARD = [
  [50, 96], [4, 50], [50, 4], [96, 50],
];

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function buildStationCoords() {
  const coords = { CENTER };
  const sides = [
    ['A', 'B', 0],
    ['B', 'C', 5],
    ['C', 'D', 10],
    ['D', 'A', 15],
  ];
  for (const [fromLetter, toLetter, base] of sides) {
    for (let i = 0; i < 5; i++) {
      coords[`P${base + i}`] = lerp(CORNER_COORD[fromLetter], CORNER_COORD[toLetter], i / 5);
    }
  }
  for (const letter of ['A', 'B', 'C', 'D']) {
    coords[`${letter}1`] = lerp(CORNER_COORD[letter], CENTER, 1 / 3);
    coords[`${letter}2`] = lerp(CORNER_COORD[letter], CENTER, 2 / 3);
  }
  return coords;
}

export const STATION_COORDS = buildStationCoords();

const CLUSTER_OFFSETS = [
  [0, 0],
  [-2.2, -1.3],
  [2.2, -1.3],
  [0, 2.4],
];

const SVGNS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVGNS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

function ensureLayer(svg, id) {
  let layer = svg.querySelector(`#${id}`);
  if (!layer) {
    layer = svgEl('g', { id });
    svg.appendChild(layer);
  }
  return layer;
}

export function drawBoardBase(svg) {
  svg.innerHTML = '';
  const linesLayer = ensureLayer(svg, 'lines-layer');
  const stationsLayer = ensureLayer(svg, 'stations-layer');
  ensureLayer(svg, 'preview-layer');
  ensureLayer(svg, 'tokens-layer');
  ensureLayer(svg, 'ghost-layer');

  // Perimeter square + both diagonals, as visual travel-path guides.
  const P = STATION_COORDS;
  const perimeterPts = Array.from({ length: 20 }, (_, i) => P[`P${i}`]).concat([P.P0]);
  linesLayer.appendChild(
    svgEl('polyline', {
      class: 'board-line',
      points: perimeterPts.map((p) => p.join(',')).join(' '),
    }),
  );
  linesLayer.appendChild(svgEl('line', { class: 'board-line', x1: P.P0[0], y1: P.P0[1], x2: P.P10[0], y2: P.P10[1] }));
  linesLayer.appendChild(svgEl('line', { class: 'board-line', x1: P.P5[0], y1: P.P5[1], x2: P.P15[0], y2: P.P15[1] }));

  for (const [id, [x, y]] of Object.entries(STATION_COORDS)) {
    const isCorner = ['P0', 'P5', 'P10', 'P15'].includes(id);
    const isCenter = id === 'CENTER';
    const r = isCorner || isCenter ? 3.2 : 2.2;
    const circle = svgEl('circle', { cx: x, cy: y, r, class: `station${isCorner ? ' corner' : ''}${isCenter ? ' center' : ''}`, 'data-station': id });
    stationsLayer.appendChild(circle);
  }
}

export function stationKeyFor(token, playerIndex) {
  if (token.finished) return `FIN-${playerIndex}`;
  if (token.position == null) return `HOME-${playerIndex}`;
  return token.position;
}

export function coordFor(key, playerIndex) {
  if (key.startsWith('HOME-')) return HOME_YARD[playerIndex];
  if (key.startsWith('FIN-')) return FINISH_YARD[playerIndex];
  return STATION_COORDS[key];
}

function ensureDefs(svg) {
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = svgEl('defs');
    svg.insertBefore(defs, svg.firstChild);
  } else {
    defs.innerHTML = '';
  }
  return defs;
}

/**
 * Redraw all tokens. `selectableTokenIds` get a `.selectable` class and fire
 * onTokenClick when clicked (used once a throw is chosen and eligible
 * tokens need to be pickable).
 */
export function drawTokens(svg, game, { selectableTokenIds = [], onTokenClick, playerPhotos = [] } = {}) {
  const layer = ensureLayer(svg, 'tokens-layer');
  layer.innerHTML = '';
  const defs = ensureDefs(svg);

  const groups = new Map(); // stationKey -> [{token, playerIndex}]
  game.players.forEach((player, playerIndex) => {
    for (const token of player.tokens) {
      const key = stationKeyFor(token, playerIndex);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ token, playerIndex, player });
    }
  });

  for (const [key, entries] of groups.entries()) {
    const base = coordFor(key, entries[0].playerIndex);
    if (!base) continue;

    // Tokens already stacked (shared stackId) render as one marker; distinct
    // stacks/singles at the same station cluster with small offsets.
    const clusters = [];
    const seenStacks = new Set();
    for (const entry of entries) {
      if (entry.token.stackId) {
        if (seenStacks.has(entry.token.stackId)) continue;
        seenStacks.add(entry.token.stackId);
        clusters.push(entries.filter((e) => e.token.stackId === entry.token.stackId));
      } else {
        clusters.push([entry]);
      }
    }

    clusters.forEach((group, i) => {
      const [ox, oy] = CLUSTER_OFFSETS[i % CLUSTER_OFFSETS.length];
      const cx = base[0] + ox;
      const cy = base[1] + oy;
      const lead = group[0];
      const isStacked = group.length > 1;
      const isSelectable = selectableTokenIds.includes(lead.token.id);

      const g = svgEl('g', { class: `token${isStacked ? ' stacked' : ''}${isSelectable ? ' selectable' : ''}` });
      const color = PLAYER_COLORS[lead.playerIndex];
      const photoUrl = playerPhotos[lead.playerIndex] || getFallbackAvatar(lead.playerIndex, color);
      const clipId = `clip-${key}-${i}`.replace(/[^\w-]/g, '_');
      const clip = svgEl('clipPath', { id: clipId });
      clip.appendChild(svgEl('circle', { cx, cy, r: 2.6 }));
      defs.appendChild(clip);

      g.appendChild(svgEl('circle', { cx, cy, r: 2.6, class: 'token-backdrop', fill: color }));
      g.appendChild(svgEl('image', { x: cx - 2.6, y: cy - 2.6, width: 5.2, height: 5.2, href: photoUrl, 'clip-path': `url(#${clipId})` }));
      g.appendChild(svgEl('circle', { cx, cy, r: 2.6, class: 'token-ring', stroke: color, fill: 'none' }));
      const label = isStacked ? String(group.length) : '';
      if (label) {
        const text = svgEl('text', { x: cx, y: cy });
        text.textContent = label;
        g.appendChild(text);
      }
      if (isSelectable && onTokenClick) {
        g.addEventListener('click', () => onTokenClick(lead.token.id));
      }
      layer.appendChild(g);
    });
  }
}

/** Highlight a previewed move: the travelled path plus, at a junction, both option destinations. */
export function drawPreview(svg, preview) {
  const layer = ensureLayer(svg, 'preview-layer');
  layer.innerHTML = '';
  if (!preview) return;

  const points = preview.path.filter((id) => id !== FINISH).map((id) => STATION_COORDS[id]).filter(Boolean);
  if (points.length > 0) {
    layer.appendChild(
      svgEl('polyline', { class: 'preview-path', points: points.map((p) => p.join(',')).join(' ') }),
    );
    const [dx, dy] = points[points.length - 1];
    layer.appendChild(svgEl('circle', { class: 'preview-dest', cx: dx, cy: dy, r: 4 }));
  }

  if (preview.pendingJunction) {
    const from = STATION_COORDS[preview.pendingJunction.stationId];
    preview.pendingJunction.options.forEach((option, i) => {
      const to = STATION_COORDS[option.next];
      if (!to) return;
      layer.appendChild(
        svgEl('line', {
          class: `preview-dest${i === 1 ? ' option-b' : ''}`,
          x1: from[0], y1: from[1], x2: to[0], y2: to[1],
        }),
      );
    });
  }
}

export function clearPreview(svg) {
  const layer = svg.querySelector('#preview-layer');
  if (layer) layer.innerHTML = '';
}

const GHOST_STEP_MS = 160;

/**
 * Animate a token sliding through the stations it just travelled, before the
 * authoritative `drawTokens` redraw snaps it into place. `fromToken` is the
 * token's state *before* the move (used to find its starting coordinate —
 * board, home yard, or finish yard). Calls `onDone` when the animation
 * completes (or immediately if there's nothing to animate).
 */
export function animateTokenMove(svg, { fromToken, playerIndex, path }, onDone) {
  const layer = ensureLayer(svg, 'ghost-layer');
  layer.innerHTML = '';

  const startCoord = coordFor(stationKeyFor(fromToken, playerIndex), playerIndex);
  const stepCoords = (path || []).filter((id) => id !== FINISH).map((id) => STATION_COORDS[id]).filter(Boolean);
  const points = [startCoord, ...stepCoords].filter(Boolean);

  if (points.length <= 1) {
    onDone && onDone();
    return;
  }

  const ghost = svgEl('circle', {
    class: 'token-ghost',
    r: 2.8,
    fill: PLAYER_COLORS[playerIndex],
    cx: points[0][0],
    cy: points[0][1],
  });
  layer.appendChild(ghost);

  let i = 0;
  function step() {
    i += 1;
    if (i >= points.length) {
      layer.innerHTML = '';
      onDone && onDone();
      return;
    }
    ghost.setAttribute('cx', points[i][0]);
    ghost.setAttribute('cy', points[i][1]);
    setTimeout(step, GHOST_STEP_MS);
  }
  // A plain setTimeout (not requestAnimationFrame) kicks this off: rAF is
  // suspended in a backgrounded/non-visible tab, which would otherwise hang
  // this promise — and everything awaiting it — forever. That matters a lot
  // more than usual here since, in online play, the host awaits this same
  // animation before it will broadcast the move to every connected player.
  setTimeout(step, GHOST_STEP_MS);
}
