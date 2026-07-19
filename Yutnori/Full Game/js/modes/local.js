// Local hotseat input mode: forwards on-screen control input straight to the
// engine. Players share one device and pass it between turns; there is no
// turn-ownership check here (unlike modes/online.js, which will validate
// that input came from the right connected peer).

import { rollAndChain, assignableTokensFor, previewAssignment, resolveAssignment, discardThrow as engineDiscardThrow } from '../engine/game.js';

export function throwSticks(game) {
  return rollAndChain(game);
}

export function assignableTokens(game, throwId) {
  return assignableTokensFor(game, throwId);
}

export function previewMove(game, throwId, tokenId) {
  return previewAssignment(game, throwId, tokenId);
}

export function confirmMove(game, throwId, tokenId, junctionChoiceKey) {
  return resolveAssignment(game, throwId, tokenId, junctionChoiceKey);
}

export function discardThrow(game, throwId) {
  engineDiscardThrow(game, throwId);
}
