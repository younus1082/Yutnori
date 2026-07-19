// Throw resolution, capture, stacking, and win detection. Pure game-logic
// functions operating on the plain-object game state built by game.js — no
// DOM access here. See PRD §7.

import { advanceToken, stepBack, isJunction, getJunctionOptions, START, FINISH } from './board.js';

// PRD §7.2 — result name, Korean, steps, whether it grants an extra throw.
export const RESULTS = {
  backdo: { name: 'Back-do', korean: '빽도', steps: -1, extra: false, isBackDo: true },
  do: { name: 'Do', korean: '도', steps: 1, extra: false, isBackDo: false },
  gae: { name: 'Gae', korean: '개', steps: 2, extra: false, isBackDo: false },
  geol: { name: 'Geol', korean: '걸', steps: 3, extra: false, isBackDo: false },
  yut: { name: 'Yut', korean: '윷', steps: 4, extra: true, isBackDo: false },
  mo: { name: 'Mo', korean: '모', steps: 5, extra: true, isBackDo: false },
};

/**
 * Toss the four yut sticks. Stick index 0 is always the X-marked stick.
 * Back-do triggers only when stick 0 is flat and it is the *sole* flat
 * stick (PRD §7.4) — if the X-stick is flat alongside others, it just
 * counts as an ordinary flat side.
 */
export function throwSticks(random = Math.random) {
  const sticks = [0, 1, 2, 3].map(() => random() < 0.5);
  const flatCount = sticks.filter(Boolean).length;
  const isLoneXFlat = flatCount === 1 && sticks[0] === true;

  let key;
  if (isLoneXFlat) key = 'backdo';
  else if (flatCount === 0) key = 'mo';
  else if (flatCount === 1) key = 'do';
  else if (flatCount === 2) key = 'gae';
  else if (flatCount === 3) key = 'geol';
  else key = 'yut';

  return { ...RESULTS[key], key, sticks };
}

function findToken(game, tokenId) {
  for (const player of game.players) {
    const token = player.tokens.find((t) => t.id === tokenId);
    if (token) return { token, player };
  }
  return null;
}

function stackGroup(player, token) {
  if (!token.stackId) return [token];
  return player.tokens.filter((t) => t.stackId === token.stackId);
}

/** Tokens belonging to `player` eligible to receive a given throw result. */
export function getAssignableTokens(game, playerIndex, result) {
  const player = game.players[playerIndex];
  let candidates = player.tokens.filter((t) => !t.finished);
  if (result.isBackDo) {
    candidates = candidates.filter((t) => t.position !== START);
  }
  // Collapse to one representative per stack (they move as a unit) and one
  // representative for not-yet-entered tokens (interchangeable until moved).
  const seenStacks = new Set();
  let seenOffBoard = false;
  return candidates.filter((t) => {
    if (t.stackId) {
      if (seenStacks.has(t.stackId)) return false;
      seenStacks.add(t.stackId);
      return true;
    }
    if (t.position === START) {
      if (seenOffBoard) return false;
      seenOffBoard = true;
      return true;
    }
    return true;
  });
}

/**
 * Compute (without committing) what a move would do — used to drive the
 * move-preview UI required by PRD §8. Safe to call repeatedly.
 */
export function previewMove(game, tokenId, result) {
  const { token } = findToken(game, tokenId);
  if (result.isBackDo) {
    const back = stepBack(token);
    const pendingJunction = back.position && isJunction(back.position)
      ? { stationId: back.position, options: getJunctionOptions(back.position, back.prevPosition) }
      : null;
    return { isBackDo: true, path: [back.position].filter(Boolean), destination: back.position, pendingJunction };
  }
  const sim = advanceToken(token, result.steps);
  return {
    isBackDo: false,
    path: sim.history,
    destination: sim.finished ? FINISH : sim.position,
    pendingJunction: sim.pendingJunction,
  };
}

/**
 * Apply capture/stacking rules at `destination` for the group of tokens
 * (`movingIds`) that just landed there. Scoped per-player (not per-team) —
 * a teammate's token at the same station is still a separate owner for
 * capture/stacking purposes, matching traditional physical play.
 */
