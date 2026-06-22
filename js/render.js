/* =====================================================================
   RENDERING
   Maps token state to a grid cell, draws the tokens (with stacking) and
   the side-panel scoreboard.
===================================================================== */

/* token position -> (row,col) on the grid */
function tokenCell(tok){
  const pl=PLAYERS[tok.player];
  if(tok.state==='base'){ return pl.base[tok.id]; }
  // Finished tokens stay in their own color's home column, spread from deepest
  // cell outward by tok.id so same-color pins don't stack. tok.id 0 → home[5]
  // (the animation endpoint, no visual jump), 1→home[4], 2→home[3], 3→home[2].
  if(tok.state==='finished'){ return FINISHED_SPOTS[tok.player][tok.id]; }
  // mod is written +52 then %52 so a reversed pin at a negative pos (wrapped
  // back behind its own start) still maps onto a real TRACK cell.
  if(tok.pos<=50){ return TRACK[((pl.start+tok.pos)%52+52)%52]; }
  return pl.home[tok.pos-51];           // pos 51..56 -> home[0..5]
}
function globalIndex(tok){
  if(tok.state!=='track' || tok.pos>50) return null;
  return ((PLAYERS[tok.player].start+tok.pos)%52+52)%52;
}

/* inner markup for a piece: a location-pin SVG + a badge for the count/✓.
   The body is filled via the per-player --pin CSS variable. */
function pinHTML(){
  return ''+
    '<svg class="pin" viewBox="0 0 24 33" aria-hidden="true">'+
      '<path class="pin-body" fill="var(--pin)" d="M12 1C6 1 1 5.8 1 11.6 1 19.6 12 32 12 32 12 32 23 19.6 23 11.6 23 5.8 18 1 12 1Z"/>'+
      '<circle class="pin-hole" cx="12" cy="11.6" r="4.7"/>'+
    '</svg>'+
    '<span class="badge"></span>';
}

function render(){
  const layer=document.getElementById('tokenLayer');
  layer.innerHTML='';
  // group tokens by cell for stacking offsets
  const groups={};
  allTokens().forEach(t=>{
    const [r,c]=tokenCell(t);
    const key=r+','+c;
    (groups[key]=groups[key]||[]).push(t);
  });
  const cur=currentColor();
  // The gear/glow is a "pick one" prompt: only show it while a human is being
  // asked to choose between two or more legal tokens. A lone legal move plays
  // itself (see turns.js), and the AI never needs the prompt — so no gear then.
  const choosing = G.awaiting && !curPlayer().isAI && G.movable && G.movable.length>1;
  // the profile "Highlight my legal moves" pref gates the glow + spinning gear;
  // when off the pieces stay clickable but get no visual hint (a cleaner board).
  const showHint = (typeof Prefs === 'undefined') || Prefs.get('highlight') !== false;
  for(const key in groups){
    const arr=groups[key];
    arr.forEach((t,i)=>{
      const [r,c]=tokenCell(t);
      const el=document.createElement('div');
      el.className='token '+t.player+(t.state==='finished'?' in-house':'');
      el.dataset.tid=t.player+t.id;   // lets the animator find this exact token
      // stacking offset
      const n=arr.length;
      let ox=0, oy=0;
      if(n>1){ const ang=(i/n)*Math.PI*2; ox=Math.cos(ang)*0.17; oy=Math.sin(ang)*0.17; }
      const leftPct=((c+0.5+ox)/15)*100;
      const topPct =((r+0.5+oy)/15)*100;
      el.style.left=leftPct+'%';
      el.style.top =topPct+'%';
      el.innerHTML=pinHTML();
      const badge=el.querySelector('.badge');
      if(n>1 && t.state!=='finished') badge.textContent=n; // count when stacked
      if(choosing && G.movable.includes(t)){
        el.classList.add('movable');
        if(!showHint) el.classList.add('nohl');   // clickable, but no glow/gear
        // a piece out on the track/home stretch has no big white yard slot around
        // it, so its prompt gear is shrunk to sit snugly on the pin instead.
        if(t.state!=='base') el.classList.add('onboard');
        el.onclick=()=>onTokenClick(t);
      }
      layer.appendChild(el);
    });
  }
}

/* Each house corner gets its own die, parked on the board's outer edge nearest
   that player. Cells are [row,col] centres on the 15-grid. */
/* [row,col] in board-local cells (board top-left = 0,0). Rows <0 sit just above
   the top edge, rows >15 just below the bottom edge, so the die rests on the
   board's outer edge nearest each player. DIE_PAD matches .boardZone's vertical
   padding, which reserves the room the dice need outside the board. */
const DIE_PAD = 2.5;
const DIE_CORNER = { green:[-1,2], yellow:[-1,13], blue:[16,13], red:[16,2] };

