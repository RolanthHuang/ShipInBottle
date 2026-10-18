import * as THREE from 'three';
import { innerR, rng, U } from './common.js';
import { softSprite, cloudSprite } from './textures.js';

const POINT_VS = `attribute float alpha; attribute float size; varying float vA; uniform float uScale;
  void main(){ vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = uScale*size/max(-mv.z, 0.01); gl_Position = projectionMatrix*mv; }`;

export class Splashes {
  constructor(n = 400) {
    this.n = n; this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.i = 0;
    this.alpha = new Float32Array(n); this.size = new Float32Array(n).fill(0.012);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: softSprite(32) }, uScale: { value: 300 }, uCol: { value: new THREE.Color(0.8, 0.85, 0.9) } },
      vertexShader: POINT_VS,
      fragmentShader: `uniform sampler2D tex; uniform vec3 uCol; varying float vA; void main(){ float a = texture2D(tex, gl_PointCoord).a * vA; if(a<0.01) discard; gl_FragColor = vec4(uCol*a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
    for (let i = 0; i < n; i++) this.p[i * 3 + 1] = -10;
  }
  burst(x, y, z, strength = 1, count = 40) {
    for (let k = 0; k < count; k++) {
      const i = this.i; this.i = (this.i + 1) % this.n;
      const a = Math.random() * Math.PI * 2, s = (0.1 + Math.random() * 0.35) * strength;
      this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
      this.v[i * 3] = Math.cos(a) * s * 0.6; this.v[i * 3 + 1] = (0.5 + Math.random() * 0.9) * strength; this.v[i * 3 + 2] = Math.sin(a) * s * 0.6;
      this.life[i] = 1; this.size[i] = 0.006 + Math.random() * 0.01;
    }
    this.points.geometry.attributes.size.needsUpdate = true;
  }
  update(dt, sea) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.v[i * 3 + 1] -= 3.2 * dt;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.life[i] -= dt * 0.9;
      if (this.v[i * 3 + 1] < 0 && this.p[i * 3 + 1] < sea.height(this.p[i * 3], this.p[i * 3 + 2])) this.life[i] = 0;
      this.alpha[i] = Math.max(0, this.life[i]) * 0.9;
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.alpha.needsUpdate = true;
  }
}

export class Bubbles {
  constructor(n = 90) {
    this.n = n; this.p = new Float32Array(n * 3); this.s = new Float32Array(n); this.R = rng(5);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.012, map: softSprite(32), transparent: true, opacity: 0.5, depthWrite: false, color: 0xcfe8ee, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false; this.sources = [[0.55, -0.33], [1.3, -0.2], [-0.2, -0.45], [0.95, 0.05]]; this.boost = 0; this.boostSrc = null;
    for (let i = 0; i < n; i++) this.respawn(i, true);
  }
  respawn(i, init) {
    const src = (this.boost > 0 && this.boostSrc && this.R() < 0.7) ? this.boostSrc : this.sources[Math.floor(this.R() * this.sources.length)];
    this.p[i * 3] = src[0] + (this.R() - 0.5) * 0.04; this.p[i * 3 + 2] = src[1] + (this.R() - 0.5) * 0.04;
    this.p[i * 3 + 1] = init ? -0.78 + this.R() * 0.4 : -0.78; this.s[i] = 0.05 + this.R() * 0.08;
  }
  update(dt, t, sea) {
    this.boost = Math.max(0, this.boost - dt);
    for (let i = 0; i < this.n; i++) {
      this.p[i * 3 + 1] += this.s[i] * dt * (1 + this.boost);
      this.p[i * 3] += Math.sin(t * 3 + i) * 0.01 * dt;
      if (this.p[i * 3 + 1] > sea.height(this.p[i * 3], this.p[i * 3 + 2]) - 0.01) this.respawn(i);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

// Soft smoke puffs (bottle-local): chimney + galley stove
export class Smoke {
  constructor(n = 90) {
    this.n = n; this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.alpha = new Float32Array(n); this.size = new Float32Array(n);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: cloudSprite(128, 11) }, uScale: { value: 300 }, uCol: { value: new THREE.Color(0.55, 0.55, 0.58) } },
      vertexShader: POINT_VS,
      fragmentShader: `uniform sampler2D tex; uniform vec3 uCol; varying float vA; void main(){ vec4 t = texture2D(tex, gl_PointCoord); float a = t.a * vA; if(a<0.004) discard; gl_FragColor = vec4(uCol*t.rgb*a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
    this.emitters = []; this.i = 0; this.acc = 0;
    for (let i = 0; i < n; i++) this.p[i * 3 + 1] = -10;
  }
  add(pos, rate = 3, scale = 1) { this.emitters.push({ pos, rate, scale, acc: 0, on: true }); }
  update(dt, wind = 0.3) {
    for (const e of this.emitters) {
      if (!e.on) continue;
      e.acc += dt * e.rate;
      while (e.acc > 1) {
        e.acc -= 1; const i = this.i; this.i = (this.i + 1) % this.n;
        this.p[i * 3] = e.pos.x + (Math.random() - 0.5) * 0.004; this.p[i * 3 + 1] = e.pos.y; this.p[i * 3 + 2] = e.pos.z + (Math.random() - 0.5) * 0.004;
        this.v[i * 3] = 0.012 + wind * 0.03; this.v[i * 3 + 1] = 0.035 + Math.random() * 0.015; this.v[i * 3 + 2] = (Math.random() - 0.5) * 0.008;
        this.life[i] = 1; this.size[i] = 0.012 * e.scale;
      }
    }
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt * 0.22;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.v[i * 3 + 1] *= 1 - dt * 0.25;
      this.size[i] += dt * 0.012;
      const x = this.p[i * 3], y = this.p[i * 3 + 1], z = this.p[i * 3 + 2];
      const edge = innerR(x) - Math.hypot(y, z);
      const fadeIn = Math.min(1, (1 - this.life[i]) * 6);
      this.alpha[i] = Math.max(0, this.life[i]) * fadeIn * 0.35 * Math.min(1, Math.max(0, edge / 0.12));
    }
    const a = this.points.geometry.attributes; a.position.needsUpdate = true; a.alpha.needsUpdate = true; a.size.needsUpdate = true;
  }
}

