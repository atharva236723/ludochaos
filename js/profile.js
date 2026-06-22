/* =====================================================================
   PROFILE CUSTOMIZATION — wires the controls on profile.html to the shared
   preference store (prefs.js). Changes are staged in `draft` and only
   committed to localStorage when the user clicks "Save changes". The live
   preview updates immediately. Chrome only: never touches game state `G`.
===================================================================== */
(function(){
  if(typeof Prefs === 'undefined') return;
  const nameIn = document.getElementById('prefName');
  if(!nameIn) return;                       // not the profile page

  const el = {
    avatar:    document.getElementById('avatar'),
    avatarWrap:document.getElementById('avatarWrap'),
    pfpUpload: document.getElementById('pfpUpload'),
    name:      document.getElementById('pName'),
    tag:       document.getElementById('pTag'),
    nameIn:    nameIn,
    tagIn:     document.getElementById('prefTag'),
    emoji:     document.getElementById('prefAvatar'),
    color:     document.getElementById('prefColor'),
    accent:    document.getElementById('prefAccent'),
    mode:      document.getElementById('prefMode'),
    players:   document.getElementById('prefPlayers'),
    ai:        document.getElementById('prefAI'),
    aiLevel:   document.getElementById('prefAILevel'),
    speed:     document.getElementById('prefSpeed'),
    highlight: document.getElementById('prefHighlight'),
    sound:     document.getElementById('prefSound'),
    volume:    document.getElementById('prefVolume'),
    volLabel:  document.getElementById('volLabel'),
    statGames: document.getElementById('statGames'),
    statWins:  document.getElementById('statWins'),
    statRate:  document.getElementById('statRate'),
    saved:     document.getElementById('savedTag'),
    saveBtn:   document.getElementById('saveBtn'),
    reset:     document.getElementById('resetBtn'),
    resetStats:document.getElementById('resetStatsBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
  };

  // draft holds all pending changes; committed to Prefs only on Save
  let draft = Prefs.get();
  let savedTimer;

  function markDirty(){
    if(el.saveBtn) el.saveBtn.classList.add('has-changes');
  }

  function flashSavedTag(){
    if(!el.saved) return;
    el.saved.classList.add('show');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => el.saved.classList.remove('show'), 1400);
  }

  function showSavedBtn(){
    if(!el.saveBtn) return;
    el.saveBtn.classList.remove('has-changes');
    el.saveBtn.classList.add('just-saved');
    el.saveBtn.textContent = 'Saved ✓';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => {
      if(!el.saveBtn) return;
      el.saveBtn.classList.remove('just-saved');
      el.saveBtn.textContent = 'Save changes';
    }, 2000);
  }

  /* repaint every control + the preview from draft */
  function paint(){
    const p = draft;
    const shown = (p.name || '').trim() || 'Guest Player';
    el.name.textContent = shown;

    // avatar priority: uploaded photo > emoji > name initial
    if(p.pfpDataUrl){
      el.avatar.textContent = '';
      el.avatar.style.background = 'url(' + p.pfpDataUrl + ') center/cover';
      el.avatar.classList.add('has-pfp');
      el.avatar.classList.remove('emoji');
    } else {
      el.avatar.style.background = 'var(--' + p.color + ')';
      el.avatar.classList.remove('has-pfp');
      el.avatar.textContent = p.avatar || shown.charAt(0).toUpperCase();
      el.avatar.classList.toggle('emoji', !!p.avatar);
    }

    if(document.activeElement !== el.nameIn) el.nameIn.value = p.name || '';

    const tag = (p.tagline || '').trim();
    el.tag.textContent = tag;
    el.tag.hidden = !tag;
    if(el.tagIn && document.activeElement !== el.tagIn) el.tagIn.value = p.tagline || '';

    // deselect all emoji buttons when a photo is active
    el.emoji.querySelectorAll('.emoji-opt').forEach(b =>
      b.classList.toggle('on', !p.pfpDataUrl && b.dataset.emoji === (p.avatar || '')));
    el.color.querySelectorAll('.swatch').forEach(b =>
      b.classList.toggle('on', b.dataset.color === p.color));
    el.accent.querySelectorAll('.swatch').forEach(b =>
      b.classList.toggle('on', b.dataset.accent === p.accent));
    el.mode.querySelectorAll('.opt-btn').forEach(b =>
      b.classList.toggle('on', b.dataset.mode === p.mode));
    el.players.querySelectorAll('.opt-btn').forEach(b =>
      b.classList.toggle('on', +b.dataset.n === p.players));
    el.ai.querySelectorAll('.opt-btn').forEach(b =>
      b.classList.toggle('on', (b.dataset.ai === '1') === p.vsAI));
    el.aiLevel.querySelectorAll('.opt-btn').forEach(b =>
      b.classList.toggle('on', b.dataset.level === p.aiLevel));
    el.speed.querySelectorAll('.opt-btn').forEach(b =>
      b.classList.toggle('on', b.dataset.speed === p.animSpeed));

    el.highlight.classList.toggle('on', !!p.highlight);
    el.highlight.setAttribute('aria-checked', String(!!p.highlight));
    el.sound.classList.toggle('on', !!p.sound);
    el.sound.setAttribute('aria-checked', String(!!p.sound));

    const vol = (p.volume == null) ? 80 : p.volume;
    el.volume.value = vol;
    el.volLabel.textContent = vol + '%';

    const s = Prefs.stats();
    el.statGames.textContent = s.games;
    el.statWins.textContent  = s.wins;
    el.statRate.textContent  = s.games ? Math.round(s.wins / s.games * 100) + '%' : '0%';
  }

  function setDraft(patch){ Object.assign(draft, patch); markDirty(); paint(); }

  /* ---- PFP upload: click avatar to pick a file, canvas-crop to 256×256 ---- */
  function openFilePicker(){ if(el.pfpUpload) el.pfpUpload.click(); }
  if(el.avatarWrap){
    el.avatarWrap.addEventListener('click', openFilePicker);
    el.avatarWrap.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openFilePicker(); }
    });
  }
  if(el.pfpUpload){
    el.pfpUpload.addEventListener('change', e => {
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const size = 256;
          const canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          // center-crop to a square before scaling
          const shortest = Math.min(img.width, img.height);
          const sx = (img.width  - shortest) / 2;
          const sy = (img.height - shortest) / 2;
          ctx.drawImage(img, sx, sy, shortest, shortest, 0, 0, size, size);
          setDraft({ pfpDataUrl: canvas.toDataURL('image/jpeg', 0.82), avatar: '' });
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // allow re-uploading the same file
    });
  }

  /* ---- Save button: commit draft → Prefs/localStorage ---- */
  if(el.saveBtn){
    el.saveBtn.addEventListener('click', () => {
      Prefs.set(draft);
      showSavedBtn();
      flashSavedTag();
    });
  }

  /* ---- control bindings (all update draft, never Prefs directly) ---- */
  el.nameIn.addEventListener('input', () => setDraft({ name: el.nameIn.value }));
  el.tagIn .addEventListener('input', () => setDraft({ tagline: el.tagIn.value }));

  // selecting any emoji (including "Aa") clears the uploaded photo
  el.emoji.addEventListener('click', e => {
    const b = e.target.closest('.emoji-opt');
    if(b) setDraft({ avatar: b.dataset.emoji, pfpDataUrl: null });
  });
  el.color.addEventListener('click', e => {
    const b = e.target.closest('.swatch'); if(b) setDraft({ color: b.dataset.color });
  });
  el.accent.addEventListener('click', e => {
    const b = e.target.closest('.swatch'); if(!b) return;
    setDraft({ accent: b.dataset.accent });
    // apply accent visually without persisting (live preview)
    document.documentElement.setAttribute('data-accent', b.dataset.accent);
  });
  el.mode.addEventListener('click', e => {
    const b = e.target.closest('.opt-btn'); if(b) setDraft({ mode: b.dataset.mode });
  });
  el.players.addEventListener('click', e => {
    const b = e.target.closest('.opt-btn'); if(b) setDraft({ players: +b.dataset.n });
  });
  el.ai.addEventListener('click', e => {
    const b = e.target.closest('.opt-btn'); if(b) setDraft({ vsAI: b.dataset.ai === '1' });
  });
  el.aiLevel.addEventListener('click', e => {
    const b = e.target.closest('.opt-btn'); if(b) setDraft({ aiLevel: b.dataset.level });
  });
  el.speed.addEventListener('click', e => {
    const b = e.target.closest('.opt-btn'); if(b) setDraft({ animSpeed: b.dataset.speed });
  });
  el.highlight.addEventListener('click', () => setDraft({ highlight: !draft.highlight }));

  el.sound.addEventListener('click', () => {
    const on = !draft.sound;
    setDraft({ sound: on });
    if(typeof Sound !== 'undefined' && Sound.muted === on){
      if(typeof toggleSound === 'function') toggleSound();
    }
  });

  el.volume.addEventListener('input', () => {
    const v = +el.volume.value;
    setDraft({ volume: v });
    el.volLabel.textContent = v + '%';
    if(typeof Sound !== 'undefined' && Sound.setVolume) Sound.setVolume(v);
  });

  if(el.reset) el.reset.addEventListener('click', () => {
    draft = Object.assign({}, Prefs.DEFAULTS, { pfpDataUrl: null });
    markDirty();
    // revert live visual effects to defaults without persisting
    document.documentElement.setAttribute('data-accent', Prefs.DEFAULTS.accent);
    document.documentElement.setAttribute('data-theme',  Prefs.DEFAULTS.theme);
    if(typeof Sound !== 'undefined' && Sound.setVolume) Sound.setVolume(Prefs.DEFAULTS.volume);
    paint();
  });

  // stats reset is immediate (stats are not identity/preference data)
  if(el.resetStats) el.resetStats.addEventListener('click', () => {
    Prefs.resetStats(); paint(); flashSavedTag();
  });

  // sign out: clear session; if logged in via Google, also clear the Google photo
  function _updateLogoutBtn() {
    if(!el.logoutBtn) return;
    try {
      el.logoutBtn.hidden = !JSON.parse(localStorage.getItem('ludoChaosSession') || 'null');
    } catch(e) { el.logoutBtn.hidden = true; }
  }
  if(el.logoutBtn) {
    el.logoutBtn.addEventListener('click', () => {
      try {
        const s = JSON.parse(localStorage.getItem('ludoChaosSession') || 'null');
        if(s && s.provider === 'google') {
          draft.pfpDataUrl = null;
          Prefs.set({ pfpDataUrl: null });
        }
        localStorage.removeItem('ludoChaosSession');
      } catch(e) {}
      _updateLogoutBtn();
      paint();
    });
  }

  paint();
  _updateLogoutBtn();
})();
