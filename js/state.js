/* =====================================================================
   GAME STATE & MENU
   Holds the global game object, start-screen option handlers, and the
   start/reset (menu <-> game) transitions.
===================================================================== */
let G = null;          // game state object
let selMode = null;
let numPlayers = null;
let diceCount = null;  // 1 = single die, 2 = double dice
let vsAI = null;
let teamMode = false;  // Green+Blue vs Yellow+Red (diagonal houses); teammates can't capture each other
let twoPlayerHouseMode = 0; // 0=single house (Green vs Blue), 1=double house diagonal (Green+Blue vs Yellow+Red)
let _prev2PCount = null;    // player count before "2" was clicked, used to revert on cancel
let _prevTeamMode = false;  // teamMode value when the team modal was opened

function updateStartBtn(){
  const ready = selMode !== null && numPlayers !== null && vsAI !== null && diceCount !== null;
  const btn = document.getElementById('startBtn');
  if(btn) btn.disabled = !ready;
}

function selectMode(m){
  selMode = m;
  document.querySelectorAll('.card').forEach(c=>c.classList.toggle('sel', c.dataset.mode===m));
  updateStartBtn();
}

function updateTeamGroupVisibility(){
  const grp = document.getElementById('grpTeam');
  if(!grp) return;
  // Teams toggle only for 4-player diagonal mode; 2-player house choice uses its own modal
  const show = numPlayers === 4;
  grp.style.display = show ? '' : 'none';
  if(!show && teamMode){
    teamMode = false;
    document.querySelectorAll('#segTeam .neon-btn').forEach((b,i)=>b.classList.toggle('on', i===0));
  }
}

document.getElementById('segPlayers').addEventListener('click', e=>{
  if(!e.target.dataset.n) return;
  const n = +e.target.dataset.n;
  if(n === 2){
    _prev2PCount = numPlayers;
    [...e.currentTarget.children].forEach(b=>b.classList.toggle('on', b===e.target));
    show2PModal();
  } else {
    numPlayers = n;
    [...e.currentTarget.children].forEach(b=>b.classList.toggle('on', b===e.target));
    updateTeamGroupVisibility();
    updateStartBtn();
  }
});
document.getElementById('segAI').addEventListener('click', e=>{
  if(e.target.dataset.ai!==undefined){ vsAI = e.target.dataset.ai==='1';
    [...e.currentTarget.children].forEach(b=>b.classList.toggle('on',b===e.target));
    updateStartBtn(); }
});
document.getElementById('segDice').addEventListener('click', e=>{
  if(e.target.dataset.dice){ diceCount=+e.target.dataset.dice;
    [...e.currentTarget.children].forEach(b=>b.classList.toggle('on',b===e.target));
    updateStartBtn(); }
});
document.getElementById('segTeam').addEventListener('click', e=>{
  if(e.target.dataset.team===undefined) return;
  const want = e.target.dataset.team==='1';
  if(want){
    _prevTeamMode = teamMode;
    [...e.currentTarget.children].forEach(b=>b.classList.toggle('on', b===e.target));
    document.getElementById('teamModal').classList.add('show');
  } else {
    teamMode = false;
    [...e.currentTarget.children].forEach(b=>b.classList.toggle('on', b===e.target));
  }
});

function cancelTeamModal(){
  document.getElementById('teamModal').classList.remove('show');
  if(!_prevTeamMode){
    teamMode = false;
    document.querySelectorAll('#segTeam .neon-btn').forEach((b,i)=>b.classList.toggle('on', i===0));
  }
}
function confirmTeamModal(){
  teamMode = true;
  document.getElementById('teamModal').classList.remove('show');
}

function select2PMode(mode){
  twoPlayerHouseMode = mode;
  document.querySelectorAll('#twoPlayerPairings .team-pairing').forEach((p,i)=>
    p.classList.toggle('sel', i===mode));
}

function show2PModal(){
  select2PMode(twoPlayerHouseMode);
  document.getElementById('twoPlayerModal').classList.add('show');
}

function cancel2PModal(){
  document.getElementById('twoPlayerModal').classList.remove('show');
  numPlayers = _prev2PCount;
  document.querySelectorAll('#segPlayers .neon-btn').forEach(b=>
    b.classList.toggle('on', numPlayers !== null && +b.dataset.n===numPlayers));
  updateTeamGroupVisibility();
}

function confirm2PModal(){
  numPlayers = 2;
  document.getElementById('twoPlayerModal').classList.remove('show');
  updateTeamGroupVisibility();
  updateStartBtn();
}

(function initMenu(){
  diceCount = 1;
  const singleDieBtn = document.querySelector('#segDice [data-dice="1"]');
  if(singleDieBtn) singleDieBtn.classList.add('on');
  updateTeamGroupVisibility();
  updateStartBtn();
})();

