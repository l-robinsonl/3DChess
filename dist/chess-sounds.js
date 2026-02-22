// ─── Sound Engine ─────────────────────────────────────────────────────────────
// Physical model of wooden chess pieces on a board.
// Core layers:
//   1. Body thud  — sine starting high (~140 Hz), pitch-dropping fast to ~50 Hz (wood resonance)
//   2. Click transient — very short burst of bandpass noise (contact of hard surfaces, 2–4 kHz)
//   3. Body noise — low-mid bandpass noise (400–700 Hz) for the woody "thok" colour
// All routed through a compressor so nothing clips.

const _ac = { ctx: null, comp: null };
const MOVE_SOUND_SRC = "./chesspiecemove.mp3";
const _moveSample = { buffer: null, loading: null, warned: false };

function warnMoveSample(err) {
  if (_moveSample.warned) return;
  _moveSample.warned = true;
  console.warn("move sample failed:", err);
}

async function loadMoveSampleBuffer(ctx) {
  if (_moveSample.buffer) return _moveSample.buffer;
  if (_moveSample.loading) return _moveSample.loading;

  _moveSample.loading = (async () => {
    const res = await fetch(MOVE_SOUND_SRC, { cache: "force-cache" });
    if (!res.ok) throw new Error(`failed to fetch move sample (${res.status})`);
    const bytes = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(bytes);
    _moveSample.buffer = buffer;
    return buffer;
  })()
    .catch((err) => {
      warnMoveSample(err);
      return null;
    })
    .finally(() => {
      _moveSample.loading = null;
    });

  return _moveSample.loading;
}

async function playMoveSample(volume = 0.9) {
  try {
    const { ctx, comp } = await getAC();
    const buffer = _moveSample.buffer ?? await loadMoveSampleBuffer(ctx);
    if (!buffer) return false;

    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(comp);
    src.start(ctx.currentTime + AUDIO_LOOKAHEAD * 0.5);
    return true;
  } catch (err) {
    warnMoveSample(err);
    return false;
  }
}

async function getAC() {
  if (!_ac.ctx) {
    _ac.ctx  = new (window.AudioContext || window.webkitAudioContext)();
    _ac.comp = _ac.ctx.createDynamicsCompressor();
    _ac.comp.threshold.value = -10;
    _ac.comp.knee.value      = 6;
    _ac.comp.ratio.value     = 4;
    _ac.comp.attack.value    = 0.001;
    _ac.comp.release.value   = 0.08;
    _ac.comp.connect(_ac.ctx.destination);
  }
  if (_ac.ctx.state !== "running") {
    await _ac.ctx.resume();
  }
  if (!_moveSample.buffer && !_moveSample.loading) {
    void loadMoveSampleBuffer(_ac.ctx);
  }
  return _ac;
}

// Schedule audio this many seconds ahead so main-thread work after
// the Sounds call doesn't starve the audio worklet before it fires.
const AUDIO_LOOKAHEAD = 0.04;

// Filtered noise burst helper
function noiseNode(ctx, freqHz, Q, durSec) {
  const rate    = ctx.sampleRate;
  const samples = Math.ceil(rate * durSec);
  const buf     = ctx.createBuffer(1, samples, rate);
  const d       = buf.getChannelData(0);
  for (let i = 0; i < samples; i++) d[i] = Math.random() * 2 - 1;
  const src     = ctx.createBufferSource();
  src.buffer    = buf;
  const bp      = ctx.createBiquadFilter();
  bp.type       = "bandpass";
  bp.frequency.value = freqHz;
  bp.Q.value    = Q;
  src.connect(bp);
  return { src, out: bp };
}

