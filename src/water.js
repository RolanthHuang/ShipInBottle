import * as THREE from 'three';
import { B, U, GLSL_UTIL, LAYER, innerR, clamp, patchMaterial } from './common.js';

const G_EFF = 1.7;
const WAVES = [
  { dir: [1, 0.12], lambda: 0.95, a: 1.0 },
  { dir: [0.86, -0.5], lambda: 0.61, a: 0.62 },
  { dir: [0.62, 0.78], lambda: 0.42, a: 0.42 },
  { dir: [0.97, -0.22], lambda: 0.28, a: 0.28 },
  { dir: [0.25, 0.97], lambda: 0.19, a: 0.18 },
];

export class Sea {
  constructor() {
    this.uWaves = WAVES.map(() => new THREE.Vector4());
    this.uRip = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -100, 0));
    this.ripIdx = 0;
    this.k = WAVES.map(w => 2 * Math.PI / w.lambda);
    this.w = this.k.map(k => Math.sqrt(G_EFF * k));
    this.amp = 0.016; this.ampTarget = 0.016; this.chop = 0;
    this.n = new THREE.Vector3(0, 1, 0);
    this.vx = 0; this.vz = 0;
    this.uN = new THREE.Vector3(0, 1, 0);
    this.time = 0;
    this.updateUniformArrays();
  }
  setWind(level) { this.ampTarget = [0.006, 0.016, 0.03, 0.05][level]; }
  updateUniformArrays() {
    const A = this.amp + this.chop;
    WAVES.forEach((wv, i) => {
      const l = Math.hypot(wv.dir[0], wv.dir[1]);
      const k = this.k[i];
      this.uWaves[i].set(wv.dir[0] / l * k, wv.dir[1] / l * k, this.w[i], A * wv.a);
    });
  }
  addRipple(x, z, amp = 0.02) {
    const r = this.uRip[this.ripIdx]; this.ripIdx = (this.ripIdx + 1) % 8;
    r.set(x, z, this.time, amp);
  }
  waves(x, z, t = this.time) {
    let h = 0;
    for (let i = 0; i < 5; i++) {
      const w = this.uWaves[i];
      h += w.w * Math.sin(w.x * x + w.y * z - w.z * t + i * 1.7);
    }
    for (let j = 0; j < 8; j++) {
      const r = this.uRip[j]; const age = t - r.z; if (age < 0 || age > 4) continue;
      const d = Math.hypot(x - r.x, z - r.y); const xx = d - age * 0.55;
      const env = Math.exp(-xx * xx * 90) * Math.exp(-age * 1.1) * r.w / (1 + d * 4);
      h += env * Math.sin(38 * xx);
    }
    return h;
  }
  base(x, z) { const n = this.uN; return (B.level - n.x * (x - B.cx) - n.z * z) / n.y; }
  height(x, z) { return this.base(x, z) + this.waves(x, z); }
  update(dt, invQ, acc) {
    this.time += dt;
    this.amp += (this.ampTarget - this.amp) * Math.min(1, dt * 0.8);
    const g = 7.0;
    const tg = new THREE.Vector3(acc.x, g + acc.y, acc.z).normalize().applyQuaternion(invQ);
    const wx = 2.3, wz = 4.0, zeta = 0.075;
    const ax = -wx * wx * (this.n.x - tg.x) - 2 * zeta * wx * this.vx;
    const az = -wz * wz * (this.n.z - tg.z) - 2 * zeta * wz * this.vz;
    this.vx += ax * dt; this.vz += az * dt;
    this.n.x = clamp(this.n.x + this.vx * dt, -0.6, 0.6);
    this.n.z = clamp(this.n.z + this.vz * dt, -0.75, 0.75);
    this.n.y = Math.sqrt(Math.max(0.2, 1 - this.n.x * this.n.x - this.n.z * this.n.z));
    this.uN.copy(this.n).normalize();
    const e = Math.abs(this.vx) + Math.abs(this.vz);
    this.chop += (Math.min(0.03, e * 0.03) - this.chop) * Math.min(1, dt * 2.0);
    this.slopeEnergy = e;
    this.updateUniformArrays();
  }
}

