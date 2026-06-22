/* =====================================================================
   ONLINE MODE — Firebase Realtime Database multiplayer
   Architecture:
   • Rooms identified by a 6-char code; listed publicly (filtered by mode)
     or joined privately by code
   • The active player publishes game actions (roll / move / die_select /
     reverse) to Firebase; watching clients receive and replay them
   • All clients run the same deterministic game logic — syncing inputs
     produces identical state on every machine without syncing G
   • G.online = { myColor, roomCode, isMyTurn } is set on game start
===================================================================== */

/* ---- FIREBASE CORE ---- */
const Online = (function () {
  'use strict';

  let db = null;
  let myPlayerId = null;
  let myColor    = null;
  let myRoomCode = null;
  let _actionListener   = null;
  let _actionListenerRef = null;  // the exact query ref used when attaching _actionListener
  let _roomListener     = null;
  let _roomListenerRef  = null;
  let _lobbyListener    = null;
  let _lobbyRef         = null;   // the exact query ref used when attaching _lobbyListener

  function init() {
    if (typeof firebase === 'undefined' || !isConfigured()) return;
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    myPlayerId = _id();
  }

  function isConfigured() {
    return typeof FIREBASE_CONFIG !== 'undefined' &&
      FIREBASE_CONFIG.databaseURL &&
      !FIREBASE_CONFIG.databaseURL.includes('YOUR_PROJECT');
  }

  function _id() {
    let id = localStorage.getItem('ludoOnlineId');
    if (!id) {
      id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('ludoOnlineId', id);
    }
    return id;
  }

  function _name() {
    return (typeof Prefs !== 'undefined' && Prefs.get('name')) || 'Player';
  }

  function _code() {
    const C = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += C[Math.floor(Math.random() * C.length)];
    return s;
  }

  function _profile(color) {
    if (typeof Prefs === 'undefined') return { name: _name(), color, online: true };
    const s = Prefs.stats();
    return {
      name:    _name(),
      color,
      online:  true,
      avatar:  Prefs.get('avatar')  || '',
      tagline: Prefs.get('tagline') || '',
      stats:   { games: s.games || 0, wins: s.wins || 0 }
    };
  }

  /* ---- ROOM CREATION ---- */
  async function createRoom({ mode, diceCount, maxPlayers, isPrivate }) {
    if (!db) throw new Error('Firebase not initialized. Check js/firebase-config.js.');
    const code = _code();
    const roomRef = db.ref('rooms/' + code);
    const existing = await roomRef.child('meta/status').once('value');
    if (existing.exists()) return createRoom({ mode, diceCount, maxPlayers, isPrivate });

    await roomRef.set({
      meta: {
        mode, diceCount, maxPlayers,
        isPrivate: !!isPrivate,
        hostId: myPlayerId,
        hostName: _name(),
        status: 'waiting',
        createdAt: firebase.database.ServerValue.TIMESTAMP
      },
      players: {
        [myPlayerId]: _profile('green')
      }
    });
    roomRef.child('players/' + myPlayerId + '/online').onDisconnect().set(false);
    myColor = 'green';
    myRoomCode = code;
    return code;
  }

  /* ---- ROOM JOINING ---- */
  async function joinRoom(code) {
    if (!db) throw new Error('Firebase not initialized. Check js/firebase-config.js.');
    code = code.toUpperCase().trim();
    const roomRef = db.ref('rooms/' + code);
    const snap = await roomRef.once('value');
    if (!snap.exists()) throw new Error('Room not found. Check the code and try again.');
    const room = snap.val();
    if (room.meta.status !== 'waiting') throw new Error('This game has already started.');

    const players = room.players || {};
    // Color order must match startGame()'s active array for each player count:
    // 2p=green+blue, 3p=green+yellow+blue, 4p=green+yellow+blue+red
    const COLOR_ORDER = { 2: ['green','blue'], 3: ['green','yellow','blue'], 4: ['green','yellow','blue','red'] };
    const colors  = COLOR_ORDER[room.meta.maxPlayers] || COLOR_ORDER[4];
    const used    = Object.values(players).map(p => p.color);
    const assignedColor = colors.find(c => !used.includes(c));
    if (!assignedColor) throw new Error('Room is full.');

    await roomRef.child('players/' + myPlayerId).set(_profile(assignedColor));
    roomRef.child('players/' + myPlayerId + '/online').onDisconnect().set(false);

    myColor = assignedColor;
    myRoomCode = code;
    return { code, room: room.meta, color: assignedColor };
  }

  /* ---- PUBLIC LOBBY ---- */
  function listenPublicRooms(mode, onUpdate) {
    if (!db) return;
    if (_lobbyRef && _lobbyListener) _lobbyRef.off('value', _lobbyListener);
    _lobbyRef = db.ref('rooms').orderByChild('meta/status').equalTo('waiting');
    _lobbyListener = _lobbyRef.on('value', snap => {
        const rooms = [];
        snap.forEach(child => {
          const r = child.val();
          if (!r || !r.meta || r.meta.isPrivate || r.meta.mode !== mode) return;
          const allP = Object.values(r.players || {});
          rooms.push({
            code: child.key,
            mode: r.meta.mode,
            diceCount: r.meta.diceCount,
            maxPlayers: r.meta.maxPlayers,
            hostName: r.meta.hostName,
            playerCount: allP.length,
            onlineCount: allP.filter(p => p.online).length
          });
        });
        onUpdate(rooms);
      });
  }

  function stopLobbyListener() {
    if (!db || !_lobbyRef || !_lobbyListener) return;
    _lobbyRef.off('value', _lobbyListener);
    _lobbyRef = null;
    _lobbyListener = null;
  }

  /* ---- WAITING ROOM ---- */
  function listenWaitingRoom(code, onPlayersChange, onGameStart) {
    if (!db) return;
    _roomListenerRef = db.ref('rooms/' + code);
    _roomListener = _roomListenerRef.on('value', snap => {
      if (!snap.exists()) return;
      const room = snap.val();
      onPlayersChange(room.players || {}, room.meta);
      if (room.meta.status === 'playing') onGameStart(room.meta, room.players || {});
    });
  }

  function stopWaitingRoomListener() {
    if (_roomListenerRef && _roomListener) {
      _roomListenerRef.off('value', _roomListener);
      _roomListenerRef = null;
      _roomListener = null;
    }
  }

  /* ---- HOST START ---- */
  async function hostStartGame() {
    if (!db || !myRoomCode) return;
    await db.ref('rooms/' + myRoomCode + '/meta/status').set('playing');
  }

  /* ---- ACTION SYNC ---- */
  function publishAction(action) {
    if (!db || !myRoomCode) return;
    db.ref('rooms/' + myRoomCode + '/actions').push({
      ...action, pid: myPlayerId,
      ts: firebase.database.ServerValue.TIMESTAMP
    });
  }

  function startActionSync(code) {
    if (!db) return;
    const actRef = db.ref('rooms/' + code + '/actions');
    // Capture the latest existing key so we only receive future actions
    actRef.limitToLast(1).once('value', snap => {
      let startAfterKey = null;
      snap.forEach(child => { startAfterKey = child.key; });
      _actionListenerRef = startAfterKey
        ? actRef.orderByKey().startAfter(startAfterKey)
        : actRef.orderByKey();
      _actionListener = _actionListenerRef.on('child_added', snap => {
        const action = snap.val();
        if (!action || action.pid === myPlayerId) return;
        _applyRemoteAction(action);
      });
    });
  }

  function stopActionSync() {
    if (!db || !_actionListenerRef || !_actionListener) return;
    _actionListenerRef.off('child_added', _actionListener);
    _actionListenerRef = null;
    _actionListener = null;
  }

  /* ---- APPLY REMOTE ACTION (watching clients only) ---- */
  function _applyRemoteAction(action) {
    if (!G) return;
    switch (action.type) {

      case 'roll':
        G._onlineRollVals = action.vals;
        G.busy  = false;
        G.rolled = false;
        doRoll();
        break;

      case 'reverse':
        if (action.yes) activateReverse();
        if (G._reverseNext) {
          const next = G._reverseNext;
          G._reverseNext = null;
          next();
        }
        break;

      case 'die_select':
        // Only sync the die selection; the 'move' action does the actual move
        if (G.dicePool && G.dicePool[action.slot] && !G.dicePool[action.slot].used) {
          G.selSlot = action.slot;
          G.dice    = G.dicePool[action.slot].v;
          G.movable = legalTokens(G.dice);
          G.awaiting = true;
          G.busy = false;
          render();
        }
        break;

      case 'move': {
        // action.pid is the Firebase player ID; resolve it to a color via playerMap
        const color = (G.online && G.online.playerMap[action.pid]) || action.pid;
        const tok = G.players[color] &&
                    G.players[color].tokens[action.tid];
        if (tok && G.movable && G.movable.includes(tok)) {
          commitMove(tok);
        } else if (tok) {
          // G.movable may not be set yet (timing); recalculate then move
          G.movable = legalTokens(G.dice || 0);
          if (G.movable.includes(tok)) commitMove(tok);
        }
        break;
      }
    }
  }

  /* ---- LEAVE / CLEANUP ---- */
  async function leaveRoom() {
    stopActionSync();
    stopWaitingRoomListener();
    stopLobbyListener();
    if (db && myRoomCode) {
      try {
        await db.ref('rooms/' + myRoomCode + '/players/' + myPlayerId).remove();
      } catch (e) {}
    }
    myColor = null;
    myRoomCode = null;
  }

  /* ---- PUBLIC API ---- */
  function isMyTurn() {
    if (!G || !G.online) return false;
    return currentColor() === G.online.myColor;
  }

  return {
    init, isConfigured,
    createRoom, joinRoom,
    listenPublicRooms, stopLobbyListener,
    listenWaitingRoom, stopWaitingRoomListener,
    hostStartGame,
    publishAction, startActionSync, stopActionSync,
    leaveRoom,
    isMyTurn,
    getMyColor()    { return myColor; },
    getRoomCode()   { return myRoomCode; },
    getMyId()       { return myPlayerId; }
  };
})();

