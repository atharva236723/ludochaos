/* =====================================================================
   AUTH — localStorage-backed account system.
   Accounts stored under 'ludoChaosAccounts'; active session under
   'ludoChaosSession'. Only required for online mode — offline play
   is always available without an account.
   Chrome only: never touches game state G.
===================================================================== */
const Auth = (function () {
  const ACCOUNTS_KEY = 'ludoChaosAccounts';
  const SESSION_KEY  = 'ludoChaosSession';

  function _accounts() {
    try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function _saveAccounts(a) {
    try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a)); } catch (e) {}
  }
  function _startSession(user) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ name: user.name, email: user.email })); } catch (e) {}
    if (typeof Prefs !== 'undefined') Prefs.set({ name: user.name });
  }

  function isLoggedIn() {
    try { return !!JSON.parse(localStorage.getItem(SESSION_KEY)); }
    catch (e) { return false; }
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
    catch (e) { return null; }
  }

  /* returns null on success, or an error string */
  function signUp(name, email, password) {
    name     = (name     || '').trim();
    email    = (email    || '').trim().toLowerCase();
    password = (password || '');
    if (!name)                                    return 'Name is required.';
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email))     return 'Enter a valid email address.';
    if (password.length < 6)                      return 'Password must be at least 6 characters.';
    const accounts = _accounts();
    if (accounts[email])                          return 'An account with this email already exists.';
    accounts[email] = { name, email, password };
    _saveAccounts(accounts);
    _startSession({ name, email });
    return null;
  }

  /* returns null on success, or an error string */
  function logIn(email, password) {
    email = (email || '').trim().toLowerCase();
    const user = _accounts()[email];
    if (!user)                      return 'No account found with this email.';
    if (user.password !== password) return 'Incorrect password.';
    _startSession(user);
    return null;
  }

  function logOut() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  /* Called after a successful Google sign-in. Saves the session and applies
     the Google display name + photo URL to Prefs so they are used everywhere. */
  function startGoogleSession(user) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        name:     user.name,
        email:    user.email,
        provider: 'google'
      }));
    } catch (e) {}
    if (typeof Prefs !== 'undefined') {
      Prefs.set({
        name:      user.name,
        pfpDataUrl: user.photoURL || Prefs.get('pfpDataUrl')
      });
    }
  }

  return { isLoggedIn, getUser, signUp, logIn, logOut, startGoogleSession };
})();

/* ---- Google Sign-In ---- */

/* Re-renders the .nav-avatar element to reflect the current Prefs (photo or
   emoji). Called after Google sign-in so the navbar updates without a reload. */
function updateNavAvatar() {
  const el = document.querySelector('.nav-avatar');
  if (!el) return;
  const pfpUrl = typeof Prefs !== 'undefined' ? Prefs.get('pfpDataUrl') : null;
  const emoji  = (typeof Prefs !== 'undefined' && Prefs.get('avatar')) || '👤';
  el.innerHTML = pfpUrl
    ? `<img src="${pfpUrl}" class="nav-pfp-img" alt="Profile photo">`
    : emoji;
}

/* Triggers a Firebase Google sign-in popup.  On success the Google display
   name and photo URL are stored to Prefs, the session is started, the navbar
   avatar is updated, and the pending callback (e.g. openOnlineLobby) fires. */
async function signInWithGoogle() {
  const btn  = document.getElementById('authGoogleBtn');
  const errEl = document.getElementById('authLoginErr');

  if (typeof firebase === 'undefined' || !window.FIREBASE_CONFIG) {
    const msg = window._firebaseFailed
      ? 'Blocked by an ad blocker or network issue — disable it and reload.'
      : 'Service unavailable — reload the page.';
    if (errEl) errEl.textContent = msg;
    return;
  }

  if (btn) { btn.disabled = true; btn.lastChild.textContent = ' Signing in…'; }

  try {
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    const provider = new firebase.auth.GoogleAuthProvider();
    const result   = await firebase.auth().signInWithPopup(provider);
    const user     = result.user;

    Auth.startGoogleSession({
      name:     user.displayName || 'Player',
      email:    user.email       || '',
      photoURL: user.photoURL    || null
    });

    updateNavAvatar();

    const cb = _authCallback;
    closeAuthModal();
    if (cb) cb();

  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.lastChild.textContent = ' Continue with Google';
    }
    const msg =
      (err.code === 'auth/popup-closed-by-user' ||
       err.code === 'auth/cancelled-popup-request') ? 'Sign-in cancelled.' :
      err.code === 'auth/popup-blocked'            ? 'Popup blocked — allow popups for this site.' :
                                                     'Google sign-in failed. Try again.';
    if (errEl) errEl.textContent = msg;
  }
}

/* ---- Auth modal UI controller ---- */
let _authCallback = null;

function showAuthModal(onSuccess) {
  _authCallback = onSuccess || null;
  document.getElementById('authModal').style.display = 'flex';
  switchAuthTab('login');
}
function closeAuthModal() {
  document.getElementById('authModal').style.display = 'none';
  _authCallback = null;
}
function switchAuthTab(tab) {
  document.getElementById('authLoginForm').style.display  = tab === 'login'  ? '' : 'none';
  document.getElementById('authSignupForm').style.display = tab === 'signup' ? '' : 'none';
  document.getElementById('authTabLogin').classList.toggle('on',  tab === 'login');
  document.getElementById('authTabSignup').classList.toggle('on', tab === 'signup');
  document.getElementById('authLoginErr').textContent  = '';
  document.getElementById('authSignupErr').textContent = '';
}
function submitAuthLogin() {
  const email = document.getElementById('authLoginEmail').value;
  const pass  = document.getElementById('authLoginPass').value;
  const err   = Auth.logIn(email, pass);
  if (err) { document.getElementById('authLoginErr').textContent = err; return; }
  const cb = _authCallback;
  closeAuthModal();
  if (cb) cb();
}
function submitAuthSignup() {
  const name  = document.getElementById('authSignupName').value;
  const email = document.getElementById('authSignupEmail').value;
  const pass  = document.getElementById('authSignupPass').value;
  const err   = Auth.signUp(name, email, pass);
  if (err) { document.getElementById('authSignupErr').textContent = err; return; }
  const cb = _authCallback;
  closeAuthModal();
  if (cb) cb();
}
