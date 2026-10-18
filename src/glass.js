import * as THREE from 'three';
import { LAYER, U, GLSL_UTIL, outerR, innerR, makeNoise } from './common.js';
import { tagCanvas, sealCanvas, toTex } from './textures.js';
import { rep } from './assets.js';

export const BOTTLE_X0 = -2.25, BOTTLE_X1 = 2.71;

function profileOuter() {
  const p = [];
  [[0.0, -2.02], [0.12, -2.03], [0.26, -2.07], [0.40, -2.135], [0.52, -2.19], [0.64, -2.23], [0.76, -2.25]].forEach(([r, a]) => p.push(new THREE.Vector2(r, a)));
  for (let i = 1; i <= 10; i++) { const ang = -Math.PI / 2 + i / 10 * Math.PI / 2; p.push(new THREE.Vector2(0.8 + 0.2 * Math.cos(ang), -2.05 + 0.2 * Math.sin(ang))); }
  for (let i = 1; i <= 70; i++) { const x = -2.05 + i / 70 * (2.52 + 2.05); p.push(new THREE.Vector2(outerR(x), x)); }
  [[0.372, 2.53], [0.398, 2.548], [0.412, 2.575], [0.416, 2.61], [0.414, 2.645], [0.405, 2.672], [0.392, 2.69], [0.372, 2.703], [0.345, 2.71], [0.312, 2.706]].forEach(([r, a]) => p.push(new THREE.Vector2(r, a)));
  return p;
}
function profileInner() {
  const p = [];
  [[0.0, -1.955], [0.14, -1.965], [0.3, -2.0], [0.46, -2.065], [0.6, -2.115], [0.72, -2.15]].forEach(([r, a]) => p.push(new THREE.Vector2(r, a)));
  for (let i = 1; i <= 10; i++) { const ang = -Math.PI / 2 + i / 10 * Math.PI / 2; p.push(new THREE.Vector2(0.785 + 0.18 * Math.cos(ang), -1.98 + 0.18 * Math.sin(ang))); }
  for (let i = 1; i <= 70; i++) { const x = -1.98 + i / 70 * (2.69 + 1.98); p.push(new THREE.Vector2(innerR(x), x)); }
  return p;
}

const GLASS_VERT = /* glsl */`
varying vec3 vWP; varying vec3 vWN; varying vec3 vLP; varying vec3 vViewPos; varying vec3 vLN; varying vec3 vM0; varying vec3 vM1; varying vec3 vM2;
void main(){
  vec4 wp = modelMatrix * vec4(position,1.);
  vWP = wp.xyz; vWN = normalize(mat3(modelMatrix) * normal); vLP = position; vLN = normal; vM0 = mat3(modelMatrix)[0]; vM1 = mat3(modelMatrix)[1]; vM2 = mat3(modelMatrix)[2];
  vec4 vp = viewMatrix * wp; vViewPos = vp.xyz;
  gl_Position = projectionMatrix * vp;
}`;

