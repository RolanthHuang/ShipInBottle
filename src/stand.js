import * as THREE from 'three';
import { D, sweep, ellipsePath } from './common.js';
import { toTex, plaqueCanvases, ropeCanvas } from './textures.js';
import { rep } from './assets.js';

export const STAND = { cx: 0.15, rx: 2.95, rz: 1.42, top: 0.345 };

export function makeStand(plaqueLines, tex) {
  const g = new THREE.Group();
  const { cx, rx, rz } = STAND;
  const woodMap = rep(tex.stand, 1.2, 1.0), woodN = rep(tex.stand_n, 1.2, 1.0);
  const wood = new THREE.MeshPhysicalMaterial({ map: woodMap, normalMap: woodN, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.22 });
  const woodSide = wood.clone(); woodSide.map = rep(tex.stand, 0.12, 1.0, Math.PI / 2); woodSide.normalMap = rep(tex.stand_n, 0.12, 1.0, Math.PI / 2);
  // molding profile [outward offset, y]
  const prof = [];
  const P = (o, y) => prof.push([o, y]);
  P(-0.001, STAND.top);
  for (let i = 0; i <= 8; i++) { const a = Math.PI / 2 - i / 8 * Math.PI / 2; P(Math.cos(a) * 0.045, 0.30 + Math.sin(a) * 0.045); }
  P(0.045, 0.287); P(0.03, 0.285); P(0.03, 0.105); P(0.05, 0.1);
  for (let i = 1; i <= 10; i++) { const t = i / 10; const s = t * t * (3 - 2 * t); P(0.05 + 0.08 * t, 0.1 - 0.065 * s + 0.012 * Math.sin(t * Math.PI)); }
  P(0.13, 0.0); P(0.0, 0.0);
  const path = ellipsePath(rx, rz, 320, cx, 0);
  const rim = new THREE.Mesh(sweep(path, prof), woodSide);
  rim.position.y = D; rim.castShadow = true; rim.receiveShadow = true; g.add(rim);
  // top face
  const sh = new THREE.Shape(); sh.absellipse(cx, 0, rx, rz, 0, Math.PI * 2, false, 0);
  const topGeo = new THREE.ShapeGeometry(sh, 96); topGeo.rotateX(-Math.PI / 2);
  const tp = topGeo.attributes.position, tuv = topGeo.attributes.uv;
  for (let i = 0; i < tp.count; i++) tuv.setXY(i, (tp.getX(i) - cx + rx) / (2 * rx), (tp.getZ(i) + rz) / (2 * rz) * 0.5);
  const top = new THREE.Mesh(topGeo, wood); top.position.y = D + STAND.top; top.receiveShadow = true; g.add(top);
  // rope trim in the cove under the bead
  const ropeTex = toTex(ropeCanvas(), { rep: [260, 1] });
  const ropePath = ellipsePath(rx + 0.052, rz + 0.052, 400, cx, 0).map(p => new THREE.Vector3(p.p.x, D + 0.265, p.p.z));
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePath, true), 800, 0.026, 10, true), new THREE.MeshStandardMaterial({ map: ropeTex, bumpMap: ropeTex, bumpScale: 2.5, roughness: 0.95 }));
  rope.castShadow = true; g.add(rope);
  // cradles
  const yTop = STAND.top;
  const axisH = -D - yTop; // bottle axis height above stand top
  const cradleShape = () => {
    const s = new THREE.Shape();
    const rr = 1.006, aEnd = 0.73;
    const tipZ = Math.sin(aEnd) * rr, tipY = axisH - Math.cos(aEnd) * rr;
    s.moveTo(-0.62, 0); s.lineTo(0.62, 0); s.lineTo(0.62, 0.05); s.quadraticCurveTo(0.6, 0.075, 0.55, 0.08);
    s.bezierCurveTo(0.48, 0.2, 0.62, tipY - 0.12, tipZ + 0.03, tipY - 0.01);
    s.quadraticCurveTo(tipZ + 0.035, tipY + 0.03, tipZ - 0.005, tipY + 0.02);
    const n = 40;
    for (let i = 0; i <= n; i++) { const a = aEnd - i / n * aEnd * 2; s.lineTo(Math.sin(a) * rr, axisH - Math.cos(a) * rr); }
    s.quadraticCurveTo(-tipZ - 0.035, tipY + 0.03, -tipZ - 0.03, tipY - 0.01);
    s.bezierCurveTo(-0.62, tipY - 0.12, -0.48, 0.2, -0.55, 0.08);
    s.quadraticCurveTo(-0.6, 0.075, -0.62, 0.05); s.lineTo(-0.62, 0);
    return s;
  };
  const felts = [];
  [-1.25, 1.05].forEach(x => {
    const geo = new THREE.ExtrudeGeometry(cradleShape(), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.014, bevelSegments: 3, curveSegments: 24 });
    geo.translate(0, 0, -0.05); geo.rotateY(Math.PI / 2);
    const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) * 0.5 + 0.5, p.getY(i) * 0.5);
    const m = new THREE.Mesh(geo, wood); m.position.set(x, D + yTop, 0); m.castShadow = true; m.receiveShadow = true; g.add(m);
    const felt = new THREE.Mesh(new THREE.CylinderGeometry(1.004, 1.004, 0.124, 64, 1, true, -Math.PI / 2 - 0.72, 1.44), new THREE.MeshStandardMaterial({ color: 0x1f3322, roughness: 1, side: THREE.DoubleSide }));
    felt.rotation.z = Math.PI / 2; felt.position.set(x, 0, 0); g.add(felt); felts.push(felt);
  });
  // plaque bent onto the front band
  const pw = 1.7, ph = 0.15;
  const pgeo = new THREE.BoxGeometry(pw, ph, 0.012, 48, 1, 1);
  const pp = pgeo.attributes.position;
  const bx = rx + 0.03;
  for (let i = 0; i < pp.count; i++) { const x = pp.getX(i); const z = (rz + 0.03) * Math.sqrt(Math.max(0, 1 - (x / bx) ** 2)) + 0.008 + pp.getZ(i); pp.setZ(i, z); }
  pgeo.computeVertexNormals();
  const { col, bump } = plaqueCanvases(plaqueLines[0], plaqueLines[1]);
  const pcol = toTex(col, { wrap: false }), pbump = toTex(bump, { wrap: false, srgb: false });
  const plaqueMat = new THREE.MeshPhysicalMaterial({ map: pcol, bumpMap: pbump, bumpScale: 3, metalness: 0.85, roughness: 0.33, roughnessMap: tex.brass_orm, clearcoat: 0.3, clearcoatRoughness: 0.35, emissive: 0x5a3e18, emissiveMap: pcol, emissiveIntensity: 0.35 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x8a6428, metalness: 1, roughness: 0.4 });
  const plaque = new THREE.Mesh(pgeo, [sideMat, sideMat, sideMat, sideMat, plaqueMat, sideMat]);
  plaque.position.set(cx, D + 0.195, 0); plaque.castShadow = true; g.add(plaque);
  plaque.userData = { mat: plaqueMat, pcol, pbump };
  g.userData = { plaque, topY: D + yTop, wood, felts };
  return g;
}

export function updatePlaque(plaque, lines) {
  const { col, bump } = plaqueCanvases(lines[0], lines[1]);
  const u = plaque.userData;
  u.pcol.image = col; u.pcol.needsUpdate = true; u.pbump.image = bump; u.pbump.needsUpdate = true;
}
