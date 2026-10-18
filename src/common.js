import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const LAYER = { MAIN: 0, WATER: 1, ROOM: 2, GLASS: 3, ENVONLY: 4 };

// 1 unit ~ 5 cm. Bottle-local frame: axis along +x (cork at +x), water plane horizontal.
export const B = {
  R: 1.0,
  Ri: 0.965,
  level: -0.32,
  cx: -0.3,
  deskY: -1.62,
};
export const D = B.deskY;
export const FLOOR = D - 15;

export function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
export function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function innerR(x) { return lerp(0.965, 0.30, smooth(1.25, 2.05, x)); }
export function outerR(x) { return lerp(1.0, 0.35, smooth(1.25, 2.05, x)); }
export const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNoise(seed = 1) {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) vals[i] = r();
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const X = xi & 255, Y = yi & 255;
    const a = vals[perm[X + perm[Y]]], b = vals[perm[X + 1 + perm[Y]]];
    const c = vals[perm[X + perm[Y + 1]]], d = vals[perm[X + 1 + perm[Y + 1]]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 4) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  }
  return { noise, fbm };
}

// Shared uniforms (same object references across materials)
export const U = {
  time: { value: 0 },
  night: { value: 1 },
  flash: { value: 0 },
  waterY: { value: B.level },
  caustI: { value: 1.0 },
  lampPos: { value: new THREE.Vector3() },
  lampCol: { value: new THREE.Color(1, 0.62, 0.3) },
};

// GLSL helpers. ss() is a smoothstep that is defined for either edge order.
export const GLSL_UTIL = /* glsl */`
float ss(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float innerR(float x){ return mix(0.965, 0.30, ss(1.25, 2.05, x)); }
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
vec2 h22(vec2 p){ float n = h21(p); return vec2(n, h21(p + n*17.17)); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
float fbm2(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+1.7; a*=.5; } return s; }
`;

export const GLSL_CAUSTIC = /* glsl */`
float causticF(vec2 uv, float t){
  vec2 p = mod(uv*6.28318, 6.28318) - 250.0;
  vec2 i = p; float c = 1.0; float inten = .005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n+1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0/length(vec2(p.x / (sin(i.x+tt)/inten), p.y / (cos(i.y+tt)/inten)));
  }
  c /= 4.0; c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 2.0);
}
`;

// Chainable onBeforeCompile helpers ------------------------------------------------
export function patchMaterial(mat, key, fn) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); fn(sh, r); };
  mat.customProgramCacheKey = () => prevKey + '|' + key;
  return mat;
}

// Underwater caustics (world space; the bottle is close to axis-aligned)
export function addCaustics(mat, strength = 1.0) {
  return patchMaterial(mat, 'caust' + strength, (sh) => {
    sh.uniforms.uTime = U.time;
    sh.uniforms.uWaterY = U.waterY;
    sh.uniforms.uCaustI = U.caustI;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCWP; uniform float uTime; uniform float uWaterY; uniform float uCaustI;\nfloat ssC(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }\n' + GLSL_CAUSTIC)
      .replace('#include <opaque_fragment>', `
        float under = 1.0 - ssC(uWaterY - 0.04, uWaterY + 0.01, vCWP.y);
        float depthF = exp(-max(uWaterY - vCWP.y, 0.0) * 1.6);
        float cst = causticF(vCWP.xz * 0.85 + vec2(0.13*sin(uTime*0.2), 0.0), uTime * 0.55);
        outgoingLight = outgoingLight * mix(1.0, 0.72, under) + diffuseColor.rgb * cst * under * depthF * ${strength.toFixed(2)} * uCaustI * vec3(0.55, 0.85, 0.9);
        #include <opaque_fragment>`);
  });
}

// Triplanar texturing for organic meshes without good UVs (island, rocks)
export function addTriplanar(mat, { map, normalMap, scale = 4, mapB = null, blendUp = 0, scaleB = 6, tintB = null }) {
  return patchMaterial(mat, 'tri' + scale + (mapB ? 'B' : ''), (sh) => {
    sh.uniforms.tTri = { value: map };
    sh.uniforms.tTriN = { value: normalMap };
    sh.uniforms.tTriB = { value: mapB || map };
    sh.uniforms.uTriS = { value: scale };
    sh.uniforms.uTriSB = { value: scaleB };
    sh.uniforms.uBlendUp = { value: blendUp };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriP; varying vec3 vTriN; varying vec3 vTV0; varying vec3 vTV1; varying vec3 vTV2;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTriP = position; vTriN = normal; mat4 tvm = viewMatrix * modelMatrix; vTV0 = (tvm * vec4(1.,0.,0.,0.)).xyz; vTV1 = (tvm * vec4(0.,1.,0.,0.)).xyz; vTV2 = (tvm * vec4(0.,0.,1.,0.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTriP; varying vec3 vTriN; varying vec3 vTV0; varying vec3 vTV1; varying vec3 vTV2; uniform sampler2D tTri; uniform sampler2D tTriN; uniform sampler2D tTriB; uniform float uTriS; uniform float uTriSB; uniform float uBlendUp;
        vec3 triW(vec3 n){ vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }`)
      .replace('#include <map_fragment>', `
        vec3 tw = triW(normalize(vTriN));
        vec3 tcol = texture2D(tTri, vTriP.zy*uTriS).rgb*tw.x + texture2D(tTri, vTriP.xz*uTriS).rgb*tw.y + texture2D(tTri, vTriP.xy*uTriS).rgb*tw.z;
        ${mapB ? `vec3 tcolB = texture2D(tTriB, vTriP.xz*uTriSB).rgb; float upk = smoothstep(0.55, 0.85, normalize(vTriN).y) * uBlendUp * vColor.g; tcol = mix(tcol, tcolB, upk);` : ''}
        diffuseColor.rgb *= tcol * 1.6;`)
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 n0 = normalize(vTriN);
          vec3 nx = texture2D(tTriN, vTriP.zy*uTriS).xyz*2.-1.;
          vec3 ny = texture2D(tTriN, vTriP.xz*uTriS).xyz*2.-1.;
          vec3 nz = texture2D(tTriN, vTriP.xy*uTriS).xyz*2.-1.;
          // whiteout blend in object space
          vec3 bx = vec3(nx.xy + n0.zy, abs(nx.z) * n0.x);
          vec3 by = vec3(ny.xy + n0.xz, abs(ny.z) * n0.y);
          vec3 bz = vec3(nz.xy + n0.xy, abs(nz.z) * n0.z);
          vec3 nObj = normalize(bx.zyx * tw.x + by.xzy * tw.y + bz * tw.z);
          normal = normalize(vTV0 * nObj.x + vTV1 * nObj.y + vTV2 * nObj.z);
        }`);
  });
}

export function enableLayers(obj, ...ls) { obj.traverse(o => ls.forEach(l => o.layers.enable(l))); }

export function shadowAll(obj, cast = true, receive = true) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
}

