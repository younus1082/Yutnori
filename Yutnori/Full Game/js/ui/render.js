// Draws the board, stations, tokens, move-preview and off-board pens into the
// game screen's SVG, in the traditional themed style ported from the board
// mockup. Pure rendering + input capture — reads game state, never mutates it.
// All movement/rules live in the engine; nothing here decides a move.

import { FINISH } from '../engine/board.js';

const MARGIN = 10;
const MAX = 90;
const CENTER = [50, 50];
const CORNER_COORD = { A: [MARGIN, MAX], B: [MARGIN, MARGIN], C: [MAX, MARGIN], D: [MAX, MAX] };
const PLAYER_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad'];

// Carved-stone token discs: a light→dark radial gradient + a darker rim per
// player slot (the mockup only had red/blue; green/purple extend it to 4p).
const TOKEN_GRADIENT = [
  ['#e46b5f', '#a5302a'],
  ['#6394c7', '#244f80'],
  ['#5cbd83', '#227a45'],
  ['#b48fd0', '#6b3fa0'],
];
const TOKEN_STROKE = ['#7a1f18', '#183a5e', '#155c33', '#4a2a72'];

const BIG = new Set(['P0', 'P5', 'P10', 'P15', 'CENTER']);
const CORNERS = ['P0', 'P5', 'P10', 'P15'];
const R_BIG = 3.2;
const R_SMALL = 2.2;
const TOKEN_R = 2.4;

// Off-board "waiting" (home) and "finished" pens, one per player slot, nudged
// just inside the frame so the dashed pen boxes never clip the viewBox.
const HOME_YARD = [
  [6, 94], [6, 6], [94, 6], [94, 94],
];
const FINISH_YARD = [
  [50, 95], [5, 50], [50, 5], [95, 50],
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

/** A dashed pen box + label for a player's waiting/finished yard. */
function drawPen(layer, [cx, cy], playerIndex, kind) {
  const w = 8.4;
  const rect = svgEl('rect', {
    x: cx - w / 2, y: cy - w / 2, width: w, height: w, rx: 2,
    class: 'pen-box', stroke: PLAYER_COLORS[playerIndex],
  });
  layer.appendChild(rect);
  // place the label toward the board centre so it never runs off the edge
  const ty = cy < 50 ? cy + w / 2 + 3 : cy - w / 2 - 1.4;
  const text = svgEl('text', { x: cx, y: ty, class: 'pen-label', 'text-anchor': 'middle' });
  text.textContent = kind === 'waiting' ? '대기' : '도착';
  layer.appendChild(text);
}

export function drawBoardBase(svg, game) {
  svg.innerHTML = '';
  const linesLayer = ensureLayer(svg, 'lines-layer');
  const pensLayer = ensureLayer(svg, 'pens-layer');
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

  // Waiting + finished pens for each player in this game.
  const playerCount = game && game.players ? game.players.length : 0;
  for (let i = 0; i < playerCount; i++) {
    drawPen(pensLayer, HOME_YARD[i], i, 'waiting');
    drawPen(pensLayer, FINISH_YARD[i], i, 'home');
  }

  // Stations, each wrapped in a <g class="node"> so a move-preview can light
  // up its halo/ring via the .movable class.
  for (const [id, [x, y]] of Object.entries(STATION_COORDS)) {
    const isCorner = CORNERS.includes(id);
    const isCenter = id === 'CENTER';
    const big = BIG.has(id);
    const r = big ? R_BIG : R_SMALL;

    const g = svgEl('g', { class: 'node', 'data-station': id });
    g.appendChild(svgEl('circle', { cx: x, cy: y, r: r + 1.5, class: 'halo' }));
    g.appendChild(svgEl('circle', {
      cx: x, cy: y, r,
      class: `station${isCorner ? ' corner' : ''}${isCenter ? ' center' : ''}`,
      'data-station': id,
    }));
    // Ring + 8-point star motif on the big corner/center stations.
    if (big) {
      g.appendChild(svgEl('circle', { cx: x, cy: y, r: r * 0.66, class: 'node-ring' }));
      for (let k = 0; k < 4; k++) {
        const ang = (k * Math.PI) / 4;
        const L = r * 0.5;
        g.appendChild(
          svgEl('line', {
            x1: x - Math.cos(ang) * L, y1: y - Math.sin(ang) * L,
            x2: x + Math.cos(ang) * L, y2: y + Math.sin(ang) * L,
            class: 'node-star',
          }),
        );
      }
    }
    stationsLayer.appendChild(g);
  }

  // "출발 · Start" marker + a small arrow at P0 (bottom-left; tokens enter and
  // travel up the left edge).
  const [sx, sy] = STATION_COORDS.P0;
  const label = svgEl('text', { x: sx, y: sy + 6.5, class: 'start-label', 'text-anchor': 'middle' });
  label.textContent = '출발 · Start';
  stationsLayer.appendChild(label);
  stationsLayer.appendChild(svgEl('path', { class: 'start-arrow', d: `M ${sx} ${sy - 6} l -1.6 3 l 3.2 0 z` }));
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

function addTokenGradients(defs) {
  TOKEN_GRADIENT.forEach(([light, dark], i) => {
    const grad = svgEl('radialGradient', { id: `tok-grad-${i}`, cx: '35%', cy: '30%', r: '75%' });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': light }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': dark }));
    defs.appendChild(grad);
  });
}

