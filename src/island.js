import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { B, U, innerR, smooth, clamp, makeNoise, rng, addCaustics, patchMaterial } from './common.js';
import { toTex, softSprite, grassBladeCanvas, cv } from './textures.js';
import { rep } from './assets.js';
import { person, makeRowboat } from './ship.js';

const C = new THREE.Vector3(-1.5, -0.62, -0.16);

function islandMaterial(tex) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, vertexColors: false });
  const rock = tex.rock, rockN = tex.rock_n, grass = tex.grass, sand = tex.sand, sandN = tex.sand_n;
  patchMaterial(mat, 'island', (sh) => {
    Object.assign(sh.uniforms, { tRock: { value: rock }, tRockN: { value: rockN }, tGrass: { value: grass }, tSand: { value: sand }, tSandN: { value: sandN }, uWaterYI: U.waterY });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 mask; varying vec3 vMask; varying vec3 vIP; varying vec3 vIN; varying float vIWY; varying vec3 vTV0; varying vec3 vTV1; varying vec3 vTV2;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMask = mask; vIP = position; vIN = normal; vIWY = (modelMatrix * vec4(transformed, 1.0)).y; mat4 tvm = viewMatrix * modelMatrix; vTV0 = (tvm * vec4(1.,0.,0.,0.)).xyz; vTV1 = (tvm * vec4(0.,1.,0.,0.)).xyz; vTV2 = (tvm * vec4(0.,0.,1.,0.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tRock; uniform sampler2D tRockN; uniform sampler2D tGrass; uniform sampler2D tSand; uniform sampler2D tSandN; uniform float uWaterYI;
        varying vec3 vMask; varying vec3 vIP; varying vec3 vIN; varying float vIWY; varying vec3 vTV0; varying vec3 vTV1; varying vec3 vTV2;
        vec3 triW(vec3 n){ vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }`)
      .replace('#include <map_fragment>', `
        vec3 n0 = normalize(vIN); vec3 tw = triW(n0); float S = 5.0;
        vec3 rk = texture2D(tRock, vIP.zy*S).rgb*tw.x + texture2D(tRock, vIP.xz*S).rgb*tw.y + texture2D(tRock, vIP.xy*S).rgb*tw.z;
        vec3 gr = texture2D(tGrass, vIP.xz*7.0).rgb;
        vec3 sd = texture2D(tSand, vIP.xz*6.0).rgb;
        vec3 base = rk * 1.25;
        base = mix(base, gr * 1.15, vMask.r);
        base = mix(base, sd * 1.05, vMask.g);
        float wet = (1.0 - smoothstep(uWaterYI + 0.005, uWaterYI + 0.035, vIWY));
        base *= 1.0 - 0.45 * wet;
        base = mix(base, base * vec3(0.75, 0.9, 0.7), vMask.b * 0.6);
        diffuseColor.rgb *= base;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.35, (1.0 - smoothstep(uWaterYI + 0.005, uWaterYI + 0.035, vIWY)));`)
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 nx = texture2D(tRockN, vIP.zy*5.0).xyz*2.-1.;
          vec3 ny = texture2D(tRockN, vIP.xz*5.0).xyz*2.-1.;
          vec3 nz = texture2D(tRockN, vIP.xy*5.0).xyz*2.-1.;
          vec3 bx = vec3(nx.xy + n0.zy, abs(nx.z) * n0.x);
          vec3 by = vec3(ny.xy + n0.xz, abs(ny.z) * n0.y);
          vec3 bz = vec3(nz.xy + n0.xy, abs(nz.z) * n0.z);
          vec3 nObj = normalize(bx.zyx * tw.x + by.xzy * tw.y + bz * tw.z);
          nObj = normalize(mix(nObj, n0, vMask.r * 0.7 + vMask.g * 0.5));
          normal = normalize(vTV0 * nObj.x + vTV1 * nObj.y + vTV2 * nObj.z);
        }`);
  });
  return addCaustics(mat, 1.0);
}

