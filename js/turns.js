/* =====================================================================
   TURN FLOW & DICE
   Begins each turn, handles human/AI rolling and the dice animation, and
   works out which tokens are legal to move.

   Two dice modes share this file:
     • single (G.diceCount===1) — one die, one move per roll (the classic flow).
     • double (G.diceCount===2) — two dice roll together; the player spends each
       die value on any pin (a pin may take one die, the other, or both). The
       "spend" phase is driven by beginSubMove() walking the G.dicePool.
===================================================================== */
function beginTurn(){
  // Online: refresh whose-turn flag and badge before rendering dice state
  if(typeof onlineBeginTurn === 'function') onlineBeginTurn();
  renderReverseBadge();     // refresh the badge for whoever's turn it now is
  G.rolled=false; G.awaiting=false; G.movable=null;
  G.dicePool=[]; G.selSlot=null; G.turnExtra=false;
  renderScores();
  resetDiceVisuals();
  positionDie();
  positionDieArrow();
  // Online watching clients: dice show but are not interactive (blocked in humanRoll)
  const onlineWatching = G.online && !G.online.isMyTurn;
  const human = !curPlayer().isAI && !onlineWatching;
  curDice().forEach(d=>d.classList.toggle('ready', human));
  document.getElementById('dieArrow').classList.toggle('show', human);

  if(curPlayer().isAI){
    setTimeout(aiRoll, 800);
  }
}

function humanRoll(){
  if(G.online && !G.online.isMyTurn) return;   // watching — wait for remote roll action
  if(G.busy || G.rolled || curPlayer().isAI) return;
  doRoll();
}
function aiRoll(){
  if(!G || curPlayer()===undefined) return;
  doRoll();
}

/* A tap on a current-player die: it rolls before the roll, and (in double dice)
   picks which die value to spend during the spend phase. */
function onDieClick(slot){
  if(!G || G.busy) return;
  if(G.online && !G.online.isMyTurn) return;    // watching — remote player controls this die
  if(!G.rolled){ humanRoll(); return; }          // first tap = roll the dice
  if(G.diceCount!==2 || curPlayer().isAI || !G.awaiting) return;
  const e=G.dicePool[slot];
  if(!e || e.used || legalTokens(e.v).length===0) return;   // not a usable die
  if(G.selSlot===slot) return;
  setDie(slot);
  markSelectedDie(slot);
  afterDieSelected();
}

function doRoll(){
  G.busy=true; G.rolled=true;
  const col=currentColor();
  const dice=curDice();
  dice.forEach(d=>{ d.classList.remove('ready','choose','sel','spent'); d.classList.add('rolling'); });
  document.getElementById('dieArrow').classList.remove('show');

  // flicker random pip faces for the ~0.7s the dice tumble
  const ivs=dice.map(d=>setInterval(()=>{ d.innerHTML=dieFaceHTML(1+Math.floor(Math.random()*6)); }, 80));
  setTimeout(()=>{
    ivs.forEach(clearInterval);
    Sound.roll();
    // Online: active player generates vals and publishes; watching clients use received vals
    const vals = (G && G._onlineRollVals)
      ? G._onlineRollVals
      : dice.map(()=>1+Math.floor(Math.random()*6));
    if(G) G._onlineRollVals = null;
    if(G && G.online && G.online.isMyTurn) {
      Online.publishAction({ type:'roll', vals });
    }
    dice.forEach((d,i)=>{ d.classList.remove('rolling'); d.innerHTML=dieFaceHTML(vals[i]); });
    G.lastDice[col]=vals.slice();          // each die keeps this face until next roll

    if(G.diceCount===2) rollDouble(vals);
    else                rollSingle(vals[0]);
  }, 700);
}

/* ---- single-die roll: pick a value, find legal moves, play / await ---- */
function rollSingle(val){
  G.dice=val;
  G.dicePool=[{v:val, used:false}]; G.selSlot=0;
  log(`<b style="text-transform:capitalize">${currentColor()}</b> rolled a <b>${val}</b>.`);

  // six streak (classic forfeit on three 6s)
  if(val===6) G.sixStreak++; else G.sixStreak=0;
  if(G.mode==='classic' && G.sixStreak===3){
    log(`Three 6s in a row — turn forfeited! 😬`);
    G.busy=false; nextTurn(); return;
  }

  // "double 6": a second 6 in a row lets the player flip their direction
  // (reverse.js) before this move; once decided, present the move as normal.
  if(val===6 && G.sixStreak===2){
    decideReverse(presentSingleMoves);
    return;
  }
  presentSingleMoves();
}

/* Compute and offer the legal moves for the single die just rolled (G.dice):
   pass when there are none, auto-play a lone one, otherwise await a tap. */
