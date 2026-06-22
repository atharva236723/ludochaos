/* =====================================================================
   BOARD GEOMETRY & PLAYER DEFINITIONS
   The 52-cell main loop, traced clockwise on a 15x15 grid (row,col),
   plus safe tile set and per-color start/home/base coordinates.
===================================================================== */
const TRACK = [
  [6,1],[6,2],[6,3],[6,4],[6,5],        // 0-4
  [5,6],[4,6],[3,6],[2,6],[1,6],        // 5-9
  [0,6],[0,7],[0,8],                    // 10-12
  [1,8],[2,8],[3,8],[4,8],[5,8],        // 13-17
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14], // 18-23
  [7,14],[8,14],                        // 24-25
  [8,13],[8,12],[8,11],[8,10],[8,9],    // 26-30
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8], // 31-36
  [14,7],[14,6],                        // 37-38
  [13,6],[12,6],[11,6],[10,6],[9,6],    // 39-43
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],  // 44-49
  [7,0],[6,0]                           // 50-51
];

// Safe cells: each player's starting square (where tokens enter the loop) and
// the star square on the 9th block of that color's path (start+8).
// Starting squares — green:0, yellow:13, blue:26, red:39.
// Star squares    — green:8, yellow:21, blue:34, red:47.
// Safe squares apply in both Classic and Chaos modes.
const SAFE = new Set([0,8,13,21,26,34,39,47]);

/* Player definitions. order = clockwise turn order. */
const PLAYERS = {
  green:  { name:'Green',  color:'green',  start:0,
            home:[[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
            base:[[1.5,1.5],[1.5,3.5],[3.5,1.5],[3.5,3.5]] },
  yellow: { name:'Yellow', color:'yellow', start:13,
            home:[[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
            base:[[1.5,10.5],[1.5,12.5],[3.5,10.5],[3.5,12.5]] },
  blue:   { name:'Blue',   color:'blue',   start:26,
            home:[[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
            base:[[10.5,10.5],[10.5,12.5],[12.5,10.5],[12.5,12.5]] },
  red:    { name:'Red',    color:'red',    start:39,
            home:[[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
            base:[[10.5,1.5],[10.5,3.5],[12.5,1.5],[12.5,3.5]] },
};
const ORDER = ['green','yellow','blue','red'];

/* Fixed grid-coord positions for finished tokens inside each color's center
   triangle. Each array holds 4 [row,col] values — one per token id — already
   shifted by -0.5 so render()'s standard +0.5 centering lands them exactly
   where intended. Positions are verified to lie inside their respective
   conic-gradient triangle (conic from -45deg: yellow=top, blue=right,
   red=bottom, green=left). */
const FINISHED_SPOTS = {
  green:  [[6.55,5.85],[7.05,5.85],[6.55,6.35],[7.05,6.35]],
  yellow: [[5.85,6.55],[5.85,7.05],[6.35,6.55],[6.35,7.05]],
  blue:   [[6.55,7.65],[7.05,7.65],[6.55,8.15],[7.05,8.15]],
  red:    [[7.65,6.55],[7.65,7.05],[8.15,6.55],[8.15,7.05]],
};
