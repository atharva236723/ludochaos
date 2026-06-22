/* =====================================================================
   PLAYER PREFERENCES — a tiny persistent settings store (localStorage).

   Chrome only: this never touches the live game state `G`. It is the bridge
   between the profile page (where the user customizes things) and the game
   (which reads these as its menu defaults), so it is loaded FIRST on every
   page — before sound.js and state.js — so both can consult it on startup.
   Degrades to an in-memory object if localStorage is unavailable.
===================================================================== */
const Prefs = (function(){
  const KEY = 'ludoChaosPrefs';
  const DEFAULTS = {
    name:     'Guest Player',  // shown on the profile + as your name in menus
    color:    'green',         // favourite colour (avatar + your token)
    avatar:   '',              // emoji avatar; '' → fall back to name's initial
    tagline:  '',              // short motto shown under the name
    mode:     'classic',       // default rule set: 'classic' | 'chaos'
    players:  4,               // default player count: 2 | 3 | 4
    dice:     1,               // default dice count: 1 (single) | 2 (double)
    vsAI:     true,            // default opponent: true = vs Computer
    sound:    true,            // master sound on/off
    volume:   80,              // master sound volume, 0..100
    accent:   'violet',        // UI accent theme (see base.css [data-accent])
    theme:    'bright',        // colour theme (see base.css [data-theme]): bright|dark|midnight|sepia|forest
    animSpeed:'normal',        // token walk speed: relaxed|normal|fast|instant
    aiLevel:  'normal',        // computer skill: easy|normal|hard
    highlight:true,            // glow ALL of your legal moves on your turn
    pfpDataUrl:null,           // base64 profile photo; null = use emoji/initial
    stats:    { games:0, wins:0 },  // lifetime record (see recordGame/recordWin)
  };

  let mem = null;
  function read(){
    if(mem) return mem;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
    catch(e){ saved = {}; }
    mem = Object.assign({}, DEFAULTS, saved);
    return mem;
  }

  /* get() → whole object copy; get('key') → single value */
  function get(k){ const p = read(); return k ? p[k] : Object.assign({}, p); }

  /* set({key:val, ...}) merges + persists, returns the new object */
  function set(patch){
    mem = Object.assign(read(), patch);
    try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch(e){}
    return mem;
  }

  function reset(){
    mem = Object.assign({}, DEFAULTS);
    try { localStorage.removeItem(KEY); } catch(e){}
    return mem;
  }

  /* ---- lifetime record (Games / Wins) ----
     A fresh copy is always written back so the shallow get() copy can never be
     mutated in place. A game is counted when it STARTS (recordGame); a win is
     counted separately when a human takes the game (recordWin). */
  function stats(){ return Object.assign({ games:0, wins:0 }, read().stats); }
  function recordGame(){ const s=stats(); s.games++; return set({ stats:s }).stats; }
  function recordWin(){  const s=stats(); s.wins++;  return set({ stats:s }).stats; }
  function resetStats(){ return set({ stats:{ games:0, wins:0 } }).stats; }

  return { get, set, reset, DEFAULTS, stats, recordGame, recordWin, resetStats };
})();