// Core wooden thud — the heart of every piece sound
// The click transient must dominate the very first millisecond.
// Body pitch starts close to pitchEnd already so there's no audible balloon sweep —
// just an instantaneous "tok" followed by the low resonance tail.
function woodThud(ctx, dest, at, {
  pitchStart = 75,      // start close to end — no balloon sweep
  pitchEnd   = 46,
  pitchDecay = 0.005,   // snap to final pitch in 5 ms — imperceptibly fast
  bodyGain   = 0.55,
  clickGain  = 0.55,    // click leads the attack — louder than body at t=0
  woodGain   = 0.30,
  totalGain  = 0.85,
  bodyDecay  = 0.18,
  noiseDecay = 0.008,   // click is very short — pure transient
  woodDecay  = 0.09,
} = {}) {
  const out = ctx.createGain();
  out.gain.value = totalGain;
  out.connect(dest);

  // 1. Click transient FIRST — this is what your ear hears as "attack"
  //    Two layers: a high crack (4kHz) and a mid knock (1.2kHz)
  const { src: clickSrc, out: clickOut } = noiseNode(ctx, 4000, 0.8, noiseDecay + 0.003);
  const clickEnv = ctx.createGain();
  clickEnv.gain.setValueAtTime(0, at);
  clickEnv.gain.linearRampToValueAtTime(clickGain, at + 0.0008); // 0.8 ms rise — instant crack
  clickEnv.gain.exponentialRampToValueAtTime(0.0001, at + noiseDecay);
  clickOut.connect(clickEnv); clickEnv.connect(out);
  clickSrc.start(at); clickSrc.stop(at + noiseDecay + 0.01);

  const { src: midSrc, out: midOut } = noiseNode(ctx, 1200, 1.0, noiseDecay * 1.8 + 0.003);
  const midEnv = ctx.createGain();
  midEnv.gain.setValueAtTime(0, at);
  midEnv.gain.linearRampToValueAtTime(clickGain * 0.55, at + 0.001);
  midEnv.gain.exponentialRampToValueAtTime(0.0001, at + noiseDecay * 1.8);
  midOut.connect(midEnv); midEnv.connect(out);
  midSrc.start(at); midSrc.stop(at + noiseDecay * 2 + 0.01);

  // 2. Body resonance — starts immediately but pitched low so it's the decay tail, not the attack
  const body    = ctx.createOscillator();
  const bodyEnv = ctx.createGain();
  body.type     = "sine";
  body.frequency.setValueAtTime(pitchStart, at);
  body.frequency.exponentialRampToValueAtTime(pitchEnd, at + pitchDecay);
  bodyEnv.gain.setValueAtTime(0, at);
  bodyEnv.gain.linearRampToValueAtTime(bodyGain, at + 0.001); // instant full gain
  bodyEnv.gain.exponentialRampToValueAtTime(0.0001, at + bodyDecay);
  body.connect(bodyEnv); bodyEnv.connect(out);
  body.start(at); body.stop(at + bodyDecay + 0.01);

  // Octave harmonic — decays faster
  const body2    = ctx.createOscillator();
  const body2Env = ctx.createGain();
  body2.type     = "sine";
  body2.frequency.setValueAtTime(pitchStart * 2.1, at);
  body2.frequency.exponentialRampToValueAtTime(pitchEnd * 2.1, at + pitchDecay);
  body2Env.gain.setValueAtTime(0, at);
  body2Env.gain.linearRampToValueAtTime(bodyGain * 0.22, at + 0.001);
  body2Env.gain.exponentialRampToValueAtTime(0.0001, at + bodyDecay * 0.5);
  body2.connect(body2Env); body2Env.connect(out);
  body2.start(at); body2.stop(at + bodyDecay * 0.6);

  // 3. Woody mid-body colour — 400–600 Hz bandpass tail
  const { src: woodSrc, out: woodOut } = noiseNode(ctx, 480, 0.9, woodDecay + 0.01);
  const woodEnv = ctx.createGain();
  woodEnv.gain.setValueAtTime(0, at);
  woodEnv.gain.linearRampToValueAtTime(woodGain, at + 0.002);
  woodEnv.gain.exponentialRampToValueAtTime(0.0001, at + woodDecay);
  woodOut.connect(woodEnv); woodEnv.connect(out);
  woodSrc.start(at); woodSrc.stop(at + woodDecay + 0.01);
}

// Tiny pitched tone for notifications (check / checkmate / stalemate)
// NOT used for piece movement
function chime(ctx, dest, at, freq, gainVal, decaySec, delayOffset = 0) {
  const t   = at + delayOffset;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type  = "sine";
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gainVal, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + decaySec);
  osc.connect(env); env.connect(dest);
  osc.start(t); osc.stop(t + decaySec + 0.02);
}

