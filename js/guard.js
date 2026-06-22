/* =====================================================================
   LEAVE GUARD — warn before abandoning a game in progress.

   The in-app Exit button already routes through confirmExit() (state.js),
   which pops the custom "Exit game?" overlay. This covers the other way out
   of a live game from this same page: clicking a navbar / footer link (or any
   in-page <a>) that navigates to another document (about / privacy / terms /
   contact / profile) as a full page load.

   Rather than the browser's native "Leave site?" dialog, we show our OWN
   on-site warning overlay (#leaveOverlay) so the message matches the rest of
   the UI. We deliberately do NOT use a `beforeunload` handler — that can only
   produce the generic native browser alert, which is exactly what we want to
   avoid. The trade-off: a raw tab close / reload can't be intercepted with
   custom HTML, so those aren't guarded; every in-app navigation is. Read-only
   on `G` — this never mutates game state.
===================================================================== */
(function(){
  let pendingHref = null;   // where the blocked click wanted to go

  // Would clicking this anchor leave the current page (a real navigation)?
  function leavesPage(a){
    if(!a) return false;
    if(a.target && a.target !== '_self') return false;          // new tab/window — page stays
    if(a.hasAttribute('download')) return false;
    const href = a.getAttribute('href');
    if(!href || href.startsWith('#')) return false;             // in-page anchor
    const proto = (a.protocol || '').toLowerCase();
    if(proto === 'javascript:' || proto === 'mailto:' || proto === 'tel:') return false;
    // same document, only the hash differs → in-page scroll, not a navigation
    if(a.pathname === location.pathname && a.search === location.search) return false;
    return true;
  }

  function overlay(){ return document.getElementById('leaveOverlay'); }
  function showWarning(){ const o = overlay(); if(o) o.style.display = 'flex'; }
  function hideWarning(){ const o = overlay(); if(o) o.style.display = 'none'; pendingHref = null; }

  // Capture-phase click interception: only steps in while a game is live.
  document.addEventListener('click', e => {
    if(!G) return;                                  // on the menu/landing — never nag
    if(e.defaultPrevented || e.button !== 0) return;
    if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // user is opening a new tab
    const a = e.target.closest && e.target.closest('a[href]');
    if(!a || !leavesPage(a)) return;
    e.preventDefault();
    pendingHref = a.href;
    showWarning();
  }, true);

  // wired up by the overlay buttons in index.html
  window.cancelLeave = hideWarning;
  window.confirmLeave = function(){
    const dest = pendingHref;
    pendingHref = null;
    G = null;                          // releasing the game; let the navigation proceed cleanly
    if(dest) location.href = dest;
  };
})();
