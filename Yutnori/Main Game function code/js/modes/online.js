// Phase 4 — online room-code play over PeerJS (PRD §5, §9). PeerJS is
// loaded from a CDN dynamically, only when Create/Join Room is actually
// used — Local and AI must keep working with no network at all.
//
// Sync model: the host holds the one authoritative `game`, mutated only
// through the same engine calls local.js/ai.js already use (see
// js/ui/controls.js's performThrow/performAssignment). After every
// mutation the host broadcasts the full serialized state; guests hold a
// mirrored copy for rendering and for their own read-only move preview,
// and never mutate the engine themselves — a guest's action is a request
// the host validates (current-player turn ownership) and applies, so
// there's nothing for a guest to reconcile or roll back.

import { createGame } from '../engine/game.js';

const PEERJS_SRC = 'https://unpkg.com/peerjs@1/dist/peerjs.min.js';
const ROOM_PREFIX = 'yutnori-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easy to read aloud/type

let peerjsLoadPromise = null;
function loadPeerJs() {
  if (window.Peer) return Promise.resolve();
  if (peerjsLoadPromise) return peerjsLoadPromise;
  peerjsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PEERJS_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load PeerJS — check your internet connection.'));
    document.head.appendChild(script);
  });
  return peerjsLoadPromise;
}

function randomRoomCode(length = 5) {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function send(conn, msg) {
  if (conn && conn.open) conn.send(msg);
}

function cloneState(game) {
  return JSON.parse(JSON.stringify(game));
}

/**
 * Create and open a room. Resolves with a handle for the lobby UI:
 *   { code, getPlayers(), onPlayersChanged(cb), startGame({tokensPerPlayer, teamsEnabled}) }
 * `startGame` builds the real engine game (host is always player 0) and
 * returns { game, playerPhotos, network } ready to hand to initControls.
 */
export async function hostRoom({ name, photo, onError }) {
  await loadPeerJs();
  const code = randomRoomCode();
  const peer = new window.Peer(ROOM_PREFIX + code);

  const hostInfo = { name, photo: photo || null };
  const guests = []; // { conn, playerIndex, name, photo }
  let actionListener = null;
  let onPlayersChanged = null;

  function currentPlayers() {
    return [hostInfo, ...guests.map((g) => ({ name: g.name, photo: g.photo }))];
  }

  function broadcastLobby() {
    const players = currentPlayers();
    guests.forEach((g) => send(g.conn, { type: 'lobby', players }));
    onPlayersChanged && onPlayersChanged(players);
  }

  return new Promise((resolve, reject) => {
    peer.on('error', (err) => {
      onError && onError(err.type === 'unavailable-id' ? 'That room code is taken — try again.' : String(err));
      reject(err);
    });

    peer.on('open', () => {
      peer.on('connection', (conn) => {
        conn.on('data', (msg) => {
          if (msg.type === 'join') {
            guests.push({ conn, playerIndex: null, name: msg.name, photo: msg.photo || null });
            broadcastLobby();
          } else if (msg.type === 'action' && actionListener) {
            const guest = guests.find((g) => g.conn === conn);
            if (guest && guest.playerIndex != null) {
              actionListener({ ...msg, fromPlayerIndex: guest.playerIndex, reply: (m) => send(conn, m) });
            }
          }
        });
        conn.on('close', () => {
          const idx = guests.findIndex((g) => g.conn === conn);
          if (idx !== -1) {
            guests.splice(idx, 1);
            broadcastLobby();
          }
        });
      });

      resolve({
        code,
        getPlayers: currentPlayers,
        onPlayersChanged(cb) {
          onPlayersChanged = cb;
        },
        startGame({ tokensPerPlayer, teamsEnabled }) {
          guests.forEach((g, idx) => {
            g.playerIndex = idx + 1;
          });
          const players = [{ name: hostInfo.name }, ...guests.map((g) => ({ name: g.name }))];
          const game = createGame({ players, tokensPerPlayer, teamsEnabled });
          const playerPhotos = [hostInfo.photo, ...guests.map((g) => g.photo)];

          function broadcastState() {
            const state = cloneState(game);
            guests.forEach((g) => send(g.conn, { type: 'state', state }));
          }

          const initialState = cloneState(game);
          guests.forEach((g) => {
            send(g.conn, { type: 'start', playerIndex: g.playerIndex, state: initialState, photos: playerPhotos });
          });

          return {
            game,
            playerPhotos,
            network: {
              isOnline: true,
              isHost: true,
              myPlayerIndex: 0,
              broadcastState,
              onActionRequest(cb) {
                actionListener = cb;
              },
            },
          };
        },
      });
    });
  });
}

/**
 * Join an existing room. Resolves once the host sends `start`, with
 * { game, playerPhotos, network } ready to hand to initControls. `network`
 * exposes sendThrow/sendAssign/sendDiscard (requests to the host) and
 * onStateReceived(cb) (fired for every full-state broadcast, including the
 * confirmation of this device's own requests).
 */
export async function joinRoom({ code, name, photo, onLobbyUpdate, onError }) {
  await loadPeerJs();
  const peer = new window.Peer();
  let stateListener = null;

  return new Promise((resolve, reject) => {
    peer.on('error', (err) => {
      onError && onError(String(err));
      reject(err);
    });

    peer.on('open', () => {
      const conn = peer.connect(ROOM_PREFIX + code.trim().toUpperCase());

      conn.on('open', () => {
        conn.send({ type: 'join', name, photo: photo || null });
      });

      conn.on('data', (msg) => {
        if (msg.type === 'lobby') {
          onLobbyUpdate && onLobbyUpdate(msg.players);
        } else if (msg.type === 'start') {
          resolve({
            game: msg.state,
            playerPhotos: msg.photos || [],
            network: {
              isOnline: true,
              isHost: false,
              myPlayerIndex: msg.playerIndex,
              sendThrow() {
                send(conn, { type: 'action', kind: 'throw' });
              },
              sendAssign(throwId, tokenId, junctionChoiceKey) {
                send(conn, { type: 'action', kind: 'assign', throwId, tokenId, junctionChoiceKey });
              },
              sendDiscard(throwId) {
                send(conn, { type: 'action', kind: 'discard', throwId });
              },
              onStateReceived(cb) {
                stateListener = cb;
              },
            },
          });
        } else if (msg.type === 'state') {
          if (stateListener) stateListener(msg.state);
        } else if (msg.type === 'error') {
          onError && onError(msg.message);
        }
      });

      conn.on('error', (err) => onError && onError(err.message || String(err)));
    });
  });
}
