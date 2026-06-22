/* =====================================================================
   SHARED CHROME — navbar + footer, injected on every page.

   This is a multi-page app: index.html is the home/landing page, play.html is
   the setup menu + live game, and each informational page (about / privacy /
   terms / contact / profile) is its own document.
   Rather than copy the navbar markup into six files, this script builds it
   once and injects it, then highlights whichever link matches the current
   URL. Navigation is plain <a href> — real page loads, animated by the
   View Transitions API (see css/base.css). Chrome only; never touches `G`.
===================================================================== */
(function(){
  const PAGES = [
    { key:'about',   href:'about.html',   label:'About Us' },
    { key:'privacy', href:'privacy.html', label:'Privacy Policy' },
    { key:'terms',   href:'terms.html',   label:'Terms &amp; Conditions' },
    { key:'contact', href:'contact.html', label:'Contact Us' },
  ];

  /* colour themes offered by the navbar picker — the `key` matches a
     [data-theme] block in base.css; `dot` is a representative swatch colour */
  const THEMES = [
    { key:'bright',   label:'Bright',   dot:'#ffffff' },
    { key:'dark',     label:'Dark',     dot:'#1c1f27' },
    { key:'midnight', label:'Midnight', dot:'#101a33' },
    { key:'sepia',    label:'Sepia',    dot:'#f5ead3' },
    { key:'forest',   label:'Forest',   dot:'#13251c' },
  ];

  // which page are we on? (filename, defaulting to the game/home page)
  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const current = file.replace('.html','') || 'index';

  // navbar avatar: show uploaded photo if available, else emoji
  const _pfpUrl     = typeof Prefs !== 'undefined' ? Prefs.get('pfpDataUrl') : null;
  const _avatarEmoji = (typeof Prefs !== 'undefined' && Prefs.get('avatar')) || '👤';
  const avatarGlyph  = _pfpUrl
    ? `<img src="${_pfpUrl}" class="nav-pfp-img" alt="Profile photo">`
    : _avatarEmoji;

  /* ---------- navbar ---------- */
  const links = PAGES.map(p =>
    `<a class="nav-link${current===p.key?' active':''}" href="${p.href}">${p.label}</a>`
  ).join('');

  const activeTheme = (typeof Prefs !== 'undefined' && Prefs.get('theme')) || 'bright';
  const themeOpts = THEMES.map(t =>
    `<button class="theme-opt" type="button" role="menuitemradio" data-theme="${t.key}"
             aria-checked="${activeTheme===t.key?'true':'false'}">
       <span class="sw" style="--dot:${t.dot}"></span>${t.label}<span class="check">✓</span>
     </button>`
  ).join('');

  const nav = document.createElement('nav');
  nav.id = 'navbar';
  nav.innerHTML =
    `<a class="nav-brand" href="index.html" title="Home">
       <span class="nav-logo">🎲</span><span class="nav-word">Ludo Chaos</span>
     </a>
     <div class="nav-links">${links}</div>
     <div class="nav-right">
       <div class="nav-theme">
         <button id="themeBtn" title="Colour theme" type="button" aria-haspopup="true" aria-expanded="false">🎨</button>
         <div class="theme-menu" id="themeMenu" role="menu" aria-label="Colour theme" hidden>
           <div class="theme-head">Colour theme</div>
           ${themeOpts}
         </div>
       </div>
       <a class="nav-avatar${current==='profile'?' active':''}" href="profile.html" title="Your profile">${avatarGlyph}</a>
     </div>`;
  document.body.prepend(nav);

  /* ---------- colour-theme picker ---------- */
  const themeBtn  = document.getElementById('themeBtn');
  const themeMenu = document.getElementById('themeMenu');
  function openMenu(open){
    themeMenu.hidden = !open;
    themeBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  themeBtn.addEventListener('click', e => { e.stopPropagation(); openMenu(themeMenu.hidden); });
  themeMenu.addEventListener('click', e => {
    const opt = e.target.closest('.theme-opt'); if(!opt) return;
    const key = opt.dataset.theme;
    document.documentElement.setAttribute('data-theme', key);
    if(typeof Prefs !== 'undefined') Prefs.set({ theme:key });
    themeMenu.querySelectorAll('.theme-opt').forEach(o =>
      o.setAttribute('aria-checked', o===opt ? 'true' : 'false'));
    openMenu(false);
  });
  // dismiss on outside click or Escape
  document.addEventListener('click', e => { if(!nav.contains(e.target)) openMenu(false); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') openMenu(false); });

  /* ---------- footer ----------
     Injected on every page. On the home page (index) it sits beneath the menu /
     FAQ; css/pages.css hides it while a game is in progress (`body.in-game`) so
     the live board still owns the full screen. */
  const foot = document.createElement('footer');
  foot.id = 'site-footer';
  foot.innerHTML =
    `<div class="foot-brand"><span>🎲</span> Ludo Chaos</div>
     <nav class="foot-links">
       <a href="index.html">Home</a>
       <a href="play.html">Play</a>
       ${PAGES.map(p=>`<a href="${p.href}">${p.label}</a>`).join('')}
       <a href="profile.html">Your Profile</a>
     </nav>
     <div class="foot-copy">© 2026 Ludo Chaos — made for fun, not profit.</div>`;
  document.body.appendChild(foot);

  /* ---------- publish the navbar height so layouts clear the fixed bar ---------- */
  function measure(){
    document.documentElement.style.setProperty('--nav-h', nav.offsetHeight + 'px');
  }
  measure();
  window.addEventListener('resize', measure);

  /* ---------- contact form: static demo, acknowledge in place ---------- */
  const cform = document.getElementById('contactForm');
  if(cform) cform.addEventListener('submit', e => {
    e.preventDefault();
    const btn = cform.querySelector('.page-btn');
    btn.textContent = 'Message sent ✓';
    btn.disabled = true;
    cform.querySelectorAll('input,textarea').forEach(el => el.disabled = true);
  });
})();
