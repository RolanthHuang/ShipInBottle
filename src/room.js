import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { D, FLOOR, U, rng, makeNoise, sweep, roundRectPath, patchMaterial } from './common.js';
import { cv, toTex, chartCanvas, clockDialCanvas, barometerDialCanvas, softSprite } from './textures.js';
import { rep, FONTS } from './assets.js';
import { brassMat } from './desk.js';

export const ROOM = { x0: -32, x1: 32, z0: -12.3, z1: 36, y0: FLOOR, y1: 30 };
export const WIN = { x0: -5.6, x1: 0.4, y0: 0.4, y1: 8.4, z: -12.3 };

function rugCanvas(w = 1536, h = 1152) {
  const c = cv(w, h), x = c.getContext('2d');
  const R = rng(31);
  x.fillStyle = '#5e1814'; x.fillRect(0, 0, w, h);
  const band = (inset, wd, col) => { x.strokeStyle = col; x.lineWidth = wd; x.strokeRect(inset, inset, w - inset * 2, h - inset * 2); };
  band(20, 40, '#1d2340'); band(64, 12, '#c9a46a'); band(110, 70, '#1f2a3a'); band(150, 8, '#c9a46a'); band(172, 14, '#7a2a1e');
  // border motifs
  x.fillStyle = '#c9a46a';
  for (let i = 0; i < 40; i++) { const t = i / 40; [[110 + t * (w - 220), 110], [110 + t * (w - 220), h - 110], [110, 110 + t * (h - 220)], [w - 110, 110 + t * (h - 220)]].forEach(([px, py]) => { x.save(); x.translate(px, py); x.rotate(Math.PI / 4); x.fillRect(-12, -12, 24, 24); x.restore(); }); }
  // central medallion
  x.save(); x.translate(w / 2, h / 2);
  for (let k = 0; k < 5; k++) { const s = 1 - k * 0.18; x.fillStyle = ['#1d2340', '#c9a46a', '#7a2a1e', '#d8c9a8', '#1f3a2c'][k]; x.beginPath(); x.moveTo(0, -300 * s); x.lineTo(380 * s, 0); x.lineTo(0, 300 * s); x.lineTo(-380 * s, 0); x.closePath(); x.fill(); }
  x.restore();
  // field motifs
  for (let i = 0; i < 160; i++) { const px = 220 + R() * (w - 440), py = 220 + R() * (h - 440); x.fillStyle = ['#c9a46a', '#1d2340', '#d8c9a8', '#3a5a3a'][i % 4]; x.globalAlpha = 0.55; x.beginPath(); x.arc(px, py, 6 + R() * 8, 0, 7); x.fill(); }
  x.globalAlpha = 1;
  // corner spandrels
  [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([sx, sy]) => { x.fillStyle = '#1d2340'; x.beginPath(); const cx = sx ? w - 190 : 190, cy = sy ? h - 190 : 190; x.moveTo(cx, cy); x.lineTo(cx + (sx ? -260 : 260), cy); x.lineTo(cx, cy + (sy ? -200 : 200)); x.closePath(); x.fill(); });
  // wear
  const img = x.getImageData(0, 0, w, h), d = img.data; const N = makeNoise(5);
  for (let yy = 0; yy < h; yy += 1) for (let xx = 0; xx < w; xx += 1) { const i = (yy * w + xx) * 4; const n = N.fbm(xx * 0.01, yy * 0.01, 3); const k = 0.82 + 0.3 * n + (R() - 0.5) * 0.12; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
  x.putImageData(img, 0, 0);
  return c;
}

function globeCanvas(w = 1024, h = 512) {
  const c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = '#c9b88e'; x.fillRect(0, 0, w, h);
  const N = makeNoise(17);
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const lon = xx / w * Math.PI * 2, lat = (yy / h - 0.5) * Math.PI;
    const px = Math.cos(lat) * Math.cos(lon), py = Math.sin(lat), pz = Math.cos(lat) * Math.sin(lon);
    const n = N.fbm(px * 2 + 5, py * 2 + pz * 1.7 + 3, 5);
    const i = (yy * w + xx) * 4;
    if (n > 0.55) { d[i] = 186; d[i + 1] = 160; d[i + 2] = 110; } else { const k = 0.9 + 0.1 * n; d[i] = 120 * k; d[i + 1] = 140 * k; d[i + 2] = 130 * k; }
    if (Math.abs(n - 0.55) < 0.006) { d[i] = 70; d[i + 1] = 50; d[i + 2] = 30; }
  }
  x.putImageData(img, 0, 0);
  x.strokeStyle = 'rgba(60,40,20,0.35)'; x.lineWidth = 1;
  for (let i = 0; i <= 12; i++) { x.beginPath(); x.moveTo(i * w / 12, 0); x.lineTo(i * w / 12, h); x.stroke(); }
  for (let j = 0; j <= 6; j++) { x.beginPath(); x.moveTo(0, j * h / 6); x.lineTo(w, j * h / 6); x.stroke(); }
  return c;
}