/* ================================================================
   UI CONTROLLERS — lobby, waiting room, game start
================================================================ */

let _onlineLobbyMode    = 'classic';
let _wrCurrentPlayers   = {};
let _autoStarted    = false;   // guard: only fire the auto-start once per room

/* scroll to the top of the page — respects Lenis if active */
function _scrollTop() {
  if (window.lenis) window.lenis.scrollTo(0, { immediate: true });
  else window.scrollTo(0, 0);
}

/* Show a non-blocking inline error inside a container element.
   Auto-dismisses after 5 s; re-uses the same banner div on repeat calls. */
function _showOlError(msg, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  let banner = container.querySelector('.ol-error-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'ol-error-banner';
    banner.style.cssText =
      'color:#e74c3c;background:rgba(231,76,60,.12);border:1px solid rgba(231,76,60,.4);' +
      'border-radius:8px;padding:9px 14px;font-size:13px;font-family:var(--v-sans);' +
      'margin-top:10px;width:100%;box-sizing:border-box;';
    container.appendChild(banner);
  }
  banner.textContent = msg;
  banner.style.display = 'block';
  clearTimeout(banner._t);
  banner._t = setTimeout(() => { banner.style.display = 'none'; }, 5000);
}

/* ---- ENTRY POINT: clicking the Online card ---- */
function openOnlineLobby() {
  if (typeof Auth !== 'undefined' && !Auth.isLoggedIn()) {
    showAuthModal(openOnlineLobby);
    return;
  }
  document.getElementById('start').style.display = 'none';
  document.getElementById('onlineLobby').style.display = 'flex';
  _scrollTop();
  if (!Online.isConfigured()) {
    _showOlError(
      'Firebase is not set up yet. Open js/firebase-config.js and fill in your project details.',
      'onlineLobby'
    );
    return;
  }
  setLobbyTab('public');
}

