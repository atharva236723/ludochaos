/* =====================================================================
   RESOLUTION / NEXT TURN
   Decides what happens after a move resolves: win, bonus turn, or pass
   play to the next color.
===================================================================== */
function endResolution(extra){
  // Tick the reverse-direction countdown once per dice roll (not per pin move).
  // curPlayer() is still the reversed player at this point, before any turn change.
  tickReverse();
  render(); renderScores();
  if(G.winner){
    showWinner(G.winner);
    return;
  }
  if(extra){
    log(`<b style="text-transform:capitalize">${currentColor()}</b> gets another turn.`);
    G.rolled=false; G.awaiting=false; G.movable=null;
    G.dicePool=[]; G.selSlot=null; G.turnExtra=false;
    G.sixPlusN=null;  // don't carry compound-die state into a bonus roll
    resetDiceVisuals();
    const human = !curPlayer().isAI && !(G.online && !G.online.isMyTurn);
    curDice().forEach(d=>d.classList.toggle('ready', human));
    document.getElementById('dieArrow').classList.toggle('show', human);
    if(curPlayer().isAI) setTimeout(aiRoll, 800);
    return;
  }
  nextTurn();
}

function nextTurn(){
  G.sixStreak=0;
  G.doubleStreak=0;
  G.lockedTid=null;
  G.sixPlusN=null;
  do { G.turnIdx=(G.turnIdx+1)%G.turnColors.length; }
  while(false);
  beginTurn();
}