// Fireplace embers (world space)
export class Embers {
  constructor(origin, n = 70) {
    this.o = origin; this.n = n; this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.alpha = new Float32Array(n); this.size = new Float32Array(n).fill(0.05);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: softSprite(32) }, uScale: { value: 300 }, uCol: { value: new THREE.Color(3.0, 1.2, 0.3) } },
      vertexShader: POINT_VS,
      fragmentShader: `uniform sampler2D tex; uniform vec3 uCol; varying float vA; void main(){ float a = texture2D(tex, gl_PointCoord).a * vA; if(a<0.01) discard; gl_FragColor = vec4(uCol*a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
    for (let i = 0; i < n; i++) this.respawn(i, true);
  }
  respawn(i, init) {
    this.p[i * 3] = this.o.x + (Math.random() - 0.5) * 0.6; this.p[i * 3 + 1] = this.o.y + (init ? Math.random() * 3 : 0); this.p[i * 3 + 2] = this.o.z + (Math.random() - 0.5) * 2.4;
    this.v[i * 3] = (Math.random() - 0.3) * 0.25; this.v[i * 3 + 1] = 0.8 + Math.random() * 1.2; this.v[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    this.life[i] = init ? Math.random() : 1; this.size[i] = 0.03 + Math.random() * 0.05;
  }
  update(dt, t, intensity = 1) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt * (0.45 + (i % 5) * 0.08);
      if (this.life[i] <= 0) this.respawn(i, false);
      this.p[i * 3] += (this.v[i * 3] + Math.sin(t * 3 + i) * 0.15) * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += (this.v[i * 3 + 2] + Math.cos(t * 2.3 + i) * 0.15) * dt;
      this.alpha[i] = Math.max(0, this.life[i]) * (0.5 + 0.5 * Math.sin(t * 20 + i * 3)) * intensity;
    }
    const a = this.points.geometry.attributes; a.position.needsUpdate = true; a.alpha.needsUpdate = true; a.size.needsUpdate = true;
  }
}

export class Storm {
  constructor() {
    this.group = new THREE.Group(); this.level = 0; this.target = 0;
    const tex = cloudSprite(256, 3);
    this.clouds = [];
    const R = rng(77);
    for (let i = 0; i < 18; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, color: 0x8a9096, transparent: true, opacity: 0, depthWrite: false });
      const s = new THREE.Sprite(m); const x = -1.7 + R() * 3.0; const ri = innerR(x);
      s.position.set(x, 0.66 + R() * 0.12, (R() - 0.5) * 0.7);
      const rr = Math.hypot(s.position.y, s.position.z); if (rr > ri - 0.14) { const k = (ri - 0.14) / rr; s.position.y *= k; s.position.z *= k; }
      s.scale.set(0.5 + R() * 0.4, 0.28 + R() * 0.15, 1); s.userData.base = s.position.clone(); s.userData.ph = R() * 6;
      this.group.add(s); this.clouds.push(s);
    }
    this.nRain = 320; this.rp = new Float32Array(this.nRain * 6); this.rv = new Float32Array(this.nRain);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(this.rp, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xaab8c4, transparent: true, opacity: 0, depthWrite: false });
    this.rain = new THREE.LineSegments(rg, this.rainMat); this.rain.frustumCulled = false; this.group.add(this.rain);
    for (let i = 0; i < this.nRain; i++) this.respawnRain(i, true);
    this.boltGeo = new THREE.BufferGeometry(); this.boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3));
    this.boltMat = new THREE.LineBasicMaterial({ color: 0xe8efff, transparent: true, opacity: 0 });
    this.bolt = new THREE.Line(this.boltGeo, this.boltMat); this.bolt.frustumCulled = false; this.group.add(this.bolt);
    this.light = new THREE.PointLight(0xc8d6ff, 0, 4, 2); this.light.position.set(0, 0.6, 0); this.group.add(this.light);
    this.nextBolt = 3; this.flash = 0;
  }
  respawnRain(i, init) {
    const x = -1.8 + Math.random() * 3.2, z = (Math.random() - 0.5) * 1.0, y = init ? -0.3 + Math.random() * 0.9 : 0.62 + Math.random() * 0.1;
    this.rp[i * 6] = x; this.rp[i * 6 + 1] = y; this.rp[i * 6 + 2] = z; this.rp[i * 6 + 3] = x - 0.006; this.rp[i * 6 + 4] = y + 0.045; this.rp[i * 6 + 5] = z; this.rv[i] = 1.6 + Math.random() * 0.8;
  }
  strike(onStrike) {
    const p = this.boltGeo.attributes.position; const x0 = -1.4 + Math.random() * 2.4, z0 = (Math.random() - 0.5) * 0.4;
    let x = x0, z = z0, y = 0.66;
    for (let i = 0; i < 30; i++) { p.setXYZ(i, x, y, z); y -= 0.034; x += (Math.random() - 0.5) * 0.06; z += (Math.random() - 0.5) * 0.04; }
    p.needsUpdate = true; this.flash = 1; this.light.position.set(x0, 0.5, z0);
    onStrike && onStrike(x, z);
  }
  update(dt, t, sea, onStrike) {
    this.level += (this.target - this.level) * Math.min(1, dt * 0.6);
    const L = this.level;
    this.clouds.forEach(s => { s.material.opacity = L * 0.92; s.position.x = s.userData.base.x + Math.sin(t * 0.15 + s.userData.ph) * 0.06; s.material.color.setScalar(0.42 + 0.1 * Math.sin(s.userData.ph) + this.flash * 0.6); });
    this.rainMat.opacity = L * 0.55;
    if (L > 0.05) {
      for (let i = 0; i < this.nRain; i++) {
        const v = this.rv[i] * dt; this.rp[i * 6 + 1] -= v; this.rp[i * 6 + 4] -= v; this.rp[i * 6] += 0.08 * dt; this.rp[i * 6 + 3] += 0.08 * dt;
        if (this.rp[i * 6 + 1] < sea.height(this.rp[i * 6], this.rp[i * 6 + 2])) this.respawnRain(i);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    this.nextBolt -= dt;
    if (L > 0.6 && this.nextBolt < 0) { this.strike(onStrike); this.nextBolt = 4 + Math.random() * 7; }
    this.flash = Math.max(0, this.flash - dt * 3.2);
    const fl = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(t * 80)) : 0;
    this.boltMat.opacity = fl > 0.2 ? 1 : 0;
    this.light.intensity = fl * 30;
    this.group.visible = L > 0.01;
    return fl;
  }
}

export function makeMiniBottle() {
  const g = new THREE.Group();
  const pts = []; for (let i = 0; i <= 16; i++) { const x = -0.04 + i / 16 * 0.075; const r = x < 0.015 ? 0.012 : 0.012 - (x - 0.015) / 0.02 * 0.007; pts.push(new THREE.Vector2(Math.max(0.0045, r), x)); }
  const geo = new THREE.LatheGeometry(pts, 16); geo.rotateZ(-Math.PI / 2);
  g.add(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0x9fc4b0, roughness: 0.08, transparent: true, opacity: 0.55, clearcoat: 1 })));
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 8), new THREE.MeshStandardMaterial({ color: 0xe8dcc0 })); paper.rotation.z = Math.PI / 2; g.add(paper);
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.0045, 0.012, 8), new THREE.MeshStandardMaterial({ color: 0xa77b4f })); cork.rotation.z = -Math.PI / 2; cork.position.x = 0.038; g.add(cork);
  return g;
}
