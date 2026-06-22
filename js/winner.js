/* =====================================================================
   WINNER — shows the victory overlay and plays the win fanfare.
===================================================================== */
function showWinner(col){
  const ov=document.getElementById('overlay');
  const modeLabel=(G.mode==='classic'?'Classic Ludo':'Chaos Ludo')+' champion.';
  if(G.teamMode){
    const myTeam = G.teams.A.includes(col) ? G.teams.A : G.teams.B;
    const teamLabel = myTeam.map(c=>PLAYERS[c].name).join(' & ');
    document.getElementById('winText').textContent=`🏆 Team ${teamLabel} Wins!`;
    document.getElementById('winSub').textContent=modeLabel;
    ov.style.display='flex'; Sound.win();
    if(typeof Prefs!=='undefined'&&myTeam.some(c=>G.players[c]&&!G.players[c].isAI)) Prefs.recordWin();
    log(`🏆 Team ${teamLabel} wins the game!`);
  } else {
    document.getElementById('winText').textContent=`🏆 ${PLAYERS[col].name} Wins!`;
    document.getElementById('winSub').textContent=modeLabel;
    ov.style.display='flex'; Sound.win();
    if(typeof Prefs!=='undefined'&&G.players[col]&&!G.players[col].isAI) Prefs.recordWin();
    log(`🏆 <b style="text-transform:capitalize">${col}</b> wins the game!`);
  }
}
