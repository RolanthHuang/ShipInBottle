import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addCaustics, smooth, clamp, patchMaterial, U } from './common.js';
import { toTex, sternCanvas, bowNameCanvas, trailboardCanvas, flagCanvas, gratingCanvas, softSprite } from './textures.js';
import { rep } from './assets.js';

// Ship local: +x bow, y up (waterline y=0), +z port, -z starboard
const X0 = -0.58, LEN = 1.25, BULW = 0.022;
const halfBeam = (u) => 0.135 * Math.pow(Math.max(0, Math.sin(Math.PI * (0.1 + 0.9 * u))), 0.5);
const sheer = (u) => 0.075 + 0.18 * (u - 0.42) * (u - 0.42) + 0.03 * smooth(0.85, 1, u);
const keelY = (u) => -0.085 + 0.08 * Math.pow(smooth(0.8, 1.0, u), 1.4) + 0.03 * smooth(0.12, 0.0, u);
export const shipDims = { X0, LEN, halfBeam, sheer, keelY, BULW };

function section(u, v) {
  const hb = halfBeam(u), top = sheer(u) + BULW, kl = keelY(u);
  const ex = 0.42 + 0.9 * smooth(0.55, 1, u) + 0.5 * smooth(0.3, 0, u);
  const y = kl + (top - kl) * v;
  let z = hb * Math.pow(Math.sin(v * Math.PI / 2), ex);
  z *= 1 - 0.06 * smooth(0.82, 1, v);
  const x = X0 + u * LEN + 0.075 * v * smooth(0.78, 1, u) - 0.045 * v * smooth(0.12, 0, u);
  return [x, y, z];
}
function vAtY(u, y) { const top = sheer(u) + BULW, kl = keelY(u); return clamp((y - kl) / (top - kl), 0, 1); }
const uAt = (x) => clamp((x - X0) / LEN, 0, 1);
const deckY = (x) => sheer(uAt(x)) - 0.003;
const railY = (x) => sheer(uAt(x)) + BULW;
function halfWidthAt(x, y) { const u = uAt(x); return section(u, vAtY(u, y))[2]; }

