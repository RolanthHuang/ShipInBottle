// Fully synthesized audio (no files)
export class Audio {
  constructor() { this.ctx = null; this.on = false; this.wind = 0.3; }
  ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.connect(this.master); this.out = comp;
    // reverb (small room)
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(1.6, 2.6); const vg = c.createGain(); vg.gain.value = 0.28; this.verb.connect(vg); vg.connect(comp);
    this.dry = c.createGain(); this.dry.connect(comp); this.wet = c.createGain(); this.wet.connect(this.verb);
    // noise buffer
    const len = c.sampleRate * 4; const nb = c.createBuffer(1, len, c.sampleRate); const d = nb.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    this.brown = nb;
    const wb = c.createBuffer(1, len, c.sampleRate); const wd = wb.getChannelData(0); for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1; this.white = wb;
    // ambient sea wash
    const src = c.createBufferSource(); src.buffer = nb; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    this.seaGain = c.createGain(); this.seaGain.gain.value = 0.0;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.12; const lfoG = c.createGain(); lfoG.gain.value = 0.12; lfo.connect(lfoG); lfoG.connect(this.seaGain.gain);
    src.connect(lp); lp.connect(this.seaGain); this.seaGain.connect(this.dry); src.start(); lfo.start();
    this.seaLP = lp;
    // rain / storm bed
    const rs = c.createBufferSource(); rs.buffer = this.white; rs.loop = true;
    const rlp = c.createBiquadFilter(); rlp.type = 'bandpass'; rlp.frequency.value = 2400; rlp.Q.value = 0.4;
    this.rainGain = c.createGain(); this.rainGain.gain.value = 0; rs.connect(rlp); rlp.connect(this.rainGain); this.rainGain.connect(this.dry); rs.start();
    // fireplace bed (low rumble) + crackles scheduled in update()
    const fs = c.createBufferSource(); fs.buffer = nb; fs.loop = true;
    const flp = c.createBiquadFilter(); flp.type = 'lowpass'; flp.frequency.value = 260;
    this.fireGain = c.createGain(); this.fireGain.gain.value = 0.05; fs.connect(flp); flp.connect(this.fireGain); this.fireGain.connect(this.dry); fs.start(0, 1.3);
    this.crackT = c.currentTime + 0.5;
    this.creakT = c.currentTime + 6;
    // clock tick
    this.tickT = Math.ceil(c.currentTime) + 0.0; this.tickN = 0;
    return true;
  }
  impulse(sec, decay) { const c = this.ctx, n = c.sampleRate * sec, b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); } return b; }
  setOn(v) { if (!this.ensure()) return; this.on = v; if (v && this.ctx.state === 'suspended') this.ctx.resume(); this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.3); }
  setWind(level) { this.wind = level; if (!this.ctx) return; const t = this.ctx.currentTime; this.seaGain.gain.setTargetAtTime(0.1 + Math.min(level, 3) * 0.09, t, 1); this.seaLP.frequency.setTargetAtTime(380 + Math.min(level, 3.5) * 260, t, 1); this.rainGain.gain.setTargetAtTime(level >= 3 ? 0.06 : 0, t, 1.5); }
  update(fire = 1) {
    if (!this.ctx || !this.on) return; const c = this.ctx;
    while (this.tickT < c.currentTime + 0.2) { this.click(this.tickT, this.tickN++ % 2 ? 1800 : 2300); this.tickT += 1.0; }
    this.fireGain.gain.setTargetAtTime(0.05 * fire, c.currentTime, 0.5);
    while (this.crackT < c.currentTime + 0.2) { if (fire > 0.1) this.crackle(this.crackT, fire); this.crackT += 0.08 + Math.random() * Math.random() * 1.4; }
    if (this.creakT < c.currentTime) { this.creak(0.4); this.creakT = c.currentTime + 9 + Math.random() * 14; }
  }
  crackle(t, k = 1) { const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.white; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500 + Math.random() * 3000; bp.Q.value = 1.5; const g = c.createGain(); const a = (0.01 + Math.random() * 0.035) * k; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + Math.random() * 0.04); s.connect(bp); bp.connect(g); g.connect(this.dry); g.connect(this.wet); s.start(t, Math.random() * 3); s.stop(t + 0.08); }
  meow() { if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime; const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(520, t); o.frequency.linearRampToValueAtTime(820, t + 0.18); o.frequency.linearRampToValueAtTime(480, t + 0.55); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1600, t + 0.2); bp.frequency.linearRampToValueAtTime(800, t + 0.55); bp.Q.value = 4; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6); o.connect(bp); bp.connect(g); g.connect(this.dry); g.connect(this.wet); o.start(t); o.stop(t + 0.62); }
  whistle() { if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime; [0, 0.25].forEach((d, i) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1400 + i * 300, t + d); o.frequency.linearRampToValueAtTime(1900 + i * 200, t + d + 0.18); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.04, t + d + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22); o.connect(g); g.connect(this.dry); g.connect(this.wet); o.start(t + d); o.stop(t + d + 0.25); }); }
  click(t, f) { if (!this.ctx || !this.on) return; const c = this.ctx; const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 8; o.connect(bp); bp.connect(g); g.connect(this.dry); g.connect(this.wet); o.start(t); o.stop(t + 0.05); }
  partials(base, ratios, decays, gain, wetAmt = 0.6) {
    if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime;
    ratios.forEach((r, i) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = base * r; const g = c.createGain(); const a = gain / (1 + i * 0.6); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + decays[i % decays.length]); o.connect(g); g.connect(this.dry); const w = c.createGain(); w.gain.value = wetAmt; g.connect(w); w.connect(this.wet); o.start(t); o.stop(t + decays[i % decays.length] + 0.1); });
  }
  noise(dur, f, q, gain, type = 'bandpass', buf = 'white', fEnd) {
    if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = buf === 'white' ? this.white : this.brown; const bp = c.createBiquadFilter(); bp.type = type; bp.frequency.setValueAtTime(f, t); if (fEnd) bp.frequency.exponentialRampToValueAtTime(fEnd, t + dur); bp.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(this.dry); g.connect(this.wet); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
  }
  clink() { this.partials(2380 + Math.random() * 120, [1, 1.53, 2.31, 3.08], [1.4, 0.9, 0.6, 0.4], 0.09, 0.9); }
  bell() { this.partials(880, [0.5, 1, 1.19, 1.5, 2.0, 2.74, 3.0], [3.2, 2.6, 2.0, 1.6, 1.2, 0.9, 0.7], 0.12, 0.8); }
  splash(s = 1) { this.noise(0.35 * s + 0.15, 1800, 0.7, 0.18 * s, 'bandpass', 'white', 600); }
  slosh() { this.noise(1.2, 500, 0.8, 0.22, 'lowpass', 'brown', 200); }
  pop() { if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime; const o = c.createOscillator(); o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08); const g = c.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); o.connect(g); g.connect(this.dry); o.start(t); o.stop(t + 0.15); this.noise(0.08, 2500, 1, 0.08); }
  foghorn() {
    if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime;
    [110, 110 * 1.005, 220].forEach((f, i) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07 / (i + 1), t + 0.25); g.gain.setValueAtTime(0.07 / (i + 1), t + 1.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4); o.connect(lp); lp.connect(g); g.connect(this.dry); g.connect(this.wet); o.start(t); o.stop(t + 2.5); });
  }
  gull() {
    if (!this.ctx || !this.on) return; const c = this.ctx; const t0 = c.currentTime;
    for (let k = 0; k < 3; k++) {
      const t = t0 + k * 0.22; const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(2300, t + 0.05); o.frequency.exponentialRampToValueAtTime(1100, t + 0.18);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 3;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      o.connect(bp); bp.connect(g); g.connect(this.dry); g.connect(this.wet); o.start(t); o.stop(t + 0.22);
    }
  }
  thunder(delay = 0.6) { if (!this.ctx || !this.on) return; setTimeout(() => this.noise(3.5, 120, 0.6, 0.5, 'lowpass', 'brown', 40), delay * 1000); }
  creak(k = 1) { if (!this.ctx || !this.on) return; const c = this.ctx, t = c.currentTime; const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t); o.frequency.linearRampToValueAtTime(130, t + 0.5); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 6; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03 * k, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6); o.connect(bp); bp.connect(g); g.connect(this.dry); o.start(t); o.stop(t + 0.7); }
  chime() { this.partials(1320, [1, 1.5, 2, 2.5, 3], [1.5, 1.2, 1, 0.8, 0.6], 0.05, 1); }
  scratch() { this.noise(0.06, 5000, 2, 0.05); }
  tickSpin() { for (let i = 0; i < 10; i++) setTimeout(() => this.ctx && this.on && this.click(this.ctx.currentTime, 3000), i * 60 + i * i * 6); }
  wick() { this.noise(0.25, 900, 1.5, 0.05, 'bandpass', 'white', 3000); }
}