/** One themed disc token (with the player's photo clipped inside if uploaded). */
function tokenDisc(g, cx, cy, playerIndex, photo, defs, keyId) {
  g.appendChild(svgEl('circle', { cx, cy, r: TOKEN_R + 1.1, class: 'token-pick' }));
  if (photo) {
    const clipId = `clip-${keyId}`.replace(/[^\w-]/g, '_');
    const clip = svgEl('clipPath', { id: clipId });
    clip.appendChild(svgEl('circle', { cx, cy, r: TOKEN_R }));
    defs.appendChild(clip);
    g.appendChild(svgEl('circle', { cx, cy, r: TOKEN_R, class: 'token-disc', fill: TOKEN_STROKE[playerIndex] }));
    g.appendChild(svgEl('image', { x: cx - TOKEN_R, y: cy - TOKEN_R, width: TOKEN_R * 2, height: TOKEN_R * 2, href: photo, 'clip-path': `url(#${clipId})` }));
  } else {
    g.appendChild(svgEl('circle', { cx, cy, r: TOKEN_R, class: 'token-disc', fill: `url(#tok-grad-${playerIndex})`, stroke: TOKEN_STROKE[playerIndex] }));
    g.appendChild(svgEl('circle', { cx: cx - 0.7, cy: cy - 0.8, r: 0.95, class: 'token-hi' }));
  }
  g.appendChild(svgEl('circle', { cx, cy, r: TOKEN_R, class: 'token-ring', stroke: TOKEN_STROKE[playerIndex], fill: 'none' }));
}

/**
 * Redraw all tokens. `selectableTokenIds` get a `.selectable` class and fire
 * onTokenClick when clicked (used once a throw is chosen and eligible tokens
 * need to be pickable).
 */
export function drawTokens(svg, game, { selectableTokenIds = [], onTokenClick, playerPhotos = [] } = {}) {
  const layer = ensureLayer(svg, 'tokens-layer');
  layer.innerHTML = '';
  const defs = ensureDefs(svg);
  addTokenGradients(defs);

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
      const pIdx = lead.playerIndex;

      const g = svgEl('g', {
        class: `token${isStacked ? ' stacked' : ''}${isSelectable ? ' selectable' : ''}`,
        'data-token': lead.token.id,
      });
      tokenDisc(g, cx, cy, pIdx, playerPhotos[pIdx], defs, `${key}-${i}`);
      if (isStacked) {
        const text = svgEl('text', { x: cx + TOKEN_R * 0.9, y: cy - TOKEN_R * 0.9, class: 'token-count' });
        text.textContent = String(group.length);
        g.appendChild(text);
      }
      if (isSelectable && onTokenClick) {
        g.addEventListener('click', () => onTokenClick(lead.token.id));
      }
      layer.appendChild(g);
    });
  }
}

function clearMovable(svg) {
  svg.querySelectorAll('#stations-layer .node.movable').forEach((n) => n.classList.remove('movable'));
}

function setMovable(svg, stationId) {
  const n = svg.querySelector(`#stations-layer .node[data-station="${stationId}"]`);
  if (n) n.classList.add('movable');
}

/** A translucent "ghost" of the moving piece + a spinning dashed ring. */
function drawGhost(layer, [x, y], playerIndex) {
  const g = svgEl('g', { class: 'ghost-preview' });
  g.appendChild(svgEl('circle', { cx: x, cy: y, r: TOKEN_R, class: 'ghost-disc', fill: PLAYER_COLORS[playerIndex] }));
  g.appendChild(svgEl('circle', { cx: x, cy: y, r: TOKEN_R + 1.6, class: 'ghost-ring' }));
  layer.appendChild(g);
}

/**
 * Highlight a previewed move: a faint travelled path, a ghost piece at the
 * landing spot with the destination node lit up, and — at a junction — a
 * marker toward each of the two branch options.
 */
export function drawPreview(svg, preview, playerIndex = 0) {
  const layer = ensureLayer(svg, 'preview-layer');
  layer.innerHTML = '';
  clearMovable(svg);
  if (!preview) return;

  const points = preview.path.filter((id) => id !== FINISH).map((id) => STATION_COORDS[id]).filter(Boolean);
  if (points.length > 0) {
    layer.appendChild(
      svgEl('polyline', { class: 'preview-path', points: points.map((p) => p.join(',')).join(' ') }),
    );
  }

  // The landing spot: a real station, or the finish pen.
  const dest = preview.destination;
  if (dest === FINISH || preview.path[preview.path.length - 1] === FINISH) {
    drawGhost(layer, FINISH_YARD[playerIndex], playerIndex);
  } else if (dest && STATION_COORDS[dest]) {
    drawGhost(layer, STATION_COORDS[dest], playerIndex);
    setMovable(svg, dest);
  } else if (points.length > 0) {
    drawGhost(layer, points[points.length - 1], playerIndex);
  }

  // At a junction the token rests on the junction and the player picks which
  // way it will leave next turn — show a marker toward each option.
  if (preview.pendingJunction) {
    const from = STATION_COORDS[preview.pendingJunction.stationId];
    preview.pendingJunction.options.forEach((option, i) => {
      const to = STATION_COORDS[option.next];
      if (!to) return;
      if (from) {
        layer.appendChild(
          svgEl('line', {
            class: `preview-dest${i === 1 ? ' option-b' : ''}`,
            x1: from[0], y1: from[1], x2: to[0], y2: to[1],
          }),
        );
      }
      setMovable(svg, option.next);
    });
  }
}

export function clearPreview(svg) {
  const layer = svg.querySelector('#preview-layer');
  if (layer) layer.innerHTML = '';
  clearMovable(svg);
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
    r: TOKEN_R,
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