function presentSingleMoves(){
  G.movable = legalTokens(G.dice);
  if(G.movable.length===0){
    log(`No legal move — turn passes.`);
    G.busy=false;
    setTimeout(()=>{ endResolution(false); }, 650);
    return;
  }
  G.busy=false;
  G.awaiting=true;
  if(curPlayer().isAI){
    setTimeout(()=>{ aiPick(); }, 600);
  } else if(G.movable.length===1 && !(G.online && !G.online.isMyTurn)){
    // only one legal move — play it automatically, no tap needed
    // (watching clients wait for the remote 'move' action instead)
    render();
    setTimeout(()=>{ commitMove(G.movable[0]); }, 550);
  } else {
    render();
  }
}

/* ---- double-dice roll: build the pool, then enter the spend phase ---- */
function rollDouble(vals){
  const [a,b]=vals;
  log(`<b style="text-transform:capitalize">${currentColor()}</b> rolled <b>${a}</b> and <b>${b}</b>.`);
  G.dicePool=vals.map(v=>({v, used:false}));
  G.selSlot=null; G.turnExtra=false;

  // Detect 6+N: exactly one die is 6 — enables the compound "unlock + move" rule.
  // Stored on G so beginSubMove and the animation/apply layers can read it.
  const sixSlot=(a===6&&b!==6)?0:(b===6&&a!==6)?1:-1;
  G.sixPlusN = sixSlot>=0 ? {sixSlot, nSlot:1-sixSlot, n:vals[1-sixSlot]} : null;

  // Only a double 6 grants a bonus roll (and offers the reverse, below). Any
  // other matching pair just plays out and passes to the next player — no extra.
  // Three double 6s in a row forfeits the turn (mirrors classic's three 6s).
  const dblSix = (a===6 && b===6);
  if(dblSix){ G.doubleStreak++; } else { G.doubleStreak=0; }
  if(G.doubleStreak===3){
    log(`Three double 6s in a row — turn forfeited! 😬`);
    G.busy=false; nextTurn(); return;
  }
  if(dblSix) G.turnExtra=true;

  G.busy=false;
  // "double 6": both dice showing 6 lets the player flip their direction
  // (reverse.js) before spending either die.
  if(a===6 && b===6){
    decideReverse(beginSubMove);
    return;
  }
  beginSubMove();
}

/* The heart of the double-dice turn: spend one unused, playable die. Loops
   (via afterSubMove) until both dice are spent or none can move. */
function beginSubMove(){
  if(!G) return;

  // 6+N compound rule: when one die is 6 and the other is N, and ALL tokens are
  // still in base (no pin yet on the board), spend both dice together — the 6
  // brings a pin out and N immediately advances it.  Once at least one pin is
  // already on the track the dice are spent independently so the player can
  // freely choose which pin to move with the N die (including the newly
  // unlocked one after the 6 is spent).
  if(G.sixPlusN && !G.dicePool[G.sixPlusN.sixSlot].used){
    const {sixSlot,nSlot,n}=G.sixPlusN;
    const baseToks=legalTokens(6).filter(t=>t.state==='base');
    const hasTrack=curTeamColors().flatMap(col=>G.players[col].tokens)
                    .some(t=>t.state==='track'||t.state==='home');
    if(baseToks.length>0 && !hasTrack && !G.dicePool[nSlot].used){
      G.dicePool[sixSlot].used=true; G.dicePool[nSlot].used=true;
      markDieSpent(sixSlot); markDieSpent(nSlot);
      G.dice=6; G.selSlot=sixSlot;
      G.movable=baseToks; G.awaiting=true; G.busy=false;
      render();
      if(G.online && G.online.isMyTurn) Online.publishAction({type:'die_select', slot:sixSlot});
      if(curPlayer().isAI){
        setTimeout(aiPick,550);
      } else if(baseToks.length===1 && !(G.online && !G.online.isMyTurn)){
        setTimeout(()=>{ commitMove(baseToks[0]); },450);
      }
      return;
    }
    G.sixPlusN=null;  // track pins exist or no base tokens — fall through to independent spending
  }

  const playable = G.dicePool
    .map((e,slot)=>({e,slot}))
    .filter(o=>!o.e.used && legalTokens(o.e.v).length>0);

  if(playable.length===0){ finishTurnAfterPool(); return; }

  // If only one die can be moved, the other is forfeited: mark any unused-but-
  // unplayable die spent now so it's ignored and the turn ends after this move.
  if(playable.length===1){
    G.dicePool.forEach((e,slot)=>{
      if(!e.used && slot!==playable[0].slot){ e.used=true; markDieSpent(slot); }
    });
  }

  if(curPlayer().isAI){
    G.awaiting=true; G.busy=false; G.movable=null; G.selSlot=null;
    setTimeout(aiSpend, 550);
    return;
  }

  // human — if only one playable die remains, or both share a value, auto-pick it
  const distinct = new Set(playable.map(o=>o.e.v));
  // also auto-pick when a single pin is the only thing that can move at all:
  // both dice get spent on that lone pin anyway, so don't make the player
  // choose which die to play first — just walk it for both numbers.
  const movableTokens = new Set();
  playable.forEach(o=>legalTokens(o.e.v).forEach(t=>movableTokens.add(t)));
  if(playable.length===1 || distinct.size===1 || movableTokens.size===1){
    setDie(playable[0].slot);
    markSelectedDie(playable[0].slot);
    afterDieSelected();
  } else {
    G.selSlot=null; G.dice=null; G.movable=null;
    G.awaiting=true; G.busy=false;
    markDiceChoosable(playable.map(o=>o.slot));
    render();
  }
}

