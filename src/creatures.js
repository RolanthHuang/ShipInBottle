import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { B, U, innerR, smooth, clamp, rng, makeNoise, addCaustics, patchMaterial } from './common.js';
import { cv, toTex, softSprite } from './textures.js';

const nonIdx = (g) => { const q = g.index ? g.toNonIndexed() : g; if (q.attributes.uv) q.deleteAttribute('uv'); return q; };

// ---------------- Dolphins ----------------
function dolphinGeometry() {
  const L = 0.22;
  const prof = [[0, 0], [0.006, 0.0032], [0.014, 0.0045], [0.02, 0.0058], [0.026, 0.0095], [0.034, 0.0135], [0.045, 0.0175], [0.065, 0.0225], [0.09, 0.0262], [0.12, 0.0258], [0.15, 0.0205], [0.175, 0.0128], [0.198, 0.0072], [0.212, 0.0052], [0.22, 0.0042]];
  const body = new THREE.LatheGeometry(prof.map(([x, r]) => new THREE.Vector2(r, x)), 24);
  body.rotateZ(Math.PI / 2);
  body.translate(L * 0.5, 0, 0);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const fromSnout = L * 0.5 - x;
    const melon = Math.exp(-Math.pow((fromSnout - 0.034) / 0.012, 2)) * 0.004;
    p.setXYZ(i, x, (y < 0 ? y * 0.9 : y) + melon * (y > 0 ? 1 : 0.3), z * 0.82);
  }
  const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.bezierCurveTo(-0.004, 0.012, -0.012, 0.024, -0.03, 0.032); fs.bezierCurveTo(-0.026, 0.02, -0.03, 0.008, -0.04, 0); fs.closePath();
  const fin = new THREE.ExtrudeGeometry(fs, { depth: 0.0028, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.0008, bevelSegments: 1 }); fin.translate(0.012, 0.022, -0.0014);
  const pf = new THREE.SphereGeometry(0.014, 10, 6); pf.scale(1.5, 0.18, 0.5);
  const pf1 = pf.clone(); pf1.rotateY(0.7); pf1.rotateX(0.55); pf1.translate(0.05, -0.013, 0.019);
  const pf2 = pf.clone(); pf2.rotateY(-0.7); pf2.rotateX(-0.55); pf2.translate(0.05, -0.013, -0.019);
  const fl = new THREE.Shape(); fl.moveTo(0, 0); fl.quadraticCurveTo(-0.008, 0.03, -0.03, 0.036); fl.quadraticCurveTo(-0.018, 0.014, -0.022, 0); fl.quadraticCurveTo(-0.018, -0.014, -0.03, -0.036); fl.quadraticCurveTo(-0.008, -0.03, 0, 0);
  const fluke = new THREE.ExtrudeGeometry(fl, { depth: 0.0026, bevelEnabled: false }); fluke.rotateX(Math.PI / 2); fluke.translate(-L * 0.5 + 0.004, 0.0013, 0);
  const merged = mergeGeometries([body, fin, pf1, pf2, fluke].map(nonIdx));
  merged.computeVertexNormals();
  const mp = merged.attributes.position; const cols = [];
  for (let i = 0; i < mp.count; i++) { const y = mp.getY(i), x = mp.getX(i); const t = smooth(-0.014, 0.01, y + 0.004 * Math.sin(x * 60)); const c = new THREE.Color(0xd2d8da).lerp(new THREE.Color(0x3f4b56), t); cols.push(c.r, c.g, c.b); }
  merged.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return merged;
}