const SKY_FRAG = /* glsl */`
uniform float uTOD; uniform float uTime; uniform float uStorm; uniform float uFlash; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+1.7; a*=.5; } return s; }
float ss(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
void main(){
  vec2 uv = vUv; float hor = 0.34;
  vec3 night0 = vec3(0.004,0.008,0.025), night1 = vec3(0.035,0.055,0.13);
  vec3 dusk0 = vec3(0.42,0.15,0.07), dusk1 = vec3(0.07,0.05,0.16);
  vec3 morn0 = vec3(1.5,1.25,0.95), morn1 = vec3(0.45,0.66,1.15);
  float t = ss(hor, 1.0, uv.y);
  vec3 n = mix(night1, night0, t), d = mix(dusk0, dusk1, pow(t, 0.6)), m = mix(morn0, morn1, pow(t, 0.7));
  float wN = ss(1.5, 2.0, uTOD), wM = 1.0 - ss(0.0, 0.5, uTOD);
  vec3 sky = mix(mix(d, n, wN), m, wM);
  vec2 mp = mix(mix(vec2(0.3, 0.42), vec2(0.66, 0.74), wN), vec2(0.72, 0.8), wM);
  float md = length((uv - mp)*vec2(1.0, 1.15));
  vec3 discC = mix(mix(vec3(6.,2.6,1.0), vec3(3.2,3.3,3.6), wN), vec3(9.,8.,6.), wM);
  float disc = 1.0 - ss(0.058, 0.065, md);
  float crater = wN * (0.85 + 0.15*vn((uv-mp)*60.0));
  sky += discC*disc*mix(1.0, crater, wN) + discC*0.05*exp(-md*7.) * (1.-uStorm*0.8);
  float cl = fbm(vec2(uv.x*3.0 + uTime*0.01, uv.y*6.0));
  float clouds = ss(0.5, 0.8, cl) * ss(hor, hor + 0.1, uv.y);
  sky = mix(sky, sky*0.4 + discC*0.02*(1.0-wM) + vec3(0.02), clouds*0.7);
  if(wN > 0.5){ vec2 g = floor(uv*vec2(160.,190.)); float s = step(0.993, h(g)); sky += vec3(1.2)*s*(0.5+0.5*sin(uTime*2.+h(g+3.)*30.))*ss(0.35,0.6,uv.y)*(1.-uStorm)*(1.0-clouds); }
  if(uv.y < hor){
    vec3 sea = sky*0.2 + vec3(0.002,0.006,0.012);
    float wave = 0.5 + 0.5*sin(uv.y*900.0/(0.05 + (hor - uv.y)*3.0) + vn(vec2(uv.x*30.0, uv.y*80.0))*6.0 - uTime*1.5);
    float path = (1.0 - ss(0.0, 0.05 + (hor-uv.y)*0.5, abs(uv.x - mp.x))) * ss(0.6, 0.95, wave);
    sea += discC*path*0.035*(1.-uStorm);
    sea += vec3(0.6,0.65,0.7)*ss(0.75,0.95,wave)*uStorm*0.05;
    sky = sea;
  }
  // distant lighthouse blink on a headland
  vec2 lh = vec2(0.12, hor + 0.012);
  float blink = pow(max(0.0, sin(uTime*2.1)), 30.0);
  sky += vec3(1.0,0.85,0.6)*exp(-length((uv-lh)*vec2(1.0,1.6))*180.0)*(2.0+blink*6.0)*(1.0-wM);
  sky *= 1. - uStorm*0.75;
  sky += vec3(0.6,0.7,1.0)*uFlash*0.8;
  gl_FragColor = vec4(sky, 1.);
}`;

const PANE_FRAG = /* glsl */`
uniform float uTime; uniform float uRain; uniform vec3 uTint; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
float ss(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
void main(){
  vec2 uv = vUv * vec2(6.0, 8.0);
  // rain on the pane: dim refracting beads with a small catch-light each, and wet runs below them
  float drops = 0.0, hi = 0.0;
  for(int L=0; L<2; L++){
    vec2 g = uv * (1.0 + float(L)*1.7) + vec2(0.0, uTime*(0.08 + float(L)*0.05));
    vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    float r = h(id + float(L)*7.0);
    vec2 o = vec2(r - 0.5, fract(r*13.0) - 0.5) * 0.6;
    vec2 q = (f - o) * vec2(1.0, 0.7);
    float s = mix(0.05, 0.13, fract(r*31.0));
    float on = step(0.45, fract(r*71.0));
    drops += (1.0 - ss(s*0.6, s, length(q))) * on * 0.45;
    hi += (1.0 - ss(0.0, s*0.32, length(q - vec2(-0.32, 0.38)*s))) * on;
    float trail = (1.0 - ss(0.0, 0.016, abs(f.x - o.x))) * ss(o.y, 0.5, f.y) * 0.22 * step(0.6, fract(r*71.0));
    drops += trail;
  }
  drops *= uRain; hi *= uRain;
  vec3 col = uTint * (0.04 + drops * 0.4) + vec3(1.0, 0.9, 0.75) * hi * 0.55;
  float a = 0.06 + drops * 0.4 + hi * 0.4;
  gl_FragColor = vec4(col * a, a);
}`;

const FLAME_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const FLAME_FS = /* glsl */`
uniform float uTime; uniform float uSeed; uniform float uI; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.1+1.3; a*=.5; } return s; }
void main(){
  vec2 uv = vUv; uv.x = (uv.x - 0.5) * 2.0;
  float n = fbm(vec2(uv.x*2.5 + uSeed, uv.y*3.0 - uTime*2.4));
  float shape = 1.0 - abs(uv.x) / max(0.05, (1.0 - uv.y) * 0.9 + 0.05);
  float f = clamp(shape * 1.2 - uv.y * 0.9 + (n - 0.5) * 1.4, 0.0, 1.0);
  f = pow(f, 1.6);
  vec3 c = mix(vec3(1.2, 0.25, 0.04), vec3(3.0, 1.6, 0.5), f) * f * 2.0 * uI;
  gl_FragColor = vec4(c, f);
}`;