function closeOnlineLobby() {
  Online.stopLobbyListener();
  document.getElementById('onlineLobby').style.display = 'none';
  document.getElementById('start').style.display = 'block';
  _scrollTop();
}

/* ---- MODE FILTER ---- */
function setLobbyMode(mode) {
  _onlineLobbyMode = mode;
  document.querySelectorAll('#lobbyModeSeg .neon-btn')
    .forEach(b => b.classList.toggle('on', b.dataset.m === mode));
  if (document.querySelector('.lobby-tab[data-tab="public"]').classList.contains('on')) {
    _refreshPublicRooms();
  }
}

/* ---- TABS ---- */
function setLobbyTab(tab) {
  document.querySelectorAll('.lobby-tab').forEach(b =>
    b.classList.toggle('on', b.dataset.tab === tab));
  document.getElementById('publicRoomsPanel').style.display =
    tab === 'public' ? '' : 'none';
  document.getElementById('privateRoomPanel').style.display =
    tab === 'private' ? '' : 'none';
  if (tab === 'public') _refreshPublicRooms();
  else Online.stopLobbyListener();
}

function _refreshPublicRooms() {
  const list = document.getElementById('roomList');
  list.innerHTML = '<div class="ol-empty">Searching for rooms…</div>';
  Online.listenPublicRooms(_onlineLobbyMode, rooms => {
    if (!rooms.length) {
      list.innerHTML = '<div class="ol-empty">No open rooms for this mode.<br>Be the first — create one!</div>';
      return;
    }
    list.innerHTML = rooms.map(r => `
      <div class="ol-room-row">
        <div class="ol-room-info">
          <span class="ol-host">${_esc(r.hostName)}'s room</span>
          <span class="ol-meta">${r.mode === 'chaos' ? '⚡ Chaos' : '👑 Classic'} · ${r.diceCount === 2 ? 'Double dice' : 'Single die'} · up to ${r.maxPlayers}p</span>
        </div>
        <span class="ol-slots">${r.onlineCount}/${r.maxPlayers}</span>
        <button class="neon-btn ol-join" onclick="onlineJoinRoom('${_esc(r.code)}')">Join</button>
      </div>
    `).join('');
  });
}

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---- CREATE ROOM MODAL ---- */
let _crOpts = { mode: 'classic', diceCount: 1, maxPlayers: 4, isPrivate: false };