function applyLanding(game, mover, destination, movingIds) {
  const captured = [];
  let stacked = false;

  for (const player of game.players) {
    for (const token of player.tokens) {
      if (token.finished || token.position !== destination) continue;
      if (movingIds.includes(token.id)) continue;

      if (player.id === mover.id) {
        // Same player's own token here: merge into one permanent stack.
        const group = stackGroup(player, token);
        const stackId = token.stackId || `stack-${token.id}`;
        for (const t of group) t.stackId = stackId;
        for (const id of movingIds) {
          const moving = player.tokens.find((t) => t.id === id);
          if (moving) moving.stackId = stackId;
        }
        stacked = true;
      } else {
        // Opponent (or teammate-as-opponent) token here: capture the whole stack.
        const group = stackGroup(player, token);
        for (const t of group) {
          t.position = START;
          t.prevPosition = null;
          t.history = [];
          t.forcedNext = null;
          t.stackId = null;
          captured.push(t.id);
        }
      }
    }
  }

  return { captured, stacked };
}

/**
 * Commit a previously-previewed move. If the preview reported a
 * pendingJunction, `junctionChoiceKey` ('outer' | 'shortcut' | 'continue' |
 * 'cross') must be supplied.
 */
export function commitMove(game, playerIndex, tokenId, result, junctionChoiceKey) {
  const player = game.players[playerIndex];
  const { token } = findToken(game, tokenId);
  const group = stackGroup(player, token);
  const movingIds = group.map((t) => t.id);

  if (result.isBackDo) {
    const back = stepBack(token);
    const backJunction = back.position && isJunction(back.position)
      ? { stationId: back.position, options: getJunctionOptions(back.position, back.prevPosition) }
      : null;
    if (backJunction && !junctionChoiceKey) {
      throw new Error('junctionChoiceKey required to commit this move');
    }
    let backForcedNext = null;
    if (backJunction) {
      const chosen = backJunction.options.find((o) => o.key === junctionChoiceKey);
      if (!chosen) throw new Error(`Invalid junction choice: ${junctionChoiceKey}`);
      backForcedNext = chosen.next;
    }
    for (const t of group) {
      t.position = back.position;
      t.prevPosition = back.prevPosition;
      t.history = back.history.slice();
      t.forcedNext = backForcedNext;
    }
    const destination = back.position;
    let outcome = { finishedTokenIds: [], capturedTokenIds: [], extraThrow: false, destination };
    if (destination !== START) {
      const { captured } = applyLanding(game, player, destination, movingIds);
      outcome.capturedTokenIds = captured;
      outcome.extraThrow = captured.length > 0;
    }
    return outcome;
  }

  const sim = advanceToken(token, result.steps);
  if (sim.pendingJunction && !junctionChoiceKey) {
    throw new Error('junctionChoiceKey required to commit this move');
  }

  let forcedNext = null;
  if (sim.pendingJunction) {
    const chosen = sim.pendingJunction.options.find((o) => o.key === junctionChoiceKey);
    if (!chosen) throw new Error(`Invalid junction choice: ${junctionChoiceKey}`);
    forcedNext = chosen.next;
  }

  if (sim.finished) {
    for (const t of group) {
      t.finished = true;
      t.position = FINISH;
      t.prevPosition = null;
      t.history = sim.history.slice();
      t.forcedNext = null;
    }
    return { finishedTokenIds: movingIds, capturedTokenIds: [], extraThrow: true, destination: FINISH };
  }

  for (const t of group) {
    t.position = sim.position;
    t.prevPosition = sim.prevPosition;
    t.history = sim.history.slice();
    t.forcedNext = forcedNext;
  }

  const { captured } = applyLanding(game, player, sim.position, movingIds);
  return {
    finishedTokenIds: [],
    capturedTokenIds: captured,
    extraThrow: captured.length > 0,
    destination: sim.position,
  };
}

/** A player's full token roster, for win checking (teammates combined). */
function rosterFor(game, player) {
  if (game.teamsEnabled && player.team != null) {
    return game.players.filter((p) => p.team === player.team).flatMap((p) => p.tokens);
  }
  return player.tokens;
}

/** Returns { winnerPlayerIds, team } if the game has been won, else null. */
export function checkWin(game) {
  for (const player of game.players) {
    const roster = rosterFor(game, player);
    if (roster.length > 0 && roster.every((t) => t.finished)) {
      const winners = game.teamsEnabled && player.team != null
        ? game.players.filter((p) => p.team === player.team).map((p) => p.id)
        : [player.id];
      return { winnerPlayerIds: winners, team: player.team ?? null };
    }
  }
  return null;
}