const Sounds = {
  // Light lift — picking up a piece
  async select() {
    try {
      const { ctx, comp } = await getAC();
      const t = ctx.currentTime + AUDIO_LOOKAHEAD;
      woodThud(ctx, comp, t, {
        pitchStart: 65, pitchEnd: 52, pitchDecay: 0.004,
        bodyGain: 0.30, clickGain: 0.40, woodGain: 0.18,
        totalGain: 0.55, bodyDecay: 0.10, noiseDecay: 0.006, woodDecay: 0.05,
      });
    } catch (e) { console.warn("select sound:", e); }
  },

  // Solid wooden placement
  async move() {
    if (await playMoveSample()) return;
    try {
      const { ctx, comp } = await getAC();
      const t = ctx.currentTime + AUDIO_LOOKAHEAD;
      woodThud(ctx, comp, t, {
        pitchStart: 72, pitchEnd: 44, pitchDecay: 0.005,
        bodyGain: 0.70, clickGain: 0.60, woodGain: 0.32,
        totalGain: 0.90, bodyDecay: 0.20, noiseDecay: 0.008, woodDecay: 0.10,
      });
    } catch (e) { console.warn("move sound:", e); }
  },

  // Hard slam — piece taken off the board.
  async capture() {
    try {
      const { ctx, comp } = await getAC();
      const t = ctx.currentTime + AUDIO_LOOKAHEAD;
      woodThud(ctx, comp, t, {
        pitchStart: 68, pitchEnd: 38, pitchDecay: 0.005,
        bodyGain: 0.85, clickGain: 0.80, woodGain: 0.42,
        totalGain: 1.0, bodyDecay: 0.24, noiseDecay: 0.010, woodDecay: 0.13,
      });
      woodThud(ctx, comp, t + 0.055, {
        pitchStart: 95, pitchEnd: 62, pitchDecay: 0.004,
        bodyGain: 0.30, clickGain: 0.28, woodGain: 0.18,
        totalGain: 0.42, bodyDecay: 0.14, noiseDecay: 0.007, woodDecay: 0.08,
      });
      const rate = ctx.sampleRate;
      const scrapeLen = 0.28;
      const scrapeBuf = ctx.createBuffer(1, Math.ceil(rate * scrapeLen), rate);
      const sd = scrapeBuf.getChannelData(0);
      for (let i = 0; i < sd.length; i++) sd[i] = (Math.random() * 2 - 1);
      const scrapeSrc = ctx.createBufferSource();
      scrapeSrc.buffer = scrapeBuf;
      const scrapeFilter = ctx.createBiquadFilter();
      scrapeFilter.type = "bandpass";
      scrapeFilter.frequency.value = 380;
      scrapeFilter.Q.value = 1.8;
      const scrapeEnv = ctx.createGain();
      const scrapeStart = t + 0.07;
      scrapeEnv.gain.setValueAtTime(0, scrapeStart);
      scrapeEnv.gain.linearRampToValueAtTime(0.10, scrapeStart + 0.04);
      scrapeEnv.gain.exponentialRampToValueAtTime(0.0001, scrapeStart + scrapeLen);
      scrapeSrc.connect(scrapeFilter);
      scrapeFilter.connect(scrapeEnv);
      scrapeEnv.connect(comp);
      scrapeSrc.start(scrapeStart);
      scrapeSrc.stop(scrapeStart + scrapeLen + 0.02);
    } catch (e) { console.warn("capture sound:", e); }
  },

  // Two distinct placements for king + rook
  async castle() {
    try {
      const { ctx, comp } = await getAC();
      const t = ctx.currentTime + AUDIO_LOOKAHEAD;
      woodThud(ctx, comp, t, {
        pitchStart: 72, pitchEnd: 44, pitchDecay: 0.005,
        bodyGain: 0.70, clickGain: 0.60, woodGain: 0.32,
        totalGain: 0.90, bodyDecay: 0.20, noiseDecay: 0.008, woodDecay: 0.10,
      });
      woodThud(ctx, comp, t + 0.18, {
        pitchStart: 78, pitchEnd: 50, pitchDecay: 0.005,
        bodyGain: 0.62, clickGain: 0.52, woodGain: 0.28,
        totalGain: 0.78, bodyDecay: 0.18, noiseDecay: 0.008, woodDecay: 0.09,
      });
    } catch (e) { console.warn("castle sound:", e); }
  },

  // Move sound + two descending chimes to signal threat
  async check() {
    try {
      const { ctx, comp } = await getAC();
      const t = ctx.currentTime + AUDIO_LOOKAHEAD;
      woodThud(ctx, comp, t, {
        pitchStart: 70, pitchEnd: 42, pitchDecay: 0.005,
        bodyGain: 0.68, clickGain: 0.58, woodGain: 0.30,
        totalGain: 0.88, bodyDecay: 0.20, noiseDecay: 0.008, woodDecay: 0.10,
      });
      chime(ctx, comp, t, 880, 0.12, 0.40, 0.12);
      chime(ctx, comp, t, 660, 0.09, 0.50, 0.22);
    } catch (e) { console.warn("check sound:", e); }
  },

  // Falling chord — game over
  async checkmate() {
    try {
      const { ctx, comp } = await getAC();
      const t = ctx.currentTime + AUDIO_LOOKAHEAD;
      woodThud(ctx, comp, t, {
        pitchStart: 65, pitchEnd: 36, pitchDecay: 0.005,
        bodyGain: 0.85, clickGain: 0.75, woodGain: 0.40,
        totalGain: 1.0, bodyDecay: 0.24, noiseDecay: 0.010, woodDecay: 0.13,
      });
      [440, 370, 311, 261].forEach((f, i) => {
        chime(ctx, comp, t, f, 0.14, 1.2, 0.20 + i * 0.22);
      });
    } catch (e) { console.warn("checkmate sound:", e); }
  },

  // Unresolved — draw
  async stalemate() {
    try {
      const { ctx, comp } = await getAC();
      const t = ctx.currentTime + AUDIO_LOOKAHEAD;
      woodThud(ctx, comp, t, {
        pitchStart: 72, pitchEnd: 44, pitchDecay: 0.005,
        bodyGain: 0.65, clickGain: 0.55, woodGain: 0.28,
        totalGain: 0.82, bodyDecay: 0.18, noiseDecay: 0.008, woodDecay: 0.09,
      });
      chime(ctx, comp, t, 392, 0.10, 0.9, 0.18);
      chime(ctx, comp, t, 440, 0.08, 0.9, 0.40);
    } catch (e) { console.warn("stalemate sound:", e); }
  },
};

