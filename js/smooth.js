/* =====================================================================
   SMOOTH SCROLL — Lenis-powered inertial scrolling, site-wide.

   Loaded on every page (game + informational pages) right after the Lenis
   library from the CDN. It owns one Lenis instance driving the window/document
   scroll, runs its requestAnimationFrame loop, and upgrades in-page anchor
   links (href="#…") to glide instead of jump. Chrome only — it never touches
   the game state object `G`, and the cosmetic walk animations in animate.js
   are unaffected since they move tokens, not the page scroll.

   Respects prefers-reduced-motion: when the user asks for less motion we
   bail out entirely and leave native scrolling in place. Degrades gracefully
   if the Lenis script failed to load.
===================================================================== */
(function () {
  // honour the OS "reduce motion" setting — no inertial hijacking there
  if (window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // the CDN script may be blocked/offline — fall back to native scrolling
  if (typeof Lenis !== 'function') return;

  const lenis = new Lenis({
    duration: 1.1,                                  // glide length (seconds)
    easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expo-out
    smoothWheel: true,
    touchMultiplier: 1.6,
  });

  // expose for debugging / other scripts that may want to stop()/start() it
  window.lenis = lenis;

  // drive Lenis from the rAF loop
  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // in-page anchor links should glide rather than teleport
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (id.length < 2) return;                       // bare "#"
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: -20 });
  });
})();
