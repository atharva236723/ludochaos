/* =====================================================================
   AI  — plays to win.
   scoreMove() ranks a single (token, die) move; the AI then plays the best.

   Key improvements over the original:
   • Multi-pin spread: tiered base-activation urgency (0 out → 120pts,
     1 out → 80pts, 2 out → 58pts, 3 out → 38pts) keeps 2-3 pins active
     simultaneously rather than racing one to home first.
   • Over-racing penalty: if one pin is 22+ squares ahead of the average
     active sibling, its pure-progress score is slightly trimmed to let
     lagging pins catch up.
   • Catch-up bonus: a lagging pin (15+ squares behind the pack average)
     gets a boost so the AI develops it rather than ignoring it.
   • Nonlinear progress multiplier: early advance matters more (×1.8)
     than mid-board (×1.5) or late-board (×1.2), since late pins already
     benefit from home-stretch / capture bonuses.
   • Chaos capture urgency: in Chaos mode without a kill, capture value
     is multiplied by 2.2; hard AI also positions to threaten opponents
     next turn.
   • Team-mode fixes: teammate tokens excluded from capture scoring in
     scoreMove, comboBonus, and threatLevel.
   Skill levels (set on profile page via prefs.js → aiLevel):
     • easy   — often plays a random legal move, loose judgment (high noise)
     • normal — picks the best move with slight tie-breaking noise
     • hard   — always the best move, sharpest spread / capture / safety
===================================================================== */
function aiLevel(){
  return (typeof Prefs !== 'undefined') ? (Prefs.get('aiLevel') || 'normal') : 'normal';
}

/* Should the AI flip its direction on a double 6? (called from reverse.js)
   Only reverses when a backward 6 lands on a capturable opponent, and never
   when any token is already in the home stretch or near it. */
function aiReverseChoice(){
  const p=curPlayer();
  if(p.tokens.some(t=>t.state==='home'||(t.state==='track'&&t.pos>=45))) return false;
  let canCapture=false;
  p.tokens.forEach(t=>{
    if(t.state!=='track') return;
    const gi=((PLAYERS[t.player].start+(t.pos-6))%52+52)%52;
    if(isSafeIdx(gi)) return;
    G.active.forEach(c=>{
      if(c===t.player||(G.teamMode&&sameTeam(t.player,c))) return;
      G.players[c].tokens.forEach(o=>{
        if(o.state==='track'&&o.pos<=50&&(PLAYERS[o.player].start+o.pos)%52===gi)
          canCapture=true;
      });
    });
  });
  return canCapture;
}

/* ---- single-die turn: pick the best legal move for G.dice ---- */
function aiPick(){
  if(!G.movable||G.movable.length===0){ endResolution(false); return; }
  const lvl=aiLevel();
  if(lvl==='easy'&&G.movable.length>1&&Math.random()<0.45){
    commitMove(G.movable[Math.floor(Math.random()*G.movable.length)]); return;
  }
  let best=G.movable[0], bestScore=-1e9;
  G.movable.forEach(t=>{
    const s=scoreMove(t,G.dice,lvl);
    if(s>bestScore){ bestScore=s; best=t; }
  });
  commitMove(best);
}

/* ---- double-dice turn: pick the best (die, token) pair from the pool ---- */
function aiSpend(){
  if(!G||!curPlayer().isAI) return;
  const lvl=aiLevel();
  const choice=aiBestAssignment(lvl);
  if(!choice){ finishTurnAfterPool(); return; }
  if(lvl==='easy'&&Math.random()<0.4){
    const opts=[];
    G.dicePool.forEach((e,slot)=>{ if(!e.used) legalTokens(e.v).forEach(t=>opts.push({slot,t})); });
    if(opts.length){ const r=opts[Math.floor(Math.random()*opts.length)];
      setDie(r.slot); commitMove(r.t); return; }
  }
  setDie(choice.slot);
  commitMove(choice.t);
}

/* Rank every unused die against every token it can legally move, with a
   look-ahead bonus for what the OTHER die could chain on the same pin. */
function aiBestAssignment(lvl){
  let best=null, bestScore=-1e9;
  G.dicePool.forEach((e,slot)=>{
    if(e.used) return;
    legalTokens(e.v).forEach(t=>{
      let s=scoreMove(t,e.v,lvl)+comboBonus(t,e.v,slot);
      if(s>bestScore){ bestScore=s; best={slot,t}; }
    });
  });
  return best;
}

/* What the remaining die could chain on the same pin after this move. */
function comboBonus(t,d,slot){
  const other=G.dicePool.find((x,i)=>i!==slot&&!x.used);
  if(!other||t.state==='base') return 0;
  if(playerDir(t.player)===-1) return 0;
  const np=t.pos+d;
  if(np>56||np>=51) return 0;
  const np2=np+other.v;
  if(np2===56) return 450;
  if(np2>56) return 0;
  if(np2<=50){
    const gi2=(PLAYERS[t.player].start+np2)%52;
    if(!isSafeIdx(gi2)){
      let bonus=0;
      G.active.forEach(c=>{
        if(c===t.player||(G.teamMode&&sameTeam(t.player,c))) return;
        G.players[c].tokens.forEach(o=>{
          if(o.state==='track'&&o.pos<=50&&(PLAYERS[o.player].start+o.pos)%52===gi2) bonus+=200;
        });
      });
      return bonus;
    }
  }
  return 0;
}

