// Game state container + turn orchestration. Wires board.js/rules.js
// together into a playable turn sequence. No DOM access here — modes/ and
// ui/ consume this through plain function calls. See PRD §7.3 for the
// required throw-then-assign sequencing this module implements.

import { throwSticks, getAssignableTokens, previewMove, commitMove, checkWin } from './rules.js';

export function createGame({ players, tokensPerPlayer, teamsEnabled }) {
  const gamePlayers = players.map((p, idx) => ({
    id: `player-${idx}`,
    name: p.name && p.name.trim() ? p.name.trim() : `Player ${idx + 1}`,
    // Standard alternating 2v2 pairing: players 0 & 2 vs players 1 & 3.
    team: teamsEnabled ? idx % 2 : null,
    tokens: Array.from({ length: tokensPerPlayer }, (_, tIdx) => ({
      id: `${idx}-${tIdx}`,
      ownerId: `player-${idx}`,
      position: null,
      prevPosition: null,
      forcedNext: null,
      history: [],
      finished: false,
      stackId: null,
    })),
  }));

  return {
    players: gamePlayers,
    teamsEnabled: !!teamsEnabled,
    currentPlayerIndex: 0,
    pendingThrows: [],
    throwCounter: 0,
    winner: null,
    log: [],
  };
}

export function getCurrentPlayer(game) {
  return game.players[game.currentPlayerIndex];
}

function rollOnce(game) {
  const result = throwSticks();
  const id = `t${game.throwCounter++}`;
  const entry = { id, result };
  game.pendingThrows.push(entry);
  return entry;
}

/**
 * Throw the sticks, automatically chaining another throw for as long as
 * Yut/Mo keep being rolled (PRD §7.3). Returns the newly-added entries.
 */
export function rollAndChain(game) {
  const rolled = [];
  let current = rollOnce(game);
  rolled.push(current);
  while (current.result.extra) {
    current = rollOnce(game);
    rolled.push(current);
  }
  return rolled;
}

export function assignableTokensFor(game, throwId) {
  const entry = game.pendingThrows.find((t) => t.id === throwId);
  if (!entry) return [];
  return getAssignableTokens(game, game.currentPlayerIndex, entry.result);
}

export function previewAssignment(game, throwId, tokenId) {
  const entry = game.pendingThrows.find((t) => t.id === throwId);
  if (!entry) throw new Error('Unknown throw id');
  return previewMove(game, tokenId, entry.result);
}

/**
 * Commit a pending throw to a token. If the move lands exactly on a
 * junction, `junctionChoiceKey` must be supplied (see rules.commitMove).
 * Captures/finishes automatically grant and roll the next extra throw.
 */
export function resolveAssignment(game, throwId, tokenId, junctionChoiceKey) {
  const idx = game.pendingThrows.findIndex((t) => t.id === throwId);
  if (idx === -1) throw new Error('Unknown throw id');
  const { result } = game.pendingThrows[idx];

  const outcome = commitMove(game, game.currentPlayerIndex, tokenId, result, junctionChoiceKey);
  game.pendingThrows.splice(idx, 1);
  game.winner = checkWin(game);

  if (!game.winner && outcome.extraThrow) {
    rollAndChain(game);
  }
  return outcome;
}

/** Discard a pending throw with no move (e.g. Back-do with no on-board token). */
export function discardThrow(game, throwId) {
  const idx = game.pendingThrows.findIndex((t) => t.id === throwId);
  if (idx !== -1) game.pendingThrows.splice(idx, 1);
}

export function isTurnOver(game) {
  return game.pendingThrows.length === 0;
}

export function advanceTurn(game) {
  if (game.winner) return;
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  game.pendingThrows = [];
}