export class Dolphins {
  constructor(n = 3) {
    this.group = new THREE.Group();
    this.list = [];
    const base = dolphinGeometry();
    const mat = addCaustics(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }), 0.7);
    for (let i = 0; i < n; i++) {
      const geo = base.clone();
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true;
      const eyeM = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.15 });
      [1, -1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0021, 8, 6), eyeM); e.position.set(0.081, 0.004, 0.0108 * s); mesh.add(e); });
      const root = new THREE.Group(); root.add(mesh); this.group.add(root);
      this.list.push({ root, mesh, geo, basePos: geo.attributes.position.array.slice(), t: i * 2.1, speed: 0.22 + i * 0.03, rx: 1.15 - i * 0.12, rz: 0.36 - i * 0.05, cx: -0.05 + i * 0.12, depth: 0.13 + i * 0.03, state: 'swim', jt: 0, nextJump: 6 + i * 5 + Math.random() * 6, spin: 0, phase: Math.random() * 6, dir: i % 2 ? 1 : -1, pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
  }
  jump(d, spin = false) { if (d.state !== 'swim') return false; d.state = 'leap'; d.jt = 0; d.spin = spin ? 1 : 0; return true; }
  update(dt, time, sea, onSplash) {
    const tmp = new THREE.Vector3(), tang = new THREE.Vector3();
    for (const d of this.list) {
      const angSpeed = d.speed / Math.max(d.rx, d.rz) * d.dir;
      d.t += angSpeed * dt * (d.state === 'leap' ? 1.6 : 1);
      tmp.set(d.cx + Math.cos(d.t) * d.rx, 0, Math.sin(d.t) * d.rz);
      const surf = sea.height(tmp.x, tmp.z);
      let y;
      d.nextJump -= dt;
      if (d.state === 'swim') {
        y = surf - d.depth + Math.sin(time * 1.3 + d.phase) * 0.025;
        if (d.nextJump < 0) { this.jump(d, Math.random() < 0.3); d.nextJump = 10 + Math.random() * 12; }
      } else {
        d.jt += dt;
        const T = 1.05, H = 0.25;
        const s = d.jt / T;
        if (s < 1) y = surf - d.depth * 0.3 + (H + d.depth * 0.3) * 4 * s * (1 - s) - 0.02;
        else y = surf - d.depth * Math.min(1, (s - 1) * 3);
        if (!d.splashOut && y > surf) { d.splashOut = true; onSplash && onSplash(tmp.x, surf, tmp.z, 0.7); }
        if (d.splashOut && !d.splashIn && s > 0.85 && y < surf + 0.01) { d.splashIn = true; onSplash && onSplash(tmp.x, surf, tmp.z, 1.0); }
        if (s > 1.4) { d.state = 'swim'; d.splashOut = d.splashIn = false; }
      }
      d.prev.copy(d.pos); d.pos.set(tmp.x, y, tmp.z);
      d.vel.subVectors(d.pos, d.prev).divideScalar(Math.max(dt, 1e-3));
      d.root.position.copy(d.pos);
      if (d.vel.lengthSq() > 1e-6) {
        tang.copy(d.vel).normalize();
        d.root.rotation.set(0, Math.atan2(-tang.z, tang.x), Math.asin(clamp(tang.y, -1, 1)), 'YZX');
        if (d.state === 'leap' && d.spin) d.root.rotateX(Math.min(1, d.jt / 1.0) * Math.PI * 2);
      }
      const p = d.geo.attributes.position, b = d.basePos;
      const freq = d.state === 'leap' ? 9 : 6;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3]; const tail = clamp((0.11 - x) / 0.22, 0, 1);
        p.setY(i, b[i * 3 + 1] + Math.sin(time * freq - tail * 3.5 + d.phase) * 0.016 * Math.pow(tail, 1.6));
      }
      p.needsUpdate = true;
    }
  }
}