const GLASS_FRAG = /* glsl */`
${GLSL_UTIL}
uniform sampler2D tScene; uniform vec2 uRes; uniform samplerCube tEnv; uniform float uEnvI;
uniform sampler2D tWear;
uniform float uTime; uniform float uInner; uniform vec3 uLampPos; uniform vec3 uLampCol; uniform vec3 uMoonDir; uniform vec3 uMoonCol;
uniform float uFlash; uniform float uWet; uniform float uLevelY; uniform vec3 uBeamPos; uniform vec3 uBeamDir; uniform float uBeamI;
uniform vec3 uTint; uniform vec3 uWinC; uniform vec2 uWinS; uniform float uWinZ; uniform vec3 uWinCol;
uniform vec3 uFirePos; uniform vec3 uFireCol; uniform vec3 uCandlePos; uniform vec3 uCandleCol;
uniform float uX0; uniform float uX1;
varying vec3 vWP; varying vec3 vWN; varying vec3 vLP; varying vec3 vViewPos; varying vec3 vLN; varying vec3 vM0; varying vec3 vM1; varying vec3 vM2;
vec3 pointSpec(vec3 P, vec3 N, vec3 V, vec3 lp, vec3 lc, float sharp, float k){
  vec3 L = normalize(lp - P); vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.);
  return lc * (pow(nh, sharp) * k + pow(nh, sharp*0.12) * k * 0.012);
}
void main(){
  vec3 N = normalize(vWN);
  vec3 V = normalize(cameraPosition - vWP);
  float facing = dot(N,V) < 0. ? -1. : 1.;
  N *= facing;
  float ang = atan(vLP.z, -vLP.y);
  vec2 wuv = vec2((vLP.x - uX0) / (uX1 - uX0), ang / 6.28318 + 0.5);
  vec4 wear = texture2D(tWear, vec2(wuv.x, 1.0 - wuv.y));
  // emboss / seams: height gradient -> normal perturbation (outer surface only)
  if(uInner < 0.5){
    vec2 e = vec2(1.0/2048.0, 1.0/1024.0);
    float h0 = wear.a;
    float hu = texture2D(tWear, vec2(wuv.x + e.x, 1.0 - wuv.y)).a;
    float hv = texture2D(tWear, vec2(wuv.x, 1.0 - wuv.y - e.y)).a;
    mat3 MM = mat3(vM0, vM1, vM2);
    vec3 T = normalize(MM * vec3(1., 0., 0.));
    vec3 Bt = normalize(MM * vec3(0., sin(ang), cos(ang)));
    N = normalize(N - facing * ((hu - h0) * T + (hv - h0) * Bt) * 9.0);
  }
  vec2 wp = vec2(vLP.x*6.0, ang*3.0);
  vec3 wav = vec3(sin(wp.x*1.3 + wp.y*2.0)*0.6 + sin(wp.x*3.1 - wp.y*1.3 + 1.7)*0.4, sin(wp.y*2.7 + wp.x*0.7)*0.5, cos(wp.x*2.2 + wp.y*3.1)*0.5);
  vec3 Nw = normalize(N + 0.045*wav);
  float NdV = clamp(dot(N,V), 0., 1.);
  float edge = 1. - NdV;
  vec2 suv = gl_FragCoord.xy / uRes;

  float drop = 0.; vec2 dropOff = vec2(0.);
  if(uInner > 0.5){
    float above = ss(uLevelY + 0.08, uLevelY + 0.32, vLP.y) * ss(-2.0, -1.6, vLP.x) * (1. - ss(1.3, 1.7, vLP.x));
    vec2 dp = vec2(vLP.x*42., ang*42.);
    vec2 ci = floor(dp), cf = fract(dp);
    vec2 h = h22(ci);
    float hasD = step(1.0 - uWet, h.y);
    float r = mix(0.06, 0.26, h.x*h.x);
    vec2 cc = vec2(0.3 + 0.4*h.y, 0.3 + 0.4*h.x);
    float d = length((cf - cc) * vec2(1., 0.85));
    drop = (1. - ss(r*0.75, r, d)) * above * hasD;
    dropOff = (cf - cc) * drop * 0.06;
  }

  vec3 nv = (viewMatrix * vec4(Nw, 0.)).xyz;
  float k = 0.004 + 0.07*pow(edge, 2.0);
  vec2 off = nv.xy * k + dropOff;
  vec3 refr;
  refr.r = texture2D(tScene, suv - off*1.00).r;
  refr.g = texture2D(tScene, suv - off*1.05).g;
  refr.b = texture2D(tScene, suv - off*1.11).b;

  vec2 bp = vec2(vLP.x*9., ang*24.);
  vec2 bi = floor(bp), bf = fract(bp); vec2 bh = h22(bi + 7.3*uInner);
  float hasB = step(0.78, bh.y);
  float br = mix(0.05, 0.16, bh.x);
  float bd = length((bf - vec2(0.5)) * vec2(1.0, 2.6));
  float bubRim = hasB * ((1. - ss(br*0.6, br, bd)) - (1. - ss(br*0.2, br*0.6, bd)));
  float bubCore = hasB * (1. - ss(0., br*0.5, bd));

  vec3 thickTint = mix(vec3(1.), uTint, 0.45 + 0.55*ss(0.1, 0.9, edge));
  thickTint *= 1. - 0.45*pow(edge, 4.);
  float a = 0.15 + 0.85*ss(0.4, 0.985, edge);
  a = max(a, drop*0.55);

  float smudge = uInner < 0.5 ? wear.g : 0.0;
  float dust = uInner < 0.5 ? wear.b * max(N.y, 0.) : 0.0;
  float scr = uInner < 0.5 ? wear.r : 0.0;

  float F = 0.04 + 0.96*pow(1.-NdV, 5.);
  vec3 R = reflect(-V, Nw);
  vec3 env = textureCube(tEnv, R).rgb * uEnvI;
  vec3 envBlur = textureCubeLodEXT(tEnv, R, 5.0).rgb * uEnvI;
  env = mix(env, envBlur, smudge*0.8);
  vec3 refl = env * (F*1.6 + 0.05);

  vec3 spec = pointSpec(vWP, Nw, V, uLampPos, uLampCol, 1400., 45.) * (0.4 + F) * (1. - smudge*0.6);
  spec += pointSpec(vWP, Nw, V, uFirePos, uFireCol, 900., 12.) * (0.4 + F);
  spec += pointSpec(vWP, Nw, V, uCandlePos, uCandleCol, 1200., 20.) * (0.4 + F);
  vec3 Hm = normalize(uMoonDir + V); float nm = max(dot(Nw, Hm), 0.);
  spec += uMoonCol * (pow(nm, 900.)*20. + pow(nm, 90.)*0.25);
  vec3 Lb = normalize(uBeamPos - vWP);
  float beamHit = pow(abs(dot(-Lb, uBeamDir)), 900.) * uBeamI;
  spec += vec3(1., .86, .6) * beamHit * 0.4 * (0.25 + pow(max(dot(Nw, normalize(Lb + V)),0.), 30.)*3.);
  vec3 Rw = reflect(-V, Nw);
  if(Rw.z < -0.05){
    float tw = (uWinZ - vWP.z) / Rw.z; vec3 hw = vWP + Rw*tw;
    vec2 wq = (hw.xy - uWinC.xy) / uWinS;
    if(abs(wq.x) < 0.5 && abs(wq.y) < 0.5){
      vec2 pane = fract((wq + 0.5) * vec2(3.0, 4.0));
      float bars = ss(0.0, 0.05, pane.x) * ss(1.0, 0.95, pane.x) * ss(0.0, 0.05, pane.y) * ss(1.0, 0.95, pane.y);
      float frame = ss(0.5, 0.47, abs(wq.x)) * ss(0.5, 0.47, abs(wq.y));
      spec += uWinCol * bars * frame * (0.08 + 0.92*F) * (0.6 + 0.4*wq.y) * (1. - smudge*0.5);
    }
  }
  // scratches catch the lamp broadly
  vec3 Ls = normalize(uLampPos - vWP);
  spec += uLampCol * scr * pow(max(dot(Nw, normalize(Ls + V)), 0.), 18.) * 0.35;
  float fl = uFlash * (0.4 + 0.6*F);
  spec += vec3(0.75, 0.82, 1.0) * fl * 1.2;

  vec3 col = refr * thickTint * a + refl + spec;
  col += (env*0.6 + uLampCol*0.05) * bubRim * 0.6 + uLampCol * bubCore * 0.02;
  col += drop * (env*0.35 + uLampCol*pow(max(dot(Nw, normalize(Ls + V)),0.), 30.)*0.8);
  // smudge haze + dust (matte, lit by lamp)
  float lampDiff = max(dot(N, Ls), 0.);
  vec3 matte = uLampCol * lampDiff * 0.08 + env * 0.25 + uWinCol * 0.05;
  col += matte * (smudge * 0.12 + dust * 0.5);
  a = max(a, dust * 0.35 + smudge * 0.04);
  gl_FragColor = vec4(col, a);
}`;