// Sweep a 2D profile along a closed (or open) path in the XZ plane.
// path: array of {p: Vector3 (y ignored), n: Vector3 outward normal in XZ}
// profile: array of [offset (outward), y]; returns BufferGeometry with uv (u along path length, v along profile)
export function sweep(path, profile, closed = true) {
  const pos = [], uv = [], idx = [];
  const np = path.length, nq = profile.length;
  const lens = [0];
  for (let i = 1; i < np; i++) lens.push(lens[i - 1] + path[i].p.distanceTo(path[i - 1].p));
  const total = lens[np - 1] + (closed ? path[np - 1].p.distanceTo(path[0].p) : 0);
  const plen = [0];
  for (let j = 1; j < nq; j++) plen.push(plen[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));
  const ptot = plen[nq - 1] || 1;
  const ring = closed ? np + 1 : np;
  for (let i = 0; i < ring; i++) {
    const k = i % np; const P = path[k];
    const u = i === np ? total : lens[k];
    for (let j = 0; j < nq; j++) {
      const [o, y] = profile[j];
      pos.push(P.p.x + P.n.x * o, y, P.p.z + P.n.z * o);
      uv.push(u, plen[j] / ptot);
    }
  }
  for (let i = 0; i < ring - 1; i++) for (let j = 0; j < nq - 1; j++) {
    const a = i * nq + j, b = (i + 1) * nq + j;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function ellipsePath(rx, rz, n = 256, cx = 0, cz = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const p = new THREE.Vector3(cx + Math.cos(a) * rx, 0, cz + Math.sin(a) * rz);
    const nn = new THREE.Vector3(Math.cos(a) / rx, 0, Math.sin(a) / rz).normalize();
    out.push({ p, n: nn });
  }
  return out;
}

// Rounded rectangle path (counter-clockwise seen from above), outward normals
export function roundRectPath(x0, x1, z0, z1, r, nArc = 8) {
  const out = [];
  const corners = [[x1 - r, z1 - r, 0], [x0 + r, z1 - r, Math.PI / 2], [x0 + r, z0 + r, Math.PI], [x1 - r, z0 + r, Math.PI * 1.5]];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= nArc; i++) {
      const a = a0 + i / nArc * Math.PI / 2;
      out.push({ p: new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r), n: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) });
    }
  }
  return out;
}

// Merge static meshes under `root` by material (cuts draw calls). Kept objects (and their subtrees) stay untouched.
export function mergeStatic(root, keep = []) {
  const keepSet = new Set(keep.filter(Boolean));
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const remove = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o === root) return;
    let a = o; while (a && a !== root) { if (keepSet.has(a) || a.userData.pickId || a.userData.dynamic) return; a = a.parent; }
    if (Array.isArray(o.material) || o.material.transparent || o.material.blending !== THREE.NormalBlending || !o.visible || o.renderOrder) return;
    const g0 = o.geometry;
    if (g0.morphAttributes && Object.keys(g0.morphAttributes).length) return;
    const g = g0.index ? g0.toNonIndexed() : g0.clone();
    const keepColor = !!o.material.vertexColors;
    for (const name of Object.keys(g.attributes)) if (!(name === 'position' || name === 'normal' || name === 'uv' || (keepColor && name === 'color'))) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (keepColor && !g.attributes.color) return;
    g.clearGroups();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const key = o.material.uuid + '|' + o.castShadow + o.receiveShadow + '|' + o.layers.mask + '|' + keepColor;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [], cast: o.castShadow, recv: o.receiveShadow, mask: o.layers.mask });
    buckets.get(key).geos.push(g); remove.push(o);
  });
  remove.forEach(o => o.parent && o.parent.remove(o));
  let n = 0;
  for (const b of buckets.values()) {
    const mg = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos);
    if (!mg) continue;
    mg.computeBoundingSphere();
    const m = new THREE.Mesh(mg, b.mat); m.castShadow = b.cast; m.receiveShadow = b.recv; m.layers.mask = b.mask; m.userData.merged = true;
    root.add(m); n++;
  }
  return { removed: remove.length, added: n };
}