// ---------------- Gulls (flying + perched) ----------------
function gullParts() {
  const white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.8 });
  const beakM = new THREE.MeshStandardMaterial({ color: 0xe0b030 });
  const ws = new THREE.Shape(); ws.moveTo(0, 0.012); ws.lineTo(0.05, 0.016); ws.quadraticCurveTo(0.09, 0.006, 0.105, -0.008); ws.lineTo(0.06, -0.006); ws.lineTo(0, -0.012); ws.closePath();
  const wGeo = new THREE.ShapeGeometry(ws); wGeo.rotateX(-Math.PI / 2);
  const wc = []; const wp = wGeo.attributes.position; for (let i = 0; i < wp.count; i++) { const x = wp.getX(i); const c = x > 0.075 ? new THREE.Color(0x222222) : new THREE.Color(0xb4b9be); wc.push(c.r, c.g, c.b); }
  wGeo.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
  const wingMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
  return { white, beakM, wGeo, wingMat };
}
function makeGull(P) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), P.white); b.scale.set(2.2, 0.9, 0.9); body.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 12, 8), P.white); h.position.set(0.026, 0.006, 0); body.add(h);
  const bk = new THREE.Mesh(new THREE.ConeGeometry(0.0025, 0.012, 6), P.beakM); bk.rotation.z = -Math.PI / 2; bk.position.set(0.038, 0.004, 0); body.add(bk);
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0013, 5, 4), new THREE.MeshStandardMaterial({ color: 0x111111 })); e.position.set(0.03, 0.009, s * 0.0055); body.add(e); });
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.02, 4), P.white); tail.rotation.z = Math.PI / 2; tail.scale.set(1, 1, 0.3); tail.position.set(-0.03, 0.002, 0); body.add(tail);
  const legs = new THREE.Group(); body.add(legs);
  [-1, 1].forEach(s => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.014, 4), P.beakM); l.position.set(0.0, -0.016, s * 0.004); legs.add(l); });
  const wl = new THREE.Group(), wr = new THREE.Group();
  const m1 = new THREE.Mesh(P.wGeo, P.wingMat); m1.rotation.y = -Math.PI / 2; wl.add(m1);
  const m2 = new THREE.Mesh(P.wGeo, P.wingMat); m2.rotation.y = Math.PI / 2; m2.scale.z = -1; wr.add(m2);
  wl.position.set(0.004, 0.006, 0.006); wr.position.set(0.004, 0.006, -0.006);
  body.add(wl, wr);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, body, wl, wr, legs };
}