export function makeIsland(tex) {
  const g = new THREE.Group();
  const N = makeNoise(21), N2 = makeNoise(77);
  let geo = new THREE.IcosahedronGeometry(1, 48);
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = mergeVertices(geo, 1e-5);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const d = v.clone().normalize();
    const n = N.fbm(d.x * 2.4 + 5, d.y * 2.4 + d.z * 1.7, 6);
    const rid = 1 - Math.abs(N2.fbm(d.x * 4 + 2, d.z * 4 + d.y * 3, 4) * 2 - 1);
    let r = 0.78 + 0.45 * n + 0.08 * rid;
    v.copy(d).multiplyScalar(r);
    v.x *= 0.52; v.y *= 0.48; v.z *= 0.44;
    // plateau + terraces
    if (v.y > 0.34) v.y = 0.34 + (v.y - 0.34) * 0.28;
    if (v.y > 0.2 && v.y < 0.34) { const t = (v.y - 0.2) / 0.14; v.y = 0.2 + 0.14 * (t + 0.18 * Math.sin(t * Math.PI * 3)); }
    // cove (front, +z side near x=-1.1)
    const w = v.clone().add(C);
    const cove = Math.exp(-Math.pow((w.x + 1.12) / 0.14, 2) - Math.pow((w.z - 0.12) / 0.16, 2));
    w.y -= cove * 0.12 * smooth(-0.6, -0.25, w.y);
    const ri = innerR(w.x) - 0.014; const rr = Math.hypot(w.y, w.z); if (rr > ri) { w.y *= ri / rr; w.z *= ri / rr; }
    if (w.x < -1.982) w.x = -1.982;
    p.setXYZ(i, w.x, w.y, w.z);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const mask = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), ny = nrm.getY(i), x = p.getX(i), z = p.getZ(i);
    const nn = N.noise(x * 40, z * 40);
    const grass = smooth(0.55, 0.8, ny) * smooth(-0.31, -0.28, y) * (0.75 + 0.25 * nn);
    const beach = smooth(-0.36, -0.33, y) * (1 - smooth(-0.3, -0.27, y)) * smooth(0.3, 0.6, ny);
    const cove = Math.exp(-Math.pow((x + 1.12) / 0.2, 2) - Math.pow((z - 0.12) / 0.22, 2));
    const algae = smooth(-0.42, -0.36, y) * (1 - smooth(-0.33, -0.3, y));
    mask[i * 3] = grass; mask[i * 3 + 1] = Math.max(beach * 0.4, cove * smooth(-0.4, -0.33, y) * (1 - smooth(-0.29, -0.25, y))); mask[i * 3 + 2] = algae;
  }
  geo.setAttribute('mask', new THREE.BufferAttribute(mask, 3));
  const islandMesh = new THREE.Mesh(geo, islandMaterial(tex));
  islandMesh.castShadow = true; islandMesh.receiveShadow = true; g.add(islandMesh);
  const ray = new THREE.Raycaster();
  const topAt = (x, z) => { ray.set(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0)); const h = ray.intersectObject(islandMesh); return h.length ? h[0].point.y : -0.3; };
  const normalAt = (x, z) => { ray.set(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0)); const h = ray.intersectObject(islandMesh); return h.length ? h[0].face.normal.clone() : new THREE.Vector3(0, 1, 0); };
  const ud = { islandMesh, topAt };

  const iron = new THREE.MeshStandardMaterial({ color: 0x23201d, roughness: 0.5, metalness: 0.6 });
  const verd = new THREE.MeshStandardMaterial({ color: 0x4f7d6c, roughness: 0.55, metalness: 0.5 });
  const stoneM = new THREE.MeshStandardMaterial({ map: rep(tex.rock, 2, 1), normalMap: rep(tex.rock_n, 2, 1), color: 0xb8b0a4, roughness: 0.9 });

  // ---------------- lighthouse
  const LH = new THREE.Group(); const lx = -1.6, lz = -0.3; const ly = topAt(lx, lz) - 0.012; LH.position.set(lx, ly, lz); g.add(LH);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.096, 0.03, 8), stoneM); plinth.position.y = 0.012; LH.add(plinth);
  const towerPts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; towerPts.push(new THREE.Vector2(0.072 - 0.025 * t + 0.008 * Math.pow(1 - t, 6), 0.025 + t * 0.42)); }
  const towerMat = new THREE.MeshStandardMaterial({ map: tex.lighthouse, normalMap: tex.lighthouse_n, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.85 });
  tex.lighthouse.wrapT = THREE.ClampToEdgeWrapping;
  const tower = new THREE.Mesh(new THREE.LatheGeometry(towerPts, 64), towerMat);
  tower.castShadow = true; tower.receiveShadow = true; LH.add(tower);
  const corbel = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.05, 0.022, 32), stoneM); corbel.position.y = 0.435; LH.add(corbel);
  const gal = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.07, 0.008, 40), iron); gal.position.y = 0.449; LH.add(gal);
  const railT = new THREE.Mesh(new THREE.TorusGeometry(0.069, 0.0016, 6, 48), iron); railT.rotation.x = Math.PI / 2; railT.position.y = 0.478; LH.add(railT);
  const railM = new THREE.Mesh(new THREE.TorusGeometry(0.069, 0.001, 4, 48), iron); railM.rotation.x = Math.PI / 2; railM.position.y = 0.466; LH.add(railM);
  const postG = new THREE.CylinderGeometry(0.0011, 0.0011, 0.028, 4);
  const posts = new THREE.InstancedMesh(postG, iron, 20); const m4 = new THREE.Matrix4();
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; m4.makeTranslation(Math.cos(a) * 0.069, 0.466, Math.sin(a) * 0.069); posts.setMatrixAt(i, m4); }
  LH.add(posts);
  const lanternGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.062, 16, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xfff0c8, emissive: 0xffcc66, emissiveIntensity: 0.5, roughness: 0.05, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  lanternGlass.position.y = 0.485; LH.add(lanternGlass);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const m = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.064, 0.003), iron); m.position.set(Math.cos(a) * 0.045, 0.485, Math.sin(a) * 0.045); LH.add(m); }
  const sill = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.006, 24), iron); sill.position.y = 0.456; LH.add(sill);
  // fresnel lens (rotating)
  const lensG = new THREE.Group(); lensG.position.y = 0.485; LH.add(lensG);
  const prismMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 3, roughness: 0.1, metalness: 0.2 });
  for (let k = -3; k <= 3; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.026 - Math.abs(k) * 0.0022, 0.0022, 6, 24), prismMat); t.position.y = k * 0.0065; t.rotation.x = Math.PI / 2; lensG.add(t); }
  const bulls = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), prismMat); bulls.scale.set(1, 1, 0.4); bulls.position.x = 0.024; lensG.add(bulls);
  const bulls2 = bulls.clone(); bulls2.position.x = -0.024; lensG.add(bulls2);
  const lensMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd18a, emissiveIntensity: 14 });
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), lensMat); lens.position.y = 0.485; LH.add(lens);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.052, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), verd); dome.position.y = 0.516; dome.scale.y = 0.75; LH.add(dome);
  const vent = new THREE.Mesh(new THREE.SphereGeometry(0.01, 12, 8), verd); vent.position.y = 0.558; LH.add(vent);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.05, 4), iron); rod.position.y = 0.58; LH.add(rod);
  const vane = new THREE.Group(); vane.position.y = 0.598; LH.add(vane);
  const arrow = new THREE.Shape(); arrow.moveTo(-0.018, -0.002); arrow.lineTo(0.012, -0.002); arrow.lineTo(0.012, -0.005); arrow.lineTo(0.02, 0); arrow.lineTo(0.012, 0.005); arrow.lineTo(0.012, 0.002); arrow.lineTo(-0.012, 0.002); arrow.lineTo(-0.02, 0.006); arrow.lineTo(-0.02, -0.006); arrow.closePath();
  const vaneM = new THREE.Mesh(new THREE.ShapeGeometry(arrow), new THREE.MeshStandardMaterial({ color: 0x2a2622, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide })); vane.add(vaneM);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.036, 0.004), new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.7 })); const da = 0.75; door.position.set(Math.cos(da) * 0.073, 0.045, Math.sin(da) * 0.073); door.rotation.y = -da + Math.PI / 2; LH.add(door);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.006, 0.008), stoneM); lintel.position.set(Math.cos(da) * 0.074, 0.066, Math.sin(da) * 0.074); lintel.rotation.y = door.rotation.y; LH.add(lintel);
  // beam
  const beamGroup = new THREE.Group(); beamGroup.position.y = 0.485; LH.add(beamGroup);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 1 }, uTime: U.time },
    vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = position.x; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uI; uniform float uTime; varying float vT; varying vec3 vN; varying vec3 vV;
      float ss(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
      void main(){ float t = clamp(abs(vT)/1.1, 0., 1.); float rim = pow(abs(dot(vN, vV)), 1.4);
        float a = (1.-t)*(1.-t) * rim * uI * 0.5 * ss(0., 0.04, t);
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.6)*a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const coneGeo = new THREE.ConeGeometry(0.14, 1.1, 40, 1, true); coneGeo.translate(0, -0.55, 0); coneGeo.rotateZ(Math.PI / 2);
  const b1 = new THREE.Mesh(coneGeo, beamMat); beamGroup.add(b1);
  const b2 = new THREE.Mesh(coneGeo, beamMat); b2.rotation.y = Math.PI; beamGroup.add(b2);
  b1.renderOrder = b2.renderOrder = 5;
  Object.assign(ud, { lighthouse: LH, beamGroup, beamMat, lensMat, lens, lensG, vane, prismMat });

  // ---------------- keeper's cottage
  const cot = new THREE.Group(); const cx = -1.43, cz = -0.06; cot.position.set(cx, topAt(cx, cz) - 0.006, cz); cot.rotation.y = 0.5; g.add(cot);
  const wallM = new THREE.MeshStandardMaterial({ map: rep(tex.rock, 1.5, 1), normalMap: rep(tex.rock_n, 1.5, 1), normalScale: new THREE.Vector2(0.6, 0.6), color: 0xf0e8dc, roughness: 0.92 });
  const slateC = cv(128, 128); { const x = slateC.getContext('2d'); x.fillStyle = '#2c2a2e'; x.fillRect(0, 0, 128, 128); const R = rng(9); for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const v = 34 + R() * 26; x.fillStyle = `rgb(${v},${v},${v + 6})`; x.fillRect(c * 16 + (r % 2) * 8, r * 16, 15, 14); } }
  const roofM = new THREE.MeshStandardMaterial({ map: toTex(slateC, { rep: [3, 3] }), roughness: 0.75 });
  const cw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.055, 0.07), wallM); cw.position.y = 0.0275; cot.add(cw);
  const rs = new THREE.Shape(); rs.moveTo(-0.046, 0); rs.lineTo(0.046, 0); rs.lineTo(0, 0.038); rs.closePath();
  const gable = new THREE.ExtrudeGeometry(rs, { depth: 0.07, bevelEnabled: false }); gable.translate(0, 0, -0.035);
  const gab = new THREE.Mesh(gable, wallM); gab.position.y = 0.055; gab.scale.x = 0.95; gab.rotation.y = Math.PI / 2; gab.scale.set(0.76, 1, 1.42); cot.add(gab);
  const roofGeo = new THREE.BoxGeometry(0.115, 0.004, 0.052);
  [1, -1].forEach(s => { const r = new THREE.Mesh(roofGeo, roofM); r.position.set(0, 0.0735, s * 0.0195); r.rotation.x = s * 0.62; cot.add(r); });
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.116, 6), roofM); ridge.rotation.z = Math.PI / 2; ridge.position.y = 0.091; cot.add(ridge);
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.036, 0.014), stoneM); chim.position.set(0.032, 0.092, 0.012); cot.add(chim);
  const chimTop = new THREE.Vector3(0.032, 0.112, 0.012);
  const winMat = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb050, emissiveIntensity: 3 });
  const frameM = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.6 });
  [[-0.024, 0.03, 0.0355], [0.022, 0.03, 0.0355], [-0.024, 0.03, -0.0355]].forEach(([x, y, z]) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.014, 0.016), winMat); w.position.set(x, y, z + Math.sign(z) * 0.0004); if (z < 0) w.rotation.y = Math.PI; cot.add(w); const fr = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.019, 0.001), frameM); fr.position.set(x, y, z); cot.add(fr); const bar = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.016, 0.0016), frameM); bar.position.set(x, y, z + Math.sign(z) * 0.0006); cot.add(bar); });
  const dr = new THREE.Mesh(new THREE.PlaneGeometry(0.015, 0.027), new THREE.MeshStandardMaterial({ color: 0x2f4a5a, roughness: 0.6 })); dr.position.set(0.0505, 0.0135, 0); dr.rotation.y = Math.PI / 2; cot.add(dr);
  const porchLamp = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), winMat); porchLamp.position.set(0.052, 0.033, 0.012); cot.add(porchLamp);
  // woodshed + logs
  const shed = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.05), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.8 })); shed.position.set(-0.064, 0.015, 0); cot.add(shed);
  for (let i = 0; i < 6; i++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.022, 6), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 })); lg.rotation.x = Math.PI / 2; lg.position.set(-0.084 + (i % 3) * 0.007, 0.004 + Math.floor(i / 3) * 0.007, 0.0); cot.add(lg); }
  cot.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  cot.updateMatrix();
  Object.assign(ud, { cottage: cot, winMat, porchLamp, chimTop: chimTop.clone().applyMatrix4(cot.matrix) });

  // fence + washing line + bench
  const fenceM = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.7 });
  const fenceCurve = new THREE.CatmullRomCurve3([[-1.32, 0.06], [-1.27, -0.02], [-1.28, -0.12], [-1.34, -0.18]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const nPost = 14; const pickets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0022, 0.018, 0.0022), fenceM, nPost);
  const railPts = [];
  for (let i = 0; i < nPost; i++) { const pp = fenceCurve.getPoint(i / (nPost - 1)); const y = topAt(pp.x, pp.z); m4.makeTranslation(pp.x, y + 0.008, pp.z); pickets.setMatrixAt(i, m4); railPts.push(new THREE.Vector3(pp.x, y + 0.012, pp.z)); }
  pickets.castShadow = true; g.add(pickets);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 40, 0.0009, 4), fenceM));
  const lineA = new THREE.Vector3(-1.62, 0, 0.0), lineB = new THREE.Vector3(-1.5, 0, 0.1);
  lineA.y = topAt(lineA.x, lineA.z); lineB.y = topAt(lineB.x, lineB.z);
  const poleM = new THREE.MeshStandardMaterial({ color: 0x6a5038, roughness: 0.8 });
  [lineA, lineB].forEach(pt => { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.045, 5), poleM); pole.position.copy(pt).add(new THREE.Vector3(0, 0.022, 0)); pole.castShadow = true; g.add(pole); });
  const la = lineA.clone().add(new THREE.Vector3(0, 0.043, 0)), lb = lineB.clone().add(new THREE.Vector3(0, 0.043, 0));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(la, la.clone().lerp(lb, 0.5).add(new THREE.Vector3(0, -0.006, 0)), lb), 12, 0.0005, 3), fenceM));
  const laundry = [];
  [[0.25, 0xe8e2d4], [0.5, 0x7a9ab8], [0.74, 0xc8a090]].forEach(([t, col]) => {
    const pos = la.clone().lerp(lb, t); pos.y -= 0.004 * Math.sin(t * Math.PI);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.018, 4, 4), new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, side: THREE.DoubleSide }));
    cloth.geometry.translate(0, -0.009, 0);
    const pivot = new THREE.Group(); pivot.position.copy(pos); pivot.rotation.y = Math.atan2(-(lb.z - la.z), lb.x - la.x); pivot.add(cloth); g.add(pivot); laundry.push(pivot);
    cloth.castShadow = true;
  });
  const bench = new THREE.Group(); const bpos = new THREE.Vector3(-1.38, 0, 0.05); bpos.y = topAt(bpos.x, bpos.z); bench.position.copy(bpos); bench.rotation.y = 1.0; g.add(bench);
  const bseat = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.009), poleM); bseat.position.y = 0.008; bench.add(bseat);
  [-0.012, 0.012].forEach(x => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.008, 0.008), poleM); l.position.set(x, 0.004, 0); bench.add(l); });
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.0015), poleM); back.position.set(0, 0.013, -0.004); bench.add(back);
  // flagpole
  const fpPos = new THREE.Vector3(-1.75, 0, 0.1); fpPos.y = topAt(fpPos.x, fpPos.z);
  const fpole = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0016, 0.13, 6), fenceM); fpole.position.copy(fpPos).add(new THREE.Vector3(0, 0.065, 0)); g.add(fpole);
  const flagGeo = new THREE.PlaneGeometry(0.03, 0.019, 8, 2); flagGeo.translate(0.015, 0, 0);
  const isleFlag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: 0x1d3a6a, roughness: 0.8, side: THREE.DoubleSide })); isleFlag.position.copy(fpPos).add(new THREE.Vector3(0, 0.12, 0)); g.add(isleFlag);
  isleFlag.userData.base = flagGeo.attributes.position.array.slice();

  // keeper with lantern
  const keeper = person({ coat: 0x3a4a3a, hat: 'cap', scale: 1.1 });
  const kp = new THREE.Vector3(-1.37, 0, -0.06); kp.y = topAt(kp.x, kp.z); keeper.position.copy(kp); keeper.rotation.y = 0.9; g.add(keeper);
  const kLantern = new THREE.Group(); kLantern.position.set(0, -0.022, 0); keeper.userData.armR.add(kLantern);
  const kLampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffb050, emissiveIntensity: 5 });
  kLantern.add(new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.006, 0.0045), kLampMat));
  const kGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(64), color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })); kGlow.scale.setScalar(0.04); kLantern.add(kGlow);
  keeper.userData.armR.rotation.x = 0.0; keeper.userData.armR.rotation.z = 0.15;

  // stone path
  const pathCurve = new THREE.CatmullRomCurve3([[-1.12, 0.12], [-1.2, 0.07], [-1.3, 0.0], [-1.36, -0.06], [-1.46, -0.16], [-1.55, -0.24]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const stones = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.009, 0.003, 7), stoneM, 46);
  const R = rng(5); const q = new THREE.Quaternion();
  for (let i = 0; i < 46; i++) { const pp = pathCurve.getPoint(i / 45); pp.x += (R() - 0.5) * 0.012; pp.z += (R() - 0.5) * 0.012; pp.y = topAt(pp.x, pp.z) + 0.0005; const s = 0.6 + R() * 0.6; q.setFromEuler(new THREE.Euler(0, R() * 3, 0)); m4.compose(pp, q, new THREE.Vector3(s, 1, s)); stones.setMatrixAt(i, m4); }
  stones.receiveShadow = true; g.add(stones);

  // pines
  const pineM = new THREE.MeshStandardMaterial({ color: 0x2c4628, roughness: 0.9 });
  const pineM2 = new THREE.MeshStandardMaterial({ color: 0x3a5a30, roughness: 0.9 });
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.9 });
  const NN = makeNoise(5);
  const pineLayer = (r, h) => { const geo = new THREE.ConeGeometry(r, h, 12, 3); const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); const a = Math.atan2(z, x); const k = 1 + (NN.noise(a * 3 + y * 40, y * 30) - 0.5) * 0.5 * (y < h / 2 - 0.001 ? 1 : 0); pa.setX(i, x * k); pa.setZ(i, z * k); if (y < -h / 2 + 0.001) pa.setY(i, y + Math.sin(a * 6) * h * 0.06); } geo.computeVertexNormals(); return geo; };
  [[-1.33, -0.25, 1.0], [-1.3, -0.17, 0.75], [-1.72, -0.05, 0.85], [-1.36, 0.08, 0.65], [-1.78, -0.32, 0.7], [-1.24, -0.22, 0.55]].forEach(([x, z, s], k) => {
    const t = new THREE.Group(); t.position.set(x, topAt(x, z) - 0.004, z); t.scale.setScalar(s); t.rotation.y = k;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.005, 0.04, 6), trunkM); tr.position.y = 0.02; t.add(tr);
    for (let j = 0; j < 4; j++) { const c = new THREE.Mesh(pineLayer(0.032 - j * 0.0065, 0.045), j % 2 ? pineM2 : pineM); c.position.y = 0.035 + j * 0.022; t.add(c); }
    t.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); g.add(t);
  });
  // grass tufts
  const gtex = toTex(grassBladeCanvas(), { wrap: false });
  const tuftGeo = mergeGeometries([0, Math.PI / 3, Math.PI * 2 / 3].map(a => { const pl = new THREE.PlaneGeometry(0.018, 0.016); pl.translate(0, 0.008, 0); pl.rotateY(a); return pl; }));
  const tuftMat = new THREE.MeshStandardMaterial({ map: gtex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
  patchMaterial(tuftMat, 'tuftsway', (sh) => { sh.uniforms.uTime = U.time; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\n float ph = instanceMatrix[3].x * 40.0 + instanceMatrix[3].z * 30.0; transformed.x += sin(uTime * 2.0 + ph) * position.y * 0.25; transformed.z += cos(uTime * 1.7 + ph) * position.y * 0.15;'); });
  const nT = 220; const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, nT); let ti = 0;
  for (let k = 0; k < 2000 && ti < nT; k++) {
    const x = -1.95 + R() * 0.95, z = -0.55 + R() * 0.75; const y = topAt(x, z); if (y < -0.29) continue;
    const n = normalAt(x, z); if (n.y < 0.7) continue;
    const s = 0.6 + R() * 0.8; q.setFromEuler(new THREE.Euler(0, R() * 6, 0)); m4.compose(new THREE.Vector3(x, y - 0.001, z), q, new THREE.Vector3(s, s * (0.7 + R() * 0.6), s)); tufts.setMatrixAt(ti++, m4);
  }
  tufts.count = ti; g.add(tufts);
  // flowers
  const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0016, 5, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), 90); let fi = 0;
  const fcols = [0xf4ead0, 0xf0d050, 0xd88ab0, 0xb8c8f0];
  for (let k = 0; k < 2000 && fi < 90; k++) { const x = -1.95 + R() * 0.95, z = -0.55 + R() * 0.75; const y = topAt(x, z); if (y < -0.29) continue; m4.makeTranslation(x, y + 0.004 + R() * 0.004, z); fl.setMatrixAt(fi, m4); fl.setColorAt(fi, new THREE.Color(fcols[fi % 4])); fi++; }
  fl.count = fi; g.add(fl);

  // jetty + rowboat
  const jw = new THREE.MeshStandardMaterial({ map: rep(tex.deck, 1, 0.3), color: 0x8a7050, roughness: 0.9 });
  const jetty = new THREE.Group(); jetty.position.set(-1.1, -0.288, 0.08); jetty.rotation.y = -0.25; g.add(jetty);
  for (let i = 0; i < 10; i++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.005, 0.042), jw); pl.position.set(-0.09 + i * 0.02, 0, (R() - 0.5) * 0.002); pl.castShadow = true; pl.receiveShadow = true; jetty.add(pl); }
  [[-0.08, 0.019], [0.0, 0.019], [0.09, 0.019], [-0.08, -0.019], [0.0, -0.019], [0.09, -0.019]].forEach(([x, z]) => { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.004, 0.13, 6), jw); post.position.set(x, -0.05, z); post.castShadow = true; jetty.add(post); });
  const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.016, 8), iron); bollard.position.set(0.09, 0.009, 0.0); jetty.add(bollard);
  const rowboat = makeRowboat(tex);
  ud.rowboat = rowboat;
  ud.jetty = jetty;
  jetty.updateMatrix();
  Object.assign(ud, { laundry, isleFlag, keeper, kLampMat, kGlow, perches: [new THREE.Vector3(lx + 0.062, ly + 0.481, lz + 0.03), new THREE.Vector3(0.09, 0.018, 0).applyMatrix4(jetty.matrix)] });
  g.userData = ud;
  return g;
}
