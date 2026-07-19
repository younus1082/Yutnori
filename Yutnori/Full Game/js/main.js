// Entry point: wires the setup screen to the engine and the in-game
// controls, plus the header's language and mute toggles (Phase 2).

import { createGame } from './engine/game.js';
import { renderSetupScreen } from './ui/setup.js';
import { initControls } from './ui/controls.js';
import { t, getLocale, setLocale, onLocaleChange } from './i18n.js';
import { isSoundEnabled, setSoundEnabled } from './ui/effects.js';

const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');

const dom = {
  turnBanner: document.getElementById('turn-banner'),
  boardSvg: document.getElementById('board-svg'),
  yutSticks: document.getElementById('yut-sticks'),
  throwBtn: document.getElementById('throw-btn'),
  announce: document.getElementById('throw-result-announce'),
  pendingThrows: document.getElementById('pending-throws'),
  assignPanel: document.getElementById('assign-panel'),
  scoreboard: document.getElementById('scoreboard'),
  victoryBanner: document.getElementById('victory-banner'),
  rulesBtn: document.getElementById('rules-btn'),
  rulesPanel: document.getElementById('rules-panel'),
  newGameBtn: document.getElementById('new-game-btn'),
};

const langEnBtn = document.getElementById('lang-en-btn');
const langKoBtn = document.getElementById('lang-ko-btn');
const muteBtn = document.getElementById('mute-btn');

function renderStaticText() {
  document.title = `Yutnori (${t('appTitle')})`;
  dom.throwBtn.textContent = t('throwSticks');
  dom.rulesBtn.textContent = t('rulesTitle');
  dom.newGameBtn.textContent = t('newGame');
  dom.rulesPanel.innerHTML = `
    <h3>${t('rulesTitle')}</h3>
    <p><strong>${t('rulesThrowLabel')}</strong> ${t('rulesThrow')}</p>
    <p>${t('rulesSequencing')}</p>
    <p>${t('rulesShortcuts')}</p>
    <p>${t('rulesCapturing')}</p>
    <p>${t('rulesStacking')}</p>
    <p>${t('rulesWinning')}</p>
  `;
  langEnBtn.classList.toggle('active', getLocale() === 'en');
  langKoBtn.classList.toggle('active', getLocale() === 'ko');
  muteBtn.textContent = isSoundEnabled() ? t('muteButton') : t('unmuteButton');
}

langEnBtn.addEventListener('click', () => setLocale('en'));
langKoBtn.addEventListener('click', () => setLocale('ko'));
muteBtn.addEventListener('click', () => {
  setSoundEnabled(!isSoundEnabled());
  renderStaticText();
});
onLocaleChange(renderStaticText);
renderStaticText();

function showSetup(initialMode) {
  gameScreen.hidden = true;
  setupScreen.hidden = false;
  renderSetupScreen(setupScreen, { onStart: startGame, initialMode });
}

function startGame(config) {
  let game;
  let playerPhotos;
  let aiPlayerIds;
  let network = null;

  if (config.mode === 'online') {
    // The game already exists — built by the host in onlineLobby.js, or
    // received (as a plain deserialized snapshot) by a joining guest. Either
    // way there's no AI in online play and no local createGame() call here.
    ({ game, network } = config);
    playerPhotos = config.playerPhotos || [];
    aiPlayerIds = new Set();
  } else {
    game = createGame({
      players: config.nicknames.map((name) => ({ name })),
      tokensPerPlayer: config.tokensPerPlayer,
      teamsEnabled: config.teamsEnabled,
    });
    playerPhotos = config.playerPhotos || [];
    aiPlayerIds = new Set(
      (config.aiPlayerFlags || [])
        .map((isAi, idx) => (isAi ? `player-${idx}` : null))
        .filter(Boolean),
    );
  }

  setupScreen.hidden = true;
  gameScreen.hidden = false;
  dom.victoryBanner.hidden = true;
  dom.rulesPanel.hidden = true;
  dom.throwBtn.disabled = false;
  dom.announce.textContent = '';

  initControls(game, dom, { onNewGame: showSetup, playerPhotos, aiPlayerIds, network, aiDifficulty: config.aiDifficulty || 'medium' });
}

// "Home" button (shown in the header) returns to the entrance page,
// preserving the current language.
const homeBtn = document.getElementById('home-btn');
if (homeBtn) {
  homeBtn.addEventListener('click', () => {
    window.location.href = `index.html?lang=${encodeURIComponent(getLocale())}`;
  });
}

// The entrance page hands off the chosen mode via ?mode=local|ai|online so
// the setup screen opens with that mode pre-selected.
function initialModeFromUrl() {
  try {
    const m = new URLSearchParams(window.location.search).get('mode');
    if (m === 'local' || m === 'ai' || m === 'online') return m;
  } catch (e) { /* ignore */ }
  return undefined;
}

showSetup(initialModeFromUrl());
