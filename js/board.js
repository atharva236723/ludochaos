/* =====================================================================
   BOARD BUILDING (static cells)
   Works out what each grid square is and paints the DOM board, plus the
   colored center finish marker.
===================================================================== */
function cellType(r,c){
  // home columns
  for(const k in PLAYERS){
    if(PLAYERS[k].home.some(([hr,hc])=>hr===r&&hc===c)) return {kind:'home', color:PLAYERS[k].color};
  }
  // track
  const ti = TRACK.findIndex(([tr,tc])=>tr===r&&tc===c);
  if(ti>=0) return {kind:'track', idx:ti};
  // center 3x3
  if(r>=6&&r<=8&&c>=6&&c<=8) return {kind:'center'};
  // base corner
  if(r<=5&&c<=5) return {kind:'base', color:'green'};
  if(r<=5&&c>=9) return {kind:'base', color:'yellow'};
  if(r>=9&&c>=9) return {kind:'base', color:'blue'};
  if(r>=9&&c<=5) return {kind:'base', color:'red'};
  return {kind:'empty'};
}

function buildBoard(){
  const board=document.getElementById('board');
  // remove old cells but keep tokenLayer
  [...board.querySelectorAll('.cell')].forEach(c=>c.remove());
  const layer=document.getElementById('tokenLayer');

  for(let r=0;r<15;r++){
    for(let c=0;c<15;c++){
      const d=document.createElement('div');
      d.className='cell';
      const t=cellType(r,c);
      if(t.kind==='track'){
        d.classList.add('path');
        const isStart = Object.values(PLAYERS).some(p=>p.start===t.idx);
        if(isStart){
          const col=Object.values(PLAYERS).find(p=>p.start===t.idx).color;
          d.classList.add('start-'+col);
        }
        if(SAFE.has(t.idx)) d.classList.add('safe');
      } else if(t.kind==='home'){
        d.classList.add('home-'+t.color);
      } else if(t.kind==='base'){
        d.classList.add('base-'+t.color);
      } else if(t.kind==='center'){
        d.classList.add('center');
      } else {
        d.classList.add('dark');
      }
      board.insertBefore(d, layer);
    }
  }
  // colored corner "houses" that hold each player's waiting pieces
  drawHouses(board);
  // center finish marker
  drawCenter(board);
}

/* A color-matched home for each player's four waiting pieces.
   Sized to (nearly) fill its whole 6x6 corner block so the home reads as a
   substantial area, matched to the board, with no black gap around it. */
function drawHouses(board){
  [...board.querySelectorAll('.house')].forEach(h=>h.remove());
  const M=0;                   // fill the whole corner block, right up to the path / edge
  for(const k in PLAYERS){
    const pl=PLAYERS[k];
    const rs=pl.base.map(b=>b[0]), cs=pl.base.map(b=>b[1]);
    // pick the 6x6 corner this player's yard lives in, then fill it
    const cornTop =(Math.max(...rs)<7)?0:9;
    const cornLeft=(Math.max(...cs)<7)?0:9;
    const top=cornTop+M, left=cornLeft+M, size=6-2*M;
    const house=document.createElement('div');
    house.className='house house-'+pl.color;
    house.style.cssText=`left:calc(var(--cell)*${left}); top:calc(var(--cell)*${top});
      width:calc(var(--cell)*${size}); height:calc(var(--cell)*${size});`;
    // a light landing slot under each waiting piece
    pl.base.forEach(([br,bc])=>{
      const slot=document.createElement('div'); slot.className='hslot';
      slot.style.left=(((bc+0.5)-left)/size*100)+'%';
      slot.style.top =(((br+0.5)-top )/size*100)+'%';
      house.appendChild(slot);
    });
    board.appendChild(house);
  }
}

function drawCenter(board){
  // colored 4-triangle home using an overlay div
  let cen=board.querySelector('.centerOverlay');
  if(cen) cen.remove();
  cen=document.createElement('div');
  cen.className='centerOverlay';
  // rotated 90° counter-clockwise from the original (`from 45deg`)
  cen.style.cssText=`position:absolute; left:calc(var(--cell)*6); top:calc(var(--cell)*6);
    width:calc(var(--cell)*3); height:calc(var(--cell)*3); z-index:2;
    background:
      conic-gradient(from -45deg,
        var(--yellow) 0deg 90deg,
        var(--blue) 90deg 180deg,
        var(--red) 180deg 270deg,
        var(--green) 270deg 360deg);`;
  board.appendChild(cen);
}
