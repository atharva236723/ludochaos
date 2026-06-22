/* =====================================================================
   MOVE EXECUTION  (returns true if player earns another turn)
   Advances a token, handles finishing and captures.
===================================================================== */
function applyMove(t,d){
  let extra=false;
  const col=t.player;
  // per-block step sounds are played during the walk animation (animate.js)

  // Chaos: consume any standing "killer pin can't move" lock — this move is the
  // bonus turn it was guarding. resolveCapture() below may set a fresh one.
  G.lockedTid=null;

  if(t.state==='base'){
    t.state='track';
    // 6+N compound: the 6 unlocks the pin and N immediately advances it
    t.pos = (G.sixPlusN && G.sixPlusN.n>0) ? G.sixPlusN.n : 0;
    t.state = t.pos>=51 ? 'home' : 'track';
    log(`<b style="text-transform:capitalize">${col}</b> brings a token onto the board.`);
  } else {
    const dir=playerDir(col);
    // Moves never overshoot the finish now (canMove blocks an overshooting die),
    // so there's no bounce. A reversed pin may roll back past its own start into
    // negative positions; tokenCell()/globalIndex() wrap those onto real cells,
    // and it can't finish (np only decreases) so the finish check below won't fire.
    t.pos=t.pos+dir*d;
    if(t.pos<0) t.reverseGated=true;
    t.state = t.pos>=51 ? 'home' : 'track';
  }

  // a 6 grants a bonus roll only in single-die games; in double dice the bonus
  // comes from rolling doubles instead (handled at roll time in turns.js).
  if(G.dice===6 && G.diceCount===1) extra=true;

  // finishing
  if(t.pos===56){
    t.state='finished';
    G.players[col].finished++;
    extra=true;
    Sound.finish();  // fanfare for every pin that reaches home, including the 4th
    log(`🎉 <b style="text-transform:capitalize">${col}</b> sent a token HOME! (${G.players[col].finished}/4)`);
  }

  // capture
  if(t.state==='track'){
    if(resolveCapture(t)) extra=true;
  }

  // three sixes forfeits even an earned extra (classic, single die)
  if(G.mode==='classic' && G.diceCount===1 && G.sixStreak===3) extra=false;

  // win check
  if(G.players[col].finished===4){
    if(G.teamMode){
      // team wins only when both allied colors have all 4 tokens home
      const myTeam = G.teams.A.includes(col) ? G.teams.A : G.teams.B;
      const partner = myTeam.find(c=>c!==col);
      if(G.players[partner]&&G.players[partner].finished===4) G.winner=col;
    } else {
      G.winner=col;
    }
  }
  return extra;
}

function sameTeam(a,b){
  if(!G.teams) return false;
  return (G.teams.A.includes(a)&&G.teams.A.includes(b))||
         (G.teams.B.includes(a)&&G.teams.B.includes(b));
}

function resolveCapture(t){
  const gi=globalIndex(t);
  if(gi===null || isSafeIdx(gi)) return false;
  let captured=false;
  G.active.forEach(c=>{
    if(c===t.player) return;
    if(G.teamMode && sameTeam(t.player,c)) return; // allies can't capture each other
    G.players[c].tokens.forEach(o=>{
      if(o.state==='track' && globalIndex(o)===gi){
        const fromGi=globalIndex(o);          // remember where it was struck
        o.state='base'; o.pos=-1; captured=true;
        // queue a visual "walk back home along the path" (played in animate.js)
        (G.pendingCaptures||(G.pendingCaptures=[])).push({player:o.player, id:o.id, fromGi});
        Sound.capture();
        log(`💥 <b style="text-transform:capitalize">${t.player}</b> captured <b style="text-transform:capitalize">${c}</b>!`);
      }
    });
  });
  if(captured){
    // Chaos rule 1: this player has now earned the right to enter the home stretch.
    G.players[t.player].hasKilled=true;
    // Chaos rule 2: the bonus turn this capture grants may not move THIS pin again.
    if(G.mode==='chaos') G.lockedTid=t.player+''+t.id;
  }
  return captured;
}