export function hullGeometry(scale = 1) {
  const nu = 90, nv = 24;
  const pos = [], uv = [], idx = [];
  const cols = 2 * nv + 1;
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    for (let j = 0; j < cols; j++) {
      const s = (j - nv) / nv; const v = Math.abs(s); const side = Math.sign(s) || 1;
      const [x, y, z] = section(u, v);
      pos.push(x * scale, y * scale, side * z * scale);
      uv.push(u, (y + 0.1) / 0.29);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = (i + 1) * cols + j, c = a + 1, d = b + 1;
    idx.push(a, b, c, c, b, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// strip on the hull surface (for decals): returns geometry following the outer hull, offset outward
function hullStrip(u0, u1, v0, v1, side, off = 0.0015, nu = 24, nv = 6, flipU = false) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const u = u0 + (u1 - u0) * i / nu, v = v0 + (v1 - v0) * j / nv;
    const [x, y, z] = section(u, v);
    const [x2, y2, z2] = section(Math.min(1, u + 0.002), v);
    const [x3, y3, z3] = section(u, Math.min(1, v + 0.01));
    const t1 = new THREE.Vector3(x2 - x, y2 - y, (z2 - z) * side), t2 = new THREE.Vector3(x3 - x, y3 - y, (z3 - z) * side);
    const n = new THREE.Vector3().crossVectors(t1, t2).normalize(); if (n.z * side < 0) n.negate();
    pos.push(x + n.x * off, y + n.y * off, z * side + n.z * off);
    uv.push(flipU ? 1 - i / nu : i / nu, j / nv);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function transomGeometry() {
  const nv = 24; const u = 0; const pts = [];
  for (let j = 0; j <= 2 * nv; j++) { const s = (j - nv) / nv; const v = Math.abs(s); const side = Math.sign(s) || 1; const [x, y, z] = section(u, v); pts.push(new THREE.Vector3(x, y, side * z)); }
  const kl = keelY(0), top = sheer(0) + BULW, hb = halfBeam(0);
  const pos = [], uv = [], idx = [];
  const cy = (kl + top) / 2;
  pos.push(X0 - 0.024, cy, 0); uv.push(0.5, (cy - kl) / (top - kl));
  pts.forEach(p => { pos.push(p.x, p.y, p.z); uv.push(0.5 - p.z / (2 * hb * 0.94), (p.y - kl) / (top - kl)); });
  for (let j = 1; j < pts.length; j++) idx.push(0, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

function deckGeometry() {
  const nu = 60, nz = 10; const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const u = 0.012 + i / nu * 0.975;
    const y = sheer(u) - 0.003;
    const [x0] = section(u, vAtY(u, y));
    const hw = halfWidthAt(x0, y) - 0.005;
    for (let j = 0; j <= nz; j++) { const s = j / nz * 2 - 1; pos.push(x0, y + 0.004 * (1 - s * s), s * hw); uv.push(x0 * 3.2, s * hw * 3.2); }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nz; j++) { const a = i * (nz + 1) + j, b = a + nz + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

function bulwarkInnerGeometry() {
  const nu = 70; const pos = [], uv = [], idx = [];
  const sides = [1, -1];
  for (const side of sides) {
    const base = pos.length / 3;
    for (let i = 0; i <= nu; i++) {
      const u = 0.012 + i / nu * 0.975;
      const yd = sheer(u) - 0.003, yr = sheer(u) + BULW;
      for (const [y, vv] of [[yd, 0], [yr, 1]]) {
        const v = vAtY(u, y);
        const [x, , z] = section(u, v);
        pos.push(x, y, side * (z - 0.006)); uv.push(u * 8, vv);
      }
    }
    for (let i = 0; i < nu; i++) { const a = base + i * 2, b = a + 2; if (side > 0) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

// ---------- sails ----------
class Sail {
  constructor(c00, c10, c01, c11, mat, belly, bellyDir, nx = 16, ny = 16, tri = false) {
    this.c = [c00, c10, c01, c11].map(v => v.clone());
    this.belly = belly; this.bellyDir = bellyDir.clone(); this.nx = nx; this.ny = ny; this.tri = tri;
    this.geo = new THREE.PlaneGeometry(1, 1, nx, ny);
    this.mesh = new THREE.Mesh(this.geo, mat); this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.luff = 0; this.reef = 0; this.update(0, 1);
  }
  update(t, wind) {
    const p = this.geo.attributes.position; const [a, b, c, d] = this.c;
    const tmp = new THREE.Vector3();
    const reef = this.reef;
    for (let j = 0; j <= this.ny; j++) for (let i = 0; i <= this.nx; i++) {
      const s = i / this.nx; let v = j / this.ny;
      const vv = reef > 0 ? reef * 0.32 + v * (1 - reef * 0.32) : v;
      tmp.copy(a).multiplyScalar((1 - s) * (1 - vv)).addScaledVector(b, s * (1 - vv)).addScaledVector(c, (1 - s) * vv).addScaledVector(d, s * vv);
      const shape = Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.04)), 0.85) * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * vv)), 0.7);
      const breathe = 1 + 0.07 * Math.sin(t * 1.9 + s * 2.5 + vv * 1.7) + 0.04 * Math.sin(t * 3.7 + vv * 5);
      const bel = this.belly * (0.35 + 0.65 * wind) * shape * breathe * (1 - this.luff * 0.85);
      const flut = this.luff * 0.012 * Math.sin(t * 28 + vv * 14 + s * 6) * Math.pow(s, 1.5);
      tmp.addScaledVector(this.bellyDir, bel + flut);
      p.setXYZ(j * (this.nx + 1) + i, tmp.x, tmp.y, tmp.z);
    }
    p.needsUpdate = true; this.geo.computeVertexNormals(); this.geo.computeBoundingSphere();
  }
}

class Flag {
  constructor(len, h, mat, segs = 16, pennant = false) {
    this.len = len; this.h = h; this.pennant = pennant;
    this.geo = new THREE.PlaneGeometry(len, h, segs, 3); this.geo.translate(len / 2, 0, 0);
    this.base = this.geo.attributes.position.array.slice();
    this.mesh = new THREE.Mesh(this.geo, mat); this.mesh.castShadow = true;
  }
  update(t, wind) {
    const p = this.geo.attributes.position; const b = this.base;
    for (let i = 0; i < p.count; i++) {
      const x = b[i * 3], y = b[i * 3 + 1]; const u = x / this.len;
      const yy = this.pennant ? y * (1 - u * 0.92) : y;
      const w = Math.sin(t * (7 + wind * 5) - u * 9) * 0.03 * u * this.len * 3 * (0.5 + wind);
      p.setXYZ(i, x * (0.96 + 0.04 * Math.cos(t * 6 - u * 7)), yy - u * this.len * 0.25 * (1 - wind), w);
    }
    p.needsUpdate = true; this.geo.computeVertexNormals();
  }
}

// ---------- rigging (tubes merged) ----------
class Rig {
  constructor() { this.geos = { stand: [], run: [], rat: [] }; }
  line(kind, a, b, r, sag = 0) {
    let curve;
    if (sag) { const m = a.clone().lerp(b, 0.5); m.y -= sag; curve = new THREE.QuadraticBezierCurve3(a, m, b); }
    else curve = new THREE.LineCurve3(a, b);
    const seg = sag ? 8 : 1;
    this.geos[kind].push(new THREE.TubeGeometry(curve, seg, r, kind === 'rat' ? 3 : 5, false));
  }
  build(mats) {
    const out = [];
    for (const k of Object.keys(this.geos)) {
      if (!this.geos[k].length) continue;
      const g = mergeGeometries(this.geos[k].map(x => { x.deleteAttribute('uv'); return x; }));
      const m = new THREE.Mesh(g, mats[k]); m.castShadow = true; out.push(m);
    }
    return out;
  }
}

export function person({ coat = 0x1d2333, skin = 0xd9a87e, hat = 'cap', stripes = false, scale = 1 } = {}) {
  const p = new THREE.Group();
  const coatM = new THREE.MeshStandardMaterial({ color: coat, roughness: 0.8 });
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x16120f, roughness: 0.6 });
  const legM = new THREE.MeshStandardMaterial({ color: stripes ? 0xd8d0c0 : 0x2a2420, roughness: 0.8 });
  [-1, 1].forEach(s => { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.0038, 0.016, 3, 6), legM); l.position.set(0, 0.011, s * 0.0045); p.add(l); });
  const bodyGeo = new THREE.CapsuleGeometry(0.0085, 0.019, 4, 10);
  let bodyMat = coatM;
  if (stripes) {
    const c = document.createElement('canvas'); c.width = 8; c.height = 64; const x = c.getContext('2d');
    for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#1c2a4a' : '#e8e2d4'; x.fillRect(0, i * 4, 8, 4); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    bodyMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  }
  const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.y = 0.036; p.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 14, 10), skinM); head.position.y = 0.06; p.add(head);
  const hatG = new THREE.Group(); hatG.position.y = 0.066; p.add(hatG);
  if (hat === 'captain') {
    hatG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.0018, 16), dark));
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0076, 0.0075, 16), dark); crown.position.y = 0.0038; hatG.add(crown);
    const badge = new THREE.Mesh(new THREE.SphereGeometry(0.0015, 6, 4), new THREE.MeshStandardMaterial({ color: 0xd9b25c, metalness: 1, roughness: 0.3 })); badge.position.set(0.0072, 0.003, 0); hatG.add(badge);
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0078, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: stripes ? 0x8a1c16 : 0x22263a, roughness: 0.8 })); hatG.add(cap);
  }
  const armR = new THREE.Group(); armR.position.set(0, 0.047, -0.0105); p.add(armR);
  const am = new THREE.Mesh(new THREE.CapsuleGeometry(0.0028, 0.016, 3, 6), bodyMat === coatM ? coatM : bodyMat); am.position.y = -0.01; armR.add(am);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 8, 6), skinM); hand.position.y = -0.02; armR.add(hand);
  const armL = new THREE.Group(); armL.position.set(0, 0.047, 0.0105); p.add(armL);
  const am2 = am.clone(); armL.add(am2); const hand2 = hand.clone(); armL.add(hand2);
  p.scale.setScalar(scale);
  p.traverse(o => { if (o.isMesh) o.castShadow = true; });
  p.userData = { hat: hatG, armR, armL, head };
  return p;
}

