// Setup screen: mode, player count, teams, tokens per player, nicknames,
// photo-upload token faces with a coded avatar fallback (Phase 2), and
// per-player AI-controlled toggles plus an easy/medium/hard difficulty
// picker shown once "AI" mode is selected (Phase 3, see PRD §11, §13).
// Online has its own lobby flow (js/ui/onlineLobby.js). Re-renders in
// place when the language toggle fires so it stays live across a locale
// switch.

import { t, onLocaleChange } from '../i18n.js';
import { getFallbackAvatar } from './avatars.js';
import { renderOnlineLobby } from './onlineLobby.js';

const PLAYER_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad'];

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  });
  children.forEach((child) => node.appendChild(child));
  return node;
}

export function renderSetupScreen(container, { onStart, initialMode }) {
  if (container.__i18nUnsub) {
    container.__i18nUnsub();
    container.__i18nUnsub = null;
  }

  let selectedMode = (initialMode === 'ai' || initialMode === 'online') ? initialMode : 'local';
  let playerCount = 2;
  let teamsEnabled = false;
  let tokensPerPlayer = 4;
  let nicknames = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
  let playerPhotos = [null, null, null, null];
  // Default: player 1 human, the rest AI-controlled (only relevant when selectedMode === 'ai').
  let aiFlags = [false, true, true, true];
  let aiDifficulty = 'medium';
  // Kept alive across build() calls (unlike the rest of the screen, which is
  // torn down and rebuilt each time) so the online lobby's own locale
  // subscription can be found and cleaned up before this container is
  // repopulated with something else.
  const bodyContainer = el('div', { id: 'setup-body' });

  function build() {
    container.innerHTML = '';
    if (bodyContainer.__i18nUnsub) {
      bodyContainer.__i18nUnsub();
      bodyContainer.__i18nUnsub = null;
    }
    bodyContainer.innerHTML = '';

    const errorBox = el('div', { class: 'setup-error' });

    // --- Mode selection ---
    const localRadio = el('input', Object.assign({ type: 'radio', name: 'mode', value: 'local' }, selectedMode === 'local' ? { checked: 'checked' } : {}));
    const aiRadio = el('input', Object.assign({ type: 'radio', name: 'mode', value: 'ai' }, selectedMode === 'ai' ? { checked: 'checked' } : {}));
    const onlineRadio = el('input', Object.assign({ type: 'radio', name: 'mode', value: 'online' }, selectedMode === 'online' ? { checked: 'checked' } : {}));
    const modeField = el('div', { class: 'setup-field' }, [
      el('label', { text: t('mode') }),
      el('div', { class: 'mode-options' }, [
        el('label', { class: 'mode-option' }, [
          localRadio,
          document.createTextNode(` ${t('mode.local')}`),
        ]),
        el('label', { class: 'mode-option' }, [
          aiRadio,
          document.createTextNode(` ${t('mode.ai')}`),
        ]),
        el('label', { class: 'mode-option' }, [
          onlineRadio,
          document.createTextNode(` ${t('mode.online')}`),
        ]),
      ]),
    ]);
    [localRadio, aiRadio, onlineRadio].forEach((radio) => {
      radio.addEventListener('change', () => {
        selectedMode = radio.value;
        errorBox.textContent = '';
        build();
      });
    });

    // --- Player count ---
    const playerCountSelect = el('select', { id: 'player-count-select' });
    [2, 3, 4].forEach((n) => {
      playerCountSelect.appendChild(el('option', { value: String(n), text: t('playersOption', { n }) }));
    });
    playerCountSelect.value = String(playerCount);

    const teamsCheckboxField = el('div', { class: 'setup-field', id: 'teams-field' }, [
      el('label', {}, [
        el('input', Object.assign({ type: 'checkbox', id: 'teams-checkbox' }, teamsEnabled ? { checked: 'checked' } : {})),
        document.createTextNode(` ${t('teams')}`),
      ]),
    ]);
    teamsCheckboxField.style.display = playerCount === 4 ? '' : 'none';

    const tokensSelect = el('select', { id: 'tokens-select' });
    [2, 3, 4].forEach((n) => {
      tokensSelect.appendChild(el('option', { value: String(n), text: t('tokensOption', { n }) }));
    });
    tokensSelect.value = String(tokensPerPlayer);

    const difficultySelect = el('select', { id: 'ai-difficulty-select' });
    ['easy', 'medium', 'hard'].forEach((d) => {
      difficultySelect.appendChild(el('option', { value: d, text: t(`aiDifficulty.${d}`) }));
    });
    difficultySelect.value = aiDifficulty;
    difficultySelect.addEventListener('change', () => {
      aiDifficulty = difficultySelect.value;
    });

    const nicknameList = el('div', { class: 'nickname-list', id: 'nickname-list' });

    function renderNicknameInputs() {
      nicknameList.innerHTML = '';
      for (let i = 0; i < playerCount; i++) {
        const row = el('div', { class: 'nickname-row' });
        row.appendChild(el('span', { class: 'swatch', style: `background:${PLAYER_COLORS[i]}` }));

        const preview = el('img', {
          class: 'avatar-preview',
          alt: t('photoLabel'),
          title: t('photoLabel'),
          src: playerPhotos[i] || getFallbackAvatar(i, PLAYER_COLORS[i]),
        });
        const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'avatar-file-input' });
        fileInput.addEventListener('change', () => {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            playerPhotos[i] = reader.result;
            preview.src = reader.result;
          };
          reader.readAsDataURL(file);
        });
        const photoLabel = el('label', { class: 'avatar-upload' }, [fileInput, preview]);
        row.appendChild(photoLabel);

        const input = el('input', {
          type: 'text',
          maxlength: '20',
          placeholder: t('playerPlaceholder', { n: i + 1 }),
          value: nicknames[i] || t('playerPlaceholder', { n: i + 1 }),
        });
        input.addEventListener('input', () => {
          nicknames[i] = input.value;
        });
        row.appendChild(input);

        if (selectedMode === 'ai') {
          const aiCheckbox = el('input', Object.assign({ type: 'checkbox' }, aiFlags[i] ? { checked: 'checked' } : {}));
          aiCheckbox.addEventListener('change', (e) => {
            aiFlags[i] = e.target.checked;
          });
          row.appendChild(el('label', { class: 'ai-flag-label' }, [aiCheckbox, document.createTextNode(` ${t('aiCheckboxLabel')}`)]));
        }

        nicknameList.appendChild(row);
      }
    }

    playerCountSelect.addEventListener('change', () => {
      playerCount = Number(playerCountSelect.value);
      teamsCheckboxField.style.display = playerCount === 4 ? '' : 'none';
      if (playerCount !== 4) {
        teamsEnabled = false;
        document.getElementById('teams-checkbox').checked = false;
      }
      renderNicknameInputs();
    });

    teamsCheckboxField.querySelector('input').addEventListener('change', (e) => {
      teamsEnabled = e.target.checked;
    });

    tokensSelect.addEventListener('change', () => {
      tokensPerPlayer = Number(tokensSelect.value);
    });

    const rulesSummary = el('details', {}, [
      el('summary', { text: t('rulesTitle') }),
      el('div', {}, [
        el('p', {}, [el('strong', { text: t('rulesThrowLabel') }), document.createTextNode(` ${t('rulesThrow')}`)]),
        el('p', { text: t('rulesSequencing') }),
        el('p', { text: t('rulesShortcuts') }),
        el('p', { text: t('rulesCapturing') }),
        el('p', { text: t('rulesStacking') }),
        el('p', { text: t('rulesWinning') }),
      ]),
    ]);

    const startBtn = el('button', { id: 'start-game-btn', type: 'button', text: t('startGame') });
    startBtn.addEventListener('click', () => {
      errorBox.textContent = '';
      if (container.__i18nUnsub) {
        container.__i18nUnsub();
        container.__i18nUnsub = null;
      }
      onStart({
        mode: selectedMode,
        playerCount,
        teamsEnabled,
        tokensPerPlayer,
        nicknames: nicknames.slice(0, playerCount),
        playerPhotos: playerPhotos.slice(0, playerCount),
        aiPlayerFlags: selectedMode === 'ai' ? aiFlags.slice(0, playerCount) : [],
        aiDifficulty,
      });
    });

    container.append(modeField, bodyContainer);

    if (selectedMode === 'online') {
      // Online has its own room-code/lobby flow (js/ui/onlineLobby.js) —
      // it calls onStart itself once a game is actually ready, so none of
      // the local player-count/nickname fields above apply here.
      renderOnlineLobby(bodyContainer, { onStart });
      return;
    }

    renderNicknameInputs();

    const setupRowFields = [
      el('div', { class: 'setup-field' }, [el('label', { text: t('players') }), playerCountSelect]),
      el('div', { class: 'setup-field' }, [el('label', { text: t('tokensPerPlayer') }), tokensSelect]),
    ];
    if (selectedMode === 'ai') {
      setupRowFields.push(el('div', { class: 'setup-field' }, [el('label', { text: t('aiDifficulty') }), difficultySelect]));
    }

    bodyContainer.append(
      el('div', { class: 'setup-row' }, setupRowFields),
      teamsCheckboxField,
      el('div', { class: 'setup-field' }, [el('label', { text: t('nicknames') }), nicknameList]),
      rulesSummary,
      errorBox,
      startBtn,
    );
  }

  container.__i18nUnsub = onLocaleChange(() => build());
  build();
}
