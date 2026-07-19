// Pure board/path model for Yutnori. No DOM, no rendering — station graph and
// movement math only. See PRD §7.5 and §9 ("trickiest parts").
//
// Station layout (29 stations total):
//   - 20 perimeter stations: P0..P19, travelled P0 -> P1 -> ... -> P19 -> FINISH.
//     P0 is the start/finish corner. P5, P10, P15 are the other three corners.
//   - 8 diagonal-only stations, two per corner-to-center arm, named so the
//     digit adjacent to the corner is always "1" and the digit adjacent to
//     CENTER is always "2": A1/A2, B1/B2, C1/C2, D1/D2.
//   - 1 center station: CENTER.
//
// Diagonals: A(P0)-CENTER-C(P10) is one straight line; B(P5)-CENTER-D(P15)
// is the other. A has no shortcut *into* it (you never shortcut away from the
// start corner) but CENTER can exit *toward* A, since that is the fastest
// route home.
//
// Only four stations ever require a player choice: P5, P10, P15 (shortcut vs.
// outer) and CENTER (continue straight through vs. cross to the other
// diagonal). Every other station has exactly one deterministic next station.
//
// A choice is only ever offered when a token comes to rest EXACTLY on one of
// these junctions (PRD §7.5: "Landing exactly ... unlocks a diagonal
// shortcut"). If a move's step count carries a token past/through a junction
// without ending there, it continues on the default route with no prompt.
// The choice made at rest is stored as that token's `forcedNext` and is
// consumed as the first step of its *next* move — this is what "shortening
// the route" means: fewer stations stand between the token and the finish on
// later turns, not extra movement on the current throw.

export const START = null; // token off the board, not yet entered
export const FINISH = 'FINISH'; // token has completed its journey

export const CORNERS = ['P0', 'P5', 'P10', 'P15'];
export const JUNCTIONS = ['P5', 'P10', 'P15', 'CENTER'];

const PERIMETER_COUNT = 20;

function perimeterId(i) {
  return `P${i}`;
}

// Straight (non-branching) forward links.
const STRAIGHT_NEXT = {
  A1: FINISH, // adjacent to P0 (the finish corner)
  A2: 'A1',
  B1: 'B2',
  B2: 'CENTER',
  C1: 'C2',
  C2: 'CENTER',
  D1: 'D2',
  D2: 'CENTER',
};

for (let i = 0; i < PERIMETER_COUNT; i++) {
  const id = perimeterId(i);
  if (CORNERS.includes(id)) continue; // corners are branch points, handled separately
  const next = i === PERIMETER_COUNT - 1 ? FINISH : perimeterId(i + 1);
  STRAIGHT_NEXT[id] = next;
}

// Corner branch options: entering a corner offers "outer" (continue the
// perimeter) or "shortcut" (peel onto the diagonal toward center).
const CORNER_BRANCHES = {
  P5: { outer: { next: 'P6', label: 'Outer path (continue around)' }, shortcut: { next: 'B1', label: 'Shortcut (toward center)' } },
  P10: { outer: { next: 'P11', label: 'Outer path (continue around)' }, shortcut: { next: 'C1', label: 'Shortcut (toward center)' } },
  P15: { outer: { next: 'P16', label: 'Outer path (continue around)' }, shortcut: { next: 'D1', label: 'Shortcut (toward center)' } },
};

// CENTER branch options depend on which diagonal the token arrived from
// (its previous station). "continue" keeps going straight through to the
// opposite corner of that same diagonal; "cross" switches to the other
// diagonal, always favoring the branch closer to the finish (A, then D).
const CENTER_EXITS = {
  B2: { continue: { next: 'D2', label: 'Continue through (toward D)' }, cross: { next: 'A2', label: 'Cross shortcut (toward A / finish)' } },
  D2: { continue: { next: 'B2', label: 'Continue through (toward B)' }, cross: { next: 'A2', label: 'Cross shortcut (toward A / finish)' } },
  C2: { continue: { next: 'A2', label: 'Continue through (toward A / finish)' }, cross: { next: 'D2', label: 'Cross shortcut (toward D)' } },
  A2: { continue: { next: 'C2', label: 'Continue through (toward C)' }, cross: { next: 'B2', label: 'Cross shortcut (toward B)' } },
};

export function isJunction(stationId) {
  return JUNCTIONS.includes(stationId);
}

/** Options available when a token comes to rest exactly on a junction. */
export function getJunctionOptions(stationId, cameFrom) {
  if (stationId === 'CENTER') {
    const exits = CENTER_EXITS[cameFrom] || CENTER_EXITS.C2;
    return [
      { key: 'continue', next: exits.continue.next, label: exits.continue.label },
      { key: 'cross', next: exits.cross.next, label: exits.cross.label },
    ];
  }
  const branch = CORNER_BRANCHES[stationId];
  if (!branch) return [];
  return [
    { key: 'outer', next: branch.outer.next, label: branch.outer.label },
    { key: 'shortcut', next: branch.shortcut.next, label: branch.shortcut.label },
  ];
}

/** Default (no-prompt) next station used when passing through mid-move. */
function getDefaultNext(stationId, cameFrom) {
  if (stationId === 'CENTER') {
    const exits = CENTER_EXITS[cameFrom] || CENTER_EXITS.C2;
    return exits.continue.next;
  }
  const branch = CORNER_BRANCHES[stationId];
  if (branch) return branch.outer.next;
  return STRAIGHT_NEXT[stationId];
}

/**
 * Simulate moving a token forward by `steps` stations.
 *
 * @param {object} token - { position, prevPosition, forcedNext, history }
 * @param {number} steps - positive integer, number of stations to advance
 * @returns {{ finished: boolean, position: string, prevPosition: string|null,
 *             history: string[], pendingJunction: {stationId, options}|null }}
 *   pendingJunction is set when the token comes to rest exactly on a
 *   junction; the caller must resolve a choice and store it as forcedNext
 *   before the token's next move.
 */
export function advanceToken(token, steps) {
  let current = token.position; // null means "at start, not yet entered"
  let cameFrom = token.prevPosition ?? null;
  const history = token.history ? token.history.slice() : [];
  let finished = false;

  for (let i = 0; i < steps; i++) {
    let next;
    if (current === START) {
      next = 'P1';
    } else if (i === 0 && token.forcedNext) {
      next = token.forcedNext;
    } else if (isJunction(current)) {
      next = getDefaultNext(current, cameFrom);
    } else {
      next = STRAIGHT_NEXT[current];
    }

    if (next === FINISH) {
      finished = true;
      cameFrom = current;
      current = FINISH;
      break;
    }

    history.push(next);
    cameFrom = current === START ? null : current;
    current = next;
  }

  let pendingJunction = null;
  if (!finished && isJunction(current)) {
    pendingJunction = { stationId: current, options: getJunctionOptions(current, cameFrom) };
  }

  return {
    finished,
    position: current,
    prevPosition: finished ? null : cameFrom,
    history,
    pendingJunction,
  };
}

/**
 * Step a token backward by one station using its own travel history
 * (Back-do). If the token has no earlier station on record, it returns to
 * the start (off the board) instead of moving further back.
 */
export function stepBack(token) {
  const history = token.history ? token.history.slice() : [];
  if (history.length <= 1) {
    return { position: START, prevPosition: null, history: [], forcedNext: null };
  }
  history.pop(); // drop current station
  const position = history[history.length - 1];
  const prevPosition = history.length > 1 ? history[history.length - 2] : null;
  return { position, prevPosition, history, forcedNext: null };
}