export const WAVE_GLSL = /* glsl */`
uniform vec4 uWaves[5];
uniform vec4 uRip[8];
uniform float uSeaT;
uniform vec3 uN;
uniform float uLevel;
uniform float uCx;
float baseY(vec2 p){ return (uLevel - uN.x*(p.x-uCx) - uN.z*p.y) / uN.y; }
float wavesH(vec2 p, out vec2 g, out float crest){
  float h = 0.; g = vec2(0.); crest = 0.;
  for(int i=0;i<5;i++){
    vec4 w = uWaves[i];
    float ph = dot(w.xy, p) - w.z*uSeaT + float(i)*1.7;
    float s = sin(ph), c = cos(ph);
    h += w.w*s; g += w.w*c*w.xy;
    crest += w.w*s;
  }
  for(int j=0;j<8;j++){
    vec4 r = uRip[j]; float age = uSeaT - r.z;
    if(age < 0. || age > 4.) continue;
    vec2 dv = p - r.xy; float d = length(dv); float x = d - age*0.55;
    float env = exp(-x*x*90.)*exp(-age*1.1)*r.w/(1.+d*4.);
    h += env*sin(38.*x);
    g += (dv/max(d,1e-4))*env*38.*cos(38.*x);
    crest += env*1.5;
  }
  return h;
}
float surfAt(vec2 p){ vec2 g; float c; return baseY(p) + wavesH(p, g, c); }
`;

export function seaUniforms(sea) {
  return {
    uWaves: { value: sea.uWaves },
    uRip: { value: sea.uRip },
    uSeaT: { value: 0 },
    uN: { value: sea.uN },
    uLevel: { value: B.level },
    uCx: { value: B.cx },
    uAmp: { value: 0.02 },
  };
}

const WATER_VERT = /* glsl */`
${WAVE_GLSL}
uniform float uSide;
uniform float uAmp;
varying vec3 vLP; varying vec3 vWP; varying vec3 vViewPos; varying vec3 vNL; varying float vCrest;
void main(){
  vec3 lp = position;
  vNL = normal;
  if(uSide < 0.5){
    vec2 g; float cr;
    float h = wavesH(lp.xz, g, cr);
    vec2 disp = vec2(0.);
    for(int i=0;i<4;i++){ vec4 w=uWaves[i]; float ph = dot(w.xy, lp.xz) - w.z*uSeaT + float(i)*1.7; disp -= normalize(w.xy)*w.w*0.55*cos(ph); }
    lp.xz += disp;
    lp.y = baseY(position.xz) + h;
    vCrest = cr / max(uAmp*2.2, 1e-4);
  } else { vCrest = 0.; }
  vLP = lp;
  vec4 wp = modelMatrix * vec4(lp, 1.0);
  vWP = wp.xyz;
  vec4 vp = viewMatrix * wp; vViewPos = vp.xyz;
  gl_Position = projectionMatrix * vp;
}`;