export function makeBottle(shared, tex) {
  const group = new THREE.Group();
  const outerGeo = new THREE.LatheGeometry(profileOuter(), 192); outerGeo.rotateZ(-Math.PI / 2);
  const innerGeo = new THREE.LatheGeometry(profileInner(), 192); innerGeo.rotateZ(-Math.PI / 2);
  const mats = [];
  const wearTex = tex.glasswear; wearTex.wrapS = THREE.ClampToEdgeWrapping; wearTex.wrapT = THREE.RepeatWrapping;
  const mk = (inner, side, order, geo) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...shared, uInner: { value: inner }, uTime: U.time, uFlash: U.flash, tWear: { value: wearTex }, uX0: { value: BOTTLE_X0 }, uX1: { value: BOTTLE_X1 } },
      vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG,
      transparent: true, depthWrite: false, side,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = new THREE.Mesh(geo, m); mesh.renderOrder = order; mesh.layers.set(LAYER.GLASS); mesh.frustumCulled = false;
    mats.push(m); group.add(mesh); return mesh;
  };
  mk(0, THREE.BackSide, 1, outerGeo);
  mk(1, THREE.BackSide, 2, innerGeo);
  mk(1, THREE.FrontSide, 3, innerGeo);
  mk(0, THREE.FrontSide, 4, outerGeo);
  const pick = new THREE.Mesh(outerGeo, new THREE.MeshBasicMaterial({ visible: false }));
  pick.userData.isGlass = true;
  group.add(pick);
  group.userData.mats = mats;
  group.userData.pick = pick;
  return group;
}