/* =====================================================================
   START / RESET
===================================================================== */
function startGame(){
  if(selMode === null || numPlayers === null || vsAI === null || diceCount === null) return;
  // Determine active colors, team mechanics, and house assignments
  let active, teams = null, useTeamMode = false, turnColors, isDualHouse = false;

  if(numPlayers === 2 && twoPlayerHouseMode === 1){
    // 2-player double house: each player controls two diagonal houses per turn
    active = ['green','yellow','blue','red'];
    useTeamMode = true;
    isDualHouse = true;
    teams = {A:['green','blue'], B:['yellow','red']};
    turnColors = ['green','yellow'];  // only 2 turn slots; each represents one team
  } else if(teamMode){
    // 4-player: diagonal teams — Green+Blue vs Yellow+Red; each color still takes its own turn
    active = ['green','yellow','blue','red'];
    useTeamMode = true;
    teams = {A:['green','blue'], B:['yellow','red']};
    turnColors = active.slice();
  } else if(numPlayers===2){
    active = ['green','blue'];
    turnColors = active.slice();
  } else {
    active = ['green','yellow','blue','red'];
    turnColors = active.slice();
  }

  const players = {};
  active.forEach((c,i)=>{
    // in any team mode vsAI: team A = human, team B = AI
    const isAI = !vsAI ? false
                : useTeamMode ? teams.B.includes(c)
                : (i!==0);
    players[c] = {
      color:c,
      isAI,
      tokens:[0,1,2,3].map(t=>({ id:t, player:c, state:'base', pos:-1, reverseGated:false })),
      finished:0,
      hasKilled:false,         // Chaos rule: must capture once before entering home
      reversed:false,          // double 6 can flip this player's direction
      reverseMoves:0           // pin moves remaining while reversed (see reverse.js)
    };
  });

  // Per-player display profiles used by the board corner cards and name labels.
  // Green is always the setup player (first in the active list), so it gets the
  // local Prefs data. AI players get a robot emoji. Online mode overrides these
  // with Firebase data after startGame() returns (see online.js _onlineStartGame).
  const playerProfiles = {};
  active.forEach(c => {
    const pl = players[c];
    const isSetupPlayer = c === active[0];
    playerProfiles[c] = {
      name:   pl.isAI ? PLAYERS[c].name
            : (isSetupPlayer && typeof Prefs !== 'undefined') ? (Prefs.get('name') || PLAYERS[c].name)
            : PLAYERS[c].name,
      avatar: pl.isAI ? '🤖'
            : (isSetupPlayer && typeof Prefs !== 'undefined') ? (Prefs.get('avatar') || '') : '',
      pfpUrl: (!pl.isAI && isSetupPlayer && typeof Prefs !== 'undefined') ? Prefs.get('pfpDataUrl') : null,
      isAI:   pl.isAI
    };
  });

  G = {
    mode:selMode, active, players, playerProfiles,
    teamMode: useTeamMode,
    teams,
    dualHouse: isDualHouse, // true in 2P double-house mode: one player controls two diagonal houses per turn
    turnColors,             // turn cycle (may be shorter than active in dual-house mode)
    diceCount,              // 1 = single die, 2 = double dice
    turnIdx:0, dice:0, lastDice:{}, rolled:false, awaiting:false,
    sixStreak:0, busy:false,
    // ---- double-dice turn state ----
    dicePool:[],            // [{v, used}] per physical die slot for the current roll
    selSlot:null,           // which die slot the player has picked to spend
    turnExtra:false,        // a bonus roll earned this turn (capture/finish/doubles/chaos)
    doubleStreak:0,         // consecutive doubles (three forfeits, like three 6s)
    lockedTid:null,         // Chaos rule: the killer pin can't move on its bonus turn
    sixPlusN:null           // compound die state: one die is 6 (unlock) + other die (move)
  };

  // count this in the lifetime record shown on the profile (prefs.js)
  if(typeof Prefs !== 'undefined') Prefs.recordGame();

  document.getElementById('start').style.display='none';
  document.getElementById('game').style.display='flex';
  document.getElementById('overlay').style.display='none';
  // in-game styling: hide the hero title, reveal the compact brand + menu button
  document.body.classList.add('in-game');
  document.body.classList.toggle('chaos-mode', selMode==='chaos');

  buildBoard();
  buildDice();
  renderScores();
  render();
  renderPlayerCorners();
  log(`Game started — ${active.map(c=>PLAYERS[c].name).join(', ')}.`);
  beginTurn();
}

function quitToMenu(){
  if(typeof onlineQuit === 'function') onlineQuit();
  document.getElementById('game').style.display='none';
  document.getElementById('overlay').style.display='none';
  document.getElementById('confirmOverlay').style.display='none';
  document.getElementById('start').style.display='block';
  document.body.classList.remove('in-game');
  document.body.classList.remove('chaos-mode');
  const rp=document.getElementById('reversePrompt'); if(rp) rp.classList.remove('show');
  const rb=document.getElementById('reverseBadge');  if(rb) rb.classList.remove('show');
  G=null;
}

/* The Exit button routes through here: confirm before tossing a live game.
   If somehow pressed with no game running, just fall back to the menu. */
function confirmExit(){
  if(!G){ quitToMenu(); return; }
  document.getElementById('confirmOverlay').style.display='flex';
}
function hideConfirmExit(){
  document.getElementById('confirmOverlay').style.display='none';
}
function doExit(){
  hideConfirmExit();
  quitToMenu();
}
