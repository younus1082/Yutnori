// Phase 3 — AI opponent, with three difficulty levels. Supplies token-move
// decisions via a greedy heuristic layered on the same read-only engine
// calls modes/local.js uses (PRD §5, §11, §13 "AI difficulty levels"): it
// never touches the random throw, only which assignable token gets a given
// result. No engine changes — everything here is built from board.js's
// exported advanceToken plus game.js's existing
// assignableTokensFor/previewAssignment.

import { assignableTokensFor, previewAssignment } from '../engine/game.js';
import { advanceToken, FINISH } from '../engine/board.js';

const MAX_PROBE_STEPS = 40;

// medium is the original single-difficulty heuristic from Phase 3: capture
// > shortcut > near-finish progress > avoid exposure, in that priority
// order. easy plays validly but with no strategy (uniformly random choice
// among assignable tokens and junction branches). hard keeps medium's
// priorities but weighs defense more heavily and adds one further
// consideration of its own: does this move put an opponent within OUR
// reach next turn?
const DIFFICULTY_WEIGHTS = {
  medium: { captureScore: 1000, finishScore: 900, junctionScore: 150, exposurePenalty: 30, setupBonus: 0 },
  hard: { captureScore: 1000, finishScore: 900, junctionScore: 150, exposurePenalty: 90, setupBonus: 70 },
};

/** Always prefer the diagonal shortcut/cross branch over the outer/continue one (PRD: "taking shortcuts at junctions"). */
function preferredJunctionChoice(pendingJunction) {
  if (!pendingJunction) return null;
  const fast = pendingJunction.options.find((o) => o.key === 'shortcut' || o.key === 'cross');
  return (fast || pendingJunction.options[0]).key;
}

function randomJunctionChoice(pendingJunction) {
  if (!pendingJunction) return null;
  const options = pendingJunction.options;
  return options[Math.floor(Math.random() * options.length)].key;
}

/** Approximate stations remaining to finish from `position` (outer-path distance; good enough for a greedy heuristic). */
function stepsToFinish(position) {
  if (position === FINISH) return 0;
  const probe = { position, prevPosition: null, forcedNext: null, history: [] };
  for (let n = 1; n <= MAX_PROBE_STEPS; n++) {
    if (advanceToken(probe, n).finished) return n;
  }
  return MAX_PROBE_STEPS;
}

/** Could any opponent token reach `destination` with a single next throw (1-5 steps)? */
function isExposed(game, moverPlayerId, destination) {
  if (!destination || destination === FINISH) return false;
  for (const player of game.players) {
    if (player.id === moverPlayerId) continue;
    for (const token of player.tokens) {
      if (token.finished) continue;
      for (let steps = 1; steps <= 5; steps++) {
        const sim = advanceToken(token, steps);
        if (!sim.finished && sim.position === destination) return true;
      }
    }
  }
  return false;
}

/** Hard mode only: from `destination`, could we reach an opponent token with our own next throw (1-5 steps)? The mirror image of isExposed. */
function canThreaten(game, moverPlayerId, destination) {
  if (!destination || destination === FINISH) return false;
  const probe = { position: destination, prevPosition: null, forcedNext: null, history: [] };
  for (let steps = 1; steps <= 5; steps++) {
    const sim = advanceToken(probe, steps);
    if (sim.finished) continue;
    const reachesOpponent = game.players.some(
      (p) => p.id !== moverPlayerId && p.tokens.some((t) => !t.finished && t.position === sim.position),
    );
    if (reachesOpponent) return true;
  }
  return false;
}

function isCapture(game, moverPlayerId, destination) {
  if (!destination || destination === FINISH) return false;
  return game.players.some(
    (p) => p.id !== moverPlayerId && p.tokens.some((t) => !t.finished && t.position === destination),
  );
}

function chooseRandomMove(game, throwId, candidates) {
  const token = candidates[Math.floor(Math.random() * candidates.length)];
  const preview = previewAssignment(game, throwId, token.id);
  return { tokenId: token.id, junctionChoiceKey: randomJunctionChoice(preview.pendingJunction) };
}

/**
 * Decide which token (and, if it lands on a junction, which branch) should
 * receive the given pending throw. `difficulty` is 'easy' | 'medium' |
 * 'hard' (defaults to 'medium'). Returns null when there's nothing
 * assignable (mirrors the "discard this throw" case controls.js already
 * handles for human turns).
 */
export function chooseMove(game, throwId, difficulty = 'medium') {
  const moverId = game.players[game.currentPlayerIndex].id;
  const candidates = assignableTokensFor(game, throwId);
  if (candidates.length === 0) return null;

  if (difficulty === 'easy') {
    return chooseRandomMove(game, throwId, candidates);
  }

  const weights = DIFFICULTY_WEIGHTS[difficulty] || DIFFICULTY_WEIGHTS.medium;
  let best = null;
  let bestScore = -Infinity;

  for (const token of candidates) {
    const preview = previewAssignment(game, throwId, token.id);
    const junctionChoiceKey = preferredJunctionChoice(preview.pendingJunction);
    const destination = preview.destination;
    const captures = isCapture(game, moverId, destination);

    let score = 0;
    if (captures) score += weights.captureScore;
    if (destination === FINISH) score += weights.finishScore;
    if (preview.pendingJunction) score += weights.junctionScore;
    score += MAX_PROBE_STEPS - stepsToFinish(destination);
    if (!captures && isExposed(game, moverId, destination)) score -= weights.exposurePenalty;
    if (weights.setupBonus && !captures && canThreaten(game, moverId, destination)) score += weights.setupBonus;

    if (score > bestScore) {
      bestScore = score;
      best = { tokenId: token.id, junctionChoiceKey };
    }
  }

  return best;
}
