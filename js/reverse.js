/* =====================================================================
   REVERSE DIRECTION (double 6) — both Classic and Chaos modes
   When a player rolls a "double 6" (two 6s in a row on a single die,
   or both dice showing 6), they may flip their travel direction.
   While reversed every pin that player moves steps BACKWARD around
   the loop; the effect lasts exactly 4 dice rolls, then flips back.

   The actual backward movement is handled wherever direction matters —
   playerDir() (helpers.js) is the single switch the move/animation/AI
   code reads. This file owns the player-facing decision (the button /
   AI choice), the per-move countdown, and the on-screen indicator.
===================================================================== */

/* Offer the reverse choice, then run `next()` to continue the turn.
   Humans get a blocking prompt; the AI decides instantly via its
   heuristic. Either way `next()` resumes with the direction already set. */
function decideReverse(next){
  if(!G){ return; }
  if(curPlayer().isAI){
    if(aiReverseChoice()) activateReverse();
    next();
    return;
  }
  // Online watching client: don't show the prompt — wait for remote 'reverse' action
  if(G.online && !G.online.isMyTurn){
    G._reverseNext=next;
    return;
  }
  // human — pause the turn on a Reverse / Keep-forward prompt
  G.busy=true;
  G._reverseNext=next;
  showReversePrompt();
}

/* The prompt's two buttons route here (see #reversePrompt in play.html). */
function chooseReverse(yes){
  if(!G || !G._reverseNext) return;
  const next=G._reverseNext; G._reverseNext=null;
  hideReversePrompt();
  if(yes) activateReverse();
  G.busy=false;
  // Online: publish the human's reverse choice so watching clients apply it
  if(G.online && G.online.isMyTurn) Online.publishAction({type:'reverse', yes});
  next();
}

/* Flip the current player's direction for the next 4 dice rolls. */
function activateReverse(){
  const p=curPlayer();
  p.reversed=true;
  p.reverseMoves=4;
  if(typeof Sound!=='undefined' && Sound.reverse) Sound.reverse();
  log(`🔄 <b style="text-transform:capitalize">${currentColor()}</b> reverses direction for 4 rolls!`);
  renderReverseBadge();
}

/* Called once per dice roll (from endResolution) to count down the reverse spell.
   When the 4 rolls are spent the direction flips back automatically. */
function tickReverse(){
  if(!G) return;
  const p=curPlayer();
  if(p && p.reversed){
    p.reverseMoves--;
    if(p.reverseMoves<=0){ p.reversed=false; p.reverseMoves=0; }
  }
  renderReverseBadge();
}

/* ---- UI ---- */
function showReversePrompt(){
  const el=document.getElementById('reversePrompt');
  if(el) el.classList.add('show');
}
function hideReversePrompt(){
  const el=document.getElementById('reversePrompt');
  if(el) el.classList.remove('show');
}

/* A small corner badge while the current player is reversed, showing
   how many moves remain. */
function renderReverseBadge(){
  const el=document.getElementById('reverseBadge');
  if(!el) return;
  const p=G && curPlayer();
  if(p && p.reversed){
    const left=p.reverseMoves;
    el.textContent='🔄 '+currentColor().replace(/^./,c=>c.toUpperCase())+
                   ' reversed · '+left+' roll'+(left===1?'':'s')+' left';
    el.classList.add('show');
  } else {
    el.classList.remove('show');
  }
}
