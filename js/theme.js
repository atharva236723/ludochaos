/* =====================================================================
   THEME APPLIER — pushes the saved visual preferences onto the document.

   Chrome only: it reads prefs.js (loaded just before it on every page) and
   reflects two saved choices onto the <html> element:
     • the UI accent  → data-accent="…"  re-tints the neon button/edge/glow
     • the colour theme → data-theme="…" swaps the whole --v-* palette
   both via the matching [data-…] blocks in base.css. Loaded right after
   prefs.js — before the page paints — so the colours are correct from the
   first frame and never flash the defaults. Never touches game state `G`.
===================================================================== */
(function(){
  if(typeof Prefs === 'undefined') return;
  const root = document.documentElement;

  function apply(){
    root.setAttribute('data-accent', Prefs.get('accent') || 'violet');
    root.setAttribute('data-theme',  Prefs.get('theme')  || 'bright');
  }
  apply();

  // let other scripts (the profile page, the navbar picker) re-apply after a change
  window.applyTheme = apply;
})();