function openCreateModal() {
  _crOpts = { mode: _onlineLobbyMode, diceCount: 1, maxPlayers: 4, isPrivate: false };
  _syncModal();
  document.getElementById('createRoomModal').classList.add('show');
}
function closeCreateModal() {
  document.getElementById('createRoomModal').classList.remove('show');
}
function setCROpt(key, val) {
  _crOpts[key] = val;
  _syncModal();
}
function _syncModal() {
  const m = _crOpts;
  _segOn('crMode',    m.mode);
  _segOn('crDice',    String(m.diceCount));
  _segOn('crMaxP',    String(m.maxPlayers));
  _segOn('crPrivacy', m.isPrivate ? 'private' : 'public');
}
function _segOn(id, val) {
  document.querySelectorAll('#' + id + ' .neon-btn')
    .forEach(b => b.classList.toggle('on', b.dataset.val === val));
}

async function confirmCreateRoom() {
  const btn = document.getElementById('crCreateBtn');
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const code = await Online.createRoom(_crOpts);
    closeCreateModal();
    document.getElementById('onlineLobby').style.display = 'none';
    _enterWaitingRoom(code, _crOpts, true);
  } catch (e) {
    _showOlError(e.message, 'createRoomModal');
    btn.disabled = false; btn.textContent = 'Create Room';
  }
}