/* which of the nine 3x3 grid cells carry a pip, for each face value */
const PIP_MAP = {
  0:[], 1:[4], 2:[0,8], 3:[0,4,8],
  4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8]
};
/* the face of a die as nine pip cells (dots), the lit ones marked .on */
function dieFaceHTML(n){
  const on = new Set(PIP_MAP[n] || []);
  let cells='';
  for(let i=0;i<9;i++) cells += '<span class="pip'+(on.has(i)?' on':'')+'"></span>';
  return '<div class="dieFace">'+cells+'</div>';
}

/* Build the dice at each corner: one per active player in single-die games, two
   side-by-side in double-dice games. Called once per game. Each die remembers
   which slot it is (data-slot) so the turn logic can tie it to a rolled value. */
function buildDice(){
  const layer=document.getElementById('diceLayer');
  if(!layer || !G) return;
  layer.innerHTML='';
  const n=G.diceCount;
  G.turnColors.forEach(col=>{
    const [row,c]=DIE_CORNER[col];
    for(let k=0;k<n;k++){
      const off = n===1 ? 0 : (k===0 ? -0.92 : 0.92);   // nudge the pair apart
      const d=document.createElement('div');
      d.className='die '+col+(n===2?' dual':'');
      d.id='die-'+col+'-'+k;
      d.dataset.slot=k;
      d.style.left='calc(var(--cell)*'+(c+off)+')';
      d.style.top ='calc(var(--cell)*'+(row+DIE_PAD)+')';
      d.onclick=()=>onDieClick(k);
      d.innerHTML=dieFaceHTML(0);
      layer.appendChild(d);
    }
  });
}

/* Refresh every die's face from its owner's last roll, and mark whose turn it is.
   lastDice[col] is an array (one value per slot); each die keeps showing that
   player's number until they roll again. */
function positionDie(){
  if(!G) return;
  const cur=currentColor();
  G.turnColors.forEach(col=>{
    const vals=G.lastDice[col]||[];
    for(let k=0;k<G.diceCount;k++){
      const d=dieEl(col,k);
      if(!d) continue;
      d.innerHTML=dieFaceHTML(vals[k]||0);
      d.classList.toggle('active', col===cur);
    }
  });
}

/* The turn-arrow points at the current player's die from the SIDE — it sits
   beside the die in the board's outer margin (never over the playing field) and
   points horizontally at it. Left-side players get a right-pointing arrow to the
   die's left; right-side players the mirror. Visibility is toggled by
   beginTurn/doRoll. */
function positionDieArrow(){
  const a=document.getElementById('dieArrow');
  if(!a || !G) return;
  const col=currentColor();
  const [row,c]=DIE_CORNER[col];
  const isLeft = c<7;                         // die sits on the board's left side
  a.textContent = isLeft ? '▶' : '◀';         // point back at the die
  a.style.top ='calc(var(--cell)*'+(row+DIE_PAD)+')';
  // park the arrow to the die's outer side, clear of the box. A single die is
  // 2 cells wide (edge 1 cell from center); a double-dice pair spreads its outer
  // die out to ~1.7 cells, so push the arrow further out in that case.
  const gap = G.diceCount===2 ? 3.1 : 2.2;
  a.style.left='calc(var(--cell)*'+(c + (isLeft ? -gap : gap))+')';
  a.classList.remove('left','right','up','down');
  a.classList.add(isLeft ? 'right' : 'left'); // bob toward the die
}

/* The on-board scores list was removed from the UI; kept as a guarded no-op so
   the existing call sites (beginTurn / endResolution) stay harmless. */
function renderScores(){
  const box=document.getElementById('scores');
  if(box) box.innerHTML='';
}

/* Player-identity cards rendered in side columns flanking the board.
   #playerSideLeft holds green (top) + red (bottom).
   #playerSideRight holds yellow (top) + blue (bottom).
   Cards are flex items; vertical alignment is handled by CSS space-between. */
function renderPlayerCorners(){
  if(!G) return;
  const left =document.getElementById('playerSideLeft');
  const right=document.getElementById('playerSideRight');
  if(!left || !right) return;
  left.innerHTML='';
  right.innerHTML='';

  // yellow and blue belong to the right column; green and red to the left
  const RIGHT_SIDE={yellow:true, blue:true};

  G.active.forEach(color=>{
    const prof=(G.playerProfiles && G.playerProfiles[color]) ||
               {name:PLAYERS[color].name, avatar:'', pfpUrl:null, isAI:false};

    const safeName=prof.name
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const avatarInner=prof.pfpUrl
      ? `<img src="${prof.pfpUrl}" class="pcc-img" alt="">`
      : (prof.avatar || prof.name.charAt(0).toUpperCase());

    const card=document.createElement('div');
    card.className='player-corner-card pcc-'+color;
    card.innerHTML=
      `<div class="pcc-avatar" style="--pcc-col:var(--${color})">${avatarInner}</div>`+
      `<div class="pcc-name">${safeName}</div>`;

    (RIGHT_SIDE[color] ? right : left).appendChild(card);
  });
}