// ---- Cork + sealing wax + twine + tag ----
export function makeStopper(tex) {
  const g = new THREE.Group();
  const corkMap = rep(tex.cork, 3, 1), corkN = rep(tex.cork_n, 3, 1);
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.296, 0.62, 64, 1), new THREE.MeshStandardMaterial({ map: corkMap, normalMap: corkN, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.92 }));
  cork.rotation.z = -Math.PI / 2; cork.position.x = 2.56;
  g.add(cork);
  const N = makeNoise(9);
  const pts = [];
  [[0.0, 2.872], [0.18, 2.871], [0.28, 2.866], [0.345, 2.856], [0.39, 2.838], [0.414, 2.81], [0.426, 2.77], [0.43, 2.71], [0.427, 2.65], [0.421, 2.6], [0.41, 2.56], [0.393, 2.53], [0.38, 2.5], [0.374, 2.47]].forEach(([r, a]) => pts.push(new THREE.Vector2(r, a)));
  const waxGeo = new THREE.LatheGeometry(pts, 96);
  const pa = waxGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const ang = Math.atan2(z, x);
    const r = Math.hypot(x, z);
    let dr = (N.fbm(ang * 2.2 + 3, y * 6, 3) - 0.5) * 0.022;
    const below = 0.35 + 0.65 * Math.max(0, Math.cos(ang));
    const drip = Math.pow(Math.max(0, Math.sin(ang * 6 + 1.3 + N.noise(ang * 3, 2) * 2)), 6) * (0.4 + 0.6 * N.noise(ang * 5 + 7, 1));
    if (y < 2.62) { const k = Math.min(1, (2.62 - y) / 0.12); dr += below * drip * 0.035 * k - (1 - drip) * 0.03 * k * k; }
    const s = (r + dr) / Math.max(r, 1e-4);
    pa.setXYZ(i, x * (r > 0.01 ? s : 1), y, z * (r > 0.01 ? s : 1));
  }
  waxGeo.computeVertexNormals();
  waxGeo.rotateZ(-Math.PI / 2);
  const waxMat = new THREE.MeshPhysicalMaterial({ color: 0x8e1a12, roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: new THREE.Color(0xff6040), side: THREE.DoubleSide });
  const wax = new THREE.Mesh(waxGeo, waxMat);
  g.add(wax);
  const stampTex = toTex(sealCanvas(), { srgb: false, wrap: false });
  const stamp = new THREE.Mesh(new THREE.CircleGeometry(0.19, 64), new THREE.MeshPhysicalMaterial({ color: 0x8e1a12, roughness: 0.32, clearcoat: 0.7, bumpMap: stampTex, bumpScale: 5 }));
  stamp.rotation.y = Math.PI / 2; stamp.position.x = 2.8735;
  g.add(stamp);
  const twineMat = new THREE.MeshStandardMaterial({ color: 0x8c7650, roughness: 1, map: rep(tex.leather, 6, 1) });
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.362, 0.0105, 8, 96), twineMat);
    t.rotation.y = Math.PI / 2; t.position.x = 2.3 + i * 0.022; g.add(t);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), twineMat); knot.position.set(2.33, -0.345, 0.12); g.add(knot);
  const tagPivot = new THREE.Group(); tagPivot.position.set(2.33, -0.35, 0.13); g.add(tagPivot);
  const strLen = 0.42;
  const strCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.012, -strLen * 0.5, 0.004), new THREE.Vector3(0.02, -strLen, 0.0)]);
  tagPivot.add(new THREE.Mesh(new THREE.TubeGeometry(strCurve, 12, 0.0035, 5), twineMat));
  const tagTex = toTex(tagCanvas(), { wrap: false });
  const tagGeo = new THREE.PlaneGeometry(0.4, 0.235, 10, 6);
  const tp = tagGeo.attributes.position; for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), y = tp.getY(i); tp.setZ(i, Math.sin(x * 6) * 0.008 + Math.sin(y * 9 + x * 3) * 0.003); } tagGeo.computeVertexNormals();
  const tag = new THREE.Mesh(tagGeo, new THREE.MeshStandardMaterial({ map: tagTex, roughness: 0.9, side: THREE.DoubleSide }));
  tag.position.set(0.19, -strLen - 0.02, 0.0); tag.rotation.z = -0.12;
  tagPivot.add(tag);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { cork, wax, stamp, tagPivot, corkBaseX: 2.56, waxParts: [wax, stamp] };
  return g;
}