/* ---- JOIN BY CODE ---- */
async function onlineJoinRoom(code) {
  if (!code) code = document.getElementById('privateCodeInput').value;
  code = String(code).toUpperCase().trim();
  if (!code) return;
  try {
    const result = await Online.joinRoom(code);
    Online.stopLobbyListener();
    document.getElementById('onlineLobby').style.display = 'none';
    _enterWaitingRoom(result.code, result.room, false);
  } catch (e) {
    _showOlError(e.message, 'privateRoomPanel');
  }
}

/* ---- WAITING ROOM ---- */
function _enterWaitingRoom(code, roomMeta, isHost) {
  _autoStarted = false;
  const wr = document.getElementById('waitingRoom');
  wr.style.display = 'flex';
  _scrollTop();
  document.getElementById('wrCode').textContent = code;
  document.getElementById('lnCode').textContent = code;
  document.getElementById('wrModeTag').textContent =
    roomMeta.mode === 'chaos' ? '⚡ Chaos' : '👑 Classic';
  document.getElementById('wrDiceTag').textContent =
    roomMeta.diceCount === 2 ? 'Double dice' : 'Single die';
  document.getElementById('wrPlayersTag').textContent =
    'Up to ' + roomMeta.maxPlayers + ' players';
  document.getElementById('wrVisibilityTag').textContent =
    roomMeta.isPrivate ? '🔒 Private' : '🌐 Public';
  document.getElementById('wrStartBtn').style.display = isHost ? '' : 'none';
  document.getElementById('wrWaitMsg').style.display  = isHost ? 'none' : '';

  Online.listenWaitingRoom(code,
    (players, meta) => {
      const myId  = Online.getMyId();
      const online = Object.values(players).filter(p => p.online).length;

      // render player slots
      _wrCurrentPlayers = players;
      const slots = document.getElementById('wrSlots');
      slots.innerHTML = Object.entries(players).map(([pid, p]) => {
        const isMe = pid === myId;
        const cls  = 'wr-slot' + (p.online ? ' active' : ' offline') + (isMe ? ' is-me' : ' clickable');
        const click = isMe ? '' : ` onclick="wrShowProfile('${pid}')"`;
        return `<div class="${cls}"${click}>
          <span class="wr-pin" style="background:var(--${p.color})"></span>
          <span class="wr-name">${_esc(p.name)}${isMe ? ' <em>(you)</em>' : ''}</span>
          ${isMe ? '' : '<span class="wr-view">›</span>'}
          <span class="wr-dot">${p.online ? '●' : '○'}</span>
        </div>`;
      }).join('');

      // update start button (host only) — require the full lobby to prevent
      // a partial start where color assignments don't match startGame()'s expectations
      if (isHost) {
        const btn = document.getElementById('wrStartBtn');
        btn.disabled = online < meta.maxPlayers;
        btn.textContent = online < meta.maxPlayers
          ? `Waiting for players… (${online}/${meta.maxPlayers})`
          : `Start Game  (${online} players ready)`;
      }

      // keep the notification bubble in sync
      _updateLobbyNotification(online, meta.maxPlayers);

      // auto-start when lobby is full (host only, fires once)
      if (isHost && online >= meta.maxPlayers && !_autoStarted) {
        _autoStarted = true;
        wrStartGame();
      }
    },
    (meta, players) => {
      // game is starting — show animation overlay, hide waiting room / notification
      Online.stopWaitingRoomListener();
      wr.style.display = 'none';
      document.getElementById('lobbyNotification').style.display = 'none';
      _showGameStartingLoader();
      // 4 400 ms = 600 ms initial pause + three 1 100 ms ticks + 500 ms "GO!" hold
      // The board is built synchronously while the overlay is still fully visible,
      // then _hideGameStartingLoader fades it out over 600 ms.
      setTimeout(() => { _onlineStartGame(meta, players); }, 4400);
    }
  );
}

