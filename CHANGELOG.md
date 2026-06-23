# Changelog

All notable changes to this project will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.0] — 2026-06-22

### Added
- Base CSS design system with CSS variables, theming, and accent colors
- Board and token layer CSS; overlay and start screen styles
- Game configuration and board geometry (`js/config.js`) — 52-cell TRACK, SAFE squares, per-color PLAYERS data
- Static 15×15 board grid renderer (`js/board.js`)
- Preferences store and theme system (`js/prefs.js`, `js/theme.js`)
- Web Audio sound synthesizer — all effects generated live, no audio files (`js/sound.js`)
- Game state object and `startGame()` initializer (`js/state.js`)
- Token rendering and player corner identity cards (`js/render.js`)
- Turn flow and dice roll engine (`js/turns.js`)
- Move validation and `applyMove` logic (`js/moves.js`)
- Step-by-step token animation with capture walk-home (`js/animate.js`)
- End-of-turn resolution and next-turn logic (`js/resolution.js`)
- Heuristic AI opponent with easy / normal / hard difficulty levels (`js/ai.js`)
- Double-six direction reversal rule — human overlay + AI decision (`js/reverse.js`)
- Win screen and game-over handling (`js/winner.js`)
- Leave-game navigation guard intercepting in-page link clicks (`js/guard.js`)
- Landing page with animated self-playing intro board (`js/landing.js`)
- Smooth scroll (Lenis CDN) and page transition engine with neon progress bar (`js/smooth.js`, `js/transition.js`)
- Shared navbar and footer injected via `js/nav.js` across all pages
- Informational pages: `about.html`, `contact.html`, `privacy.html`, `terms.html`
- Profile customization page (`profile.html`, `js/profile.js`) — name, avatar, accent, AI level, stats
- Local auth system and Google Sign-In via Firebase (`js/auth.js`)
- Firebase online multiplayer with deterministic replay (`js/online.js`, `js/firebase-config.js`)
- Custom 403, 404, and 500 error pages
- Cloudflare Workers deployment configuration (`wrangler.jsonc`)
- PWA favicon suite and `site.webmanifest`
- GitHub issue templates (bug report, feature request) and PR template
- README, MIT License, DESIGN.md, CLAUDE.md

### Changed
- Removed 3-player mode; fixed online UI responsiveness
- Replaced blocking `alert()` calls in `online.js` with inline auto-dismissing error banners
- Corrected `DIE_PAD` so corner dice sit flush with board edges
- Fixed player-side `z-index` so profile cards are never obscured by the die arrow

### Infrastructure
- Cloudflare Worker (`worker.js`) sets `X-Content-Type-Options: nosniff` on `ludochaos.com` and `X-Robots-Tag: noindex` on the workers.dev alias
- `ludochaos.com/*` route wired in `wrangler.jsonc` so all production traffic passes through the Worker
- GitHub Actions workflow auto-deploys to Cloudflare Workers on every push to `main`
