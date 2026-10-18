import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { D, FLOOR, sweep, roundRectPath, rng, makeNoise, U } from './common.js';
import { toTex, chartCanvas, compassCardCanvas, featherCanvas, watchDialCanvas, plansCanvas, letterCanvas, logPageCanvas, softSprite } from './textures.js';
import { rep } from './assets.js';
import { hullGeometry, shipDims } from './ship.js';

export const DESK = { x0: -18, x1: 18, z0: -12, z1: 10 };

export function brassMat(tex, color = 0xd9ad5c, rough = 1) {
  return new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: rough, roughnessMap: tex.brass_orm, aoMap: tex.brass_orm, aoMapIntensity: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.4 });
}

function lathe(pts, seg = 48) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); }

export function makeDesk(tex) {
  const g = new THREE.Group();
  // ---- top
  const tw = 35.84, td = 21.84;
  const topGeo = new THREE.PlaneGeometry(tw, td, 1, 1); topGeo.rotateX(-Math.PI / 2); topGeo.translate(0, 0, -1);
  const tp = topGeo.attributes.position, tuv = topGeo.attributes.uv;
  for (let i = 0; i < tp.count; i++) tuv.setXY(i, (tp.getX(i) + 18) / 36, (10 - tp.getZ(i)) / 22);
  const deskTex = tex.desk; deskTex.wrapS = deskTex.wrapT = THREE.ClampToEdgeWrapping;
  const topMat = new THREE.MeshPhysicalMaterial({ map: deskTex, normalMap: tex.desk_n, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: tex.desk_orm, metalnessMap: tex.desk_orm, aoMap: tex.desk_orm, roughness: 1, metalness: 1, clearcoat: 0.25, clearcoatRoughness: 0.3 });
  [tex.desk_n, tex.desk_orm].forEach(t => { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; });
  const top = new THREE.Mesh(topGeo, topMat); top.position.y = D; top.receiveShadow = true; g.add(top);
  // walnut for the rest of the desk
  const walnut = new THREE.MeshPhysicalMaterial({ map: rep(tex.floor, 0.25, 0.25), normalMap: rep(tex.floor_n, 0.25, 0.25), normalScale: new THREE.Vector2(0.3, 0.3), color: 0x9a8070, roughness: 0.48, clearcoat: 0.3, clearcoatRoughness: 0.35 });
  const prof = [];
  for (let i = 0; i <= 8; i++) { const a = Math.PI / 2 - i / 8 * Math.PI / 2; prof.push([-0.08 + 0.08 * Math.cos(a), -0.08 + 0.08 * Math.sin(a)]); }
  prof.push([0, -0.3], [0.02, -0.32], [0.02, -0.34], [-0.04, -0.4], [-0.1, -0.46], [-0.14, -0.5], [-0.6, -0.5]);
  const edgeMat = walnut.clone(); edgeMat.map = rep(tex.floor, 0.02, 1); edgeMat.normalMap = rep(tex.floor_n, 0.02, 1);
  const edge = new THREE.Mesh(sweep(roundRectPath(-18, 18, -12, 10, 0.25, 6), prof), edgeMat);
  edge.position.y = D; edge.castShadow = true; edge.receiveShadow = true; g.add(edge);
  // underside
  const under = new THREE.Mesh(new THREE.PlaneGeometry(36, 22), new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.9 }));
  under.rotation.x = Math.PI / 2; under.position.set(0, D - 0.5, -1); g.add(under);
  // apron
  const apH = 1.7, apY = D - 0.5 - apH / 2;
  const box = (sx, sy, sz, x, y, z, m = walnut) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; g.add(b); return b; };
  box(33.6, apH, 0.5, 0, apY, 8.7); box(33.6, apH, 0.5, 0, apY, -10.6); box(0.5, apH, 19.3, -16.6, apY, -0.95); box(0.5, apH, 19.3, 16.6, apY, -0.95);
  // drawers
  const brass = brassMat(tex);
  [[-10, 7.6], [0, 9.0], [10, 7.6]].forEach(([x, w]) => {
    box(w, apH * 0.78, 0.18, x, apY, 9.02);
    const pull = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 10, 24, Math.PI), brass); pull.position.set(x, apY - 0.1, 9.2); pull.rotation.z = Math.PI; g.add(pull);
    [-0.28, 0.28].forEach(dx => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16), brass); r.rotation.x = Math.PI / 2; r.position.set(x + dx, apY - 0.1, 9.13); g.add(r); });
    const esc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 20), brass); esc.rotation.x = Math.PI / 2; esc.position.set(x, apY + 0.38, 9.13); esc.scale.set(1, 1, 1.5); g.add(esc);
  });
  // legs
  const legPts = [[0, 0], [0.42, 0], [0.48, 0.15], [0.36, 0.5], [0.3, 1.2], [0.38, 1.5], [0.42, 1.7], [0.33, 2.0], [0.4, 6.5], [0.5, 9.5], [0.46, 10.2], [0.56, 10.6], [0.5, 11.0], [0.42, 11.3], [0.42, 12.1], [0, 12.1]];
  const legGeo = lathe(legPts, 32);
  [[-16.4, 8.5], [16.4, 8.5], [-16.4, -10.4], [16.4, -10.4]].forEach(([x, z]) => {
    const l = new THREE.Mesh(legGeo, walnut); l.position.set(x, FLOOR, z); l.castShadow = true; g.add(l);
    box(1.0, apH + 0.1, 1.0, x, apY, z);
  });
  // ---- chair (captain's chair)
  const chair = new THREE.Group(); chair.position.set(3.0, FLOOR, 17.0); chair.rotation.y = Math.PI + 0.22; g.add(chair);
  const seatGeo = new THREE.CylinderGeometry(4.2, 4.0, 0.7, 48); seatGeo.scale(1, 1, 0.92);
  const seat = new THREE.Mesh(seatGeo, walnut); seat.position.y = 9.0; chair.add(seat);
  const legC = new THREE.CylinderGeometry(0.28, 0.36, 9.0, 12);
  [[2.6, 2.4], [-2.6, 2.4], [2.6, -2.4], [-2.6, -2.4]].forEach(([x, z]) => { const l = new THREE.Mesh(legC, walnut); l.position.set(x * 1.1, 4.5, z * 1.1); l.rotation.set(z * 0.035, 0, -x * 0.035); chair.add(l); });
  const armArc = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.3, 10, 48, Math.PI * 1.2), walnut); armArc.rotation.x = Math.PI / 2; armArc.rotation.z = -Math.PI * 0.1 - Math.PI; armArc.position.y = 12.6; chair.add(armArc);
  const crest = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.38, 10, 40, Math.PI * 0.75), walnut); crest.rotation.x = Math.PI / 2; crest.rotation.z = Math.PI * 1.125; crest.position.y = 16.2; chair.add(crest);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 1.1 + i / 8 * Math.PI * 0.8;
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 7.0, 8), walnut); sp.position.set(Math.cos(a) * 3.5, 12.6, Math.sin(a) * 3.5); chair.add(sp);
  }
  chair.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { top, topMat, chair };
  return g;
}