function leaveWaitingRoom() {
  _autoStarted = false;
  Online.stopWaitingRoomListener();
  Online.leaveRoom();
  document.getElementById('waitingRoom').style.display = 'none';
  document.getElementById('lobbyNotification').style.display = 'none';
  document.getElementById('start').style.display = 'block';
  _scrollTop();
}

/* Minimize the waiting room to a corner notification bubble */
function minimizeLobby() {
  document.getElementById('waitingRoom').style.display = 'none';
  document.getElementById('start').style.display = 'block';
  document.getElementById('lobbyNotification').style.display = 'flex';
}

/* Restore the waiting room from the notification bubble */
function restoreLobby() {
  document.getElementById('lobbyNotification').style.display = 'none';
  document.getElementById('start').style.display = 'none';
  document.getElementById('waitingRoom').style.display = 'flex';
}

/* Update the notification bubble's player count text */
function _updateLobbyNotification(online, max) {
  const el = document.getElementById('lnCount');
  if (el) el.textContent = online + ' / ' + max + ' player' + (max === 1 ? '' : 's') + ' in lobby';
}

/* Show the profile card for a player in the waiting room (called via onclick) */
function wrShowProfile(pid) {
  const p = _wrCurrentPlayers[pid];
  if (!p) return;
  const modal = document.getElementById('wrProfileModal');
  if (!modal) return;

  const stats   = p.stats || { games: 0, wins: 0 };
  const winRate = stats.games > 0 ? Math.round(stats.wins / stats.games * 100) : 0;
  const avatarText = p.avatar || p.name.charAt(0).toUpperCase();

  document.getElementById('wrpAvatar').textContent    = avatarText;
  document.getElementById('wrpAvatar').style.background = 'var(--' + p.color + ')';
  document.getElementById('wrpName').textContent      = p.name;
  const tl = document.getElementById('wrpTagline');
  tl.textContent    = p.tagline || '';
  tl.style.display  = p.tagline ? '' : 'none';
  document.getElementById('wrpGames').textContent = stats.games;
  document.getElementById('wrpWins').textContent  = stats.wins;
  document.getElementById('wrpRate').textContent  = winRate + '%';

  modal.style.display = 'flex';
  void modal.offsetWidth;
  modal.classList.add('wrp-active');
}

function closeWrProfile() {
  const modal = document.getElementById('wrProfileModal');
  if (!modal) return;
  modal.classList.remove('wrp-active');
  setTimeout(() => { if (!modal.classList.contains('wrp-active')) modal.style.display = 'none'; }, 220);
}

function _showGameStartingLoader() {
  const ov = document.getElementById('gameStartingOverlay');
  ov.classList.remove('gs-exit');
  ov.style.display = 'flex';
  void ov.offsetWidth;   // force reflow so entrance animations trigger
  _gsCountdown();
}

function _hideGameStartingLoader() {
  const ov = document.getElementById('gameStartingOverlay');
  if (!ov) return;
  ov.classList.add('gs-exit');
  setTimeout(() => { ov.style.display = 'none'; ov.classList.remove('gs-exit'); }, 600);
}

/* Drives the 3 → 2 → 1 → GO! sequence inside #gsNumBox.
   Each step springs in, lingers, fades out completely, then the next appears. */
function _gsCountdown() {
  const box = document.getElementById('gsNumBox');
  if (!box) return;
  box.innerHTML = '';
  const steps = ['3', '2', '1', 'GO!'];
  let i = 0;

  function showNext() {
    if (i >= steps.length) return;
    const el = document.createElement('div');
    el.className = steps[i] === 'GO!' ? 'gs-num-go' : 'gs-num-step';
    el.textContent = steps[i];
    box.appendChild(el);
    i++;
    if (i < steps.length) setTimeout(hideAndAdvance, 800);
  }

  function hideAndAdvance() {
    const cur = box.firstElementChild;
    if (!cur) { showNext(); return; }
    cur.classList.add('gs-num-out');
    // wait for exit animation (280ms) to finish before showing next
    setTimeout(() => {
      if (cur.parentNode === box) box.removeChild(cur);
      showNext();
    }, 300);
  }

  setTimeout(showNext, 600);   // brief pause before "3" drops in
}

