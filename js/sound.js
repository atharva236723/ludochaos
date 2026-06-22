/* =====================================================================
   SOUND ENGINE — synthesized with the Web Audio API (no asset files).
   Only sound EFFECTS are generated (move / spawn / capture / win etc.);
   there is intentionally no background music.
===================================================================== */
const Sound = {
  ctx:null, master:null, sfxGain:null,
  // honour the saved profile preferences (prefs.js loads before this)
  muted: (typeof Prefs !== 'undefined') ? (Prefs.get('sound') === false) : false,
  // master volume as a 0..1 gain, from the saved 0..100 preference
  vol: (typeof Prefs !== 'undefined')
        ? Math.max(0, Math.min(1, (Prefs.get('volume') ?? 80) / 100))
        : 0.8,

  ensure(){
    if(this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.vol;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 1;
    this.sfxGain.connect(this.master);
  },
  resume(){ if(this.ctx && this.ctx.state==='suspended') this.ctx.resume(); },

  // one shaped note routed to a given bus
  tone(freq, dur, type='sine', vol=0.2, when=0, slideTo=null, bus=null){
    if(!this.ctx) return;
    const dest = bus || this.sfxGain;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if(slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0+dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    osc.connect(g); g.connect(dest);
    osc.start(t0); osc.stop(t0+dur+0.03);
  },

  // a cute bubble "pop" per block — climbs a pentatonic scale as the piece walks
  move(step){
    this.ensure(); this.resume();
    const scale=[523.25,587.33,659.25,783.99,880.00];   // C D E G A
    const f=scale[(step|0)%scale.length];
    this.tone(f,0.10,'sine',0.20,0,f*1.6);              // bright upward bloop
    this.tone(f*2,0.05,'sine',0.06,0.004);              // sparkle harmonic
  },
  // cheerful two-note "pop" when a piece is brought out of the yard
  spawn(){
    this.ensure(); this.resume();
    this.tone(523.25,0.10,'triangle',0.18,0,784);
    this.tone(784.00,0.13,'sine',0.13,0.06,1046.5);
  },
  // soft descending bloop for each block as a captured piece walks home
  back(step){
    this.ensure(); this.resume();
    const scale=[880.00,783.99,659.25,587.33,523.25];   // A G E D C
    const f=scale[(step|0)%scale.length];
    this.tone(f,0.09,'sine',0.16,0,f*0.7);
  },
  roll(){
    this.ensure(); this.resume();
    for(let i=0;i<6;i++) this.tone(180+Math.random()*420,0.05,'square',0.07,i*0.055);
    this.tone(540,0.16,'triangle',0.15,0.38);
  },
  capture(){
    this.ensure(); this.resume();
    this.tone(420,0.32,'sawtooth',0.22,0,70);   // descending zap = a token dies
    this.tone(210,0.34,'square',0.10,0,55);
  },
  win(){
    this.ensure(); this.resume();
    [523.25,659.25,783.99,1046.5].forEach((n,i)=> this.tone(n,0.32,'triangle',0.22,i*0.16));
    [392,523.25].forEach((n,i)=> this.tone(n,0.5,'sine',0.12,i*0.16));
  },
  // a bright little fanfare when a single pin reaches home (distinct from win())
  finish(){
    this.ensure(); this.resume();
    [659.25,880.00,1318.51].forEach((n,i)=> this.tone(n,0.18,'triangle',0.20,i*0.07,n*1.5));
    this.tone(1760,0.12,'sine',0.09,0.21);   // a top sparkle to cap it
  },
  // a swirling "whoosh" that swoops up then back down — direction reversed!
  reverse(){
    this.ensure(); this.resume();
    this.tone(330,0.22,'triangle',0.20,0,880);    // swoop up
    this.tone(880,0.30,'triangle',0.18,0.18,260); // ...and back down
    this.tone(180,0.10,'square',0.08,0.40);       // little thunk to land
  },

  toggleMute(){
    this.ensure(); this.resume();
    this.muted=!this.muted;
    if(this.master) this.master.gain.setTargetAtTime(this.muted?0:this.vol, this.ctx.currentTime, 0.02);
    return this.muted;
  },

  // live volume change from the profile slider (v is 0..100)
  setVolume(v){
    this.vol = Math.max(0, Math.min(1, (+v||0)/100));
    if(this.master && !this.muted) this.master.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.02);
  }
};

function toggleSound(){
  const muted = Sound.toggleMute();
  if(typeof Prefs !== 'undefined') Prefs.set({ sound: !muted });   // remember the choice
  reflectSoundBtn(muted);
}

/* paint the navbar sound button to match the current mute state */
function reflectSoundBtn(muted){
  const btn = document.getElementById('soundBtn');
  if(!btn) return;
  btn.textContent = muted ? '🔇' : '🔊';
  btn.classList.toggle('muted', muted);
  btn.title = muted ? 'Sound off — click to unmute' : 'Sound on — click to mute';
}