export function makeCat() {
  const c = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xc87a3a, roughness: 0.9 });
  const furD = new THREE.MeshStandardMaterial({ color: 0x8a4a20, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.01, 14, 10), fur); body.scale.set(1.5, 0.85, 0.8); body.position.y = 0.009; c.add(body);
  const headG = new THREE.Group(); headG.position.set(0.013, 0.017, 0); c.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 14, 10), fur); headG.add(head);
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.ConeGeometry(0.0024, 0.005, 4), furD); e.position.set(0.0005, 0.006, s * 0.0034); e.rotation.x = s * 0.25; headG.add(e); });
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x9adf6a, emissive: 0x30a020, emissiveIntensity: 0.6 });
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 6, 4), eyeM); e.position.set(0.0055, 0.0012, s * 0.0024); headG.add(e); });
  const tailG = new THREE.Group(); tailG.position.set(-0.014, 0.008, 0); c.add(tailG);
  const tailCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.008, 0.004, 0.004), new THREE.Vector3(-0.012, 0.014, 0.006), new THREE.Vector3(-0.009, 0.022, 0.004)]);
  tailG.add(new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 12, 0.0018, 6), fur));
  [[0.008, 1], [0.008, -1], [-0.008, 1], [-0.008, -1]].forEach(([x, s]) => { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.0018, 0.006, 3, 5), fur); l.position.set(x, 0.003, s * 0.0045); c.add(l); });
  c.traverse(o => { if (o.isMesh) o.castShadow = true; });
  c.userData = { headG, tailG, body };
  return c;
}

function makeFigurehead() {
  const g = new THREE.Group();
  const blue = new THREE.MeshPhysicalMaterial({ color: 0x14708a, roughness: 0.35, clearcoat: 0.6, metalness: 0.1 });
  const orange = new THREE.MeshPhysicalMaterial({ color: 0xd2742a, roughness: 0.4, clearcoat: 0.6 });
  const gilt = new THREE.MeshStandardMaterial({ color: 0xd9b25c, metalness: 1, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.02, 20, 14), orange); body.scale.set(1.6, 0.9, 0.85); g.add(body);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.0205, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), blue); back.scale.set(1.62, 0.92, 0.87); g.add(back);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 18, 12), blue); head.position.set(0.03, 0.01, 0); g.add(head);
  const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.0118, 16, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), orange); cheek.position.copy(head.position); g.add(cheek);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.0038, 0.03, 10), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.4 })); beak.rotation.z = -Math.PI / 2 - 0.12; beak.position.set(0.054, 0.007, 0); g.add(beak);
  [-1, 1].forEach(s => {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 10), blue); w.scale.set(1.5, 0.45, 0.22); w.position.set(-0.008, 0.006, s * 0.016); w.rotation.set(s * 0.25, 0, 0.12); g.add(w);
    const wg = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0012, 6, 20, Math.PI), gilt); wg.position.copy(w.position); wg.scale.set(1.5, 0.5, 1); wg.rotation.set(Math.PI / 2 + s * 0.25, 0, 0.12); g.add(wg);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2 })); e.position.set(0.039, 0.013, s * 0.0085); g.add(e);
  });
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 8), blue); tail.rotation.z = Math.PI / 2 + 0.25; tail.position.set(-0.04, -0.004, 0); tail.scale.set(1, 1, 0.4); g.add(tail);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function sailTranslucency(mat) {
  return patchMaterial(mat, 'sailtl', (sh) => {
    sh.uniforms.uLampV = U.lampV || (U.lampV = { value: new THREE.Vector3() });
    sh.uniforms.uLampColT = U.lampCol;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uLampV; uniform vec3 uLampColT;')
      .replace('#include <opaque_fragment>', `
        { vec3 Lv = normalize(uLampV + vViewPosition); float back = max(0., -dot(normal, Lv));
          outgoingLight += diffuseColor.rgb * uLampColT * back * 0.22; }
        #include <opaque_fragment>`);
  });
}