// ------------------------------------------------------------------ desk-top props
export function makeProps(tex) {
  const g = new THREE.Group();
  const brass = brassMat(tex);
  const brassDark = brassMat(tex, 0xa77a38);
  const ud = {};
  // ---- chart
  const chartTex = toTex(chartCanvas(tex.paper.image), { wrap: false, aniso: 16 });
  const cg = new THREE.PlaneGeometry(11, 7.73, 90, 64); cg.rotateX(-Math.PI / 2);
  const cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), z = cp.getZ(i);
    const u = (x + 5.5) / 11, v = (z + 3.865) / 7.73;
    const cTR = Math.max(0, (u - 0.86) / 0.14) * Math.max(0, (0.18 - v) / 0.18);
    const cFL = Math.max(0, (0.1 - u) / 0.1) * Math.max(0, (v - 0.88) / 0.12);
    const fold = Math.exp(-Math.pow((u - 0.5) / 0.012, 2)) * 0.006 + Math.exp(-Math.pow((v - 0.5) / 0.012, 2)) * 0.004;
    const wave = Math.sin(u * 7) * Math.sin(v * 5) * 0.012;
    cp.setY(i, Math.pow(cTR, 1.6) * 0.55 + Math.pow(cFL, 1.6) * 0.25 + wave + fold + 0.006);
  }
  cg.computeVertexNormals();
  const chartN = tex.paper_n; chartN.wrapS = chartN.wrapT = THREE.ClampToEdgeWrapping;
  const chart = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ map: chartTex, normalMap: chartN, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.88, side: THREE.DoubleSide }));
  chart.position.set(0.3, D, 0.4); chart.rotation.y = 0.07; chart.receiveShadow = true; g.add(chart);
  ud.chart = chart;

  // ---- oil lamp
  const lamp = new THREE.Group(); lamp.position.set(-5.6, D, -3.8); lamp.scale.setScalar(1.9); g.add(lamp);
  const footPts = [[0, 0], [0.5, 0], [0.53, 0.02], [0.52, 0.05], [0.47, 0.07], [0.36, 0.1], [0.24, 0.13], [0.2, 0.16], [0.24, 0.18], [0.16, 0.22], [0.13, 0.26], [0.11, 0.38], [0.13, 0.41], [0.18, 0.44], [0.2, 0.47], [0, 0.47]];
  const foot = new THREE.Mesh(lathe(footPts, 64), brass); foot.castShadow = true; lamp.add(foot);
  const fontPts = []; for (let i = 0; i <= 20; i++) { const a = -Math.PI / 2 + i / 20 * Math.PI; fontPts.push([Math.cos(a) * 0.4 + 0.02, 0.72 + Math.sin(a) * 0.26]); }
  const font = new THREE.Mesh(lathe(fontPts, 64), new THREE.MeshPhysicalMaterial({ color: 0x8a3a12, roughness: 0.06, metalness: 0, transmission: 0, transparent: true, opacity: 0.86, clearcoat: 1, sheen: 0.3, sheenColor: new THREE.Color(0xff8040) }));
  font.castShadow = true; lamp.add(font);
  const oil = new THREE.Mesh(new THREE.SphereGeometry(0.36, 32, 16, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x7a3a10, emissive: 0x401000, roughness: 0.2 })); oil.position.y = 0.72; lamp.add(oil);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.022, 10, 64), brass); band.rotation.x = Math.PI / 2; band.position.y = 0.72; lamp.add(band);
  const collar = new THREE.Mesh(lathe([[0.15, 0.95], [0.24, 0.97], [0.25, 1.02], [0.2, 1.06], [0.21, 1.1], [0.15, 1.1]], 48), brass); lamp.add(collar);
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.1, 32, 1, true), brass); gallery.position.y = 1.15; lamp.add(gallery);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), brass); knob.rotation.z = Math.PI / 2; knob.position.set(0.27, 1.06, 0); lamp.add(knob);
  const knobStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), brass); knobStem.rotation.z = Math.PI / 2; knobStem.position.set(0.22, 1.06, 0); lamp.add(knobStem);
  const chimPts = [[0.16, 1.14], [0.2, 1.22], [0.27, 1.36], [0.285, 1.46], [0.24, 1.6], [0.15, 1.78], [0.13, 2.1], [0.14, 2.22]];
  const chimney = new THREE.Mesh(lathe(chimPts, 48), new THREE.MeshPhysicalMaterial({ color: 0xfff4e0, roughness: 0.03, transparent: true, opacity: 0.14, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false, emissive: 0xff9a40, emissiveIntensity: 0.25 }));
  lamp.add(chimney);
  const wick = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.02), new THREE.MeshStandardMaterial({ color: 0x1a1410 })); wick.position.y = 1.2; lamp.add(wick);
  const flamePts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; flamePts.push([Math.sin(t * Math.PI) * 0.055 * (1 - t * 0.6), 1.22 + t * 0.26]); }
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 4.2, 1.3) });
  const flame = new THREE.Mesh(lathe(flamePts, 24), flameMat); lamp.add(flame);
  const flameCore = new THREE.Mesh(lathe(flamePts.map(([r, y]) => [r * 0.5, 1.22 + (y - 1.22) * 0.55]), 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 2.5, 6) })); flameCore.position.y = -0.01; lamp.add(flameCore);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(128), color: new THREE.Color(1.1, 0.55, 0.22), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(0.75, 0.95, 1); glow.position.y = 1.36; lamp.add(glow);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 10, 32, Math.PI * 1.3), brass); handle.position.set(0.5, 0.5, 0); handle.rotation.z = -0.6; lamp.add(handle);
  lamp.traverse(o => { if (o.isMesh && o !== flame && o !== chimney && o !== flameCore) o.castShadow = true; });
  ud.lamp = lamp; ud.flame = flame; ud.flameCore = flameCore; ud.flameMat = flameMat; ud.glow = glow; ud.chimney = chimney;
  ud.lampFlamePos = new THREE.Vector3(-5.6, D + 1.36 * 1.9, -3.8);

  // ---- compass
  const compass = new THREE.Group(); compass.position.set(3.1, D, 2.3); compass.rotation.y = -0.5; g.add(compass);
  const caseG = lathe([[0, 0], [0.9, 0], [0.93, 0.03], [0.93, 0.22], [0.9, 0.26], [0.86, 0.27], [0.86, 0.24], [0, 0.24]], 96);
  const case_ = new THREE.Mesh(caseG, brass); case_.castShadow = true; compass.add(case_);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.87, 0.04, 12, 96), brass); bezel.rotation.x = Math.PI / 2; bezel.position.y = 0.27; compass.add(bezel);
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.84, 96), new THREE.MeshStandardMaterial({ map: toTex(compassCardCanvas(), { wrap: false }), roughness: 0.7 }));
  dial.rotation.x = -Math.PI / 2; dial.position.y = 0.241; compass.add(dial);
  const needle = new THREE.Group(); needle.position.y = 0.256; compass.add(needle);
  const ns = new THREE.Shape(); ns.moveTo(0, 0.7); ns.lineTo(0.065, 0); ns.lineTo(0, -0.7); ns.lineTo(-0.065, 0); ns.closePath();
  const ng = new THREE.ExtrudeGeometry(ns, { depth: 0.012, bevelEnabled: false }); ng.rotateX(-Math.PI / 2);
  const ncol = []; const np = ng.attributes.position; for (let i = 0; i < np.count; i++) { const z = np.getZ(i); const c = z < 0 ? new THREE.Color(0x9a1d14) : new THREE.Color(0x1c1a1a); ncol.push(c.r, c.g, c.b); }
  ng.setAttribute('color', new THREE.Float32BufferAttribute(ncol, 3));
  const nm = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.35 })); nm.castShadow = true; needle.add(nm);
  const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10), brass); pivot.position.y = 0.272; compass.add(pivot);
  const cover = new THREE.Mesh(new THREE.CircleGeometry(0.86, 64), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.1, clearcoat: 1, depthWrite: false })); cover.rotation.x = -Math.PI / 2; cover.position.y = 0.29; compass.add(cover);
  const lidG = new THREE.Group(); lidG.position.set(0, 0.28, -0.93); lidG.rotation.x = -2.35; compass.add(lidG);
  const lidM = new THREE.Mesh(lathe([[0, 0], [0.92, 0], [0.93, 0.03], [0.9, 0.07], [0, 0.07]], 96), brass); lidM.rotation.x = Math.PI / 2; lidM.position.z = 0.93; lidG.add(lidM);
  const lidIn = new THREE.Mesh(new THREE.CircleGeometry(0.85, 64), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08 })); lidIn.position.set(0, -0.001, 0.93); lidIn.rotation.x = Math.PI / 2; lidG.add(lidIn);
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 16), brass); hinge.rotation.z = Math.PI / 2; hinge.position.set(0, 0.26, -0.95); compass.add(hinge);
  lidG.traverse(o => { if (o.isMesh) o.castShadow = true; });
  ud.compass = compass; ud.needle = needle;

  // ---- dividers
  const dividers = new THREE.Group(); dividers.position.set(1.4, D + 0.04, 2.7); dividers.rotation.y = 0.9; g.add(dividers);
  const steel = new THREE.MeshStandardMaterial({ color: 0x9a9690, metalness: 1, roughness: 0.3 });
  [0.16, -0.16].forEach(a => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.004, 2.2, 10), steel); leg.rotation.z = Math.PI / 2; leg.rotation.y = a; leg.position.set(Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1); leg.castShadow = true; dividers.add(leg); });
  const dh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 20), brass); dh.position.y = 0.01; dividers.add(dh);

  // ---- books
  const books = new THREE.Group(); books.position.set(5.8, D, -3.1); books.rotation.y = -0.35; g.add(books);
  const pageC = document.createElement('canvas'); pageC.width = pageC.height = 128; const pc = pageC.getContext('2d'); pc.fillStyle = '#ddd0ac'; pc.fillRect(0, 0, 128, 128); for (let i = 0; i < 128; i += 2) { pc.fillStyle = `rgba(110,90,60,${0.15 + Math.random() * 0.15})`; pc.fillRect(0, i, 128, 1); }
  const pageMat = new THREE.MeshStandardMaterial({ map: toTex(pageC), roughness: 0.95 });
  let y = 0;
  [[0x4a1a14, 4.6, 0.55, 3.3, 0.0], [0x1f3324, 4.2, 0.45, 3.0, 0.12], [0x3b2a18, 3.6, 0.38, 2.6, -0.1]].forEach(([colr, w, h, d, rot]) => {
    const cover = new THREE.MeshStandardMaterial({ map: rep(tex.leather, 1.2, 1.2), normalMap: rep(tex.leather_n, 1.2, 1.2), color: colr, roughness: 0.6 });
    const gilt = new THREE.MeshStandardMaterial({ color: 0xc9a050, metalness: 1, roughness: 0.35 });
    const bk = new THREE.Group(); bk.position.y = y; bk.rotation.y = rot; books.add(bk);
    const coverT = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), cover); coverT.position.y = h - 0.025; bk.add(coverT);
    const coverB = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), cover); coverB.position.y = 0.025; bk.add(coverB);
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(h / 2, h / 2, w, 16, 1, false, 0, Math.PI), cover); spine.rotation.z = Math.PI / 2; spine.rotation.y = Math.PI; spine.position.set(0, h / 2, -d / 2 + 0.02); spine.scale.set(1, 1, 0.35); bk.add(spine);
    const pages = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, h - 0.1, d - 0.08), pageMat); pages.position.set(0, h / 2, 0.02); bk.add(pages);
    for (const xx of [-w * 0.35, w * 0.35]) { const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, h * 0.9, 0.02), gilt); b2.position.set(xx, h / 2, -d / 2 - 0.13); bk.add(b2); }
    bk.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    y += h;
  });
  ud.books = books;

  // ---- inkwell + quill
  const ink = new THREE.Group(); ink.position.set(3.4, D, -2.3); g.add(ink);
  const iwGeo = new THREE.BoxGeometry(0.75, 0.55, 0.75, 1, 1, 1);
  const iw = new THREE.Mesh(iwGeo, new THREE.MeshPhysicalMaterial({ color: 0x0b1216, roughness: 0.04, clearcoat: 1, metalness: 0.1 })); iw.position.y = 0.275; iw.castShadow = true; ink.add(iw);
  const ic = new THREE.Mesh(lathe([[0.17, 0.55], [0.22, 0.56], [0.23, 0.66], [0.2, 0.7], [0, 0.71]], 32), brass); ink.add(ic);
  const ftex = new THREE.CanvasTexture(featherCanvas()); ftex.colorSpace = THREE.SRGBColorSpace;
  const fgeo = new THREE.PlaneGeometry(0.55, 3.0, 4, 20); fgeo.translate(0, 1.5, 0);
  const fpp = fgeo.attributes.position; for (let i = 0; i < fpp.count; i++) { const yy = fpp.getY(i); fpp.setZ(i, Math.pow(yy / 3, 2) * 0.5); fpp.setX(i, fpp.getX(i) + Math.pow(yy / 3, 2) * 0.2); }
  fgeo.computeVertexNormals();
  const quill = new THREE.Mesh(fgeo, new THREE.MeshStandardMaterial({ map: ftex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }));
  quill.position.y = 0.55; quill.rotation.set(-0.15, 0.4, 0.42); quill.castShadow = true; ink.add(quill);
  ud.ink = ink; ud.quill = quill;

  // ---- candle in a brass chamberstick
  const candle = new THREE.Group(); candle.position.set(8.3, D, 0.2); g.add(candle);
  const dish = new THREE.Mesh(lathe([[0, 0], [0.9, 0], [0.95, 0.05], [0.93, 0.12], [0.86, 0.1], [0.3, 0.08], [0.22, 0.12], [0.24, 0.4], [0.3, 0.44], [0.28, 0.48], [0, 0.48]], 64), brass); dish.castShadow = true; candle.add(dish);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 10, 24), brass); ring.position.set(0.95, 0.12, 0); ring.rotation.y = Math.PI / 2; candle.add(ring);
  const N = makeNoise(31);
  const waxPts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; waxPts.push([0.17 + (i === 24 ? -0.17 : 0), 0.48 + t * 1.4]); }
  const waxGeo = lathe([[0, 0.48], ...waxPts.slice(0, 24), [0.16, 1.88], [0.12, 1.86], [0, 1.85]], 32);
  const wp = waxGeo.attributes.position;
  for (let i = 0; i < wp.count; i++) { const x = wp.getX(i), yy = wp.getY(i), z = wp.getZ(i); const a = Math.atan2(z, x); const r = Math.hypot(x, z); if (r < 0.01) continue; const drip = Math.max(0, Math.sin(a * 5 + 1) * N.fbm(a * 2, yy * 3, 3) - 0.25) * 0.08 * Math.min(1, (1.88 - yy) * 1.5); const s = (r + drip) / r; wp.setX(i, x * s); wp.setZ(i, z * s); }
  waxGeo.computeVertexNormals();
  const waxC = new THREE.Mesh(waxGeo, new THREE.MeshPhysicalMaterial({ color: 0xefe3c4, roughness: 0.45, sheen: 0.6, sheenColor: new THREE.Color(0xffd8a0), emissive: 0x3a2008, emissiveIntensity: 0.4 })); waxC.castShadow = true; candle.add(waxC);
  const cWick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), new THREE.MeshStandardMaterial({ color: 0x111111 })); cWick.position.y = 1.9; candle.add(cWick);
  const cFlame = new THREE.Mesh(lathe(flamePts.map(([r, yy]) => [r * 0.9, 1.92 + (yy - 1.22) * 0.85]), 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 3.6, 1.1) })); candle.add(cFlame);
  const cGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(128), color: new THREE.Color(0.9, 0.45, 0.18), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); cGlow.scale.set(0.6, 0.8, 1); cGlow.position.y = 2.05; candle.add(cGlow);
  ud.candle = candle; ud.candleFlame = cFlame; ud.candleGlow = cGlow; ud.candleFlamePos = new THREE.Vector3(8.3, D + 2.05, 0.2);

  // ---- spyglass
  const spy = new THREE.Group(); spy.position.set(-6.6, D + 0.32, 2.9); spy.rotation.set(0, 0.55, 0); g.add(spy);
  const leatherM = new THREE.MeshStandardMaterial({ map: rep(tex.leather, 2, 0.5), normalMap: rep(tex.leather_n, 2, 0.5), color: 0x5a3a24, roughness: 0.65 });
  const tube = (r0, r1, len, x, m) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 40), m); t.rotation.z = Math.PI / 2; t.position.x = x; t.castShadow = true; spy.add(t); return t; };
  tube(0.32, 0.3, 2.6, 0, leatherM);
  tube(0.33, 0.33, 0.14, -1.32, brass); tube(0.33, 0.33, 0.14, 1.32, brass); tube(0.33, 0.33, 0.06, 0.4, brass);
  const t2 = tube(0.25, 0.25, 1.4, 1.95, brass); const t3 = tube(0.19, 0.19, 1.2, 2.9, brass);
  tube(0.27, 0.27, 0.08, 2.62, brassDark); tube(0.21, 0.21, 0.07, 3.48, brassDark);
  const lensM = new THREE.MeshPhysicalMaterial({ color: 0x9fb6c0, roughness: 0.02, metalness: 0.3, clearcoat: 1 });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.29, 32), lensM); lens.rotation.y = -Math.PI / 2; lens.position.x = -1.4; spy.add(lens);
  ud.spyglass = spy; ud.spyTubes = [t2, t3];

  // ---- pocket watch with chain
  const watch = new THREE.Group(); watch.position.set(-2.5, D, 3.7); watch.rotation.y = 0.3; g.add(watch);
  const wcase = new THREE.Mesh(lathe([[0, 0], [0.55, 0], [0.6, 0.04], [0.62, 0.1], [0.6, 0.16], [0.56, 0.19], [0, 0.19]], 64), brass); wcase.castShadow = true; watch.add(wcase);
  const wdial = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), new THREE.MeshStandardMaterial({ map: toTex(watchDialCanvas(), { wrap: false }), roughness: 0.5 })); wdial.rotation.x = -Math.PI / 2; wdial.position.y = 0.191; watch.add(wdial);
  const handM = new THREE.MeshStandardMaterial({ color: 0x14100c, metalness: 0.6, roughness: 0.3 });
  const mkHand = (len, w) => { const h = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.006, len), handM); m.position.z = -len / 2 + 0.03; h.add(m); h.position.y = 0.198; watch.add(h); return h; };
  const hH = mkHand(0.26, 0.03), hM = mkHand(0.38, 0.022), hS = mkHand(0.1, 0.008); hS.position.set(0, 0.2, 0.2);
  const crystal = new THREE.Mesh(new THREE.SphereGeometry(0.52, 48, 12, 0, Math.PI * 2, 0, 0.42), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.12, clearcoat: 1, depthWrite: false })); crystal.position.y = 0.19 - 0.52 * Math.cos(0.42); watch.add(crystal);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 10, 24), brass); bow.rotation.x = Math.PI / 2; bow.position.set(0, 0.1, -0.78); watch.add(bow);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 16), brass); crown.rotation.x = Math.PI / 2; crown.position.set(0, 0.1, -0.66); watch.add(crown);
  // chain links along a curve
  const chainCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.03, -0.95), new THREE.Vector3(0.6, 0.03, -1.6), new THREE.Vector3(1.6, 0.03, -1.4), new THREE.Vector3(2.4, 0.03, -2.0), new THREE.Vector3(2.7, 0.03, -2.9)]);
  const linkGeo = new THREE.TorusGeometry(0.032, 0.0075, 6, 12); linkGeo.scale(1.4, 1, 1);
  const nLinks = 110;
  const chain = new THREE.InstancedMesh(linkGeo, brass, nLinks);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), tq = new THREE.Quaternion();
  for (let i = 0; i < nLinks; i++) {
    const t = i / (nLinks - 1); const p = chainCurve.getPoint(t); const tan = chainCurve.getTangent(t);
    q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tan);
    tq.setFromAxisAngle(tan, i % 2 ? Math.PI / 2 : 0); q.premultiply(tq);
    m4.compose(p, q, new THREE.Vector3(1, 1, 1)); chain.setMatrixAt(i, m4);
  }
  chain.castShadow = true; watch.add(chain);
  ud.watch = watch; ud.watchHands = { h: hH, m: hM, s: hS };

  // ---- plans sheet + ship-building tools
  const plansTex = toTex(plansCanvas(tex.sheet.image, shipDims), { wrap: false, aniso: 16 });
  const pg = new THREE.PlaneGeometry(4.8, 3.2, 24, 16); pg.rotateX(-Math.PI / 2);
  const ppos = pg.attributes.position; for (let i = 0; i < ppos.count; i++) { const x = ppos.getX(i), z = ppos.getZ(i); ppos.setY(i, 0.012 + Math.max(0, (x - 1.8)) ** 2 * 0.05 + Math.sin(z * 2) * 0.004); } pg.computeVertexNormals();
  const plans = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: plansTex, roughness: 0.9, side: THREE.DoubleSide }));
  plans.position.set(-5.2, D, 0.9); plans.rotation.y = 0.18; plans.receiveShadow = true; g.add(plans);
  ud.plans = plans;
  const tools = new THREE.Group(); tools.position.set(-5.0, D + 0.03, 1.0); tools.rotation.y = 0.18; g.add(tools);
  // long forceps
  const forc = new THREE.Group(); forc.position.set(-0.6, 0.02, 0.9); forc.rotation.y = 0.35; tools.add(forc);
  [-1, 1].forEach(s => { const arm = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.03, 0.05), steel); arm.position.set(0, 0, s * 0.04); arm.rotation.y = s * 0.025; forc.add(arm); });
  const fhinge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), steel); fhinge.position.x = -1.6; forc.add(fhinge);
  // thread spool
  const spool = new THREE.Group(); spool.position.set(1.7, 0, -0.9); tools.add(spool);
  const sw = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.6 });
  [0, 0.42].forEach(yy => { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 24), sw); d.position.y = yy + 0.025; spool.add(d); });
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.37, 24), new THREE.MeshStandardMaterial({ color: 0xd8cfb4, roughness: 0.95 })); thread.position.y = 0.235; spool.add(thread);
  const loose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.2, 0.2, 0), new THREE.Vector3(0.6, 0.0, 0.2), new THREE.Vector3(1.1, 0.0, -0.1), new THREE.Vector3(1.4, 0.0, 0.3)]), 30, 0.006, 4), thread.material); spool.add(loose);
  // the next ship: a bare hull on the plans
  const nextHull = new THREE.Mesh(hullGeometry(0.85), new THREE.MeshStandardMaterial({ map: rep(tex.deck, 2, 0.5), color: 0xc8a878, roughness: 0.7, side: THREE.DoubleSide }));
  nextHull.position.set(0.6, 0.08, -0.3); nextHull.rotation.y = -0.2; tools.add(nextHull);
  // paper sails cut-outs
  const sailPaper = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9, side: THREE.DoubleSide });
  [[1.2, 0.3, 0.4], [1.5, 0.5, -0.5], [0.9, 0.7, 1.2]].forEach(([x, z, r]) => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.45, 0); s.lineTo(0.05, 0.6); s.closePath(); const m = new THREE.Mesh(new THREE.ShapeGeometry(s), sailPaper); m.rotation.x = -Math.PI / 2; m.rotation.z = r; m.position.set(x, 0.005, z); tools.add(m); });
  tools.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  ud.tools = tools;

  // ---- letter with wax seal (folded)
  const letterTex = toTex(letterCanvas(tex.sheet.image), { wrap: false });
  const letter = new THREE.Group(); letter.position.set(6.6, D + 0.01, 3.6); letter.rotation.y = -0.25; g.add(letter);
  const lg = new THREE.PlaneGeometry(2.2, 3.0, 8, 12); lg.rotateX(-Math.PI / 2);
  const lpp = lg.attributes.position; for (let i = 0; i < lpp.count; i++) { const z = lpp.getZ(i); lpp.setY(i, 0.01 + 0.025 * Math.exp(-Math.pow((z + 0.5) / 0.1, 2)) + 0.025 * Math.exp(-Math.pow((z - 0.5) / 0.1, 2))); }
  lg.computeVertexNormals();
  const lsheet = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ map: letterTex, roughness: 0.92, side: THREE.DoubleSide })); lsheet.receiveShadow = true; letter.add(lsheet);
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 24), new THREE.MeshPhysicalMaterial({ color: 0x8e1a12, roughness: 0.35, clearcoat: 0.6 })); seal.position.set(0.7, 0.04, 1.6); seal.castShadow = true; letter.add(seal);
  ud.letter = letter;

  // ---- open log book
  const logBook = new THREE.Group(); logBook.position.set(10.2, D, -3.4); logBook.rotation.y = -0.4; g.add(logBook);
  const lcover = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.08, 3.4), new THREE.MeshStandardMaterial({ map: rep(tex.leather, 1.5, 1), normalMap: rep(tex.leather_n, 1.5, 1), color: 0x5a2a18, roughness: 0.6 })); lcover.position.y = 0.04; logBook.add(lcover);
  const pageTexL = toTex(logPageCanvas(tex.sheet.image), { wrap: false });
  [-1, 1].forEach(s => {
    const pgeo = new THREE.PlaneGeometry(2.35, 3.2, 20, 4); pgeo.rotateX(-Math.PI / 2);
    const pa = pgeo.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i); const u = (x + 1.175) / 2.35; const t = s < 0 ? 1 - u : u; pa.setY(i, 0.25 * Math.sin(Math.min(1, t * 3.5) * Math.PI / 2) * (1 - t * 0.6) + 0.1); }
    pgeo.computeVertexNormals();
    const page = new THREE.Mesh(pgeo, new THREE.MeshStandardMaterial({ map: s > 0 ? pageTexL : rep(tex.sheet, 0.6, 1), roughness: 0.92, side: THREE.DoubleSide }));
    page.position.x = s * 1.2; page.receiveShadow = true; page.castShadow = true; logBook.add(page);
    const block = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.18, 3.15), pageMat); block.position.set(s * 1.2, 0.12, 0); logBook.add(block);
  });
  ud.logBook = logBook;

  g.userData = ud;
  return g;
}
