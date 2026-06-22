# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ludo Chaos is a browser Ludo game written in **vanilla HTML/CSS/JS** — no framework, no build step, no package manager, no tests. Everything ships as static files served straight to the browser. It supports two rule sets: **Classic** (traditional Ludo) and **Chaos** (random "chaos tile" events and a global capture-before-home-entry gate that applies to all pins). Both modes share the **double-six direction-reversal** rule (rolling double 6 offers a choice to reverse direction for 4 moves), and any pin that travels backward past its own starting square acquires a per-pin home-entry gate that requires one kill before it can enter the home stretch. Neither mode allows overshooting the finish — an exact roll (or under) is always required.

It is also a **small multi-page site**: `index.html` is the home/landing page (a decorative self-playing intro board + a **Play** button that links to `play.html`), `play.html` is the actual game (the setup menu `#start`, the live board `#game`, and all game overlays), and `about.html` / `privacy.html` / `terms.html` / `contact.html` / `profile.html` are standalone informational documents. They share one navbar/footer injected by `js/nav.js` and one smooth-scroll engine (`js/smooth.js`); navigation between them is plain `<a href>` full page loads, animated by the View Transitions API.

## Running it

There is no build or test command. Serve the directory over HTTP (opening `index.html` via `file://` works for most things but module/audio behavior is more reliable over a server):

```
npx --yes http-server -p 8123 -c-1
```

This is also wired up as the `ludo` config in `.claude/launch.json` for the preview tooling. To exercise a game without clicking through the start screen, open **`play.html`**, then set the globals and call `startGame()` in the page console (the game scripts only load on `play.html`, not the landing `index.html`):

```js
numPlayers = 4; vsAI = true; selMode = 'classic'; startGame();
```

## Deployment

The site is deployed to Cloudflare Workers as a static asset bundle. `wrangler.jsonc` at the project root configures it (no Worker code — pure asset serving). `.assetsignore` excludes dev files (`.claude/`, `.wrangler/`, `CLAUDE.md`, `DESIGN.md`, `wrangler.jsonc`). To deploy:

```
npx wrangler deploy
```

Live URL: `https://ludochaos.com` (workers.dev alias: `https://ludo-chaos.atharva-shukla2367.workers.dev`)

See `DESIGN.md` for detailed decision logs and diagrams from the initial design phase.

## Architecture

### No modules — globals + ordered script tags

Files are plain scripts sharing one global namespace; there is no `import`/`export`. **Load order in `play.html` is load-bearing**:

```
prefs → auth → theme → sound → config → helpers → state → guard →
board → render → turns → moves → animate → resolution → ai → reverse → winner →
  [firebase-app-compat CDN → firebase-database-compat CDN → firebase-auth-compat CDN → firebase-config → online] →
  [chrome last: smooth → nav → transition]
```

When adding a file, add its `<script>` tag in dependency order. `index.html` (the landing page) loads only the subset the decorative intro board reuses — config/helpers/board/render + `landing.js` — plus the chrome scripts, and **not** the game-logic scripts (state/turns/moves/etc.) nor the Firebase/online scripts. The single source of truth for live game state is the global **`G`** object, created in `startGame()` (`js/state.js`). `null` when on the menu, so most logic assumes a game is in progress. Key fields beyond the obvious: `G.playerProfiles` (`color → {name, avatar, pfpUrl, isAI}`) built once in `startGame()` from Prefs for the human player and from `PLAYERS[c].name` for AIs; overridden by `_onlineStartGame()` in online mode with Firebase data.

CSS load order in `<head>` is likewise deliberate: `navbar.css` and `pages.css` load **after** `overlay.css` so the navbar's repositioning of the sound button wins over overlay's floating-corner rules.

### Three coordinate systems (the core thing to understand)

A token's location is expressed three different ways; conversions between them are the trickiest part of the code:

1. **Logical position** `tok.pos` (0–56), per-player and relative to that player's own start. 0–50 = main loop, 51–56 = the colored home stretch, 56 = finished. Paired with `tok.state` (`base` / `track` / `home` / `finished`) and `tok.reverseGated` (set permanently true the first time a reversed move pushes `pos` below 0 — blocks home-entry until the player makes a kill).
2. **Global track index** (0–51) into the shared `TRACK` loop, computed as `(PLAYERS[player].start + pos) % 52` — see `globalIndex()`. Used for collision/capture detection and safe-tile checks, because two tokens collide only when their *global* indices match.
3. **Grid cell** `[row, col]` on the 15×15 board. `tokenCell()` (render) and `posToCell()` (animate) map logical position → grid; rendering then converts cell → CSS percentage.