/* How exposed a square is: combined threat from opponents who can land on it
   with a roll of 1-6 next turn. Excludes safe squares and teammates. */
function threatLevel(gi, me){
  if(gi==null||isSafeIdx(gi)) return 0;
  let lvl=0;
  G.active.forEach(c=>{
    if(c===me||(G.teamMode&&sameTeam(me,c))) return;
    G.players[c].tokens.forEach(o=>{
      if(o.state==='track'&&o.pos<=50){
        const go=(PLAYERS[o.player].start+o.pos)%52;
        const dist=(gi-go+52)%52;
        if(dist>=1&&dist<=6) lvl+=60-(dist-1)*8;   // 60 (adjacent) → 20 (6 away)
      }
    });
  });
  return lvl;
}

/* =====================================================================
   SCORE A MOVE — the heart of the AI. Higher = better.
===================================================================== */
function scoreMove(t,d,lvl){
  lvl=lvl||'normal';
  const hard =lvl==='hard';
  const noise=hard?0:(lvl==='easy'?18:4);
  const col=t.player;
  const p=G.players[col];
  const activeToks=p.tokens.filter(x=>x.state==='track'||x.state==='home');
  const chaosNeedsKill=G.mode==='chaos'&&!p.hasKilled;

  // ---- Bring a token out of base (only on a 6) ----
  if(t.state==='base'){
    // Urgency scales with how few pins are currently active; having more pins
    // in play gives more move options and more capture opportunities in Chaos.
    const out=activeToks.length;
    let s=out===0?120 : out===1?80 : out===2?58 : 38;
    if(threatLevel(PLAYERS[col].start,col)>0) s+=14;  // we'd threaten someone on entry
    if(chaosNeedsKill) s+=20;                          // need active pins to find kills
    return s+Math.random()*(noise+4);
  }

  const dir=playerDir(col);
  let np=t.pos+dir*d;
  if(dir===1){
    if(np>56) return -1e6;     // overshoot — illegal
    if(np===56) return 100000; // finish — top priority
  }
  const onTrack=np<=50;
  const giT  =onTrack?((PLAYERS[col].start+np)%52+52)%52:null;
  const giNow=(t.state==='track'&&t.pos<=50)?((PLAYERS[col].start+t.pos)%52+52)%52:null;
  let s=0;

  // Home stretch (51-55): immune to capture, nearly done
  if(np>=51&&np<56) s+=650+(np-51)*40;

  // ---- Capture value ----
  let captureVal=0;
  if(onTrack&&!isSafeIdx(giT)){
    G.active.forEach(c=>{
      if(c===col||(G.teamMode&&sameTeam(col,c))) return;
      G.players[c].tokens.forEach(o=>{
        if(o.state==='track'&&o.pos<=50&&(PLAYERS[o.player].start+o.pos)%52===giT){
          let v=320+o.pos*6;
          if(o.pos>=44) v+=180;   // near-home victim is extra valuable
          captureVal+=v;
        }
      });
    });
    // Chaos: capturing unlocks home entry for ALL our pins — double the urgency
    if(chaosNeedsKill&&captureVal>0) captureVal*=2.2;
    // Chaos hard: also position close behind opponents to threaten next turn
    if(chaosNeedsKill&&captureVal===0&&hard){
      G.active.forEach(c=>{
        if(c===col||(G.teamMode&&sameTeam(col,c))) return;
        G.players[c].tokens.forEach(o=>{
          if(o.state==='track'&&o.pos<=50){
            const go=(PLAYERS[o.player].start+o.pos)%52;
            const dist=(go-giT+52)%52;   // steps from us to the opponent ahead
            if(dist>=1&&dist<=4) s+=25*(5-dist);
          }
        });
      });
    }
  }

  // Threat at landing vs current square
  const landThreat=onTrack?threatLevel(giT,col):0;
  const stayThreat=threatLevel(giNow,col);

  if(captureVal>0){
    s+=captureVal-landThreat*(hard?0.5:0.4);
  } else {
    s-=landThreat*(hard?1.2:0.85);
  }
  // Flee a threatened square when the landing is safer
  if(stayThreat>0&&landThreat<stayThreat){
    s+=(stayThreat-landThreat)*(hard?1.3:1.0);
  }

  if(onTrack&&isSafeIdx(giT)) s+=hard?75:50;

  // ---- Multi-pin aware progress ----
  if(dir===1&&onTrack){
    // Nonlinear multiplier: early advance matters more to encourage development
    // of base/lagging pins; late pins benefit from home-stretch & capture bonuses.
    s+=np*(np<25?1.8 : np<42?1.5 : 1.2);

    // Spread factor: don't over-race one pin while others lag far behind.
    if(activeToks.length>=2){
      const others=activeToks.filter(x=>x!==t);
      const avgOther=others.reduce((a,x)=>a+x.pos,0)/others.length;
      // Over-racing penalty (only applies mid-board, not near home stretch)
      if(t.pos>avgOther+22&&np<=48){
        s-=(t.pos-avgOther-22)*(hard?0.55:0.38);
      }
      // Catch-up bonus for lagging pins
      if(t.pos<avgOther-15){
        s+=(avgOther-t.pos-15)*(hard?0.75:0.52);
      }
    }
  } else if(dir===-1){
    s+=Math.abs(np)*0.5;
  }

  return s+Math.random()*noise;
}
