// Turn UI: throw button, pending-throw chips, token assignment + move
// preview/confirm, scoreboard, victory banner. Talks to the engine only
// through js/modes/local.js. Phase 2 layers in i18n text, stick-throw and
// token-movement animation, sound, and a victory effect on top of the
// Phase 1 flow. Phase 3 adds driveAiTurns(), which calls the same
// performThrow/performAssignment a human's clicks trigger, but decided by
// js/modes/ai.js instead of waiting for input. Phase 4 adds `network`
// (see js/modes/online.js): when present, every interactive entry point is
// gated to the locally-controlled player's turn, and a non-host device
// routes its own actions through the network instead of calling the
// engine directly — no engine changes.

import * as local from '../modes/local.js';
import * as ai from '../modes/ai.js';
import { isTurnOver, advanceTurn, getCurrentPlayer } from '../engine/game.js';
import { drawBoardBase, drawTokens, drawPreview, clearPreview, animateTokenMove } from './render.js';
import { t, resultName, onLocaleChange } from '../i18n.js';
import * as effects from './effects.js';

const PLAYER_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad'];

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  });
  children.forEach((c) => node.appendChild(c));
  return node;
}

function findToken(game, tokenId) {
  for (const player of game.players) {
    const token = player.tokens.find((tk) => tk.id === tokenId);
    if (token) return token;
  }
  return null;
}