export class Gulls {
  constructor(perches = []) {
    this.group = new THREE.Group(); this.list = [];
    const P = gullParts();
    const cfg = [
      { cx: -0.35, cy: 0.72, cz: 0, rx: 1.15, rz: 0.36, sp: 0.45, ph: 0 },
      { cx: -1.6, cy: 0.18, cz: -0.3, rx: 0.3, rz: 0.26, sp: 0.6, ph: 2 },
      { cx: -0.2, cy: 0.62, cz: 0.05, rx: 0.9, rz: 0.3, sp: -0.38, ph: 4 },
    ];
    cfg.forEach(c => { const gp = makeGull(P); gp.legs.visible = false; this.group.add(gp.root); this.list.push({ ...c, ...gp, a: c.ph, swoop: 0, flapBoost: 0, prev: new THREE.Vector3(), pos: new THREE.Vector3(), mode: 'fly' }); });
    perches.forEach((pp, i) => {
      const gp = makeGull(P); this.group.add(gp.root);
      const g = { cx: -0.6 + i * 0.4, cy: 0.55, cz: 0.0, rx: 0.8, rz: 0.3, sp: 0.5 * (i ? -1 : 1), ph: i * 3, ...gp, a: 0, swoop: 0, flapBoost: 0, prev: new THREE.Vector3(), pos: pp.clone(), mode: 'perch', perch: pp.clone(), heading: i ? 2.2 : -0.6, flyT: 0 };
      this.list.push(g);
    });
  }
  path(g, a, out) {
    out.set(g.cx + Math.cos(a) * g.rx, g.cy + Math.sin(a * 2) * 0.04, g.cz + Math.sin(a) * g.rz);
    const ri = innerR(out.x) - 0.08; const rr = Math.hypot(out.y, out.z); if (rr > ri) { out.y *= ri / rr; out.z *= ri / rr; }
    return out;
  }
  startle(g) {
    if (g.mode === 'perch') { g.mode = 'takeoff'; g.flyT = 0; g.a = Math.atan2((g.perch.z - g.cz) / g.rz, (g.perch.x - g.cx) / g.rx); g.from = g.pos.clone(); return; }
    g.swoop = 1; g.flapBoost = 1.5;
  }
  update(dt, time, sea) {
    const tmp = new THREE.Vector3();
    for (const g of this.list) {
      let flap = 1, glide = false;
      if (g.mode === 'perch') {
        g.root.position.copy(g.perch); g.root.rotation.set(0, g.heading, 0);
        g.body.rotation.set(0, 0, 0.15 + Math.sin(time * 0.7 + g.ph) * 0.03);
        g.wl.rotation.x = -1.35; g.wr.rotation.x = 1.35; g.wl.rotation.y = 0.25; g.wr.rotation.y = -0.25;
        g.legs.visible = true; g.pos.copy(g.perch);
        if (Math.sin(time * 0.37 + g.ph) > 0.995) g.body.rotation.z += 0.2;
        continue;
      }
      g.wl.rotation.y = 0; g.wr.rotation.y = 0; g.legs.visible = false;
      if (g.mode === 'takeoff' || g.mode === 'land') {
        g.flyT += dt;
        const T = g.mode === 'takeoff' ? 1.6 : 2.2;
        const k = Math.min(1, g.flyT / T);
        this.path(g, g.a, tmp);
        const a = g.mode === 'takeoff' ? g.from : tmp.clone();
        const b = g.mode === 'takeoff' ? tmp.clone() : g.perch;
        const kk = k * k * (3 - 2 * k);
        const p = a.clone().lerp(b, kk); p.y += Math.sin(Math.PI * k) * 0.08;
        g.prev.copy(g.pos); g.pos.copy(p); g.root.position.copy(p);
        if (k >= 1) { if (g.mode === 'takeoff') { g.mode = 'fly'; g.flyT = 0; g.landAt = 9 + Math.random() * 6; } else { g.mode = 'perch'; g.root.rotation.set(0, g.heading, 0); continue; } }
        flap = 1.6;
      } else {
        g.a += g.sp / Math.max(g.rx, 0.3) * dt * (1 + g.flapBoost * 0.3);
        this.path(g, g.a, tmp);
        if (g.swoop > 0) {
          g.swoop = Math.max(0, g.swoop - dt * 0.45);
          const s = 1 - g.swoop; const dip = Math.sin(Math.PI * s);
          const surf = sea.height(tmp.x, tmp.z) + 0.05;
          tmp.y = tmp.y + (surf - tmp.y) * dip * 0.9;
        }
        g.flapBoost = Math.max(0, g.flapBoost - dt * 0.6);
        g.prev.copy(g.pos); g.pos.copy(tmp); g.root.position.copy(tmp);
        if (g.perch) { g.flyT += dt; if (g.flyT > g.landAt) { g.mode = 'land'; g.flyT = 0; } }
        glide = (Math.sin(time * 0.7 + g.ph) > 0.2 && g.flapBoost < 0.1);
      }
      const v = new THREE.Vector3().subVectors(g.pos, g.prev);
      if (v.lengthSq() > 1e-9) {
        const yaw = Math.atan2(-v.z, v.x); const pitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
        g.root.rotation.set(0, yaw, 0); g.body.rotation.z = pitch * 0.8;
        g.body.rotation.x = -Math.sign(g.sp || 1) * 0.35;
      }
      const f = glide ? 0.12 + Math.sin(time * 2) * 0.03 : Math.sin(time * (11 + g.flapBoost * 5) * flap + g.ph) * 0.7;
      g.wl.rotation.x = -f; g.wr.rotation.x = f;
    }
  }
}

// ---------------- Fish ----------------
function fishGeometry() {
  const body = new THREE.SphereGeometry(0.01, 12, 8); body.scale(1.9, 0.72, 0.4);
  const tl = new THREE.Shape(); tl.moveTo(0, 0); tl.lineTo(-0.012, 0.007); tl.quadraticCurveTo(-0.009, 0, -0.012, -0.007); tl.closePath();
  const tail = new THREE.ShapeGeometry(tl); tail.translate(-0.017, 0, 0);
  const df = new THREE.Shape(); df.moveTo(0.004, 0); df.lineTo(-0.004, 0.005); df.lineTo(-0.009, 0); df.closePath();
  const dorsal = new THREE.ShapeGeometry(df); dorsal.translate(0, 0.0068, 0);
  const g = mergeGeometries([body, tail, dorsal].map(nonIdx));
  g.computeVertexNormals();
  const p = g.attributes.position; const cols = [];
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const t = smooth(-0.004, 0.005, y); const c = new THREE.Color(0xf0f2f2).lerp(new THREE.Color(0x40566a), t); cols.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
}