export function makeShip(tex) {
  const ship = new THREE.Group(); ship.name = 'ship';
  const ud = {};
  // ---- hull
  const hullMat = addCaustics(new THREE.MeshStandardMaterial({ map: tex.hull, normalMap: tex.hull_n, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: tex.hull_orm, metalnessMap: tex.hull_orm, aoMap: tex.hull_orm, roughness: 1, metalness: 1 }), 0.8);
  [tex.hull, tex.hull_n, tex.hull_orm].forEach(t => { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; });
  const hull = new THREE.Mesh(hullGeometry(), hullMat); hull.castShadow = true; hull.receiveShadow = true; ship.add(hull);
  ud.hullMat = hullMat;
  const st = sternCanvas();
  const sternMat = new THREE.MeshStandardMaterial({ map: toTex(st.col, { wrap: false }), emissiveMap: toTex(st.glow, { wrap: false }), emissive: 0xffa040, emissiveIntensity: 1.5, roughness: 0.6, side: THREE.DoubleSide });
  const transom = new THREE.Mesh(transomGeometry(), sternMat); ship.add(transom);
  ud.sternMat = sternMat;
  const deckMat = new THREE.MeshStandardMaterial({ map: rep(tex.deck, 1, 1), normalMap: rep(tex.deck_n, 1, 1), roughness: 0.78 });
  const deck = new THREE.Mesh(deckGeometry(), deckMat); deck.receiveShadow = true; ship.add(deck);
  const buffPaint = new THREE.MeshStandardMaterial({ color: 0xcdbb94, roughness: 0.7, side: THREE.DoubleSide });
  const bulw = new THREE.Mesh(bulwarkInnerGeometry(), buffPaint); bulw.receiveShadow = true; ship.add(bulw);
  const varnish = new THREE.MeshStandardMaterial({ map: rep(tex.stand, 4, 0.2), color: 0xd0a080, roughness: 0.38 });
  const wood = new THREE.MeshStandardMaterial({ map: rep(tex.deck, 2, 2), color: 0x9a7a50, roughness: 0.6 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3a2617, roughness: 0.6 });
  const tar = new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 0.55 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd2a650, roughness: 0.3, metalness: 1, roughnessMap: tex.brass_orm });
  const iron = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.5, metalness: 0.7 });
  const goldPaint = new THREE.MeshStandardMaterial({ color: 0xd9b25c, metalness: 0.9, roughness: 0.32 });
  // rail cap (both sides)
  [1, -1].forEach(side => {
    const pts = []; for (let i = 0; i <= 60; i++) { const u = 0.0 + i / 60 * 0.995; const y = sheer(u) + BULW + 0.002; const [x, , z] = section(u, 1); pts.push(new THREE.Vector3(x, y, side * (z - 0.003))); }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.0045, 6), varnish); m.scale.y = 1; m.castShadow = true; ship.add(m);
  });
  // stern rail
  { const [x, y, z] = section(0, 1); const pts = [new THREE.Vector3(x, y + 0.002, z - 0.003), new THREE.Vector3(x - 0.008, y + 0.004, 0), new THREE.Vector3(x, y + 0.002, -z + 0.003)]; ship.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.0045, 6), varnish)); }
  // keel + stem
  const kpts = []; for (let i = 0; i <= 40; i++) { const u = i / 40; kpts.push(new THREE.Vector3(X0 + u * LEN, keelY(u) - 0.003, 0)); }
  for (let i = 1; i <= 12; i++) { const v = i / 12; const [x, y] = section(1, v); kpts.push(new THREE.Vector3(x + 0.006, y, 0)); }
  const keel = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(kpts), 120, 0.0055, 6), tar); keel.scale.z = 0.7; keel.castShadow = true; ship.add(keel);
  // rudder
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.006), addCaustics(new THREE.MeshStandardMaterial({ map: tex.hull, color: 0xffffff, roughness: 0.6, metalness: 0.5 }), 0.8));
  rudder.position.set(X0 - 0.038, -0.035, 0); rudder.rotation.z = 0.12; ship.add(rudder); ud.rudder = rudder;
  // decals: bow names, trailboards
  const nameTex = toTex(bowNameCanvas(), { wrap: false });
  const nameMat = new THREE.MeshStandardMaterial({ map: nameTex, transparent: true, alphaTest: 0.2, metalness: 0.7, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
  [1, -1].forEach(side => { const m = new THREE.Mesh(hullStrip(0.78, 0.9, 0.86, 0.985, side, 0.0012, 16, 4, side < 0), nameMat); ship.add(m); });
  const tbTex = toTex(trailboardCanvas(), { wrap: false });
  const tbMat = new THREE.MeshStandardMaterial({ map: tbTex, metalness: 0.4, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2 });
  [1, -1].forEach(side => { ship.add(new THREE.Mesh(hullStrip(0.91, 0.995, 0.74, 0.86, side, 0.0015, 16, 3, side < 0), tbMat)); });
  // figurehead
  const fig = makeFigurehead(); const [fx, fy] = section(1, 0.9); fig.position.set(fx + 0.03, fy - 0.004, 0); fig.rotation.z = 0.1; fig.scale.setScalar(0.85); ship.add(fig); ud.figurehead = fig;

  const box = (sx, sy, sz, x, y, z, mat, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; ship.add(m); return m; };
  const cyl = (r0, r1, a, b, mat, seg = 12) => {
    const dir = new THREE.Vector3().subVectors(b, a); const L = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, L, seg), mat);
    m.position.copy(a).addScaledVector(dir, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true; ship.add(m); return m;
  };

  // ---- deck furniture
  const gratTex = toTex(gratingCanvas(), { rep: [1, 1] });
  const grating = new THREE.MeshStandardMaterial({ map: gratTex, roughness: 0.7 });
  const hatch = (x, w, d) => { box(w, 0.014, d, x, deckY(x) + 0.007, 0, varnish); const gr = box(w - 0.008, 0.002, d - 0.008, x, deckY(x) + 0.0145, 0, grating); return gr; };
  hatch(0.02, 0.12, 0.085); hatch(0.37, 0.06, 0.055);
  // aft cabin trunk with skylight
  const trunk = box(0.17, 0.035, 0.11, -0.32, deckY(-0.32) + 0.0175, 0, varnish);
  box(0.175, 0.004, 0.115, -0.32, deckY(-0.32) + 0.036, 0, buffPaint);
  const skyMat = new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xffa040, emissiveIntensity: 1.2, roughness: 0.15 });
  const skylight = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 3, 1), skyMat); skylight.rotation.z = Math.PI / 2; skylight.rotation.x = Math.PI / 6; skylight.position.set(-0.3, deckY(-0.32) + 0.045, 0); ship.add(skylight);
  for (let i = 0; i < 4; i++) { const b = box(0.002, 0.004, 0.03, -0.33 + i * 0.016, deckY(-0.32) + 0.052, 0, brass); }
  // portholes on the trunk sides
  [1, -1].forEach(s => { for (let i = 0; i < 3; i++) { const ph = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 12), skyMat); ph.position.set(-0.37 + i * 0.05, deckY(-0.32) + 0.018, s * 0.0556); ph.rotation.y = s > 0 ? 0 : Math.PI; ship.add(ph); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.0058, 0.0012, 6, 16), brass); rim.position.copy(ph.position); rim.rotation.y = ph.rotation.y; ship.add(rim); } });
  // companionway hood
  box(0.04, 0.03, 0.05, -0.43, deckY(-0.43) + 0.015, 0, varnish);
  // galley stove pipe
  const pipeTop = new THREE.Vector3(0.14, deckY(0.14) + 0.055, 0.03);
  cyl(0.004, 0.004, new THREE.Vector3(0.14, deckY(0.14), 0.03), pipeTop, iron, 8);
  const capP = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.006, 8), iron); capP.position.copy(pipeTop).add(new THREE.Vector3(0, 0.004, 0)); ship.add(capP);
  ud.smokeSource = pipeTop.clone().add(new THREE.Vector3(0, 0.006, 0));
  // windlass + bitts
  const wx = 0.5;
  [-1, 1].forEach(s => box(0.012, 0.03, 0.012, wx, deckY(wx) + 0.015, s * 0.045, darkWood));
  const wl = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.085, 10), darkWood); wl.rotation.x = Math.PI / 2; wl.position.set(wx, deckY(wx) + 0.016, 0); wl.castShadow = true; ship.add(wl);
  [-0.025, 0.025].forEach(z => { const c = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.002, 6, 16), iron); c.position.set(wx, deckY(wx) + 0.016, z); ship.add(c); });
  // belfry + bell
  const bx = 0.45;
  [-1, 1].forEach(s => cyl(0.0025, 0.0025, new THREE.Vector3(bx, deckY(bx), s * 0.018), new THREE.Vector3(bx, deckY(bx) + 0.06, s * 0.018), darkWood, 6));
  box(0.008, 0.005, 0.044, bx, deckY(bx) + 0.062, 0, darkWood);
  const bellG = new THREE.Group(); bellG.position.set(bx, deckY(bx) + 0.06, 0); ship.add(bellG);
  const bellPts = [[0, 0.0], [0.004, -0.001], [0.006, -0.006], [0.0075, -0.012], [0.009, -0.018], [0.0105, -0.021], [0.0102, -0.023]].map(([r, y]) => new THREE.Vector2(r, y));
  const bell = new THREE.Mesh(new THREE.LatheGeometry(bellPts, 20), new THREE.MeshStandardMaterial({ color: 0xd4a94e, metalness: 1, roughness: 0.22, side: THREE.DoubleSide })); bellG.add(bell); bell.castShadow = true;
  ud.bell = bellG;
  // wheel + binnacle
  const whx = -0.5;
  cyl(0.006, 0.006, new THREE.Vector3(whx, deckY(whx), 0), new THREE.Vector3(whx, deckY(whx) + 0.046, 0), darkWood);
  const wheel = new THREE.Group(); wheel.position.set(whx + 0.012, deckY(whx) + 0.05, 0); wheel.rotation.y = Math.PI / 2;
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0026, 8, 32), varnish));
  for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.066, 5), varnish); sp.rotation.z = i * Math.PI / 8; wheel.add(sp); const hdl = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 6, 4), varnish); hdl.position.set(Math.cos(i * Math.PI / 4 + Math.PI / 2) * 0.033, Math.sin(i * Math.PI / 4 + Math.PI / 2) * 0.033, 0); wheel.add(hdl); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.006, 12), brass); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  ship.add(wheel); ud.wheel = wheel;
  const binX = -0.455;
  cyl(0.007, 0.009, new THREE.Vector3(binX, deckY(binX), 0), new THREE.Vector3(binX, deckY(binX) + 0.03, 0), varnish, 10);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.009, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass); dome.position.set(binX, deckY(binX) + 0.03, 0); ship.add(dome);
  // barrels, crates, coils
  const barrelM = new THREE.MeshStandardMaterial({ map: rep(tex.deck, 0.5, 1, Math.PI / 2), color: 0x9a7048, roughness: 0.7 });
  [[0.1, 0.065], [0.13, 0.08], [0.115, -0.07]].forEach(([x, z]) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.026, 14), barrelM); b.scale.set(1, 1, 1); b.position.set(x, deckY(x) + 0.013, z); b.castShadow = true; ship.add(b); [0.007, -0.007].forEach(dy => { const h = new THREE.Mesh(new THREE.TorusGeometry(0.0113, 0.0011, 4, 16), iron); h.rotation.x = Math.PI / 2; h.position.set(x, deckY(x) + 0.013 + dy, z); ship.add(h); }); });
  box(0.024, 0.018, 0.02, -0.22, deckY(-0.22) + 0.009, 0.07, wood, 0.3); box(0.02, 0.014, 0.018, -0.2, deckY(-0.2) + 0.007 + 0.018, 0.07, wood, 0.1);
  const hemp = new THREE.MeshStandardMaterial({ color: 0x9a8258, roughness: 0.95 });
  const coil = (x, z) => { const pts = []; for (let i = 0; i <= 120; i++) { const a = i / 120 * Math.PI * 2 * 4.5; const r = 0.004 + i / 120 * 0.012; pts.push(new THREE.Vector3(Math.cos(a) * r, 0.0015 + (i % 30) * 0.00004, Math.sin(a) * r)); } const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.0013, 4), hemp); m.position.set(x, deckY(x), z); m.castShadow = true; ship.add(m); };
  coil(0.2, 0.06); coil(-0.12, -0.065); coil(0.43, -0.06); coil(-0.48, 0.045);
  // lifebuoy on the stern rail
  { const lb = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0035, 8, 20), new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.7 })); const [x, y, z] = section(0.04, 1); lb.position.set(x - 0.004, y - 0.006, z * 0.6); lb.rotation.y = Math.PI / 2 - 0.4; ship.add(lb);
    for (let i = 0; i < 4; i++) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0037, 8, 4, Math.PI / 8), new THREE.MeshStandardMaterial({ color: 0xa82418, roughness: 0.7 })); band.rotation.copy(lb.rotation); band.rotateZ(i * Math.PI / 2); band.position.copy(lb.position); ship.add(band); } }
  // stern davits + boat
  [1, -1].forEach(s => { const [x, y, z] = section(0.03, 1); const pts = [new THREE.Vector3(x + 0.01, y, s * z * 0.75), new THREE.Vector3(x - 0.01, y + 0.05, s * z * 0.75), new THREE.Vector3(x - 0.06, y + 0.045, s * z * 0.75)]; ship.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0025, 6), iron)); });
  const boat = new THREE.Mesh(hullGeometry(0.11), new THREE.MeshStandardMaterial({ color: 0xe0d8c4, roughness: 0.6, side: THREE.DoubleSide }));
  boat.rotation.y = Math.PI / 2; boat.position.set(X0 - 0.075, sheer(0) + 0.015, 0); boat.castShadow = true; ship.add(boat); ud.boat = boat;
  // catheads + anchors
  const anchorGeo = (() => { const parts = []; const sh = new THREE.CylinderGeometry(0.0015, 0.0015, 0.04, 6); parts.push(sh); const arm = new THREE.TorusGeometry(0.012, 0.0015, 4, 10, Math.PI); arm.rotateZ(Math.PI); arm.translate(0, -0.012, 0); parts.push(arm); const stock = new THREE.CylinderGeometry(0.001, 0.001, 0.028, 4); stock.rotateX(Math.PI / 2); stock.translate(0, 0.018, 0); parts.push(stock); return mergeGeometries(parts.map(p => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); return q; })); })();
  [1, -1].forEach(s => { const u = 0.9; const [x, y, z] = section(u, 1); box(0.008, 0.008, 0.03, x, y - 0.006, s * (z + 0.012), darkWood); const a = new THREE.Mesh(anchorGeo, iron); a.position.set(x - 0.01, y - 0.035, s * (z + 0.004)); a.rotation.set(s * 0.2, 0.3, 0.6); a.castShadow = true; ship.add(a); });

  // ---- masts & spars
  const mastMat = new THREE.MeshStandardMaterial({ map: rep(tex.stand, 0.3, 2), color: 0xd8b080, roughness: 0.45 });
  const blackBand = tar;
  const rake = 0.07;
  const mastPt = (x0, h) => new THREE.Vector3(x0 - Math.sin(rake) * h, deckY(x0) + Math.cos(rake) * h, 0);
  const FM = 0.24, MM = -0.16;
  cyl(0.0115, 0.0085, mastPt(FM, -0.05), mastPt(FM, 0.56), mastMat);
  cyl(0.0068, 0.0035, mastPt(FM, 0.48), mastPt(FM, 0.9), mastMat);
  cyl(0.012, 0.009, mastPt(MM, -0.05), mastPt(MM, 0.6), mastMat);
  cyl(0.007, 0.0035, mastPt(MM, 0.52), mastPt(MM, 0.96), mastMat);
  // mast coats + bands
  [FM, MM].forEach(m => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.019, 0.01, 14), tar); c.position.copy(mastPt(m, 0.005)); ship.add(c); });
  [[FM, 0.5], [FM, 0.56], [MM, 0.54], [MM, 0.6]].forEach(([m, h]) => { const b = new THREE.Mesh(new THREE.TorusGeometry(0.0095, 0.0018, 6, 16), blackBand); b.rotation.x = Math.PI / 2; b.position.copy(mastPt(m, h)); ship.add(b); });
  // trestle/crosstrees
  [[FM, 0.53], [MM, 0.57]].forEach(([x, h]) => { const p = mastPt(x, h); box(0.036, 0.006, 0.009, p.x, p.y, 0, darkWood); box(0.01, 0.006, 0.085, p.x, p.y + 0.004, 0, darkWood); box(0.024, 0.008, 0.016, p.x + 0.004, p.y + 0.03, 0, tar); });
  [[FM, 0.9], [MM, 0.96]].forEach(([x, h]) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 10, 8), varnish); s.position.copy(mastPt(x, h)); ship.add(s); });
  // mast hoops
  [[FM, 0.1, 0.44], [MM, 0.12, 0.49]].forEach(([x, h0, h1]) => { for (let i = 0; i < 9; i++) { const h = h0 + (h1 - h0) * i / 8; const t = new THREE.Mesh(new THREE.TorusGeometry(0.0122, 0.0013, 5, 14), varnish); t.rotation.x = Math.PI / 2; t.rotation.y = -rake; t.position.copy(mastPt(x, h)).add(new THREE.Vector3(-0.001, 0, 0)); ship.add(t); } });
  // bowsprit & jibboom & dolphin striker
  const bsA = new THREE.Vector3(section(1, 0.95)[0] - 0.02, sheer(1) + 0.004, 0); const bsDir = new THREE.Vector3(Math.cos(0.2), Math.sin(0.2), 0);
  const bsB = bsA.clone().addScaledVector(bsDir, 0.3); const jbB = bsA.clone().addScaledVector(bsDir, 0.52);
  cyl(0.0095, 0.0065, bsA.clone().addScaledVector(bsDir, -0.14), bsB, mastMat);
  cyl(0.0052, 0.0028, bsA.clone().addScaledVector(bsDir, 0.2), jbB, mastMat);
  const capB = box(0.012, 0.016, 0.014, bsB.x, bsB.y, 0, tar); capB.rotation.z = 0.2;
  const dsTop = bsA.clone().addScaledVector(bsDir, 0.26), dsBot = dsTop.clone().add(new THREE.Vector3(0.005, -0.07, 0));
  cyl(0.0022, 0.0018, dsTop, dsBot, mastMat, 6);
  // booms & gaffs
  const mBoomA = mastPt(MM, 0.1), mBoomB = new THREE.Vector3(-0.72, mBoomA.y + 0.02, -0.07);
  cyl(0.0055, 0.004, mBoomA, mBoomB, mastMat);
  const mGaffA = mastPt(MM, 0.5); const mGaffB = new THREE.Vector3(mGaffA.x - 0.32, mGaffA.y + 0.2, -0.055);
  cyl(0.0045, 0.003, mGaffA, mGaffB, mastMat);
  const fBoomA = mastPt(FM, 0.09), fBoomB = new THREE.Vector3(-0.1, fBoomA.y + 0.015, -0.055);
  cyl(0.005, 0.0038, fBoomA, fBoomB, mastMat);
  const fGaffA = mastPt(FM, 0.45); const fGaffB = new THREE.Vector3(fGaffA.x - 0.26, fGaffA.y + 0.15, -0.045);
  cyl(0.004, 0.0028, fGaffA, fGaffB, mastMat);
  // boom crutch
  const crA = new THREE.Vector3(-0.66, deckY(-0.66), -0.02), crB = new THREE.Vector3(-0.66, deckY(-0.66) + 0.03, -0.04);
  cyl(0.0018, 0.0018, crA, crB, darkWood, 5);
  // yards
  const fYardP = mastPt(FM, 0.48), tYardP = mastPt(FM, 0.76);
  cyl(0.0045, 0.0045, fYardP.clone().add(new THREE.Vector3(0, 0, -0.27)), fYardP.clone().add(new THREE.Vector3(0, 0, 0.27)), mastMat);
  cyl(0.0038, 0.0038, tYardP.clone().add(new THREE.Vector3(0, 0, -0.2)), tYardP.clone().add(new THREE.Vector3(0, 0, 0.2)), mastMat);
  const furl = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.46, 4, 10), new THREE.MeshStandardMaterial({ map: tex.sail, color: 0xd9ccb0, roughness: 0.9 }));
  furl.rotation.x = Math.PI / 2; furl.position.copy(fYardP).add(new THREE.Vector3(0.006, -0.008, 0)); furl.castShadow = true; ship.add(furl);
  for (let i = 0; i < 7; i++) { const g2 = new THREE.Mesh(new THREE.TorusGeometry(0.0092, 0.0012, 4, 10), hemp); g2.position.copy(furl.position).add(new THREE.Vector3(0, 0, -0.21 + i * 0.07)); ship.add(g2); }

  // ---- sails
  const sailMat = sailTranslucency(new THREE.MeshStandardMaterial({ map: tex.sail, normalMap: tex.sail_n, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.9, side: THREE.DoubleSide, emissive: 0x2a2015, emissiveIntensity: 0.12 }));
  const sails = [];
  const side = new THREE.Vector3(0, 0, -1);
  sails.push(new Sail(mastPt(MM, 0.12).add(new THREE.Vector3(-0.013, 0, 0)), mBoomB.clone().add(new THREE.Vector3(0.015, 0.006, 0)), mastPt(MM, 0.49).add(new THREE.Vector3(-0.013, 0, 0)), mGaffB.clone().add(new THREE.Vector3(0.01, -0.01, 0)), sailMat, 0.06, side));
  sails.push(new Sail(mastPt(FM, 0.11).add(new THREE.Vector3(-0.013, 0, 0)), fBoomB.clone().add(new THREE.Vector3(0.012, 0.005, 0)), mastPt(FM, 0.44).add(new THREE.Vector3(-0.013, 0, 0)), fGaffB.clone().add(new THREE.Vector3(0.008, -0.008, 0)), sailMat, 0.05, side));
  sails.push(new Sail(fYardP.clone().add(new THREE.Vector3(0.008, 0.008, 0.25)), fYardP.clone().add(new THREE.Vector3(0.008, 0.008, -0.25)), tYardP.clone().add(new THREE.Vector3(0.006, -0.004, 0.185)), tYardP.clone().add(new THREE.Vector3(0.006, -0.004, -0.185)), sailMat, 0.055, new THREE.Vector3(1, 0, 0)));
  // main gaff topsail (triangle between gaff and topmast)
  sails.push(new Sail(mGaffA.clone().add(new THREE.Vector3(-0.012, 0.012, 0)), mGaffB.clone().add(new THREE.Vector3(0.02, 0.012, 0)), mastPt(MM, 0.9).add(new THREE.Vector3(-0.008, 0, 0)), mastPt(MM, 0.9).add(new THREE.Vector3(-0.009, -0.004, 0)), sailMat, 0.025, side, 12, 10));
  const foreHead1 = mastPt(FM, 0.44), foreHead2 = mastPt(FM, 0.74), foreHead3 = mastPt(FM, 0.86);
  const stem = new THREE.Vector3(section(1, 0.98)[0] - 0.01, sheer(1) + 0.012, 0);
  const jibTack = bsA.clone().addScaledVector(bsDir, 0.27), fjTack = bsA.clone().addScaledVector(bsDir, 0.48);
  const headsail = (tack, head, clew, belly) => new Sail(tack, clew, head, head.clone().add(new THREE.Vector3(-0.002, -0.004, 0)), sailMat, belly, side, 12, 12);
  const clews = [new THREE.Vector3(0.36, 0.16, -0.06), new THREE.Vector3(0.47, 0.2, -0.075), new THREE.Vector3(0.58, 0.26, -0.08)];
  sails.push(headsail(stem.clone().add(new THREE.Vector3(-0.02, 0.01, 0)), foreHead1.clone().add(new THREE.Vector3(0.01, 0, 0)), clews[0], 0.035));
  sails.push(headsail(jibTack, foreHead2.clone().add(new THREE.Vector3(0.008, 0, 0)), clews[1], 0.04));
  sails.push(headsail(fjTack, foreHead3.clone().add(new THREE.Vector3(0.006, 0, 0)), clews[2], 0.035));
  sails.forEach(s => ship.add(s.mesh));

  // ---- channels, deadeyes and rigging
  const rig = new Rig();
  const chain = (x, s) => { const u = uAt(x); const [xx, , z] = section(u, vAtY(u, sheer(u))); return new THREE.Vector3(xx, sheer(u) - 0.004, s * (z + 0.016)); };
  const deadM = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.6 });
  const deadGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.0028, 10);
  [[FM, 0.53], [MM, 0.57]].forEach(([mx, hh]) => {
    const top = mastPt(mx, hh - 0.02);
    [1, -1].forEach(s => {
      const u = uAt(mx); const [cx, , cz] = section(u, vAtY(u, sheer(u)));
      box(0.17, 0.004, 0.02, cx - 0.025, sheer(u) - 0.008, s * (cz + 0.008), darkWood);
      const xs = [mx + 0.05, mx + 0.015, mx - 0.02, mx - 0.055];
      xs.forEach(x => {
        const p = chain(x, s);
        const de = new THREE.Mesh(deadGeo, deadM); de.position.copy(p).add(new THREE.Vector3(0, 0.01, 0));
        de.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(p).normalize()); ship.add(de);
        const lowDe = de.position.clone();
        rig.line('stand', lowDe, top, 0.0016);
        const plate = cyl(0.0012, 0.0012, p.clone().add(new THREE.Vector3(0, 0.008, 0)), p.clone().add(new THREE.Vector3(0, -0.035, s * -0.004)), iron, 4);
      });
      // ratlines
      const d0 = chain(xs[0], s).add(new THREE.Vector3(0, 0.01, 0)), d3 = chain(xs[3], s).add(new THREE.Vector3(0, 0.01, 0));
      for (let k = 1; k < 14; k++) { const f = k / 15; rig.line('rat', d0.clone().lerp(top, f), d3.clone().lerp(top, f), 0.0007); }
      // topmast shrouds to crosstree ends
      const ct = mastPt(mx, hh).add(new THREE.Vector3(0, 0.004, s * 0.042));
      rig.line('stand', mastPt(mx, hh + 0.3), ct, 0.0011);
      rig.line('stand', ct, top.clone().add(new THREE.Vector3(0, -0.05, s * 0.01)), 0.0009);
      // backstays
      rig.line('stand', mastPt(mx, hh + 0.36), chain(mx - 0.22, s).add(new THREE.Vector3(0, 0.005, 0)), 0.0012);
    });
  });
  // stays
  rig.line('stand', mastPt(FM, 0.53), stem, 0.0019);
  rig.line('stand', mastPt(FM, 0.76), jibTack, 0.0015);
  rig.line('stand', mastPt(FM, 0.88), fjTack, 0.0013);
  rig.line('stand', mastPt(MM, 0.57), mastPt(FM, 0.53), 0.0017);
  rig.line('stand', mastPt(MM, 0.93), mastPt(FM, 0.86), 0.0012);
  rig.line('stand', bsB, new THREE.Vector3(section(1, 0.1)[0] + 0.005, 0.0, 0), 0.0017);
  rig.line('stand', jbB, dsBot, 0.0012); rig.line('stand', dsBot, chain(0.55, 1).add(new THREE.Vector3(0.03, 0, -0.01)), 0.001); rig.line('stand', dsBot, chain(0.55, -1).add(new THREE.Vector3(0.03, 0, 0.01)), 0.001);
  // running rigging
  rig.line('run', mGaffB, mastPt(MM, 0.92), 0.0009, 0.01); rig.line('run', mGaffA.clone().lerp(mGaffB, 0.5), mastPt(MM, 0.58), 0.0009, 0.006);
  rig.line('run', fGaffB, mastPt(FM, 0.84), 0.0009, 0.01); rig.line('run', fGaffA.clone().lerp(fGaffB, 0.5), mastPt(FM, 0.54), 0.0009, 0.006);
  rig.line('run', mBoomB, mastPt(MM, 0.55), 0.0008, 0.02);
  rig.line('run', mBoomB, new THREE.Vector3(-0.56, deckY(-0.56) + 0.004, -0.04), 0.001, 0.015);
  rig.line('run', fBoomB, chain(-0.06, -1), 0.0009, 0.01);
  clews.forEach((c, i) => rig.line('run', c, chain([0.3, 0.38, 0.44][i], -1).add(new THREE.Vector3(0, 0.02, 0)), 0.0009, 0.012));
  [[fYardP, 0.27], [tYardP, 0.2]].forEach(([p, w]) => {
    [1, -1].forEach(s => {
      const end = p.clone().add(new THREE.Vector3(0, 0, w * s));
      rig.line('run', end, mastPt(MM, 0.52).add(new THREE.Vector3(0, 0, s * 0.01)), 0.0008, 0.015);
      rig.line('run', end, mastPt(FM, w > 0.25 ? 0.62 : 0.86), 0.0007);
      // footropes
      rig.line('run', p.clone().add(new THREE.Vector3(0.004, -0.004, s * 0.01)), end.clone().add(new THREE.Vector3(0.004, -0.004, 0)), 0.0007, 0.018);
    });
  });
  const rigMeshes = rig.build({
    stand: new THREE.MeshStandardMaterial({ color: 0x1b140e, roughness: 0.65 }),
    run: new THREE.MeshStandardMaterial({ color: 0x8a7550, roughness: 0.85 }),
    rat: new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.8 }),
  });
  rigMeshes.forEach(m => ship.add(m));
  // blocks
  const blockGeo = new THREE.SphereGeometry(0.003, 8, 6); blockGeo.scale(1, 1.5, 0.8);
  [mGaffB, fGaffB, mBoomB, fBoomB, ...clews, mastPt(MM, 0.92), mastPt(FM, 0.84)].forEach(p => { const b = new THREE.Mesh(blockGeo, darkWood); b.position.copy(p); ship.add(b); });

  // ---- flags
  const pennant = new Flag(0.2, 0.022, new THREE.MeshStandardMaterial({ color: 0x8c1c14, side: THREE.DoubleSide, roughness: 0.8 }), 20, true);
  pennant.mesh.position.copy(mastPt(MM, 0.965)); pennant.mesh.rotation.y = Math.PI; ship.add(pennant.mesh);
  const ensign = new Flag(0.075, 0.048, new THREE.MeshStandardMaterial({ map: toTex(flagCanvas('ensign'), { wrap: false }), side: THREE.DoubleSide, roughness: 0.8 }), 12, false);
  ensign.mesh.position.copy(mGaffB); ensign.mesh.rotation.y = Math.PI; ship.add(ensign.mesh);
  const house = new Flag(0.06, 0.038, new THREE.MeshStandardMaterial({ map: toTex(flagCanvas('house'), { wrap: false }), side: THREE.DoubleSide, roughness: 0.8 }), 10, false);
  house.mesh.position.copy(mastPt(FM, 0.905)); house.mesh.rotation.y = Math.PI; ship.add(house.mesh);

  // ---- lights: stern lantern, running lights, masthead
  const glowTex = softSprite(64);
  const mkLantern = (pos, color, size = 0.011) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 6 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), mat); m.position.copy(pos); ship.add(m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
    glow.scale.setScalar(size * 9); glow.position.copy(pos); ship.add(glow);
    return { mat, glow, mesh: m };
  };
  const sternL = mkLantern(new THREE.Vector3(X0 - 0.05, sheer(0) + BULW + 0.06, 0), 0xffaa44);
  cyl(0.0018, 0.0018, new THREE.Vector3(X0 - 0.01, sheer(0) + BULW, 0), new THREE.Vector3(X0 - 0.05, sheer(0) + BULW + 0.05, 0), iron, 5);
  const portL = mkLantern(chain(FM + 0.03, 1).add(new THREE.Vector3(0, 0.07, 0.006)), 0xff2a1a, 0.006);
  const stbdL = mkLantern(chain(FM + 0.03, -1).add(new THREE.Vector3(0, 0.07, -0.006)), 0x20ff70, 0.006);

  // ---- crew & cat
  const captain = person({ hat: 'captain' }); captain.position.set(-0.52, deckY(-0.52), 0.032); captain.rotation.y = -0.2; ship.add(captain);
  captain.userData.armR.rotation.z = 0.9; captain.userData.armL.rotation.z = 0.9;
  const lookout = person({ coat: 0x3a3428, stripes: true, scale: 0.95 }); const lp = mastPt(FM, 0.535); lookout.position.set(lp.x + 0.006, lp.y + 0.005, 0.022); lookout.rotation.y = 0.1; ship.add(lookout);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.002, 0.016, 6), brass); glass.position.set(0, -0.02, 0); lookout.userData.armR.add(glass);
  lookout.userData.armR.rotation.z = 0.4;
  const sailor = person({ coat: 0x2a2a30, stripes: true }); sailor.position.set(0.54, deckY(0.54), -0.03); sailor.rotation.y = 2.2; ship.add(sailor);
  const cat = makeCat(); cat.position.set(-0.31, deckY(-0.32) + 0.038, 0.025); cat.rotation.y = 0.8; ship.add(cat);

  ship.traverse(o => { if (o.isMesh && o.castShadow === false && !o.material.transparent) { o.castShadow = true; } });
  Object.assign(ud, {
    sails, flags: [pennant, ensign, house], captain, lookout, sailor, cat, skyMat, lanterns: [sternL, portL, stbdL],
    mastTop: mastPt(MM, 0.96), foreTop: mastPt(FM, 0.53),
  });
  ship.userData = ud;
  return ship;
}

export function makeRowboat(tex) {
  const g = new THREE.Group();
  const hm = new THREE.MeshStandardMaterial({ map: tex ? rep(tex.deck, 1, 1) : null, color: 0x6f8f96, roughness: 0.7, side: THREE.DoubleSide });
  const hull = new THREE.Mesh(hullGeometry(0.15), hm); hull.castShadow = true; g.add(hull);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.002, 0.03), new THREE.MeshStandardMaterial({ color: 0x8a6a45 }));
  seat.position.set(0, 0.012, 0); g.add(seat);
  const oarM = new THREE.MeshStandardMaterial({ color: 0xa07a50 });
  [-1, 1].forEach(s => { const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.12, 4), oarM); oar.rotation.z = Math.PI / 2; oar.rotation.y = 0.25 * s; oar.position.set(0.0, 0.016, s * 0.012); g.add(oar); });
  return g;
}