export function initControls(game, dom, { onNewGame, playerPhotos = [], aiPlayerIds = new Set(), network = null, aiDifficulty = 'medium' }) {
  let activeThrowId = null;
  let preview = null; // { throwId, tokenId, data }
  // True from the moment a move is confirmed until its animation + commit
  // finish. Guards chooseThrow/selectToken so a throw whose commit is
  // in-flight can't be re-entered and double-confirmed (the previous
  // confirm's own button is disabled, but re-selecting the same still-
  // pending chip would otherwise render a fresh, enabled Confirm button).
  let committing = false;

  drawBoardBase(dom.boardSvg, game);

  const unsubLocale = onLocaleChange(() => renderAll());

  /** In online play, only the locally-controlled player may act on their own turn (host included — the host is just player 0 on one screen among several). Always true for local/AI. */
  function isMyTurn() {
    return !network || !network.isOnline || network.myPlayerIndex === game.currentPlayerIndex;
  }

  function currentSelectableTokenIds() {
    if (!activeThrowId || preview || !isMyTurn()) return [];
    return local.assignableTokens(game, activeThrowId).map((tk) => tk.id);
  }

  function renderBoard() {
    drawTokens(dom.boardSvg, game, {
      selectableTokenIds: currentSelectableTokenIds(),
      onTokenClick: (tokenId) => selectToken(tokenId),
      playerPhotos,
    });
    if (preview) drawPreview(dom.boardSvg, preview.data, game.currentPlayerIndex);
    else clearPreview(dom.boardSvg);
  }

  function displayName(player, idx) {
    let name = aiPlayerIds.has(player.id) ? `🤖 ${player.name}` : player.name;
    if (network && network.isOnline && idx === network.myPlayerIndex) name += ` ${t('youSuffix')}`;
    return name;
  }

  function renderTurnBanner() {
    const idx = game.currentPlayerIndex;
    const player = getCurrentPlayer(game);
    const pending = game.pendingThrows.length;
    dom.turnBanner.innerHTML = '';
    dom.turnBanner.style.borderLeft = '';
    const dot = el('span', { class: 'turn-dot' });
    dot.style.background = PLAYER_COLORS[idx];
    const info = el('div', { class: 'turn-info' }, [
      el('div', { class: 'turn-who', text: displayName(player, idx) }),
      el('div', { class: 'turn-sub', text: pending > 0 ? t('movesToPlace', { n: pending }) : t('throwPrompt') }),
    ]);
    dom.turnBanner.append(dot, info);
  }

  function renderScoreboard() {
    dom.scoreboard.innerHTML = '';
    game.players.forEach((player, idx) => {
      const finished = player.tokens.filter((tk) => tk.finished).length;
      const teamSuffix = player.team != null ? t('teamSuffix', { team: player.team + 1 }) : '';
      const nm = el('span', { class: 'nm', text: displayName(player, idx) + teamSuffix });
      nm.style.color = PLAYER_COLORS[idx];
      const fin = el('span', { class: 'fin', text: t('scoreHome', { finished, total: player.tokens.length }) });
      const row = el('div', { class: `score-row${idx === game.currentPlayerIndex ? ' current' : ''}` }, [nm, fin]);
      dom.scoreboard.appendChild(row);
    });
  }

  function renderPendingThrows() {
    dom.pendingThrows.innerHTML = '';
    game.pendingThrows.forEach((entry) => {
      const chip = el('button', {
        type: 'button',
        class: `throw-chip${entry.result.isBackDo ? ' backdo' : ''}${entry.id === activeThrowId ? ' selected' : ''}`,
        text: `${resultName(entry.result)} · ${entry.result.isBackDo ? '−1' : '+' + entry.result.steps}`,
      });
      if (isMyTurn()) chip.addEventListener('click', () => chooseThrow(entry.id));
      dom.pendingThrows.appendChild(chip);
    });
  }

  function announce(text) {
    dom.announce.textContent = text;
  }

  function renderAssignPanel() {
    dom.assignPanel.innerHTML = '';
    dom.assignPanel.hidden = true;
    if (!activeThrowId || !isMyTurn()) return;

    const entry = game.pendingThrows.find((tk) => tk.id === activeThrowId);
    if (!entry) return;
    dom.assignPanel.hidden = false;

    if (preview) {
      renderPreviewPanel(entry);
      return;
    }

    const tokens = local.assignableTokens(game, activeThrowId);
    if (tokens.length === 0) {
      dom.assignPanel.append(
        el('div', { class: 'preview-line', text: t('noValidToken') }),
        el('button', { type: 'button', text: t('continueBtn') }, []),
      );
      dom.assignPanel.lastElementChild.addEventListener('click', () => {
        if (network && network.isOnline && !network.isHost) {
          network.sendDiscard(activeThrowId);
          activeThrowId = null;
          renderAll();
          return;
        }
        local.discardThrow(game, activeThrowId);
        activeThrowId = null;
        afterEngineChange();
        driveAiTurns();
      });
      return;
    }

    dom.assignPanel.append(
      el('div', { class: 'preview-line', text: t('chooseToken', { result: resultName(entry.result) }) }),
      el('div', { class: 'assign-tokens' }, tokens.map((token) => {
        const label = token.position == null ? t('newTokenEnter') : t('tokenLabel', { id: token.id.split('-').pop() });
        const btn = el('button', { type: 'button', class: 'assign-token-btn', text: label });
        btn.style.borderColor = PLAYER_COLORS[game.currentPlayerIndex];
        btn.addEventListener('click', () => selectToken(token.id));
        return btn;
      })),
    );
  }

  function renderPreviewPanel(entry) {
    const { data } = preview;
    const destLabel = data.destination === 'FINISH' ? t('finishLabel') : (data.destination || t('startOffBoard'));
    dom.assignPanel.append(
      el('div', { class: 'preview-line', text: t('moveToLabel', { result: resultName(entry.result), dest: destLabel }) }),
    );

    let chosenJunction = null;
    const confirmBtn = el('button', { type: 'button', text: t('confirmMove') });

    if (data.pendingJunction) {
      confirmBtn.disabled = true;
      const row = el('div', { class: 'junction-choice-row' });
      data.pendingJunction.options.forEach((option) => {
        const btn = el('button', { type: 'button', text: t(`junction.${option.key}`) });
        btn.addEventListener('click', () => {
          chosenJunction = option.key;
          [...row.children].forEach((c) => c.classList.remove('selected'));
          btn.classList.add('selected');
          confirmBtn.disabled = false;
        });
        row.appendChild(btn);
      });
      dom.assignPanel.append(
        el('div', { class: 'preview-line', text: t('junctionPrompt') }),
        row,
      );
    }

    const cancelBtn = el('button', { type: 'button', text: t('back') });
    cancelBtn.addEventListener('click', () => {
      preview = null;
      afterEngineChange();
    });

    confirmBtn.addEventListener('click', async () => {
      if (committing) return;
      committing = true;
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
      const { throwId, tokenId, data: previewData } = preview;

      if (network && network.isOnline && !network.isHost) {
        // Guest: the host is authoritative, so animate optimistically with
        // our own already-computed preview path while the request is in
        // flight, then just wait — the confirming broadcast (handled by
        // onStateReceived below) settles the real state and re-renders.
        const fromToken = findToken(game, tokenId);
        const playerIndex = game.currentPlayerIndex;
        network.sendAssign(throwId, tokenId, chosenJunction);
        await new Promise((resolve) => {
          animateTokenMove(dom.boardSvg, { fromToken, playerIndex, path: previewData.path }, resolve);
        });
        activeThrowId = null;
        preview = null;
        committing = false;
        return;
      }

      await performAssignment(throwId, tokenId, chosenJunction);
      activeThrowId = null;
      preview = null;
      committing = false;
      afterEngineChange();
      driveAiTurns();
    });

    dom.assignPanel.append(el('div', { class: 'confirm-row' }, [confirmBtn, cancelBtn]));
  }

  /** Animate + commit a chosen (tokenId, junctionChoiceKey) for a pending throw. Shared by the human Confirm button (local/host) and driveAiTurns(). */
  async function performAssignment(throwId, tokenId, junctionChoiceKey) {
    const entry = game.pendingThrows.find((p) => p.id === throwId);
    const previewData = local.previewMove(game, throwId, tokenId);
    const fromToken = findToken(game, tokenId);
    const playerIndex = game.currentPlayerIndex;

    await new Promise((resolve) => {
      animateTokenMove(dom.boardSvg, { fromToken, playerIndex, path: previewData.path }, resolve);
    });

    const outcome = local.confirmMove(game, throwId, tokenId, junctionChoiceKey);
    effects.playMove();
    const messages = [];
    if (outcome.capturedTokenIds.length > 0) {
      messages.push(t('capturedMsg'));
      effects.playCapture();
    }
    if (outcome.finishedTokenIds.length > 0) {
      messages.push(t('finishedMsg'));
      effects.playFinish();
    }
    announce(messages.join(' ') || t('playedMsg', { result: resultName(entry.result) }));
  }

  function chooseThrow(throwId) {
    if (committing || !isMyTurn()) return;
    activeThrowId = throwId;
    preview = null;
    renderAll();
  }

  function selectToken(tokenId) {
    if (!activeThrowId || committing || !isMyTurn()) return;
    const data = local.previewMove(game, activeThrowId, tokenId);
    preview = { throwId: activeThrowId, tokenId, data };
    renderAll();
  }

  function afterEngineChange() {
    if (game.winner) {
      showVictory();
      renderAll();
      if (network && network.isHost) network.broadcastState();
      return;
    }
    if (isTurnOver(game)) {
      advanceTurn(game);
      announce('');
    }
    renderAll();
    if (network && network.isHost) network.broadcastState();
  }

  function showVictory() {
    const winnerNames = game.winner.winnerPlayerIds
      .map((id) => displayName(game.players.find((p) => p.id === id), game.players.findIndex((p) => p.id === id)))
      .join(' & ');
    dom.victoryBanner.hidden = false;
    dom.victoryBanner.textContent = t('victoryMsg', { names: winnerNames, s: game.winner.winnerPlayerIds.length > 1 ? '' : 's' });
    effects.playVictory();
    effects.launchConfetti(dom.victoryBanner);
  }

  /** Sole owner of the throw button's enabled state: mid-turn, the game being won, and (online) it not being this device's turn all disable it. */
  function syncThrowButton() {
    const midTurn = game.pendingThrows.length > 0;
    dom.throwBtn.disabled = !!game.winner || midTurn || !isMyTurn();
  }

  function renderAll() {
    renderTurnBanner();
    renderScoreboard();
    renderPendingThrows();
    renderAssignPanel();
    renderBoard();
    syncThrowButton();
  }

  function animateSticksReveal(sticks) {
    const stickEls = [...dom.yutSticks.children];
    // Sticks rest showing their flat ✕ belly; a stick that lands round-side up
    // gets `is-round` to flip to the dark back (sticks[i] === true means flat).
    stickEls.forEach((stEl) => stEl.classList.remove('is-round'));
    // Force a reflow so the "rolling" class re-triggers its keyframe animation every throw.
    void dom.yutSticks.offsetWidth;
    stickEls.forEach((stEl) => stEl.classList.add('rolling'));
    return effects.delay(500).then(() => {
      stickEls.forEach((stEl, i) => {
        stEl.classList.remove('rolling');
        if (!sticks[i]) stEl.classList.add('is-round');
      });
    });
  }

  /** Sequence the stick-reveal animation for a chain of already-decided throw entries. Shared by performThrow() (local roll) and the guest state-received handler (host-relayed roll). */
  async function revealThrows(entries) {
    const revealed = [];
    for (const entry of entries) {
      await animateSticksReveal(entry.result.sticks);
      effects.playThrow();
      revealed.push(`${resultName(entry.result)} · ${entry.result.isBackDo ? t('backdoSuffix') : t('stepsSuffix', { n: entry.result.steps })}`);
      announce(revealed.join('  +  '));
      renderPendingThrows();
      await effects.delay(250);
    }
  }

  /** Roll + reveal the whole Yut/Mo chain. Shared by the human/host Throw button and driveAiTurns(); a guest never calls this for its own throw (see the throw button handler below). */
  async function performThrow() {
    dom.throwBtn.disabled = true;
    activeThrowId = null;
    preview = null;
    announce('');

    const rolled = local.throwSticks(game); // whole chain already resolved; we reveal it one throw at a time
    if (network && network.isHost) network.broadcastState();
    await revealThrows(rolled);
    renderAll();
  }

  /**
   * Auto-play consecutive AI-controlled turns: throw, then let ai.chooseMove
   * decide (and performAssignment execute) every pending throw in the chain,
   * looping across back-to-back AI players until a human's turn comes up or
   * the game is won. Not re-entrant with itself — each of its three call
   * sites only fires after the previous turn has fully settled. (AI and
   * Online are mutually exclusive modes, so aiPlayerIds is always empty
   * here when network is set.)
   */
  async function driveAiTurns() {
    while (!game.winner && aiPlayerIds.has(getCurrentPlayer(game).id)) {
      await performThrow();
      while (game.pendingThrows.length > 0 && !game.winner) {
        const throwId = game.pendingThrows[0].id;
        const decision = ai.chooseMove(game, throwId, aiDifficulty);
        if (decision) {
          await performAssignment(throwId, decision.tokenId, decision.junctionChoiceKey);
        } else {
          local.discardThrow(game, throwId);
          announce(t('noValidToken'));
        }
        renderAll();
        await effects.delay(300);
      }
      afterEngineChange();
      await effects.delay(400);
    }
  }

  dom.throwBtn.addEventListener('click', async () => {
    if (committing || !isMyTurn()) return;
    if (network && network.isOnline && !network.isHost) {
      committing = true;
      dom.throwBtn.disabled = true;
      network.sendThrow();
      // The reveal animation for this throw plays reactively once the
      // host's confirming broadcast arrives (see onStateReceived below),
      // exactly like observing anyone else's throw.
      committing = false;
      return;
    }
    committing = true;
    await performThrow();
    committing = false;
  });

  dom.rulesBtn.addEventListener('click', () => {
    dom.rulesPanel.hidden = !dom.rulesPanel.hidden;
  });

  dom.newGameBtn.addEventListener('click', () => {
    unsubLocale();
    onNewGame();
  });

  // --- Phase 4: network wiring ---

  if (network && network.isHost) {
    // Apply a validated remote request exactly like a local human/AI turn —
    // same performThrow/performAssignment, same animation, same broadcast
    // hook — the only difference is what triggered it.
    network.onActionRequest(async ({ kind, throwId, tokenId, junctionChoiceKey, fromPlayerIndex, reply }) => {
      if (committing || fromPlayerIndex !== game.currentPlayerIndex) {
        reply({ type: 'error', message: 'Not your turn' });
        return;
      }
      committing = true;
      if (kind === 'throw') {
        await performThrow();
      } else if (kind === 'assign') {
        await performAssignment(throwId, tokenId, junctionChoiceKey);
        afterEngineChange();
      } else if (kind === 'discard') {
        local.discardThrow(game, throwId);
        afterEngineChange();
      }
      committing = false;
    });
  } else if (network && network.isOnline) {
    // Guest: track which pendingThrows ids we've already animated so an
    // incoming state update only replays the reveal for genuinely new
    // throws (including the confirmation of our own sendThrow()).
    let knownThrowIds = new Set(game.pendingThrows.map((p) => p.id));
    network.onStateReceived(async (newState) => {
      const freshEntries = newState.pendingThrows.filter((p) => !knownThrowIds.has(p.id));
      Object.assign(game, newState);
      knownThrowIds = new Set(game.pendingThrows.map((p) => p.id));

      if (freshEntries.length > 0) {
        committing = true;
        dom.throwBtn.disabled = true;
        activeThrowId = null;
        preview = null;
        await revealThrows(freshEntries);
        committing = false;
      }
      if (game.winner) showVictory();
      renderAll();
    });
  }

  renderAll();
  driveAiTurns();
}