export class FishSchool {
  constructor(n = 40, opts = {}) {
    const geo = fishGeometry();
    const mat = addCaustics(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.28, side: THREE.DoubleSide }), 0.8);
    patchMaterial(mat, 'fishwag', (sh) => {
      sh.uniforms.uTime = U.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 31.0 + instanceMatrix[3].z * 17.0;
          float tl = clamp(-position.x / 0.03, 0.0, 1.0);
          transformed.z += sin(uTime * 14.0 + ph - position.x * 120.0) * 0.004 * tl * tl;`);
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, n); this.n = n;
    const R = rng(opts.seed || 8);
    this.f = [];
    const pal = opts.palette || [0xcfd6dc, 0xb9c4cc, 0xc8d0d6, 0xdde4e8];
    for (let i = 0; i < n; i++) {
      this.f.push({ off: new THREE.Vector3((R() - 0.5) * 0.24, (R() - 0.5) * 0.08, (R() - 0.5) * 0.18), ph: R() * 6, pos: new THREE.Vector3(), prev: new THREE.Vector3(), sc: (opts.size || 1) * (0.7 + R() * 0.6), q: new THREE.Quaternion() });
      this.mesh.setColorAt(i, new THREE.Color(pal[i % pal.length]));
    }
    this.speed = opts.speed || 1; this.yBase = opts.y ?? -0.6; this.phase = opts.phase || 0;
    this.scatter = 0;
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
  }
  center(t, out) { t = t * this.speed + this.phase; return out.set(0.2 + Math.sin(t * 0.13) * 1.0, this.yBase + Math.sin(t * 0.31) * 0.06, Math.sin(t * 0.21 + 1) * 0.3); }
  startle() { this.scatter = 1; }
  update(dt, t) {
    this.scatter = Math.max(0, this.scatter - dt * 0.5);
    const m = new THREE.Matrix4(); const tmp = new THREE.Vector3(); const q = new THREE.Quaternion();
    for (let i = 0; i < this.n; i++) {
      const f = this.f[i];
      const lag = 0.4 + (i % 7) * 0.05;
      this.center(t - lag, tmp);
      const sp = 1 + this.scatter * 3.5;
      tmp.add(new THREE.Vector3(f.off.x * sp + Math.sin(t * 1.3 + f.ph) * 0.02, f.off.y * sp + Math.sin(t * 1.7 + f.ph) * 0.01, f.off.z * sp + Math.cos(t * 1.1 + f.ph) * 0.02));
      const ri = innerR(tmp.x) - 0.05; const rr = Math.hypot(tmp.y, tmp.z); if (rr > ri) { tmp.y *= ri / rr; tmp.z *= ri / rr; }
      tmp.y = Math.min(tmp.y, B.level - 0.06);
      f.prev.copy(f.pos); f.pos.lerp(tmp, Math.min(1, dt * (3 + this.scatter * 6)));
      const v = new THREE.Vector3().subVectors(f.pos, f.prev);
      if (v.lengthSq() > 1e-10) { q.setFromEuler(new THREE.Euler(0, Math.atan2(-v.z, v.x), clamp(v.y / Math.max(1e-5, Math.hypot(v.x, v.z)), -0.5, 0.5))); f.q.slerp(q, Math.min(1, dt * 6)); }
      m.compose(f.pos, f.q, new THREE.Vector3(f.sc, f.sc, f.sc));
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- Sea turtle ----------------
function shellCanvas() {
  const c = cv(256, 256), x = c.getContext('2d');
  x.fillStyle = '#4a3a1e'; x.fillRect(0, 0, 256, 256);
  const R = rng(4);
  const cells = [[128, 128, 40], [128, 60, 34], [128, 196, 34], [70, 95, 32], [186, 95, 32], [70, 165, 32], [186, 165, 32], [40, 128, 22], [216, 128, 22]];
  cells.forEach(([cx, cy, r]) => {
    const gr = x.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 2, cx, cy, r);
    gr.addColorStop(0, '#8a6a32'); gr.addColorStop(0.6, '#6a4f24'); gr.addColorStop(1, '#2e2210');
    x.fillStyle = gr; x.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.5; const rr = r * (0.9 + R() * 0.15); i ? x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    x.closePath(); x.fill(); x.strokeStyle = 'rgba(230,210,160,0.35)'; x.lineWidth = 3; x.stroke();
  });
  return c;
}
export class Turtle {
  constructor() {
    const g = this.group = new THREE.Group();
    const skin = addCaustics(new THREE.MeshStandardMaterial({ color: 0x6a7a5a, roughness: 0.7 }), 0.8);
    const shellM = addCaustics(new THREE.MeshPhysicalMaterial({ map: toTex(shellCanvas(), { wrap: false }), roughness: 0.4, clearcoat: 0.5 }), 0.8);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.05, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), shellM);
    const sp = shell.geometry.attributes.position, suv = shell.geometry.attributes.uv; for (let i = 0; i < sp.count; i++) suv.setXY(i, sp.getX(i) / 0.1 + 0.5, sp.getZ(i) / 0.1 + 0.5);
    shell.scale.set(1.25, 0.42, 1.0); g.add(shell);
    const plast = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), new THREE.MeshStandardMaterial({ color: 0xd8c89a, roughness: 0.8 })); plast.rotation.x = Math.PI / 2; plast.scale.set(1.2, 0.95, 1); plast.position.y = -0.001; g.add(plast);
    const head = new THREE.Group(); head.position.set(0.066, 0.004, 0); g.add(head);
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 10), skin); hm.scale.set(1.35, 0.85, 0.9); head.add(hm);
    [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0024, 6, 4), new THREE.MeshStandardMaterial({ color: 0x0a0a0a })); e.position.set(0.01, 0.004, s * 0.008); head.add(e); });
    const fl = (len, wid) => { const geo = new THREE.SphereGeometry(1, 14, 8); geo.scale(len, 0.004, wid); geo.translate(len * 0.9, 0, 0); return new THREE.Mesh(geo, skin); };
    this.fins = [];
    [[0.03, 1, 0.055, 0.017], [0.03, -1, 0.055, 0.017], [-0.045, 1, 0.026, 0.012], [-0.045, -1, 0.026, 0.012]].forEach(([x, s, l, w], i) => {
      const piv = new THREE.Group(); piv.position.set(x, -0.002, s * 0.038); g.add(piv);
      const m = fl(l, w); m.rotation.y = s * (i < 2 ? -1.0 : -2.3); piv.add(m); this.fins.push({ piv, s, front: i < 2 });
    });
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.head = head; this.t = 0; this.boost = 0; this.pos = new THREE.Vector3(); this.prev = new THREE.Vector3();
  }
  poke() { this.boost = 1; }
  update(dt, time) {
    this.boost = Math.max(0, this.boost - dt * 0.35);
    this.t += dt * (0.05 + this.boost * 0.12);
    const a = this.t;
    this.prev.copy(this.pos);
    this.pos.set(0.4 + Math.cos(a) * 0.95, -0.56 + Math.sin(a * 2.0) * 0.06 - this.boost * 0.05 * Math.sin(this.boost * 6), Math.sin(a) * 0.32);
    this.group.position.copy(this.pos);
    const v = this.pos.clone().sub(this.prev);
    if (v.lengthSq() > 1e-10) this.group.rotation.set(0, Math.atan2(-v.z, v.x), clamp(v.y / Math.max(1e-6, Math.hypot(v.x, v.z)), -0.5, 0.5) * 0.8, 'YZX');
    const sp = 1.4 + this.boost * 3;
    this.fins.forEach(f => {
      const ph = time * sp + (f.front ? 0 : 1.2);
      f.piv.rotation.x = f.s * (f.front ? Math.sin(ph) * 0.55 : Math.sin(ph) * 0.25);
      f.piv.rotation.y = f.front ? Math.cos(ph) * 0.25 * f.s : 0;
    });
    this.head.rotation.y = Math.sin(time * 0.6) * 0.2 + this.boost * Math.sin(time * 6) * 0.3;
  }
}

// ---------------- Jellyfish ----------------
export class Jellies {
  constructor(n = 3) {
    this.group = new THREE.Group(); this.list = [];
    const bellMat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.time, uNight: U.night, uPulse: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uTime; uniform float uNight; uniform float uPulse; varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){ float fr = pow(1.0 - abs(dot(vN, vV)), 2.0); float rings = 0.5 + 0.5*sin(vY*600.0);
          vec3 c = mix(vec3(0.75,0.6,0.9), vec3(0.4,0.9,1.0), uNight) * (fr*0.9 + 0.12 + rings*0.06);
          c *= 0.6 + uNight*1.4 + uPulse*2.0; float a = clamp(fr*0.8 + 0.12, 0., 1.);
          gl_FragColor = vec4(c*a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const tentMat = new THREE.LineBasicMaterial({ color: 0x9ab8d8, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    const R = rng(23);
    for (let i = 0; i < n; i++) {
      const root = new THREE.Group(); this.group.add(root);
      const bellGeo = new THREE.SphereGeometry(0.028, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
      const m = bellMat.clone(); m.uniforms.uTime = U.time; m.uniforms.uNight = U.night; m.uniforms.uPulse = { value: 0 };
      const bell = new THREE.Mesh(bellGeo, m); root.add(bell);
      const nT = 10, seg = 12;
      const tp = new Float32Array(nT * seg * 2 * 3);
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
      const tent = new THREE.LineSegments(tg, tentMat); tent.frustumCulled = false; root.add(tent);
      this.list.push({ root, bell, mat: m, tent, tp, nT, seg, ph: R() * 6, base: new THREE.Vector3(-0.6 + i * 0.75 + R() * 0.2, -0.45 - R() * 0.15, (R() - 0.5) * 0.4), pulse: 0 });
    }
  }
  poke(j) { j.pulse = 1; }
  update(dt, time) {
    for (const j of this.list) {
      j.pulse = Math.max(0, j.pulse - dt * 0.8);
      const beat = Math.max(0, Math.sin(time * 1.6 + j.ph)) ** 2 + j.pulse;
      const y = j.base.y + Math.sin(time * 0.3 + j.ph) * 0.05 + (time * 0.01 + j.pulse * 0.05) % 0.0;
      j.root.position.set(j.base.x + Math.sin(time * 0.11 + j.ph) * 0.15, y, j.base.z + Math.cos(time * 0.13 + j.ph) * 0.1);
      j.bell.scale.set(1 + beat * 0.12, 1 - beat * 0.15, 1 + beat * 0.12);
      j.mat.uniforms.uPulse.value = j.pulse;
      const p = j.tp; let k = 0;
      for (let t = 0; t < j.nT; t++) {
        const a = t / j.nT * Math.PI * 2; const r0 = 0.022;
        let px = Math.cos(a) * r0, pz = Math.sin(a) * r0, py = -0.002;
        for (let s = 0; s < j.seg; s++) {
          const L = 0.012;
          const nx = px + Math.sin(time * 1.3 + s * 0.6 + t + j.ph) * 0.003, nz = pz + Math.cos(time * 1.1 + s * 0.5 + t) * 0.003, ny = py - L;
          p[k++] = px; p[k++] = py; p[k++] = pz; p[k++] = nx; p[k++] = ny; p[k++] = nz;
          px = nx * 0.97; py = ny; pz = nz * 0.97;
        }
      }
      j.tent.geometry.attributes.position.needsUpdate = true;
    }
  }
}
