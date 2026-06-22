/* =====================================================================
   PAGE TRANSITIONS — progress bar + fade-in fallback for all browsers.
   Works alongside the CSS View Transitions declared in base.css:
   Chromium/Safari handle the page-content swap via @view-transition;
   this script adds a neon progress bar on every browser and provides a
   body fade-in for browsers that lack cross-document VT support.
   Never touches G — chrome layer only.
===================================================================== */
(function(){
  // always scroll to the top on arrival — unrelated to motion preference
  if('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  if(window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;

  /* ---- progress bar ---- */
  const bar = document.createElement('div');
  bar.id = 'page-progress';
  document.body.prepend(bar);

  // arriving on a new page after navigation — sweep bar 0→100% and fade out
  if(sessionStorage.getItem('lc-nav')){
    sessionStorage.removeItem('lc-nav');
    requestAnimationFrame(()=>{ bar.classList.add('done'); });
  }

  /* ---- non-VT fade-in ---- */
  // 'startViewTransition' is the reliable proxy for VT support;
  // if it's absent the page enters instantly, so we fade it in ourselves.
  if(!('startViewTransition' in document)){
    document.body.classList.add('page-in');
  }

  /* ---- intercept navigation clicks ---- */
  document.addEventListener('click', e=>{
    const a = e.target.closest('a[href]');
    if(!a || a.target || a.download) return;
    const href = a.getAttribute('href');
    if(!href || href.startsWith('#') || href.startsWith('mailto:') ||
       href.startsWith('tel:') || href.startsWith('javascript:')) return;
    let url;
    try{ url = new URL(href, location.href); } catch(_){ return; }
    if(url.origin !== location.origin) return;
    // same page with a hash is an in-page anchor scroll — skip
    if(url.pathname === location.pathname && !url.search) return;

    // start the bar; sessionStorage signals the next page to complete it
    sessionStorage.setItem('lc-nav', '1');
    bar.classList.remove('done');
    void bar.offsetWidth;
    bar.classList.add('running');
  });
})();