`js/config.js` holds the static geometry: the 52-cell `TRACK` array traced clockwise, the `SAFE`/`CHAOS_TILES`/`CHAOS_SAFE` index sets, and per-color `start`/`home`/`base` coordinates in `PLAYERS`.

### Turn flow

A turn is a chain of callbacks, not a loop: `beginTurn` → `doRoll` (`turns.js`) → **`commitMove`** → `performMove` (`moves.js` logic + `animate.js` walk) → `endResolution` → `nextTurn` (`resolution.js`). **`commitMove` (in `animate.js`) is the single entry point for all token movement** — clicks, auto-play, and AI all route through it. Both modes need a 6 to leave base and an exact roll to finish (overshooting is never allowed — the die simply can't be played). Two home-entry gates live in `canMove()` and `applyMove()`: Chaos mode has a global gate (all pins blocked until `player.hasKilled`); both modes have a per-pin gate (`tok.reverseGated`) for pins that traveled backward past their own start — also cleared by `player.hasKilled`. `applyMove` returns whether the player earns an **extra turn** (single-die 6, captured, or finished — plus a double six in double-dice, handled in `turns.js`); `endResolution` uses that to decide whether to re-roll or pass play.

### State mutation vs. animation are deliberately separated

`applyMove()` mutates `G` to the *final* result immediately, including pushing captured tokens onto `G.pendingCaptures`. The visual walk in `animate.js` happens **around** that: `performMove` animates the mover block-by-block, *then* calls `applyMove`, re-renders, then animates captured tokens walking home (`animateCaptures`/`homeward`). So the DOM is rebuilt from scratch by `render()` (it clears `#tokenLayer` and re-creates every token each call) while animations directly manipulate the specific token element found via `[data-tid]`. Keep this split in mind: gameplay correctness lives in the move/resolution layer; `animate.js` is purely cosmetic and must not change `G`.

### Board rendering

`buildBoard()` (`js/board.js`) paints the static 15×15 grid by classifying each cell with `cellType()`, then overlays the four colored corner "houses" (`drawHouses`) and the rotating center finish marker (`drawCenter`), both as absolutely-positioned divs above the grid but below the token layer (z-index: houses 1, center 2, tokens 5). `render()` (`js/render.js`) draws only the moving tokens (location-pin SVGs) and handles stacking offsets when multiple sit on one cell.

**Player identity cards** are rendered by `renderPlayerCorners()` (`js/render.js`) into `#playerLayer` — a `position:absolute; inset:0` div that is a sibling of `#board` and `#diceLayer` inside `.boardZone`. Cards sit *outside* the 15-cell playing grid in the boardZone's vertical padding strips (`.boardZone` has `padding: calc(var(--cell)*2.5) 0`), not inside the house divs. Die positions are declared in `DIE_CORNER = {green:[-1,2], yellow:[-1,13], blue:[16,13], red:[16,2]}` (board-local row/col); `DIE_PAD = 1.4` is the vertical padding offset added to place each die's top edge. Green/yellow cards sit at `top: 1.5×cell` (between die bottom and board top); blue/red at `top: 18.5×cell` (just below die bottom). The `--cell` formula denominator in `css/base.css` is `20` (= 15 board cells + 2 × 2.5 padding) — keep it in sync with `.boardZone` padding. `renderPlayerCorners()` is called from `startGame()` after `render()`, and again from `_onlineStartGame()` after overriding `G.playerProfiles`.

### Other pieces

- **Preferences** (`js/prefs.js`): the `Prefs` singleton — a localStorage-backed settings store loaded **first** on every page (before sound, theme, and state), so all other scripts can read it on startup. Stores name, avatar (emoji), `pfpDataUrl` (profile photo — either a `data:image/...;base64,...` string from a device upload or an `https://` URL from Google Sign-In; both work identically as `<img src>` values), accent/theme, animSpeed, aiLevel, sound volume, stats, etc. Files that consume it guard with `typeof Prefs !== 'undefined'`.
- **Auth** (`js/auth.js`): the `Auth` singleton — a localStorage-backed account + session store, loaded immediately after `prefs.js` on `play.html` **only** (`profile.html` intentionally does not load it). Accounts are stored under `ludoChaosAccounts` (email-keyed, plaintext password), the active session under `ludoChaosSession`. `Auth.isLoggedIn()` / `signUp()` / `logIn()` / `logOut()` / `startGoogleSession()` are the public surface. **Google Sign-In**: the global `signInWithGoogle()` (outside the IIFE) triggers `firebase.auth().signInWithPopup(GoogleAuthProvider)`, then calls `Auth.startGoogleSession({name, email, photoURL})` which persists the session and writes the Google display name + photo URL to `Prefs.pfpDataUrl`. `updateNavAvatar()` then patches `.nav-avatar` in the DOM without a page reload. Requires `firebase-auth-compat.js` loaded before `firebase-config.js`. The modal UI controller lives in the same file (`showAuthModal(callback)`, `closeAuthModal()`, `switchAuthTab()`, `submitAuthLogin()`, `submitAuthSignup()`). **Critical**: save the callback to a local variable before calling `closeAuthModal()` — `closeAuthModal()` nulls `_authCallback`, so reading it afterward gives `null`. The gate is in `openOnlineLobby()` (`js/online.js`): if not logged in, it calls `showAuthModal(openOnlineLobby)` and returns; on success the modal re-fires the callback. Modal HTML lives in `play.html`; styles in `css/auth.css` (loaded after `css/online.css` in `<head>`). **Firebase CDN failures**: all three Firebase `<script>` tags in `play.html` carry `onerror="window._firebaseFailed=true"`; `signInWithGoogle()` checks this flag to surface "Blocked by an ad blocker or network issue" instead of the generic reload message. **Google session marker**: `ludoChaosSession` stores `{ name, email, provider: 'google' }` for Google sign-ins; `profile.js` checks `session.provider === 'google'` to know whether to clear `Prefs.pfpDataUrl` on sign-out (Google photo should not persist after logout; locally-uploaded photos should).
- **AI** (`js/ai.js`): pure heuristic — `scoreMove()` ranks each legal move (finish ≫ capture ≫ advance/safety) and `aiPick` plays the best. Three skill levels (easy/normal/hard) controlled by `Prefs.get('aiLevel')`. This is the one place to tune CPU behavior.
- **Sound** (`js/sound.js`): all effects are synthesized live via the Web Audio API — there are **no audio asset files**. Lazily initialized on first sound (browser autoplay policy).
- **Reverse direction** (`js/reverse.js`): the double-six rule that works in **both** Classic and Chaos. Rolling double 6 calls `decideReverse()` — humans get the `#reversePrompt` overlay, the AI decides via `aiReverseChoice()`. Activating sets `p.reversed=true` and `p.reverseMoves=4`. `tickReverse()` is called from `applyMove()` after every pin movement (not per turn), counting down `reverseMoves`. `playerDir(col)` in `helpers.js` is the single switch that returns `-1` while reversed — every movement, animation, and AI calc reads it. When a reversed move pushes `tok.pos` below 0, `applyMove` permanently sets `tok.reverseGated=true`; `canMove` then blocks that pin from crossing into the home stretch until `player.hasKilled` is true.
- **Chaos effects** (`applyChaos` in `moves.js`): boost / teleport / trap / swap, only triggered when a token lands on a `CHAOS_TILES` index in Chaos mode.
- **Win screen** (`js/winner.js`): shows the `#overlay` victory card with the winner's name, handles team-mode labeling, and records the win via `Prefs.recordWin()`.
- **Online multiplayer** (`js/online.js` + `js/firebase-config.js`): the `Online` IIFE module wraps all Firebase Realtime Database calls. The backend stores rooms under `/rooms/{code}` (metadata + players map) and inputs under `/rooms/{code}/actions`. The core architecture is **deterministic replay** — only player inputs (`roll` / `move` / `die_select` / `reverse`) are pushed to Firebase; every client independently runs the same game logic from those inputs and arrives at identical state without ever syncing `G`. `G.online = { myColor, roomCode, isMyTurn }` is set at game start; `turns.js` and `resolution.js` read `G.online.isMyTurn` to gate die-click and token-click UI to the correct player. **Listener cleanup**: `stopLobbyListener()` and `stopActionSync()` must call `.off()` on the **exact same query reference object** used when attaching (a fresh `db.ref(path)` silently fails to detach a listener that was attached to an `orderByChild(...).equalTo(...)` query — always save the ref). The game-starting overlay (`#gameStartingOverlay` in `play.html`, styled in `css/online.css`) plays a 4-second animated countdown (3→2→1→GO!) before the board appears — each number fades out completely before the next appears; `_showGameStartingLoader()` / `_hideGameStartingLoader()` control it, and the `setTimeout` before `_onlineStartGame()` is set to `4400` ms to accommodate the animation. **Player data in Firebase**: `createRoom()` and `joinRoom()` both use the internal `_profile(color)` helper (inside the `Online` IIFE) to write `{ name, color, online, avatar, tagline, stats }` per player — `avatar` (emoji) and `tagline` are read from `Prefs`; `pfpDataUrl` is intentionally excluded to avoid large base64 payloads. **Waiting room player profiles**: the UI controller stores the latest player map in `_wrCurrentPlayers`; non-self slots render with `class="wr-slot clickable"` and `onclick="wrShowProfile(pid)"`. `wrShowProfile(pid)` looks up the player and populates `#wrProfileModal` (in `play.html`, styled in `css/online.css` with hardcoded dark colors so it is immune to theme switching). `closeWrProfile()` fades it out; clicking the backdrop also dismisses it.

### Chrome layer (cosmetic, independent of `G`)

These scripts run on every page and **never touch `G`** — keep them that way:

- **Preferences applier** (`js/theme.js`): reads `Prefs` immediately and sets `data-accent` / `data-theme` on `<html>` before the first paint, so colors are never wrong on load. Exposes `window.applyTheme()` for the profile page to call after a change.
- **Landing intro** (`js/landing.js`): the decorative self-playing board on the home page (`index.html`). It *reuses* the game's static-board helpers (`cellType` / `drawHouses` / `drawCenter`) and markup helpers (`pinHTML` / `dieFaceHTML`) — none of which depend on `G` — so the floating board matches the real one. The Play button is a plain `<a href="play.html">` link; `body.show-landing` stays set on `index.html` to keep the big hero title hidden in favour of the landing's own.
- **Shared navbar/footer** (`js/nav.js`): builds the nav (and footer on content pages) once and injects it, so the six HTML documents don't duplicate markup. Highlights the link matching the current filename, wires the global sound toggle, publishes `--nav-h` for layouts to clear the fixed bar, and handles the static contact-form acknowledgement. The `.nav-avatar` element renders a circular `<img>` when `Prefs.pfpDataUrl` is set (device upload or Google photo URL), otherwise falls back to the emoji avatar. `updateNavAvatar()` in `auth.js` patches this element live after Google Sign-In without rebuilding the nav. To add an informational page, add it to the `PAGES` array here and create the matching `*.html`.
- **Leave guard** (`js/guard.js`): intercepts in-page `<a>` clicks that would navigate away during a live game, showing `#leaveOverlay` instead of the browser's generic `beforeunload` dialog. Raw tab closes and reloads are not intercepted by design.
- **Smooth scroll** (`js/smooth.js`): one Lenis instance (library from CDN) driving inertial scroll site-wide and upgrading in-page `#anchor` links to glide. Bails out entirely under `prefers-reduced-motion` and degrades gracefully if the CDN script fails to load.
- **Page transitions** (`js/transition.js`): adds a neon progress bar on every cross-page navigation and a body fade-in for browsers that lack View Transitions API support. Uses `sessionStorage` to coordinate the bar across the navigation boundary.

## Conventions

- **Keep code in small, per-responsibility files** rather than one monolith — `css/` is split by board/panel/overlay/etc., `js/` by game concern. Match this when adding features; each file starts with a banner comment stating its responsibility.
- Theme colors and the global `--cell` size are CSS variables in `css/base.css`; per-player color is keyed off the color name (`green`/`yellow`/`blue`/`red`) used consistently as object keys, CSS classes, and CSS-var suffixes (`var(--green)`).
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:` / `fix:` / `chore:` / `docs:` / `refactor:`. Keep subjects under ~72 characters; put the *why* in the body, not the *what*.