export function makeRoom(tex) {
  const g = new THREE.Group();
  const ud = {};
  const { x0, x1, z0, z1, y0, y1 } = ROOM;
  // ---------- floor & rug
  const floorGeo = new THREE.PlaneGeometry(x1 - x0, z1 - z0); floorGeo.rotateX(-Math.PI / 2);
  { const p = floorGeo.attributes.position, uv = floorGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 20, p.getZ(i) / 20); }
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshPhysicalMaterial({ map: tex.floor, normalMap: tex.floor_n, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.5 }));
  floor.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2); floor.receiveShadow = true; g.add(floor);
  const rugTex = toTex(rugCanvas(), { wrap: false });
  const rug = new THREE.Mesh(new THREE.BoxGeometry(40, 0.12, 30), [null, null, new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }), null, null, null].map(m => m || new THREE.MeshStandardMaterial({ color: 0x3a1410, roughness: 1 })));
  rug.position.set(0, y0 + 0.06, 6); rug.receiveShadow = true; g.add(rug);
  // ---------- walls
  const panel = new THREE.MeshStandardMaterial({ map: tex.panel, normalMap: tex.panel_n, normalScale: new THREE.Vector2(1.0, 1.0), roughness: 0.58, color: 0xe8d4b8 });
  const wallRect = (ax, ay, bx, by, place) => {
    const geo = new THREE.PlaneGeometry(bx - ax, by - ay);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (ax + (bx - ax) * uv.getX(i)) / 8, (ay + (by - ay) * uv.getY(i) - y0) / 10.67);
    const m = new THREE.Mesh(geo, panel); place(m, (ax + bx) / 2, (ay + by) / 2); m.receiveShadow = true; m.castShadow = true; g.add(m); return m;
  };
  // back wall (z0) faces +z: x from x0..x1 ; window hole
  const back = (m, cx, cy) => { m.position.set(cx, cy, z0); };
  wallRect(x0, y0, WIN.x0, y1, back); wallRect(WIN.x1, y0, x1, y1, back); wallRect(WIN.x0, WIN.y1, WIN.x1, y1, back); wallRect(WIN.x0, y0, WIN.x1, WIN.y0, back);
  // front wall (z1) faces -z
  wallRect(x0, y0, x1, y1, (m, cx, cy) => { m.position.set(-cx, cy, z1); m.rotation.y = Math.PI; });
  // left wall (x0) faces +x ; fireplace opening z 0..16, y y0..y0+14
  const FPz0 = 0, FPz1 = 16, FPy1 = y0 + 14;
  const leftWall = (za, ya, zb, yb) => wallRect(za, ya, zb, yb, (m, cx, cy) => { m.position.set(x0, cy, cx); m.rotation.y = Math.PI / 2; });
  leftWall(z0, y0, FPz0, y1); leftWall(FPz1, y0, z1, y1); leftWall(FPz0, FPy1, FPz1, y1);
  // right wall (x1) faces -x
  wallRect(z0, y0, z1, y1, (m, cx, cy) => { m.position.set(x1, cy, cx); m.rotation.y = -Math.PI / 2; });
  // baseboards + crown
  const trim = new THREE.MeshStandardMaterial({ map: rep(tex.panel, 0.2, 0.02), color: 0x6a5040, roughness: 0.55 });
  const tb = (sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), trim); b.position.set(x, y, z); b.receiveShadow = true; b.castShadow = true; g.add(b); return b; };
  tb(x1 - x0, 1.0, 0.3, 0, y0 + 0.5, z0 + 0.15); tb(x1 - x0, 1.0, 0.3, 0, y0 + 0.5, z1 - 0.15);
  tb(0.3, 1.0, z1 - z0, x1 - 0.15, y0 + 0.5, (z0 + z1) / 2);
  tb(0.3, 1.0, FPz0 - z0, x0 + 0.15, y0 + 0.5, (z0 + FPz0) / 2); tb(0.3, 1.0, z1 - FPz1, x0 + 0.15, y0 + 0.5, (FPz1 + z1) / 2);
  tb(x1 - x0, 1.2, 0.6, 0, y1 - 0.6, z0 + 0.3); tb(x1 - x0, 1.2, 0.6, 0, y1 - 0.6, z1 - 0.3); tb(0.6, 1.2, z1 - z0, x0 + 0.3, y1 - 0.6, (z0 + z1) / 2); tb(0.6, 1.2, z1 - z0, x1 - 0.3, y1 - 0.6, (z0 + z1) / 2);
  // ceiling + beams
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.95 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, y1, (z0 + z1) / 2); g.add(ceil);
  const beamM = new THREE.MeshStandardMaterial({ map: rep(tex.floor, 1, 0.1), color: 0x5a4030, roughness: 0.7 });
  for (let x = -28; x <= 28; x += 8) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, z1 - z0), beamM); b.position.set(x, y1 - 0.8, (z0 + z1) / 2); g.add(b); }

  // ---------- window
  const skyMat = new THREE.ShaderMaterial({ uniforms: { uTOD: { value: 2 }, uTime: U.time, uStorm: { value: 0 }, uFlash: U.flash }, vertexShader: FLAME_VS, fragmentShader: SKY_FRAG });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(WIN.x1 - WIN.x0 + 6, WIN.y1 - WIN.y0 + 6), skyMat); sky.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, z0 - 2.2); g.add(sky);
  // window reveal (wall thickness)
  const reveal = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.8 });
  const rv = (sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), reveal); b.position.set(x, y, z); g.add(b); };
  rv(0.2, WIN.y1 - WIN.y0, 1.4, WIN.x0 - 0.1, (WIN.y0 + WIN.y1) / 2, z0 - 0.7); rv(0.2, WIN.y1 - WIN.y0, 1.4, WIN.x1 + 0.1, (WIN.y0 + WIN.y1) / 2, z0 - 0.7);
  rv(WIN.x1 - WIN.x0, 0.2, 1.4, (WIN.x0 + WIN.x1) / 2, WIN.y1 + 0.1, z0 - 0.7);
  const frameMat = new THREE.MeshStandardMaterial({ map: rep(tex.panel, 0.3, 0.3), color: 0x4a3426, roughness: 0.6 });
  const fb = (sx, sy, x, y, sz = 0.35, z = z0 - 0.3) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), frameMat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); };
  const W = WIN.x1 - WIN.x0, H = WIN.y1 - WIN.y0, cxw = (WIN.x0 + WIN.x1) / 2, cyw = (WIN.y0 + WIN.y1) / 2;
  fb(W + 0.8, 0.4, cxw, WIN.y1 + 0.1, 0.5, z0 + 0.05); fb(0.4, H + 0.6, WIN.x0 - 0.1, cyw, 0.5, z0 + 0.05); fb(0.4, H + 0.6, WIN.x1 + 0.1, cyw, 0.5, z0 + 0.05);
  fb(0.12, H, cxw - W / 6, cyw, 0.16); fb(0.12, H, cxw + W / 6, cyw, 0.16);
  for (let k = 1; k < 4; k++) fb(W, 0.12, cxw, WIN.y0 + H * k / 4, 0.16);
  fb(W, 0.35, cxw, cyw + 0.05, 0.22);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 0.25, 1.4), frameMat); sill.position.set(cxw, WIN.y0 - 0.12, z0 + 0.4); sill.castShadow = true; sill.receiveShadow = true; g.add(sill);
  const paneMat = new THREE.ShaderMaterial({ uniforms: { uTime: U.time, uRain: { value: 0 }, uTint: { value: new THREE.Color(0.5, 0.55, 0.65) } }, vertexShader: FLAME_VS, fragmentShader: PANE_FRAG, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), paneMat); pane.position.set(cxw, cyw, z0 - 0.32); g.add(pane);
  // curtains + rod
  const brass = brassMat(tex);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, W + 9, 16), brass); rod.rotation.z = Math.PI / 2; rod.position.set(cxw, WIN.y1 + 1.4, z0 + 0.9); g.add(rod);
  [-1, 1].forEach(s => { const f = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), brass); f.position.set(cxw + s * (W / 2 + 4.6), WIN.y1 + 1.4, z0 + 0.9); g.add(f); });
  const curtainMat = new THREE.MeshPhysicalMaterial({ color: 0x4e1012, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0xb04848), sheenRoughness: 0.45, side: THREE.DoubleSide });
  const curtains = [];
  [-1, 1].forEach(s => {
    const cw = 3.4, chh = WIN.y1 + 1.3 - (y0 + 0.4);
    const geo = new THREE.PlaneGeometry(cw, chh, 56, 30);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i); const v = (y + chh / 2) / chh;
      const gather = 0.55 + 0.45 * Math.abs(v - 0.42) / 0.58;
      const tieback = Math.exp(-Math.pow((v - 0.42) / 0.06, 2));
      p.setX(i, x * (gather - tieback * 0.25) + s * tieback * 0.5);
      p.setZ(i, Math.sin(x * 6.5) * 0.18 * (1 - 0.4 * tieback) + Math.sin(x * 2.3 + v * 3) * 0.08);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, curtainMat); m.position.set(cxw + s * (W / 2 + 2.2), y0 + 0.4 + chh / 2, z0 + 0.95); m.castShadow = true; m.receiveShadow = true; g.add(m); curtains.push(m);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 8, 24), new THREE.MeshStandardMaterial({ color: 0xb08a40, roughness: 0.6 })); tie.position.set(m.position.x, y0 + 0.4 + chh * 0.42, z0 + 1.0); tie.scale.set(1, 0.35, 0.6); g.add(tie);
  });
  Object.assign(ud, { skyMat, paneMat, curtains, windowCenter: new THREE.Vector3(cxw, cyw, z0) });

  // ---------- fireplace (left wall)
  const marble = new THREE.MeshPhysicalMaterial({ map: rep(tex.rock, 0.6, 0.6), normalMap: rep(tex.rock_n, 0.6, 0.6), normalScale: new THREE.Vector2(0.3, 0.3), color: 0xc0b8ac, roughness: 0.35, clearcoat: 0.4 });
  const fx = x0, fzc = (FPz0 + FPz1) / 2;
  const fbx = (sx, sy, sz, x, y, z, m = marble) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; g.add(b); return b; };
  fbx(1.4, 15, 2.2, fx + 0.7, y0 + 7.5, FPz0 - 1.1); fbx(1.4, 15, 2.2, fx + 0.7, y0 + 7.5, FPz1 + 1.1);
  fbx(1.4, 2.4, FPz1 - FPz0 + 4.4, fx + 0.7, y0 + 15.2, fzc);
  fbx(2.6, 0.5, FPz1 - FPz0 + 6.0, fx + 1.3, y0 + 16.65, fzc);
  fbx(2.2, 0.3, FPz1 - FPz0 + 5.4, fx + 1.1, y0 + 16.25, fzc);
  // firebox
  const soot = new THREE.MeshStandardMaterial({ color: 0x120c09, roughness: 0.95 });
  fbx(0.3, 14, FPz1 - FPz0, fx - 3.8, y0 + 7, fzc, soot);
  fbx(4, 0.3, FPz1 - FPz0, fx - 2, y0 + 14, fzc, soot);
  fbx(4, 14, 0.3, fx - 2, y0 + 7, FPz0, soot); fbx(4, 14, 0.3, fx - 2, y0 + 7, FPz1, soot);
  fbx(4.2, 0.3, FPz1 - FPz0, fx - 2, y0 + 0.15, fzc, soot);
  fbx(5, 0.4, FPz1 - FPz0 + 5, fx + 2.5, y0 + 0.2, fzc, marble);
  // grate + logs
  const iron = new THREE.MeshStandardMaterial({ color: 0x18140f, roughness: 0.6, metalness: 0.6 });
  for (let i = 0; i < 7; i++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 8), iron); bar.rotation.x = Math.PI / 2; bar.position.set(fx - 2.2 + i * 0.3, y0 + 1.2, fzc); g.add(bar); }
  [[-1, 1.2], [1, 1.2]].forEach(([s]) => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8), iron); leg.position.set(fx - 0.6, y0 + 1.1, fzc + s * 3); g.add(leg); const fin = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), brass); fin.position.set(fx - 0.6, y0 + 2.3, fzc + s * 3); g.add(fin); });
  const logM = new THREE.MeshStandardMaterial({ map: rep(tex.rock, 1, 3), normalMap: rep(tex.rock_n, 1, 3), color: 0x5a4030, roughness: 0.95, emissive: 0x401000, emissiveIntensity: 0.6 });
  [[0.0, 0.25, 0], [0.4, -0.35, 0.7], [-0.6, 0.6, -0.5]].forEach(([dx, ry, dz], i) => { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 5.4, 12), logM); lg.rotation.set(Math.PI / 2, 0, ry); lg.position.set(fx - 2 + dx, y0 + 1.7 + i * 0.5, fzc + dz); g.add(lg); });
  const emberMat = new THREE.ShaderMaterial({ uniforms: { uTime: U.time, uSeed: { value: 3 }, uI: { value: 1 } }, vertexShader: FLAME_VS, fragmentShader: `uniform float uTime; uniform float uI; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); } float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); } void main(){ float n = vn(vUv*vec2(30.,12.) + vec2(uTime*0.4, 0.)) * vn(vUv*vec2(8.,4.) - uTime*0.2); vec3 c = vec3(2.5, 0.6, 0.08) * pow(n, 1.5) * 2.0 * uI; gl_FragColor = vec4(c, 1.0); }` });
  const embersBed = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 6.0), emberMat); embersBed.rotation.x = -Math.PI / 2; embersBed.rotation.z = Math.PI / 2; embersBed.position.set(fx - 2, y0 + 1.3, fzc); g.add(embersBed);
  const flames = [];
  for (let i = 0; i < 7; i++) {
    const fm = new THREE.ShaderMaterial({ uniforms: { uTime: U.time, uSeed: { value: i * 3.7 }, uI: { value: 1 } }, vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const f = new THREE.Mesh(new THREE.PlaneGeometry(2.2 + (i % 3) * 0.6, 4.2 + (i % 2) * 1.2), fm);
    f.geometry.translate(0, (4.2 + (i % 2) * 1.2) / 2, 0);
    f.position.set(fx - 2.2 + (i % 3) * 0.4, y0 + 1.6, fzc - 2.4 + i * 0.8); f.rotation.y = Math.PI / 2 + (i % 2 ? 0.5 : -0.5) + i * 0.2;
    g.add(f); flames.push(fm);
  }
  Object.assign(ud, { flames, emberMat, mantelLightPos: new THREE.Vector3(fx + 2.6, y0 + 22.2, fzc), fireLightPos: new THREE.Vector3(fx + 1.2, y0 + 3.5, fzc), emberOrigin: new THREE.Vector3(fx - 2, y0 + 2.5, fzc) });
  // mantel clock
  const clock = new THREE.Group(); clock.position.set(fx + 1.4, y0 + 16.9, fzc); clock.rotation.y = Math.PI / 2; g.add(clock);
  const caseM = new THREE.MeshPhysicalMaterial({ map: rep(tex.stand, 0.5, 0.5), roughness: 0.35, clearcoat: 0.6 });
  const shape = new THREE.Shape(); shape.moveTo(-1.6, 0); shape.lineTo(1.6, 0); shape.lineTo(1.6, 2.2); shape.absarc(0, 2.2, 1.6, 0, Math.PI, false); shape.lineTo(-1.6, 0);
  const caseG = new THREE.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }); caseG.translate(0, 0, -0.5);
  { const p = caseG.attributes.position, uv = caseG.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.3, p.getY(i) * 0.3); }
  clock.add(new THREE.Mesh(caseG, caseM));
  const dialTex = toTex(clockDialCanvas(512, 'HALCYON'), { wrap: false });
  const dial = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48), new THREE.MeshStandardMaterial({ map: dialTex, roughness: 0.6 })); dial.position.set(0, 2.25, 0.6); clock.add(dial);
  const bez = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.09, 10, 48), brass); bez.position.set(0, 2.25, 0.6); clock.add(bez);
  const handM = new THREE.MeshStandardMaterial({ color: 0x14100c, metalness: 0.5, roughness: 0.4 });
  const mk = (len, w, z) => { const h = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.03), handM); m.position.y = len / 2 - 0.1; h.add(m); h.position.set(0, 2.25, 0.62 + z); clock.add(h); return h; };
  ud.mantelClock = { h: mk(0.65, 0.09, 0), m: mk(0.95, 0.06, 0.02), s: mk(1.0, 0.02, 0.04) };
  // mantel candlesticks (lit)
  ud.mantelCandles = [];
  [-1, 1].forEach(s => {
    const cs = new THREE.Group(); cs.position.set(fx + 1.4, y0 + 16.9, fzc + s * 6.0); g.add(cs);
    cs.add(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.6, 0], [0.62, 0.1], [0.3, 0.3], [0.18, 0.5], [0.22, 1.6], [0.14, 2.4], [0.3, 2.6], [0.3, 2.75], [0, 2.75]].map(([r, y]) => new THREE.Vector2(r, y)), 32), brass));
    const cdl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.0, 16), new THREE.MeshPhysicalMaterial({ color: 0xefe3c4, roughness: 0.45, sheen: 0.6, emissive: 0x2a1404, emissiveIntensity: 0.6 })); cdl.position.y = 3.75; cs.add(cdl);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 3.5, 1) })); flame.scale.set(0.8, 1.8, 0.8); flame.position.y = 4.95; cs.add(flame);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(64), color: new THREE.Color(1, 0.5, 0.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(1.4, 1.8, 1); glow.position.y = 5.0; cs.add(glow);
    ud.mantelCandles.push({ flame, glow, pos: new THREE.Vector3(fx + 1.4, y0 + 16.9 + 5.0, fzc + s * 6.0) });
  });
  // painting above mantel in a gilt frame
  const pw = 13, ph = 9.5;
  const painting = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ map: tex.painting, roughness: 0.55 }));
  painting.position.set(fx + 0.12, y0 + 24, fzc); painting.rotation.y = Math.PI / 2; g.add(painting);
  const gilt = new THREE.MeshPhysicalMaterial({ color: 0xb8913f, metalness: 1, roughness: 0.38, roughnessMap: tex.brass_orm, clearcoat: 0.2 });
  const frameProf = [[0.0, 0.05], [0.25, 0.25], [0.45, 0.3], [0.6, 0.45], [0.9, 0.42], [1.1, 0.25], [1.2, 0.1], [1.2, 0.0]];
  const fp = roundRectPath(-pw / 2, pw / 2, -ph / 2, ph / 2, 0.05, 1).map(o => ({ p: o.p, n: o.n }));
  const frameGeo = sweep(fp, frameProf.map(([o, y]) => [o, y]));
  const frame = new THREE.Mesh(frameGeo, gilt); frame.rotation.x = Math.PI / 2; frame.castShadow = true; const fr = new THREE.Group(); fr.add(frame); fr.position.set(fx, y0 + 24, fzc); fr.rotation.y = Math.PI / 2; g.add(fr);

  // ---------- bookshelves (right wall)
  const shelfM = new THREE.MeshStandardMaterial({ map: rep(tex.panel, 0.4, 0.4), color: 0x7a5e48, roughness: 0.55 });
  const bsx = x1 - 1.6, bz0 = -6, bz1 = 26, bh = 30, bd = 3.0;
  const sb = (sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), shelfM); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; g.add(b); };
  sb(bd, bh, 0.5, bsx, y0 + bh / 2, bz0); sb(bd, bh, 0.5, bsx, y0 + bh / 2, bz1); sb(bd, bh, 0.5, bsx, y0 + bh / 2, (bz0 + bz1) / 2);
  sb(0.3, bh, bz1 - bz0, x1 - 0.15, y0 + bh / 2, (bz0 + bz1) / 2);
  const nShelf = 6, sp = (bh - 1.2) / nShelf;
  for (let i = 0; i <= nShelf; i++) sb(bd, 0.35, bz1 - bz0, bsx, y0 + 0.6 + i * sp, (bz0 + bz1) / 2);
  sb(bd + 0.6, 0.8, bz1 - bz0 + 1, bsx - 0.2, y0 + bh + 0.4, (bz0 + bz1) / 2);
  // books (instanced, atlas spines)
  const R = rng(91);
  const books = [];
  for (let i = 0; i < nShelf; i++) {
    const yb = y0 + 0.6 + i * sp + 0.175;
    for (const [za, zb] of [[bz0 + 0.3, (bz0 + bz1) / 2 - 0.3], [(bz0 + bz1) / 2 + 0.3, bz1 - 0.3]]) {
      let z = za;
      while (z < zb - 0.6) {
        if (R() < 0.06) { z += 1.2 + R() * 2.0; continue; }
        const t = 0.45 + R() * 0.7, hgt = Math.min(sp - 0.6, 3.0 + R() * 1.5), dep = 2.0 + R() * 0.6;
        if (z + t > zb) break;
        const lean = R() < 0.08 ? (R() - 0.5) * 0.25 : 0;
        books.push({ x: x1 - 0.3 - dep / 2 - 0.02, y: yb + hgt / 2, z: z + t / 2, t, hgt, dep, cell: Math.floor(R() * 48), lean });
        z += t + 0.03;
      }
    }
  }
  const bookGeo = new THREE.BoxGeometry(1, 1, 1);
  const bookMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  patchMaterial(bookMat, 'books', (sh) => {
    sh.uniforms.tAtlas = { value: tex.books };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aCell; attribute vec3 aTint; varying vec2 vBUV; varying float vFace; varying vec3 vTint;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n float cx = mod(aCell, 16.0), cy = floor(aCell / 16.0); vBUV = vec2((cx + uv.x) / 16.0, 1.0 - (cy + 1.0 - uv.y) / 3.0); vFace = normal.x < -0.5 ? 0.0 : (normal.y > 0.5 || normal.y < -0.5 ? 1.0 : 2.0); vTint = aTint;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tAtlas; varying vec2 vBUV; varying float vFace; varying vec3 vTint;')
      .replace('#include <map_fragment>', `
        vec3 bc = vFace < 0.5 ? texture2D(tAtlas, vBUV).rgb : (vFace < 1.5 ? vec3(0.78, 0.72, 0.58) : vTint);
        diffuseColor.rgb *= bc;`);
  });
  const inst = new THREE.InstancedMesh(bookGeo, bookMat, books.length);
  const aCell = new Float32Array(books.length), aTint = new Float32Array(books.length * 3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const tints = [0x4a1712, 0x1d3326, 0x1b2440, 0x3a2a18, 0x5a3a1a, 0x2b2b2b, 0x6a1e16];
  books.forEach((b, i) => {
    q.setFromEuler(new THREE.Euler(b.lean, 0, 0));
    m4.compose(new THREE.Vector3(b.x, b.y - Math.abs(b.lean) * 0.4, b.z), q, new THREE.Vector3(b.dep, b.hgt, b.t));
    inst.setMatrixAt(i, m4); aCell[i] = b.cell; const c = new THREE.Color(tints[i % tints.length]); aTint.set([c.r, c.g, c.b], i * 3);
  });
  inst.geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(aCell, 1));
  inst.geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 3));
  inst.castShadow = true; inst.receiveShadow = true; g.add(inst);
  // hourglass on a shelf
  const hg = new THREE.Group(); hg.position.set(x1 - 1.6, y0 + 0.6 + 4 * sp + 0.2, bz1 - 2.0); g.add(hg);
  const hgWood = new THREE.MeshStandardMaterial({ map: rep(tex.stand, 0.5, 0.5), roughness: 0.4 });
  [0, 2.6].forEach(y => { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 24), hgWood); d.position.y = y + 0.1; hg.add(d); });
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), hgWood); p.position.set(Math.cos(a) * 0.75, 1.4, Math.sin(a) * 0.75); hg.add(p); }
  const bulbPts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; bulbPts.push(new THREE.Vector2(0.08 + 0.55 * Math.pow(Math.sin(t * Math.PI), 1.3) * (t < 0.5 ? 1 : 1), 0.2 + t * 2.4)); }
  hg.add(new THREE.Mesh(new THREE.LatheGeometry(bulbPts, 24), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.2, depthWrite: false })));
  const sandC = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.6, 20), new THREE.MeshStandardMaterial({ color: 0xd8c08a, roughness: 0.9 })); sandC.position.y = 0.55; hg.add(sandC);
  // floor globe
  const globe = new THREE.Group(); globe.position.set(24, y0, 28); g.add(globe);
  const stand = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [1.8, 0], [1.9, 0.3], [0.5, 0.6], [0.3, 4.5], [0.6, 5.0], [0, 5.0]].map(([r, y]) => new THREE.Vector2(r, y)), 32), hgWood); globe.add(stand);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(2.4, 48, 32), new THREE.MeshPhysicalMaterial({ map: toTex(globeCanvas(), { wrap: false }), roughness: 0.4, clearcoat: 0.6 })); sphere.position.y = 7.4; sphere.rotation.z = 0.41; globe.add(sphere);
  const mer = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.08, 8, 64), brass); mer.position.y = 7.4; mer.rotation.z = 0.41; globe.add(mer);
  const hor = new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.12, 8, 64), hgWood); hor.rotation.x = Math.PI / 2; hor.position.y = 7.4; globe.add(hor);
  globe.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  ud.globe = sphere;

  // ---------- front wall: door, coat stand, framed map
  const doorM = new THREE.MeshStandardMaterial({ map: rep(tex.panel, 1, 1), normalMap: rep(tex.panel_n, 1, 1), color: 0x8a6a50, roughness: 0.5 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(9, 20, 0.4), doorM); door.position.set(12, y0 + 10, z1 - 0.25); g.add(door);
  const casing = new THREE.MeshStandardMaterial({ map: rep(tex.panel, 0.2, 0.2), color: 0x5a4030, roughness: 0.55 });
  [[-1], [1]].forEach(([s]) => { const c = new THREE.Mesh(new THREE.BoxGeometry(0.8, 21, 0.5), casing); c.position.set(12 + s * 4.9, y0 + 10.5, z1 - 0.3); g.add(c); });
  const lint = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.9, 0.6), casing); lint.position.set(12, y0 + 21.2, z1 - 0.3); g.add(lint);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), brass); knob.position.set(8.6, y0 + 9.5, z1 - 0.6); g.add(knob);
  const coat = new THREE.Group(); coat.position.set(-14, y0, z1 - 3); g.add(coat);
  coat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 26, 12), hgWood)).position.y = 13;
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const f = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 4, 8), hgWood); f.position.set(Math.cos(a) * 1.5, 1.2, Math.sin(a) * 1.5); f.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); coat.add(f); }
  const coatGeo = new THREE.CylinderGeometry(0.8, 2.6, 13, 24, 8, true); const cp = coatGeo.attributes.position; for (let i = 0; i < cp.count; i++) { const a = Math.atan2(cp.getZ(i), cp.getX(i)); const k = 1 + Math.sin(a * 9) * 0.06; cp.setX(i, cp.getX(i) * k); cp.setZ(i, cp.getZ(i) * k * 0.6); } coatGeo.computeVertexNormals();
  const coatM = new THREE.Mesh(coatGeo, new THREE.MeshStandardMaterial({ color: 0x1a2032, roughness: 0.85, side: THREE.DoubleSide })); coatM.position.set(0, 18, 0.4); coat.add(coatM);
  const capHat = new THREE.Group(); capHat.position.set(0, 26.3, 0); coat.add(capHat);
  capHat.add(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.15, 24), new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.6 })));
  const crown2 = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.0, 1.0, 24), new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.6 })); crown2.position.y = 0.55; capHat.add(crown2);
  const badge = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 6, 16), brass); badge.position.set(0, 0.5, 1.15); capHat.add(badge);
  coat.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  // framed chart on the back wall + front wall
  const smallChart = toTex(chartCanvas(tex.paper.image), { wrap: false });
  const mkFrame = (w, h, map) => {
    const grp = new THREE.Group();
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, roughness: 0.8 })); pic.position.z = 0.05; grp.add(pic);
    const fpth = roundRectPath(-w / 2, w / 2, -h / 2, h / 2, 0.02, 1);
    const fgeo = sweep(fpth, [[0.0, 0.1], [0.2, 0.2], [0.35, 0.18], [0.45, 0.05], [0.45, 0.0]]); const fm = new THREE.Mesh(fgeo, gilt); fm.rotation.x = Math.PI / 2; grp.add(fm);
    const glassF = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.08, depthWrite: false })); glassF.position.z = 0.12; grp.add(glassF);
    grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return grp;
  };
  const fc1 = mkFrame(8, 5.6, smallChart); fc1.position.set(-12.5, 3.8, z0 + 0.05); g.add(fc1);
  const fc2 = mkFrame(9, 6.3, smallChart); fc2.position.set(-2, y0 + 22, z1 - 0.05); fc2.rotation.y = Math.PI; g.add(fc2);
  // barometer + wall clock on the back wall
  const baro = new THREE.Group(); baro.position.set(5.8, 4.6, z0 + 0.1); g.add(baro);
  const baroBody = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.35, 48), new THREE.MeshPhysicalMaterial({ map: rep(tex.stand, 0.3, 0.3), roughness: 0.35, clearcoat: 0.6 })); baroBody.rotation.x = Math.PI / 2; baro.add(baroBody);
  const baroRing = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.11, 12, 48), brass); baroRing.position.z = 0.2; baro.add(baroRing);
  const baroDial = new THREE.Mesh(new THREE.CircleGeometry(1.38, 48), new THREE.MeshStandardMaterial({ map: toTex(barometerDialCanvas(), { wrap: false }), roughness: 0.6 })); baroDial.position.z = 0.18; baro.add(baroDial);
  const baroNeedle = new THREE.Group(); baroNeedle.position.z = 0.22; baro.add(baroNeedle);
  const bn = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.15, 0.02), new THREE.MeshStandardMaterial({ color: 0x1a1410, metalness: 0.5 })); bn.position.y = 0.5; baroNeedle.add(bn);
  const setN = new THREE.Group(); setN.position.z = 0.24; baro.add(setN);
  const sn = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.2, 0.01), brass); sn.position.y = 0.55; setN.add(sn);
  baro.traverse(o => { if (o.isMesh) o.castShadow = true; });
  ud.baroNeedle = baroNeedle; ud.baroSet = setN;
  const wclock = new THREE.Group(); wclock.position.set(11.2, 4.9, z0 + 0.1); g.add(wclock);
  const wcBody = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.4, 48), brass); wcBody.rotation.x = Math.PI / 2; wclock.add(wcBody);
  const wcDial = new THREE.Mesh(new THREE.CircleGeometry(1.35, 48), new THREE.MeshStandardMaterial({ map: toTex(clockDialCanvas(512, 'SHIP’S TIME'), { wrap: false }), roughness: 0.6 })); wcDial.position.z = 0.21; wclock.add(wcDial);
  const wcGlass = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 8, 0, Math.PI * 2, 0, 0.5), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.1, depthWrite: false })); wcGlass.rotation.x = Math.PI / 2; wcGlass.position.z = 0.21 - 1.5 * Math.cos(0.5); wclock.add(wcGlass);
  const wmk = (len, w, z) => { const h = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.02), handM); m.position.y = len / 2 - 0.1; h.add(m); h.position.z = 0.24 + z; wclock.add(h); return h; };
  ud.wallClock = { h: wmk(0.75, 0.09, 0), m: wmk(1.1, 0.06, 0.02), s: wmk(1.15, 0.02, 0.04) };
  wclock.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // wall sconces (candle + mirror plate)
  ud.sconcePos = [];
  [[-6, 7, z1 - 0.2, Math.PI], [x1 - 0.2, 7, 30, -Math.PI / 2]].forEach(([x, y, z, ry]) => {
    const sc = new THREE.Group(); sc.position.set(x, y, z); sc.rotation.y = ry; g.add(sc);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 32), brass); plate.rotation.x = Math.PI / 2; plate.scale.set(0.8, 1, 1.25); sc.add(plate);
    const arm = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 8, 20, Math.PI / 2), brass); arm.position.set(0, -0.7, 0.7); arm.rotation.y = Math.PI / 2; sc.add(arm);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.25, 16), brass); cup.position.set(0, -0.05, 1.4); sc.add(cup);
    const cdl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.2, 12), new THREE.MeshPhysicalMaterial({ color: 0xefe3c4, roughness: 0.45, emissive: 0x3a1a04, emissiveIntensity: 0.6 })); cdl.position.set(0, 0.6, 1.4); sc.add(cdl);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 3.5, 1) })); fl.scale.set(0.8, 1.9, 0.8); fl.position.set(0, 1.35, 1.4); sc.add(fl);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(64), color: new THREE.Color(1, 0.5, 0.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(1.2, 1.6, 1); glow.position.set(0, 1.4, 1.4); sc.add(glow);
    sc.updateMatrix(); ud.sconcePos.push(new THREE.Vector3(0, 1.5, 1.6).applyMatrix4(sc.matrix));
  });
  g.userData = ud;
  return g;
}
