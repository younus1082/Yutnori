// Online mode's setup UI (Phase 4, PRD §5): Create Room / Join Room,
// room-code display, and a live connected-players list, rendered into the
// same container setup.js normally fills with the local player grid.
// Talks only to js/modes/online.js — mirrors how setup.js talks to
// js/engine/game.js.

import { t, onLocaleChange } from '../i18n.js';
import { getFallbackAvatar } from './avatars.js';
import { hostRoom, joinRoom } from '../modes/online.js';

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

export function renderOnlineLobby(container, { onStart }) {
  if (container.__i18nUnsub) {
    container.__i18nUnsub();
    container.__i18nUnsub = null;
  }

  let view = 'choose'; // choose | host-form | host-waiting | join-form | join-waiting
  let myName = '';
  let myPhoto = null;
  let tokensPerPlayer = 4;
  let teamsEnabled = false;
  let joinCode = '';
  let roomHandle = null;
  let lobbyPlayers = [];
  let errorMsg = '';
  let busy = false;

  function cleanupSubscriptions() {
    if (container.__i18nUnsub) {
      container.__i18nUnsub();
      container.__i18nUnsub = null;
    }
  }

  function nicknameAndPhotoField() {
    const preview = el('img', {
      class: 'avatar-preview',
      alt: t('photoLabel'),
      title: t('photoLabel'),
      src: myPhoto || getFallbackAvatar(0, PLAYER_COLORS[0]),
    });
    const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'avatar-file-input' });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        myPhoto = reader.result;
        preview.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
    const photoField = el('label', { class: 'avatar-upload' }, [fileInput, preview]);

    const nameInput = el('input', { type: 'text', maxlength: '20', placeholder: t('playerPlaceholder', { n: 1 }), value: myName });
    nameInput.addEventListener('input', () => {
      myName = nameInput.value;
    });

    return el('div', { class: 'nickname-row' }, [photoField, nameInput]);
  }

  function playerListEl(players) {
    return el('div', { class: 'lobby-player-list' }, players.map((p, i) => el('div', { class: 'lobby-player' }, [
      el('img', { class: 'avatar-preview avatar-preview-sm', src: p.photo || getFallbackAvatar(i, PLAYER_COLORS[i % PLAYER_COLORS.length]) }),
      document.createTextNode(p.name),
    ])));
  }

  function build() {
    container.innerHTML = '';
    const box = el('div', { class: 'online-lobby' });

    if (view === 'choose') {
      const createBtn = el('button', { type: 'button', text: t('onlineCreateBtn') });
      const joinBtn = el('button', { type: 'button', text: t('onlineJoinBtn') });
      createBtn.addEventListener('click', () => {
        view = 'host-form';
        errorMsg = '';
        build();
      });
      joinBtn.addEventListener('click', () => {
        view = 'join-form';
        errorMsg = '';
        build();
      });
      box.append(el('div', { class: 'setup-row' }, [createBtn, joinBtn]));
    } else if (view === 'host-form') {
      const tokensSelect = el('select', {});
      [2, 3, 4].forEach((n) => tokensSelect.appendChild(el('option', { value: String(n), text: t('tokensOption', { n }) })));
      tokensSelect.value = String(tokensPerPlayer);
      tokensSelect.addEventListener('change', () => {
        tokensPerPlayer = Number(tokensSelect.value);
      });

      const teamsCheckbox = el('input', Object.assign({ type: 'checkbox' }, teamsEnabled ? { checked: 'checked' } : {}));
      teamsCheckbox.addEventListener('change', (e) => {
        teamsEnabled = e.target.checked;
      });

      const createBtn = el('button', Object.assign({ type: 'button', text: t('onlineCreateBtn') }, busy ? { disabled: 'disabled' } : {}));
      createBtn.addEventListener('click', async () => {
        errorMsg = '';
        busy = true;
        build();
        try {
          roomHandle = await hostRoom({
            name: myName.trim() || t('playerPlaceholder', { n: 1 }),
            photo: myPhoto,
            onError: (msg) => {
              errorMsg = msg;
              busy = false;
              build();
            },
          });
          roomHandle.onPlayersChanged((players) => {
            lobbyPlayers = players;
            build();
          });
          lobbyPlayers = roomHandle.getPlayers();
          busy = false;
          view = 'host-waiting';
        } catch (e) {
          errorMsg = String(e && e.message ? e.message : e);
          busy = false;
        }
        build();
      });

      box.append(
        nicknameAndPhotoField(),
        el('div', { class: 'setup-row' }, [
          el('div', { class: 'setup-field' }, [el('label', { text: t('tokensPerPlayer') }), tokensSelect]),
        ]),
        el('div', { class: 'setup-field' }, [
          el('label', {}, [teamsCheckbox, document.createTextNode(` ${t('teams')}`)]),
        ]),
        createBtn,
      );
    } else if (view === 'host-waiting') {
      const canStart = lobbyPlayers.length >= 2 && !busy;
      const startBtn = el('button', Object.assign({ type: 'button', text: t('startGame') }, canStart ? {} : { disabled: 'disabled' }));
      startBtn.addEventListener('click', () => {
        busy = true;
        build();
        const { game, playerPhotos, network } = roomHandle.startGame({ tokensPerPlayer, teamsEnabled });
        cleanupSubscriptions();
        onStart({ mode: 'online', game, playerPhotos, network });
      });

      box.append(
        el('div', { class: 'room-code-display', text: t('onlineRoomCodeLabel', { code: roomHandle.code }) }),
        el('div', { class: 'preview-line', text: t('onlineWaitingForPlayers') }),
        playerListEl(lobbyPlayers),
        startBtn,
      );
    } else if (view === 'join-form') {
      const codeInput = el('input', { type: 'text', maxlength: '8', placeholder: t('onlineRoomCode'), value: joinCode, style: 'text-transform:uppercase' });
      codeInput.addEventListener('input', () => {
        joinCode = codeInput.value;
      });

      const joinBtn = el('button', Object.assign({ type: 'button', text: t('onlineJoinBtn') }, busy ? { disabled: 'disabled' } : {}));
      joinBtn.addEventListener('click', async () => {
        if (!joinCode.trim()) return;
        errorMsg = '';
        busy = true;
        view = 'join-waiting';
        build();
        try {
          const { game, playerPhotos, network } = await joinRoom({
            code: joinCode,
            name: myName.trim() || t('playerPlaceholder', { n: 2 }),
            photo: myPhoto,
            onLobbyUpdate: (players) => {
              lobbyPlayers = players;
              build();
            },
            onError: (msg) => {
              errorMsg = String(msg);
              busy = false;
              view = 'join-form';
              build();
            },
          });
          cleanupSubscriptions();
          onStart({ mode: 'online', game, playerPhotos, network });
        } catch (e) {
          errorMsg = String(e && e.message ? e.message : e);
          busy = false;
          view = 'join-form';
          build();
        }
      });

      box.append(
        nicknameAndPhotoField(),
        el('div', { class: 'setup-field' }, [el('label', { text: t('onlineRoomCode') }), codeInput]),
        joinBtn,
      );
    } else if (view === 'join-waiting') {
      box.append(
        el('div', { class: 'preview-line', text: t('onlineWaitingForHost') }),
        playerListEl(lobbyPlayers),
      );
    }

    if (view !== 'choose') {
      const backBtn = el('button', { type: 'button', text: t('back') });
      backBtn.addEventListener('click', () => {
        view = 'choose';
        errorMsg = '';
        build();
      });
      box.appendChild(backBtn);
    }

    if (errorMsg) box.appendChild(el('div', { class: 'setup-error', text: errorMsg }));
    container.appendChild(box);
  }

  container.__i18nUnsub = onLocaleChange(() => build());
  build();
}
