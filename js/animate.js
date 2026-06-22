/* =====================================================================
   MOVE ANIMATION
   Walks a token one block at a time along the track — playing a step
   sound on every block — before the move's landing effects are applied.
===================================================================== */

/* The walk-pace multiplier from the saved profile preference (prefs.js).
   1 = normal; <1 faster; >1 slower; 0 = instant (skip the per-block walk). */
function animPace(){
  const sp = (typeof Prefs !== 'undefined') ? Prefs.get('animSpeed') : 'normal';
  switch(sp){
    case 'relaxed': return 1.6;
    case 'fast':    return 0.45;
    case 'instant': return 0;
    default:        return 1;
  }
}

/* (row,col) on the grid for a player + logical position (0..56). */
function posToCell(player, pos){
  const pl=PLAYERS[player];
  // +52 %52 keeps negative (reversed/wrapped) positions on a real TRACK cell.
  if(pos<=50) return TRACK[((pl.start+pos)%52+52)%52];
  return pl.home[pos-51];          // 51..56 -> home[0..5]
}

/* The ordered list of positions a token visits for a roll of d.
   Handles the Chaos bounce by reflecting off the 56 finish. */
function moveSteps(t, d){
  const steps=[];
  if(t.state==='base'){
    steps.push(0);   // pop onto the start square
    // 6+N compound: walk N steps from the entry square in the same animation
    if(G.sixPlusN && G.sixPlusN.n>0){
      let pos=0;
      for(let i=0;i<G.sixPlusN.n;i++) steps.push(++pos);
    }
    return steps;
  }
  // walk in the player's current travel direction (reversed pins step backward).
  // No overshoot/bounce: a forward walk is only ever animated for a legal (non-
  // overshooting) roll, so pos climbs at most to 56 (the finish).
  let pos=t.pos, dir=playerDir(t.player);
  for(let i=0;i<d;i++){
    pos=pos+dir;
    steps.push(pos);
  }
  return steps;
}

/* Visually step the token's DOM element block-by-block, sound per block. */
function animateMove(t, steps, onDone, opts){
  const layer=document.getElementById('tokenLayer');
  const el=layer.querySelector('[data-tid="'+t.player+t.id+'"]');
  if(!el || !steps.length){ onDone(); return; }
  const activating = !!(opts && opts.activating);   // popping out of the yard
  const pace = animPace();
  // "Instant" speed: drop the token straight on its landing cell, no walk.
  if(pace === 0){
    const [r,c]=posToCell(t.player, steps[steps.length-1]);
    el.style.left=((c+0.5)/15)*100+'%';
    el.style.top =((r+0.5)/15)*100+'%';
    if(activating) Sound.spawn(); else Sound.move(0);
    onDone(); return;
  }
  // forward walk glides smoothly between blocks (.walking); the yard pop uses
  // its own springy transition (.popping). Either way the per-block hop syncs.
  el.classList.add(activating ? 'popping' : 'walking');
  el.style.zIndex=20;
  // render() just re-created this element, so the browser hasn't painted it at
  // its starting cell yet. Force a reflow to commit that start position; without
  // this the FIRST block has no "from" state and snaps instead of gliding.
  void el.offsetWidth;
  let i=0;
  const STEP = Math.round((activating ? 360 : 300) * pace);   // ms per block, scaled by the speed pref
  (function stepOne(){
    if(i>=steps.length){ el.classList.remove('walking','popping'); onDone(); return; }
    const [r,c]=posToCell(t.player, steps[i]);
    el.style.left=((c+0.5)/15)*100+'%';
    el.style.top =((r+0.5)/15)*100+'%';
    if(activating) Sound.spawn(); else Sound.move(i);
    i++;
    setTimeout(stepOne, STEP);
  })();
}

/* Walk every just-captured token back along the track to its yard, then
   continue. Runs after the mover has landed. */
