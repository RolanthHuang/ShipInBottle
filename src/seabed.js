import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { B, U, innerR, makeNoise, rng, addCaustics, addTriplanar, patchMaterial } from './common.js';
import { cv, toTex } from './textures.js';
import { rep } from './assets.js';

function fanCanvas(w = 256, h = 256) {
  const c = cv(w, h), ctx = c.getContext('2d');
  const R = rng(13);
  ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
  const branch = (x, y, a, len, wdt, depth) => {
    if (depth <= 0 || len < 4) return;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    ctx.lineWidth = wdt; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    branch(x2, y2, a - 0.35 - R() * 0.2, len * (0.72 + R() * 0.1), wdt * 0.75, depth - 1);
    branch(x2, y2, a + 0.35 + R() * 0.2, len * (0.72 + R() * 0.1), wdt * 0.75, depth - 1);
  };
  branch(w / 2, h, -Math.PI / 2, 60, 7, 8);
  ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const a = -Math.PI * (0.15 + R() * 0.7); const r = 60 + R() * 120; ctx.beginPath(); ctx.arc(w / 2, h, r, a - 0.08, a + 0.08); ctx.stroke(); }
  return c;
}

export function makeSeabed(tex) {
  const g = new THREE.Group();
  const N = makeNoise(4);
  const nx = 200, nz = 50;
  const pos = [], uv = [], idx = [], col = [];
  for (let i = 0; i <= nx; i++) {
    const x = -1.99 + i / nx * 3.95;
    const r = innerR(x) - 0.006;
    for (let j = 0; j <= nz; j++) {
      const s = j / nz * 2 - 1;
      const baseY = -0.8 + (N.fbm(x * 2.2, 3.1, 3) - 0.5) * 0.06;
      let y = Math.max(baseY, -r + 0.03);
      let zEdge = Math.sqrt(Math.max(0.0025, r * r - y * y));
      let z = s * zEdge;
      let dy = (N.fbm(x * 3.0 + 9, z * 3.0, 4) - 0.5) * 0.08 + Math.sin(x * 26 + N.noise(x * 4, z * 4) * 4) * 0.004;
      dy *= (1 - Math.pow(Math.abs(s), 4));
      let yy = y + dy;
      const rr = Math.hypot(yy, z); if (rr > r) { yy *= r / rr; z *= r / rr; }
      pos.push(x, yy, z); uv.push(x * 1.6, z * 1.6);
      const k = 0.88 + 0.2 * N.noise(x * 8, z * 8);
      col.push(k, k * 0.98, k * 0.94);
    }
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const a = i * (nz + 1) + j, b = a + nz + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const sand = new THREE.Mesh(geo, addCaustics(new THREE.MeshStandardMaterial({ map: rep(tex.sand, 1, 1), normalMap: rep(tex.sand_n, 1, 1), normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true, roughness: 0.95 }), 1.2));
  sand.receiveShadow = true; g.add(sand);

  const R = rng(17);
  const rockMat = addCaustics(addTriplanar(new THREE.MeshStandardMaterial({ color: 0x8a8278, roughness: 0.9 }), { map: tex.rock, normalMap: tex.rock_n, scale: 9 }), 1.0);
  const rockGeo = (rad, seed) => {
    const gg = new THREE.IcosahedronGeometry(rad, 6); const p = gg.attributes.position; const NN = makeNoise(seed);
    for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); const d = v.clone().normalize(); const n = NN.fbm(d.x * 3 + 3, d.y * 3 + d.z * 2.4, 4); v.copy(d).multiplyScalar(rad * (0.72 + 0.6 * n)); v.y *= 0.62; p.setXYZ(i, v.x, v.y, v.z); }
    gg.computeVertexNormals(); return gg;
  };
  const rocks = [[0.55, -0.38, 0.06], [0.75, 0.35, 0.05], [1.3, -0.2, 0.07], [1.45, 0.25, 0.05], [-0.7, 0.42, 0.045], [-0.2, -0.45, 0.05], [0.95, 0.05, 0.035], [0.3, 0.4, 0.03], [-0.45, -0.2, 0.028]];
  rocks.forEach(([x, z, r], i) => { const m = new THREE.Mesh(rockGeo(r, 100 + i), rockMat); m.position.set(x, -0.79, z); m.rotation.y = R() * 6; m.castShadow = m.receiveShadow = true; g.add(m); });

  // kelp ribbons
  const kelpMat = new THREE.MeshStandardMaterial({ color: 0x4a6b2c, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x0c1a06 });
  patchMaterial(kelpMat, 'kelp', (sh) => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float hh = position.y; float ph = instanceMatrix[3].x*7.0 + instanceMatrix[3].z*5.0;
        transformed.x += sin(uTime*1.3 + ph + hh*12.0) * hh * hh * 0.9;
        transformed.z += cos(uTime*1.1 + ph + hh*9.0) * hh * hh * 0.5;`);
  });
  const kelpGeo = new THREE.PlaneGeometry(0.022, 0.3, 2, 18); kelpGeo.translate(0, 0.15, 0);
  const kp = kelpGeo.attributes.position;
  for (let i = 0; i < kp.count; i++) { const y = kp.getY(i); const w = Math.sin(Math.min(1, y / 0.3) * Math.PI) * 0.8 + 0.3; kp.setX(i, kp.getX(i) * w + Math.sin(y * 30) * 0.004); kp.setZ(i, Math.sin(y * 60 + kp.getX(i) * 200) * 0.0025); }
  kelpGeo.computeVertexNormals();
  const kelpSpots = [[0.6, -0.33], [0.62, -0.3], [0.78, 0.31], [1.25, -0.16], [1.35, -0.25], [-0.65, 0.38], [-0.25, -0.4], [0.2, 0.42], [1.5, 0.2], [-0.1, 0.4], [-0.95, -0.35], [1.05, 0.38]];
  const kelp = new THREE.InstancedMesh(kelpGeo, addCaustics(kelpMat, 0.6), kelpSpots.length * 4);
  const m4 = new THREE.Matrix4(); let ki = 0;
  const kcols = [0x4a6b2c, 0x5a7a30, 0x3f5a28, 0x6a7a34];
  kelpSpots.forEach(([x, z]) => { for (let k = 0; k < 4; k++) { const s = 0.5 + R() * 0.8; m4.compose(new THREE.Vector3(x + (R() - 0.5) * 0.06, -0.8, z + (R() - 0.5) * 0.06), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R() * 3, 0)), new THREE.Vector3(1, s, 1)); kelp.setColorAt(ki, new THREE.Color(kcols[k])); kelp.setMatrixAt(ki++, m4); } });
  kelp.castShadow = true; g.add(kelp);
  // seagrass
  const blade = new THREE.PlaneGeometry(0.004, 0.08, 1, 6); blade.translate(0, 0.04, 0);
  const grassMat = kelpMat.clone(); grassMat.color.set(0x6a8a3a);
  patchMaterial(grassMat, 'kelp2', (sh) => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float hh = position.y; float ph = instanceMatrix[3].x*17.0 + instanceMatrix[3].z*13.0;
        transformed.x += sin(uTime*1.6 + ph) * hh * hh * 6.0;`);
  });
  const nG = 600; const sg = new THREE.InstancedMesh(blade, addCaustics(grassMat, 0.6), nG);
  for (let i = 0; i < nG; i++) {
    const cxz = [[-0.5, 0.25], [0.4, -0.25], [1.2, 0.1], [-0.2, -0.1]][i % 4];
    const x = cxz[0] + (R() - 0.5) * 0.35, z = cxz[1] + (R() - 0.5) * 0.25;
    const s = 0.5 + R();
    m4.compose(new THREE.Vector3(x, -0.805, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.4, R() * 6, (R() - 0.5) * 0.4)), new THREE.Vector3(1, s, 1)); sg.setMatrixAt(i, m4);
  }
  g.add(sg);
  // sea fans
  const fanTex = toTex(fanCanvas(), { wrap: false });
  const fanMat = addCaustics(new THREE.MeshStandardMaterial({ map: fanTex, alphaMap: fanTex, alphaTest: 0.35, color: 0xb03a2a, side: THREE.DoubleSide, roughness: 0.8 }), 0.8);
  [[0.95, -0.42, 0.3], [1.55, 0.05, -0.6], [-0.85, 0.15, 1.2]].forEach(([x, z, r]) => { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fanMat); f.geometry.translate(0, 0.08, 0); f.position.set(x, -0.8, z); f.rotation.y = r; f.castShadow = true; g.add(f); });

  // starfish, shells, urchins
  const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? 0.008 : 0.022; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const starGeo = new THREE.ExtrudeGeometry(star, { depth: 0.004, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 }); starGeo.rotateX(-Math.PI / 2);
  const starMat = addCaustics(new THREE.MeshStandardMaterial({ color: 0xc8643a, roughness: 0.8 }), 1);
  [[0.35, 0.25], [1.1, -0.35], [-0.45, -0.3], [0.65, 0.12]].forEach(([x, z]) => { const m = new THREE.Mesh(starGeo, starMat); m.position.set(x, -0.79, z); m.rotation.y = R() * 6; g.add(m); });
  const shellMat = addCaustics(new THREE.MeshStandardMaterial({ color: 0xe8d8c0, roughness: 0.5 }), 1);
  const scallop = new THREE.CircleGeometry(0.014, 14, -Math.PI * 0.1, Math.PI * 1.2); const sp = scallop.attributes.position; for (let i = 0; i < sp.count; i++) { const a = Math.atan2(sp.getY(i), sp.getX(i)); sp.setZ(i, Math.abs(Math.sin(a * 7)) * 0.002 * Math.hypot(sp.getX(i), sp.getY(i)) / 0.014); } scallop.computeVertexNormals(); scallop.rotateX(-Math.PI / 2 + 0.2);
  for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(scallop, shellMat); m.position.set(-1 + R() * 2.6, -0.795, (R() - 0.5) * 0.8); m.rotation.y = R() * 6; g.add(m); }
  const cone = new THREE.ConeGeometry(0.006, 0.02, 10); cone.rotateZ(Math.PI / 2);
  for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(cone, shellMat); m.position.set(-1 + R() * 2.6, -0.792, (R() - 0.5) * 0.8); m.rotation.y = R() * 6; g.add(m); }
  const urchMat = addCaustics(new THREE.MeshStandardMaterial({ color: 0x2a1830, roughness: 0.6 }), 1);
  const urchGeo = new THREE.IcosahedronGeometry(0.012, 1); { const p = urchGeo.attributes.position; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.multiplyScalar(1 + (i % 3 === 0 ? 0.8 : 0)); p.setXYZ(i, v.x, v.y, v.z); } urchGeo.computeVertexNormals(); }
  [[0.5, -0.3], [1.35, -0.12], [-0.6, 0.35]].forEach(([x, z]) => { const m = new THREE.Mesh(urchGeo, urchMat); m.position.set(x, -0.785, z); g.add(m); });

  // old anchor
  const rust = addCaustics(new THREE.MeshStandardMaterial({ color: 0x4e3326, roughness: 0.95, metalness: 0.4 }), 1);
  const anchor = new THREE.Group();
  anchor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 8), rust));
  const arms = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.006, 6, 20, Math.PI), rust); arms.rotation.z = Math.PI; arms.position.y = -0.02; anchor.add(arms);
  [-1, 1].forEach(s => { const fl = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.02, 4), rust); fl.position.set(s * 0.055, -0.02, 0); fl.rotation.z = s * 0.3; anchor.add(fl); });
  const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.11, 6), rust); stock.rotation.x = Math.PI / 2; stock.position.y = 0.07; anchor.add(stock);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 12), rust); ring.position.y = 0.09; anchor.add(ring);
  anchor.position.set(0.15, -0.77, -0.32); anchor.rotation.set(0.3, 0.6, 1.25); anchor.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.add(anchor);
  // chain from anchor
  const chainPts = [new THREE.Vector3(0.11, -0.71, -0.3), new THREE.Vector3(0.0, -0.79, -0.26), new THREE.Vector3(-0.12, -0.795, -0.3), new THREE.Vector3(-0.22, -0.79, -0.22)];
  const cc = new THREE.CatmullRomCurve3(chainPts); const links = new THREE.InstancedMesh(new THREE.TorusGeometry(0.006, 0.0018, 4, 8), rust, 40);
  for (let i = 0; i < 40; i++) { const t = i / 39; const pp = cc.getPoint(t); const tan = cc.getTangent(t); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), tan); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), i % 2 ? Math.PI / 2 : 0)); m4.compose(pp, q, new THREE.Vector3(1, 1, 1)); links.setMatrixAt(i, m4); }
  g.add(links);

  // treasure chest
  const chest = new THREE.Group(); chest.position.set(1.05, -0.785, -0.28); chest.rotation.y = 0.5;
  const chestWood = addCaustics(new THREE.MeshStandardMaterial({ map: rep(tex.deck, 0.5, 0.5), color: 0x6a4a2e, roughness: 0.85 }), 1);
  const chestBand = new THREE.MeshStandardMaterial({ color: 0xa88540, metalness: 1, roughness: 0.4 });
  const cb = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.045, 0.06), chestWood); cb.position.y = 0.022; chest.add(cb);
  const lid = new THREE.Group(); lid.position.set(0, 0.045, -0.03); chest.add(lid);
  const lidM = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 16, 1, false, 0, Math.PI), chestWood); lidM.rotation.z = Math.PI / 2; lidM.position.z = 0.03; lid.add(lidM);
  [-0.03, 0.03].forEach(x => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.047, 0.062), chestBand); b.position.set(x, 0.022, 0); chest.add(b); const lb = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.003, 4, 12, Math.PI), chestBand); lb.rotation.y = Math.PI / 2; lb.position.set(x, 0, 0.03); lid.add(lb); });
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.004), chestBand); lock.position.set(0, 0.04, 0.032); chest.add(lock);
  const gold = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffcc55, emissive: 0xffaa22, emissiveIntensity: 0, metalness: 1, roughness: 0.25 }));
  gold.scale.set(1.4, 0.4, 0.9); gold.position.y = 0.04; chest.add(gold);
  const coinGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.0012, 12);
  for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(coinGeo, gold.material); c.position.set(0.055 + R() * 0.05, 0.001, (R() - 0.5) * 0.06); c.rotation.set((R() - 0.5) * 0.4, R() * 3, (R() - 0.5) * 0.4); chest.add(c); }
  chest.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.add(chest);
  g.userData = { chest, lid, gold, sand };
  return g;
}