async function wrStartGame() {
  document.getElementById('wrStartBtn').disabled = true;
  await Online.hostStartGame();
}

/* ---- ONLINE GAME START ---- */
function _onlineStartGame(meta, players) {
  // Populate the globals that startGame() reads
  selMode    = meta.mode;
  diceCount  = meta.diceCount;
  vsAI       = false;
  teamMode   = false;

  // Count active (online) players, sorted by color order
  const colorOrder = ['green', 'yellow', 'blue', 'red'];
  const activePlayers = Object.entries(players)
    .filter(([, p]) => p.online)
    .sort((a, b) => colorOrder.indexOf(a[1].color) - colorOrder.indexOf(b[1].color));

  numPlayers = activePlayers.length;
  // For 2-player online, use standard (not dual-house) mode
  twoPlayerHouseMode = 0;

  startGame();

  // Attach online metadata
  const myId = Online.getMyId();
  const myEntry = Object.entries(players).find(([pid]) => pid === myId);
  G.online = {
    myColor: myEntry ? myEntry[1].color : 'green',
    roomCode: Online.getRoomCode(),
    isMyTurn: false,
    playerMap: {}
  };
  Object.entries(players).forEach(([pid, p]) => {
    G.online.playerMap[pid] = p.color;
  });
  G.online.isMyTurn = currentColor() === G.online.myColor;

  // Override player profiles with Firebase data so the board corner cards show
  // the real player names and avatars, not the offline Prefs/AI defaults.
  // The local player also gets their pfpDataUrl since it isn't stored in Firebase.
  const _myId = Online.getMyId();
  G.playerProfiles = G.playerProfiles || {};
  Object.entries(players).forEach(([pid, p]) => {
    G.playerProfiles[p.color] = {
      name:   p.name,
      avatar: p.avatar || '',
      pfpUrl: pid === _myId && typeof Prefs !== 'undefined' ? Prefs.get('pfpDataUrl') : null,
      isAI:   false
    };
  });
  renderPlayerCorners();

  // Hide the loading overlay now that the board is built
  _hideGameStartingLoader();

  // Show turn indicator
  _renderOnlineTurnBadge();

  // Start listening for remote player actions
  Online.startActionSync(Online.getRoomCode());
}

/* ---- TURN BADGE (whose turn it is) ---- */
function _renderOnlineTurnBadge() {
  const el = document.getElementById('onlineTurnBadge');
  if (!el || !G || !G.online) return;
  if (G.online.isMyTurn) {
    el.textContent = '🎲 Your turn';
    el.className = 'online-turn-badge my-turn';
  } else {
    const col = currentColor();
    const name = Object.entries(G.online.playerMap || {}).find(([, c]) => c === col);
    el.textContent = `⏳ ${col.charAt(0).toUpperCase() + col.slice(1)}'s turn`;
    el.className = 'online-turn-badge wait-turn';
  }
  el.style.display = '';
}

/* Exported so beginTurn() in turns.js can call it */
function onlineBeginTurn() {
  if (!G || !G.online) return;
  G.online.isMyTurn = currentColor() === G.online.myColor;
  _renderOnlineTurnBadge();
}

/* Called from quitToMenu() in state.js */
function onlineQuit() {
  if (!G || !G.online) return;
  Online.stopActionSync();
  Online.leaveRoom();
  const badge = document.getElementById('onlineTurnBadge');
  if (badge) badge.style.display = 'none';
}

/* init Firebase as soon as the script loads */
Online.init();