function animateCaptures(list, onDone){
  if(!list || !list.length){ onDone(); return; }
  let pending=list.length;
  list.forEach(cap=> homeward(cap, ()=>{ if(--pending===0) onDone(); }));
}

/* A single captured token retraces the path home, block by block. */
function homeward(cap, done){
  const layer=document.getElementById('tokenLayer');
  const el=layer.querySelector('[data-tid="'+cap.player+cap.id+'"]');
  const pl=PLAYERS[cap.player];
  if(!el){ done(); return; }
  // cells to visit: backward around the loop to the start square, then the yard slot
  const cells=[];
  let gi=cap.fromGi;
  while(gi!==pl.start){ gi=(gi-1+52)%52; cells.push(TRACK[gi]); }
  cells.push(pl.base[cap.id]);
  // "Instant" speed: send the captured pin straight back to its yard slot.
  if(animPace() === 0){
    const [rb,cb]=pl.base[cap.id];
    el.style.transition='none';
    el.style.left=((cb+0.5)/15)*100+'%';
    el.style.top =((rb+0.5)/15)*100+'%';
    void el.offsetWidth; el.style.transition='';
    render(); done(); return;
  }
  // snap the pin to where it was struck (no transition), then glide it home
  const [r0,c0]=TRACK[cap.fromGi];
  el.classList.add('stepping','dying');
  el.style.zIndex=25;
  el.style.transition='none';
  el.style.left=((c0+0.5)/15)*100+'%';
  el.style.top =((r0+0.5)/15)*100+'%';
  void el.offsetWidth;               // commit the snap before the glide starts
  let i=0; const STEP=Math.max(70, Math.round(140*animPace()));
  // each cell glides over exactly the per-cell delay, so the captured pin flows
  // home in one smooth, continuous motion rather than snapping block to block.
  el.style.transition='left '+STEP+'ms linear, top '+STEP+'ms linear';
  (function back(){
    if(i>=cells.length){ el.classList.remove('stepping','dying'); el.style.transition=''; render(); done(); return; }
    const [r,c]=cells[i];
    el.style.left=((c+0.5)/15)*100+'%';
    el.style.top =((r+0.5)/15)*100+'%';
    Sound.back(i);
    i++;
    setTimeout(back, STEP);
  })();
}

/* Animate the walk, then apply landing effects (capture/finish),
   then send captured tokens home. */
function performMove(t, d, onDone){
  render();                          // ensure the token element exists at its current cell
  const activating = t.state==='base';
  const steps=moveSteps(t,d);
  animateMove(t, steps, ()=>{
    G.pendingCaptures=[];            // resolveCapture() fills this during applyMove
    const extra=applyMove(t,d);      // mutate state to final pos + landing effects
    render(); renderScores();
    animateCaptures(G.pendingCaptures, ()=> onDone(extra));
  }, {activating});
}

/* Single entry point used by clicks, auto-move, and the AI. */
function commitMove(t){
  if(G.busy) return;                 // guards against a double-trigger (click + auto-move)
  G.awaiting=false; G.busy=true;
  // Online: active player publishes move immediately so watching clients start animating
  if(G.online && G.online.isMyTurn) {
    Online.publishAction({type:'move', pid:t.player, tid:t.id});
  }
  performMove(t, G.dice, (extra)=>{
    setTimeout(()=>{ G.busy=false; afterSubMove(extra); }, 220);
  });
}

/* After one move resolves: in single-die games the turn is over (resolve now);
   in double dice, mark the spent die and loop back for the other one. */
function afterSubMove(extra){
  if(G.diceCount!==2){ endResolution(extra); return; }
  if(G.selSlot!=null){ G.dicePool[G.selSlot].used=true; markDieSpent(G.selSlot); }
  if(extra) G.turnExtra=true;        // capture / finish / chaos earned a bonus roll
  G.selSlot=null; G.dice=null; G.movable=null; G.awaiting=false;
  render(); renderScores();
  if(G.winner){ endResolution(false); return; }
  setTimeout(beginSubMove, 200);     // spend the other die, or end the turn
}