const WATER_FRAG = /* glsl */`
${WAVE_GLSL}
${GLSL_UTIL}
uniform float uSide;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar;
uniform samplerCube tEnv; uniform float uEnvI;
uniform vec3 uCamL; uniform mat3 uBotRot; uniform mat4 uProjView;
uniform vec3 uLampPos; uniform vec3 uLampCol; uniform vec3 uMoonDir; uniform vec3 uMoonCol;
uniform vec3 uDeep; uniform vec3 uAmbW; uniform float uNight; uniform float uFlash; uniform float uTime; uniform float uAmp;
uniform vec3 uBeamDir; uniform float uBeamI; uniform vec3 uBeamPos; uniform float uSSR;
varying vec3 vLP; varying vec3 vWP; varying vec3 vViewPos; varying vec3 vNL; varying float vCrest;
float linD(float d){ float z = d*2.-1.; return 2.*uNear*uFar/(uFar+uNear - z*(uFar-uNear)); }
float cylExit(vec3 o, vec3 d, float R){
  float a = d.y*d.y + d.z*d.z; if(a < 1e-5) return 10.;
  float b = 2.*(o.y*d.y + o.z*d.z); float c = o.y*o.y + o.z*o.z - R*R;
  float disc = b*b - 4.*a*c; if(disc < 0.) return 0.;
  return max((-b + sqrt(disc))/(2.*a), 0.);
}
vec3 ssr(vec3 P, vec3 R, out float hit){
  hit = 0.;
  vec3 col = vec3(0.);
  float t = 0.02;
  vec2 uvH = vec2(0.);
  for(int i=0;i<14;i++){
    vec3 Q = P + R*t;
    vec4 c = uProjView * vec4(Q, 1.0);
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if(uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) break;
    float zq = c.w;
    float zs = linD(texture2D(tDepth, uv).r);
    if(zq > zs && zq - zs < 0.12 + t*0.25){ hit = 1.; uvH = uv; break; }
    t *= 1.32;
  }
  if(hit > 0.5){
    col = texture2D(tColor, uvH).rgb;
    vec2 e = min(uvH, 1.-uvH); hit *= ss(0.0, 0.08, min(e.x, e.y));
  }
  return col;
}
void main(){
  vec3 lp = vLP;
  float rr = innerR(lp.x);
  if(lp.x < -2.0 || lp.x > 2.25) discard;
  float radial = length(lp.yz);
  vec2 g; float cr;
  float wh = wavesH(lp.xz, g, cr);
  float sy = baseY(lp.xz) + wh;
  if(uSide < 0.5){ if(radial > rr) discard; }
  else { if(lp.y > sy) discard; }

  vec3 nL;
  if(uSide < 0.5){
    vec2 slope = vec2(-uN.x/uN.y, -uN.z/uN.y) + g;
    vec2 q = lp.xz*34.;
    float t = uTime;
    vec2 mr = vec2(sin(q.x+t*2.1+sin(q.y*.7)), cos(q.y*1.1-t*1.7+sin(q.x*.6)))*0.022*(0.4+uAmp*20.);
    slope += mr;
    nL = normalize(vec3(-slope.x, 1., -slope.y));
  } else {
    nL = normalize(vNL);
  }
  vec3 N = normalize(uBotRot * nL);
  vec3 V = normalize(cameraPosition - vWP);
  bool fromBelow = false;
  if(dot(N,V) < 0. && uSide < 0.5){ N = -N; fromBelow = true; }

  vec2 suv = gl_FragCoord.xy / uRes;
  float zMe = linD(gl_FragCoord.z);
  float rayScale = length(vViewPos) / max(-vViewPos.z, 1e-3);
  float zS0 = linD(texture2D(tDepth, suv).r);
  float tScene0 = max(zS0 - zMe, 0.) * rayScale;

  vec3 rd = normalize(lp - uCamL);
  float tCyl = cylExit(lp, rd, rr);
  float tG = tCyl;
  float tSurf = 1e9;
  if(uSide > 0.5 && rd.y > 1e-3){
    float ts = (sy - lp.y)/rd.y;
    vec3 ph = lp + rd*max(ts, 0.);
    ts = (surfAt(ph.xz) - lp.y)/rd.y;
    tSurf = max(ts, 0.);
    tG = min(tG, tSurf);
  }

  vec3 nV = (viewMatrix * vec4(N,0.)).xyz;
  float refrK = uSide < 0.5 ? 0.045 : 0.012;
  vec2 off = nV.xy * refrK * ss(0.0, 0.12, min(tScene0, tG));
  float zS = linD(texture2D(tDepth, suv + off).r);
  if(zS < zMe) { off = vec2(0.); zS = zS0; }
  float tScene = max(zS - zMe, 0.) * rayScale;
  float thick = min(tScene, tG);

  vec3 below = texture2D(tColor, suv + off).rgb;
  vec3 sigma = vec3(2.4, 0.78, 0.52);
  // looking up at the underside of the surface through the side of the bottle
  if(uSide > 0.5 && tSurf < tCyl && tSurf < tScene){
    vec3 ph = lp + rd*tSurf;
    vec2 g2; float c2; wavesH(ph.xz, g2, c2);
    vec3 ns = normalize(vec3(-(g2.x - uN.x/uN.y), 1., -(g2.y - uN.z/uN.y)));
    float cosI = clamp(dot(rd, ns), 0., 1.);
    float sinI = sqrt(1. - cosI*cosI);
    float tir = ss(0.68, 0.76, sinI);
    vec3 wN = normalize(uBotRot * ns);
    vec3 wRd = normalize(uBotRot * rd);
    vec3 skyC = textureCube(tEnv, refract(wRd, -wN, 1.33)).rgb * uEnvI;
    float rip = 0.5 + 0.5*sin(dot(g2, vec2(40., 30.)) + uTime*2.);
    vec3 mirror = uDeep*uAmbW*1.6 + uAmbW*0.12*rip + uLampCol*0.04*rip;
    below = mix(skyC*0.8, mirror, tir);
    thick = tSurf;
  }
  vec3 T = exp(-sigma * thick);
  vec3 inscat = uDeep * uAmbW * (1. - exp(-thick*1.4));
  vec3 col = below * T + inscat;

  float NdV = clamp(dot(N, V), 0., 1.);
  float F = uSide < 0.5 ? (0.02 + 0.98*pow(1.-NdV, 5.)) : 0.0;
  vec3 R = reflect(-V, N);
  vec3 refl = textureCube(tEnv, R).rgb * uEnvI;
  if(uSide < 0.5 && !fromBelow && uSSR > 0.5){
    vec2 slope0 = vec2(-uN.x/uN.y, -uN.z/uN.y) + g;
    vec3 N0 = normalize(uBotRot * normalize(vec3(-slope0.x, 1., -slope0.y)));
    vec3 R0 = reflect(-V, N0);
    float hit; vec3 sr = ssr(vWP, R0, hit);
    refl = mix(refl, sr, hit * 0.75);
  }
  if(fromBelow){
    // total internal reflection from below
    float sinI = sqrt(1. - NdV*NdV);
    F = ss(0.68, 0.76, sinI);
    refl = uDeep*uAmbW*1.5;
  }
  col = mix(col, refl, F);

  vec3 L = normalize(uLampPos - vWP); vec3 H = normalize(L + V);
  float sp = pow(max(dot(N,H),0.), 420.) * 6. + pow(max(dot(N,H),0.), 60.)*0.12;
  vec3 Hm = normalize(uMoonDir + V);
  float spm = pow(max(dot(N,Hm),0.), 700.) * 2.2;
  vec3 Hb = normalize(normalize(uBeamPos - vWP) + V);
  float spb = pow(max(dot(N,Hb),0.), 200.) * uBeamI * 2.0 * max(dot(normalize(vWP - uBeamPos), uBeamDir), 0.);
  if(uSide < 0.5 && !fromBelow) col += uLampCol*sp + uMoonCol*spm + vec3(1.,.85,.6)*spb;

  float foam = 0.; float cfoam = 0.;
  if(uSide < 0.5){
    float inter = 1. - ss(0.0, 0.034, tScene0);
    float men = 1. - ss(0.0, 0.02, rr - radial);
    float crest = ss(0.8, 1.15, vCrest) * ss(0.012, 0.04, uAmp);
    float fn = fbm2(lp.xz*38. + vec2(uTime*0.6, -uTime*0.4));
    foam = clamp(inter*1.1 + men*0.6 + crest, 0., 1.) * ss(0.38, 0.66, fn + 0.25*inter);
    // contact foam (hull, shore, pilings) is white water: let it catch the lamp like the sails do
    cfoam = inter * ss(0.3, 0.62, fn + 0.3*inter);
  } else {
    float line = 1. - ss(0.0, 0.012, sy - lp.y);
    col += uAmbW * line * 0.35;
    float rays = ss(0.55, 1.0, vnoise(vec2(lp.x*7. + lp.z*3. + uTime*0.15, 0.))) * exp(-(sy-lp.y)*5.) * 0.08;
    col += uAmbW * rays;
  }
  vec3 foamCol = (uAmbW*0.9 + uLampCol*0.06) * 1.2;
  col = mix(col, foamCol, foam*0.85);
  vec3 Lf = normalize(uLampPos - vWP);
  col += uLampCol * cfoam * 0.42 * (0.3 + 0.7*max(dot(N, Lf), 0.));
  col += vec3(0.15, 0.7, 1.0) * foam * uNight * 0.35;
  col += vec3(0.7, 0.75, 1.0) * uFlash * 0.25;
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeWater(sea, shared, res = [300, 140]) {
  const group = new THREE.Group();
  const su = seaUniforms(sea);
  const common = { ...su, ...shared, uTime: U.time, uNight: U.night, uFlash: U.flash };
  const geo = new THREE.PlaneGeometry(4.3, 2.0, res[0], res[1]);
  geo.rotateX(-Math.PI / 2);
  const surfMat = new THREE.ShaderMaterial({
    uniforms: { ...common, uSide: { value: 0 } },
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    side: THREE.DoubleSide,
  });
  const surf = new THREE.Mesh(geo, surfMat);
  surf.frustumCulled = false;
  surf.layers.set(LAYER.WATER);
  group.add(surf);
  const pts = [];
  for (let i = 0; i <= 80; i++) { const x = -2.0 + i / 80 * 4.1; pts.push(new THREE.Vector2(innerR(x) - 0.004, x)); }
  const lg = new THREE.LatheGeometry(pts, 96);
  lg.rotateZ(-Math.PI / 2);
  const volMat = new THREE.ShaderMaterial({
    uniforms: { ...common, uSide: { value: 1 } },
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    side: THREE.FrontSide,
  });
  const vol = new THREE.Mesh(lg, volMat);
  vol.layers.set(LAYER.WATER);
  group.add(vol);
  const cap = new THREE.CircleGeometry(0.961, 64);
  cap.rotateY(-Math.PI / 2); cap.translate(-1.999, 0, 0);
  const capM = new THREE.Mesh(cap, volMat); capM.layers.set(LAYER.WATER); group.add(capM);
  group.userData.mats = [surfMat, volMat];
  group.userData.surf = surf;
  return group;
}

// A wave-following waterline for floating hulls: the fragment is moved into bottle space and compared
// with the same sea surface the water shader draws. Below it the hull is cooler and dimmer (the light
// reached it through water); just above it is wet; at the contact there is a thin, broken foam line.
export function addWaterline(mat, waterUniforms, w2b, { tint = [0.6, 0.76, 0.8], foam = 0.6 } = {}) {
  const t = tint.map(v => v.toFixed(3)).join(', ');
  return patchMaterial(mat, 'wline' + foam, (sh) => {
    for (const k of ['uWaves', 'uRip', 'uSeaT', 'uN', 'uLevel', 'uCx']) sh.uniforms[k] = waterUniforms[k];
    sh.uniforms.uW2B = w2b; sh.uniforms.uWLT = U.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWLw;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWLw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWLw; uniform mat4 uW2B; uniform float uWLT;\n' + WAVE_GLSL +
        '\nfloat ssWL(float a, float b, float x){ float q = clamp((x - a) / (b - a), 0.0, 1.0); return q * q * (3.0 - 2.0 * q); }\n')
      .replace('#include <opaque_fragment>', `
        vec3 pWL = (uW2B * vec4(vWLw, 1.0)).xyz;
        float dWL = pWL.y - surfAt(pWL.xz);
        float subWL = 1.0 - ssWL(-0.005, 0.001, dWL);
        outgoingLight *= mix(vec3(1.0), vec3(${t}), subWL);
        float wetWL = (1.0 - ssWL(0.0, 0.016, dWL)) * (1.0 - subWL);
        outgoingLight *= 1.0 - 0.32 * wetWL;
        float nWL = ssWL(0.15, 0.85, 0.5 + 0.5 * sin(pWL.x * 83.0 + uWLT * 2.9) * sin(pWL.z * 61.0 + pWL.x * 29.0 - uWLT * 1.7));
        float lineWL = exp(-dWL * dWL / (0.0019 * 0.0019)) * (0.35 + 0.65 * nWL);
        float albWL = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.05);
        outgoingLight = mix(outgoingLight, outgoingLight / albWL * 0.6, clamp(lineWL, 0.0, 1.0) * ${foam.toFixed(2)});
        #include <opaque_fragment>`);
  });
}