/* Select a die slot to spend: sets G.dice and recomputes the legal tokens. */
function setDie(slot){
  G.selSlot=slot;
  G.dice=G.dicePool[slot].v;
  G.movable=legalTokens(G.dice);
  G.awaiting=true; G.busy=false;
  // Online: publish die selection so watching clients know which slot was chosen
  if(G.online && G.online.isMyTurn) Online.publishAction({type:'die_select', slot});
}

/* After a die is chosen (human, double dice): auto-play a lone move or wait. */
function afterDieSelected(){
  if(!G || curPlayer().isAI) return;
  if(G.online && !G.online.isMyTurn) { render(); return; }  // watching — wait for remote 'move'
  if(G.movable.length===1){
    render();
    setTimeout(()=>{ commitMove(G.movable[0]); }, 450);
  } else {
    render();
  }
}

/* Both dice spent (or nothing left to move): resolve the turn — a bonus roll if
   one was earned, otherwise pass play on. */
function finishTurnAfterPool(){
  const extra=G.turnExtra; G.turnExtra=false;
  endResolution(extra);
}

function legalTokens(d){
  // In dual-house mode the current player controls two colors, so gather tokens
  // from all of their houses. In normal mode this is just curPlayer().tokens.
  return curTeamColors().flatMap(col=>G.players[col].tokens).filter(t=>{
    if(G.lockedTid && (t.player+''+t.id)===G.lockedTid) return false;
    return canMove(t,d);
  });
}
function canMove(t,d){
  if(t.state==='finished') return false;
  if(t.state==='base'){
    return d===6;                 // both modes: a pin leaves base only on a 6
  }
  // a reversed pin always has a legal step backward (no finish wall going this
  // way, and it can't enter the home stretch, so the gates below never apply).
  // It just rolls back around the loop. Pins already in the home stretch are
  // excluded — they stay put rather than being walked back onto the main track.
  if(playerDir(t.player)===-1) return t.state!=='home';  // track pins step backward freely; home pins stay put
  // on track or home
  const np=t.pos+d;
  if(np>56) return false;          // no overshoot in any mode — an exact roll (or under) is required
  // reverse gate: pin went into negative positions — blocked at home entry until player makes a kill
  if(t.reverseGated && t.pos<51 && np>=51 && !G.players[t.player].hasKilled) return false;
  if(G.mode==='chaos'){
    // Chaos rule 1: block entry into the home stretch without a kill.
    // Only the *transition* (track pos<51 → np>=51) is gated; movement that
    // stays within the home stretch (pin already at pos>=51) is always legal.
    // Dual-house: a kill by any color the controlling player moves counts for all
    // their tokens; in normal play each color must earn its own kill.
    if(t.pos<51 && np>=51){
      const unlocked = G.dualHouse
        ? curTeamColors().some(c=>G.players[c].hasKilled)
        : G.players[t.player].hasKilled;
      if(!unlocked) return false;
    }
  }
  return true;
}

function onTokenClick(t){
  if(G.online && !G.online.isMyTurn) return;   // watching — remote player moves this
  if(!G.awaiting || G.busy) return;
  if(!G.movable.includes(t)) return;
  commitMove(t);   // animates the walk, then resolves (see animate.js)
}

/* =====================================================================
   DICE VISUAL STATE (double dice) — choosable / selected / spent cues.
===================================================================== */
function resetDiceVisuals(){
  if(!G) return;
  G.active.forEach(col=>{
    for(let k=0;k<G.diceCount;k++){
      const d=dieEl(col,k);
      if(d) d.classList.remove('ready','choose','sel','spent');
    }
  });
}
/* mark the listed current-player slots as tappable (pick which die to spend) */
function markDiceChoosable(slots){
  curDice().forEach((d,k)=>{
    d.classList.toggle('choose', slots.includes(k));
    d.classList.remove('sel');
  });
}
function markSelectedDie(slot){
  curDice().forEach((d,k)=>{
    d.classList.toggle('sel', k===slot);
    d.classList.remove('choose');
  });
}
function markDieSpent(slot){
  const d=dieEl(currentColor(),slot);
  if(d){ d.classList.remove('choose','sel'); d.classList.add('spent'); }
}
