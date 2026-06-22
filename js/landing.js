/* =====================================================================
   LANDING PAGE
   Builds a purely decorative, self-playing Ludo board for the intro screen
   and runs an endless roll-and-move loop (a die shows a number, then a piece
   walks that many squares). This is cosmetic only — it never touches the live
   game state `G`. The Play button is a plain <a href="play.html"> link that
   loads the real setup menu / game on its own page (animated by the View
   Transitions API); we only stop the decorative loop on the way out.

   It reuses the game's own static-board helpers (cellType / drawHouses /
   drawCenter) and markup helpers (pinHTML / dieFaceHTML), none of which depend
   on `G`, so the floating board looks identical to the one you play on.
===================================================================== */
(function(){
  const board  = document.getElementById('landingBoard');
  const layer  = document.getElementById('landingTokens');
  const dieEl  = document.getElementById('landingDie');
  const playBtn= document.getElementById('playBtn');
  if(!board || !layer || !dieEl || !playBtn) return;   // landing not on the page

  /* ---- paint the static board (classic-mode look) into #landingBoard ---- */
  function buildLandingBoard(){
    for(let r=0;r<15;r++){
      for(let c=0;c<15;c++){
        const d=document.createElement('div');
        d.className='cell';
        const t=cellType(r,c);
        if(t.kind==='track'){
          d.classList.add('path');
          const startPl=Object.values(PLAYERS).find(p=>p.start===t.idx);
          if(startPl)            d.classList.add('start-'+startPl.color);
          else if(SAFE.has(t.idx)) d.classList.add('safe');
        } else if(t.kind==='home')   d.classList.add('home-'+t.color);
        else   if(t.kind==='base')   d.classList.add('base-'+t.color);
        else   if(t.kind==='center') d.classList.add('center');
        else                         d.classList.add('dark');
        board.insertBefore(d, layer);
      }
    }
    drawHouses(board);   // colored corner yards
    drawCenter(board);   // four-triangle finish
  }

  /* a decorative token element placed at a global track index */
  function makeToken(color, gi){
    const el=document.createElement('div');
    el.className='token '+color;
    el.innerHTML=pinHTML();
    placeAt(el, gi);
    layer.appendChild(el);
    return {color, gi, el};
  }
  function placeAt(el, gi){
    const [r,c]=TRACK[gi];
    el.style.left=((c+0.5)/15)*100+'%';
    el.style.top =((r+0.5)/15)*100+'%';
  }

  /* show a freshly rolled face on the die, with a little tumble */
  function rollDie(n){
    dieEl.innerHTML=dieFaceHTML(n);
    dieEl.classList.remove('roll');
    void dieEl.offsetWidth;            // restart the animation
    dieEl.classList.add('roll');
  }

  let tokens=[], turn=0, running=true;

  /* the endless loop: roll, then walk the chosen piece that many squares */
  function cycle(){
    if(!running) return;
    const tk=tokens[turn % tokens.length];
    turn++;
    const d=1+Math.floor(Math.random()*6);
    rollDie(d);
    let steps=0;
    (function walk(){
      if(!running) return;
      if(steps>=d){ setTimeout(cycle, 750); return; }   // pause, then next piece
      tk.gi=(tk.gi+1)%52;                                // loop forever around the track
      placeAt(tk.el, tk.gi);
      steps++;
      setTimeout(walk, 300);                             // matches the .token glide
    })();
  }

  /* leaving for play.html — stop the decorative loop; the <a> handles the nav */
  function stopLoop(){ running=false; }

  buildLandingBoard();
  // one piece per colour, each parked on its own start square to begin
  tokens=ORDER.map(col=> makeToken(col, PLAYERS[col].start));
  rollDie(1);
  setTimeout(cycle, 600);

  playBtn.addEventListener('click', stopLoop);
})();
