/* =====================================================================
   HELPERS — small shared utilities used across the game modules.
===================================================================== */
function allTokens(){ return G.active.flatMap(c=>G.players[c].tokens); }
function currentColor(){ return G.turnColors[G.turnIdx]; }
function curPlayer(){ return G.players[currentColor()]; }
/* All colors the current player controls this turn. In normal play this is
   just [currentColor()]. In 2P dual-house mode the current slot represents
   a whole team (e.g. green's turn = green+blue), so both are returned. */
function curTeamColors(){
  if(!G.dualHouse) return [currentColor()];
  const col = currentColor();
  return G.teams.A.includes(col) ? G.teams.A : G.teams.B;
}
/* The current player's die element(s). There is one die per house corner in
   single-die games, and two side-by-side in double-dice games. dieEl() fetches a
   specific slot; curDice() returns the whole row; curDie() is the first slot. */
function dieEl(col, slot){ return document.getElementById('die-'+col+'-'+slot); }
function curDice(){
  const col=currentColor(), n=(G?G.diceCount:1), out=[];
  for(let k=0;k<n;k++){ const d=dieEl(col,k); if(d) out.push(d); }
  return out;
}
function curDie(){ return dieEl(currentColor(), 0); }
function isSafeIdx(gi){
  return SAFE.has(gi);
}
/* Which way a player's pins currently travel: +1 forward (normal), -1 reversed.
   Chaos "reverse direction" (double 6 -> see reverse.js) flips this for a player
   for their next 4 turns; every movement/animation/AI calc keys off it. */
function playerDir(col){
  return (G && G.players[col] && G.players[col].reversed) ? -1 : 1;
}
/* The on-board move history was removed; log() is kept as a harmless no-op
   so the many existing log(...) call sites need no changes. */
function log(msg){}
