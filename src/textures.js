import * as THREE from 'three';
import { rng, makeNoise, clamp } from './common.js';
import { FONTS } from './assets.js';

export function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function toTex(c, { srgb = true, rep = [1, 1], wrap = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.repeat.set(rep[0], rep[1]);
  t.anisotropy = aniso;
  return t;
}
const SERIF = FONTS.serif, KAI = FONTS.kai, LATIN = FONTS.latin;

function fitFont(ctx, text, fontFn, maxW, size, min = 10) {
  let s = size;
  do { ctx.font = fontFn(s); s -= 2; } while (ctx.measureText(text).width > maxW && s > min);
  return s + 2;
}

// ---------------------------------------------------------------- nautical chart (ink over baked paper)
export function chartCanvas(paperImg, plan) {
  const W = paperImg && paperImg.width ? paperImg.width : 2048, H = paperImg && paperImg.height ? paperImg.height : 1440;
  const c = cv(W, H), ctx = c.getContext('2d');
  if (paperImg && paperImg.width) ctx.drawImage(paperImg, 0, 0, W, H); else { ctx.fillStyle = '#e3d3ad'; ctx.fillRect(0, 0, W, H); }
  const k = W / 2048;
  ctx.save(); ctx.scale(k, k);
  const w = 2048, h = 1440;
  ctx.globalCompositeOperation = 'multiply';
  const R = rng(42);
  const ink = 'rgba(62,38,20,';
  ctx.strokeStyle = ink + '0.85)'; ctx.lineWidth = 6; ctx.strokeRect(50, 50, w - 100, h - 100);
  ctx.lineWidth = 2; ctx.strokeRect(74, 74, w - 148, h - 148);
  for (let x = 74; x < w - 74; x += 40) { ctx.fillStyle = ink + ((x / 40) % 2 ? '0.7)' : '0.08)'); ctx.fillRect(x, 54, 40, 16); ctx.fillRect(x, h - 70, 40, 16); }
  for (let y = 74; y < h - 74; y += 40) { ctx.fillStyle = ink + ((y / 40) % 2 ? '0.7)' : '0.08)'); ctx.fillRect(54, y, 16, 40); ctx.fillRect(w - 70, y, 16, 40); }
  ctx.font = `20px ${LATIN}`; ctx.fillStyle = ink + '0.8)'; ctx.textAlign = 'center';
  for (let i = 0; i < 8; i++) { ctx.fillText(`${12 + i}°`, 74 + 180 + i * 260, 46); }
  ctx.strokeStyle = ink + '0.2)'; ctx.lineWidth = 1.5;
  for (let x = 74 + 180; x < w - 74; x += 260) { ctx.beginPath(); ctx.moveTo(x, 74); ctx.lineTo(x, h - 74); ctx.stroke(); }
  for (let y = 74 + 150; y < h - 74; y += 240) { ctx.beginPath(); ctx.moveTo(74, y); ctx.lineTo(w - 74, y); ctx.stroke(); }
  const rx = w * 0.62, ry = h * 0.55;
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * Math.PI * 2; ctx.strokeStyle = ink + (i % 4 === 0 ? '0.26)' : '0.11)');
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + Math.cos(a) * 2400, ry + Math.sin(a) * 2400); ctx.stroke();
  }
  function coast(cx, cy, rad, seed, n = 220) {
    const N = makeNoise(seed); const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2; const rr = rad * (0.6 + 0.65 * N.fbm(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5, 6));
      pts.push([cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr]);
    }
    for (let k2 = 7; k2 >= 1; k2--) {
      ctx.strokeStyle = ink + (0.05 + 0.018 * (7 - k2)) + ')'; ctx.lineWidth = 1.1;
      ctx.beginPath(); pts.forEach((p, i) => { const dx = p[0] - cx, dy = p[1] - cy; const f = 1 + k2 * 0.03; i ? ctx.lineTo(cx + dx * f, cy + dy * f) : ctx.moveTo(cx + dx * f, cy + dy * f); }); ctx.closePath(); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(165,135,85,0.2)';
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink + '0.9)'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.strokeStyle = ink + '0.42)'; ctx.lineWidth = 1.3;
    for (let j = 0; j < rad / 10; j++) {
      const a = R() * 6.28, d = R() * rad * 0.5; const x = cx + Math.cos(a) * d * 1.2, y = cy + Math.sin(a) * d;
      ctx.beginPath(); ctx.moveTo(x - 14, y + 6); ctx.quadraticCurveTo(x, y - 16, x + 14, y + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 6, y + 2); ctx.lineTo(x - 2, y - 6); ctx.stroke();
    }
  }
  coast(330, 330, 210, 5); coast(1650, 1180, 260, 9); coast(1180, 360, 90, 13); coast(560, 1100, 130, 21); coast(1830, 330, 120, 33);
  ctx.fillStyle = ink + '0.5)'; ctx.font = `italic 24px ${LATIN}`;
  for (let i = 0; i < 90; i++) { const x = 120 + R() * (w - 240), y = 120 + R() * (h - 240); ctx.fillText(String(3 + Math.floor(R() * 40)), x, y); }
  // compass rose
  ctx.save(); ctx.translate(rx, ry);
  ctx.strokeStyle = ink + '0.9)'; ctx.lineWidth = 2;
  [172, 162, 122].forEach(r => { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); });
  for (let i = 0; i < 128; i++) { const a = i / 128 * Math.PI * 2, l = i % 16 === 0 ? 22 : i % 4 === 0 ? 14 : 7; ctx.lineWidth = i % 16 === 0 ? 2 : 1; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 162, Math.sin(a) * 162); ctx.lineTo(Math.cos(a) * (162 - l), Math.sin(a) * (162 - l)); ctx.stroke(); }
  function star(n, R1, R2, rot, fillA, fillB) {
    for (let i = 0; i < n; i++) {
      const a = rot + i / n * Math.PI * 2, a1 = a - Math.PI / n, a2 = a + Math.PI / n;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a1) * R2, Math.sin(a1) * R2); ctx.lineTo(Math.cos(a) * R1, Math.sin(a) * R1); ctx.closePath(); ctx.fillStyle = fillA; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a2) * R2, Math.sin(a2) * R2); ctx.lineTo(Math.cos(a) * R1, Math.sin(a) * R1); ctx.closePath(); ctx.fillStyle = fillB; ctx.fill(); ctx.stroke();
    }
  }
  ctx.lineWidth = 1.2;
  star(8, 118, 26, Math.PI / 8 - Math.PI / 2, 'rgba(130,40,30,0.5)', 'rgba(240,225,190,0.35)');
  star(4, 172, 34, -Math.PI / 2, 'rgba(50,30,18,0.85)', 'rgba(240,225,190,0.4)');
  ctx.fillStyle = ink + '0.95)'; ctx.font = `600 48px ${LATIN}`; ctx.textAlign = 'center'; ctx.fillText('N', 0, -190);
  ctx.beginPath(); ctx.moveTo(0, -232); ctx.lineTo(10, -212); ctx.lineTo(-10, -212); ctx.closePath(); ctx.fill();
  ctx.restore();
  // voyage track
  ctx.setLineDash([14, 12]); ctx.strokeStyle = 'rgba(140,30,25,0.7)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(560, 330); ctx.bezierCurveTo(900, 520, 1000, 900, 1420, 960); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(140,30,25,0.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(1405, 945); ctx.lineTo(1435, 975); ctx.moveTo(1435, 945); ctx.lineTo(1405, 975); ctx.stroke();
  // labels
  ctx.fillStyle = ink + '0.85)'; ctx.textAlign = 'center';
  ctx.font = `italic 66px ${LATIN}`; ctx.fillText('Mare Incognitum', 1020, 700);
  ctx.font = `italic 40px ${LATIN}`; ctx.fillText('Terra Australis', 1650, 1190); ctx.fillText('Insula Lucis', 330, 330);
  ctx.font = `46px ${SERIF}`; ctx.fillText('拾 光 灣', 760, 1000);
  // handwritten notes (kai)
  ctx.fillStyle = 'rgba(40,30,60,0.75)'; ctx.font = `30px ${KAI}`; ctx.textAlign = 'left';
  ctx.fillText('此處多霧，夜行慎之', 1240, 470);
  ctx.fillText('燈塔一閃三秒', 420, 470);
  ctx.save(); ctx.translate(1150, 860); ctx.rotate(-0.12); ctx.fillText('九月十二日 風向西南 · 一切安好', 0, 0); ctx.restore();
  // cartouche
  ctx.save(); ctx.translate(360, 1180); ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(232,212,170,0.55)'; ctx.strokeStyle = ink + '0.9)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(0, 0, 250, 120, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, 236, 106, 0, 0, Math.PI * 2); ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = ink + '0.95)'; ctx.font = `italic 46px ${LATIN}`; ctx.fillText('Carta Marina', 0, -18);
  ctx.font = `30px ${LATIN}`; ctx.fillText('ANNO MDCCCLXXXVII', 0, 30); ctx.font = `26px ${SERIF}`; ctx.fillText('拾光號 航跡', 0, 72);
  ctx.restore();
  // sea serpent doodle
  ctx.save(); ctx.translate(1300, 520); ctx.strokeStyle = ink + '0.55)'; ctx.lineWidth = 2.2; ctx.fillStyle = ink + '0.55)';
  ctx.beginPath(); ctx.moveTo(-90, 0); ctx.bezierCurveTo(-60, -50, 40, -50, 70, -5); ctx.bezierCurveTo(90, -30, 110, -30, 120, -10); ctx.moveTo(70, -5); ctx.bezierCurveTo(95, 10, 110, 20, 125, 8); ctx.moveTo(-90, 0); ctx.bezierCurveTo(-40, 20, 30, 20, 70, -5); ctx.stroke();
  ctx.beginPath(); ctx.arc(-60, -12, 3, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(-70, -30); ctx.quadraticCurveTo(-75, -70, -60, -80); ctx.moveTo(-70, -30); ctx.quadraticCurveTo(-60, -65, -45, -70); ctx.stroke();
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-150 + i * 60, 30); ctx.quadraticCurveTo(-135 + i * 60, 20, -120 + i * 60, 30); ctx.stroke(); }
  ctx.restore();
  ctx.restore();
  return c;
}

// ---------------------------------------------------------------- engraved brass plaque
export function plaqueCanvases(line1, line2, W = 2048, H = 280) {
  const col = cv(W, H), bump = cv(W, H);
  const c = col.getContext('2d'), b = bump.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#e4c27a'); g.addColorStop(0.45, '#c9a35a'); g.addColorStop(1, '#9c7838');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // brushed lines
  const R = rng(3);
  for (let i = 0; i < 1400; i++) { const y = R() * H; c.fillStyle = `rgba(${R() < 0.5 ? '255,240,200' : '90,60,20'},${0.04 + R() * 0.06})`; c.fillRect(R() * W * 0.2 - 100, y, W * (0.5 + R()), 1); }
  b.fillStyle = '#ffffff'; b.fillRect(0, 0, W, H);
  // bevel
  const bev = 10;
  c.strokeStyle = 'rgba(255,240,200,0.55)'; c.lineWidth = 3; c.beginPath(); c.moveTo(bev, H - bev); c.lineTo(bev, bev); c.lineTo(W - bev, bev); c.stroke();
  c.strokeStyle = 'rgba(70,45,15,0.6)'; c.beginPath(); c.moveTo(W - bev, bev); c.lineTo(W - bev, H - bev); c.lineTo(bev, H - bev); c.stroke();
  // engraved double border
  const border = (ctx, colr, lw, inset) => { ctx.strokeStyle = colr; ctx.lineWidth = lw; ctx.strokeRect(inset, inset, W - 2 * inset, H - 2 * inset); };
  border(c, 'rgba(25,15,6,0.9)', 3, 30); border(c, 'rgba(25,15,6,0.8)', 1.5, 38);
  border(b, '#202020', 3, 30); border(b, '#404040', 1.5, 38);
  // screws
  [[70, H / 2], [W - 70, H / 2]].forEach(([x, y]) => {
    const rg = c.createRadialGradient(x - 6, y - 6, 2, x, y, 22);
    rg.addColorStop(0, '#f0d79a'); rg.addColorStop(1, '#7a5a26');
    c.fillStyle = rg; c.beginPath(); c.arc(x, y, 20, 0, 7); c.fill();
    c.strokeStyle = 'rgba(30,18,6,0.9)'; c.lineWidth = 4; c.beginPath(); c.moveTo(x - 14, y + 4); c.lineTo(x + 14, y - 4); c.stroke();
    b.fillStyle = '#e0e0e0'; b.beginPath(); b.arc(x, y, 20, 0, 7); b.fill(); b.strokeStyle = '#303030'; b.lineWidth = 4; b.beginPath(); b.moveTo(x - 14, y + 4); b.lineTo(x + 14, y - 4); b.stroke();
  });
  const drawText = (text, y, fontFn, size) => {
    c.textAlign = b.textAlign = 'center'; c.textBaseline = b.textBaseline = 'middle';
    fitFont(c, text, fontFn, W - 260, size); b.font = c.font;
    c.fillStyle = 'rgba(255,240,205,0.6)'; c.fillText(text, W / 2 + 1.5, y + 2);
    c.fillStyle = 'rgba(14,9,4,0.96)'; c.fillText(text, W / 2, y);
    b.fillStyle = '#000'; b.fillText(text, W / 2, y);
  };
  drawText(line1 || '', H * (line2 ? 0.42 : 0.52), (s) => `600 ${s}px ${SERIF}`, 128);
  if (line2) drawText(line2, H * 0.77, (s) => `italic 500 ${s}px ${LATIN}`, 46);
  return { col, bump };
}

// ---------------------------------------------------------------- paper luggage tag
export function tagCanvas(w = 512, h = 300) {
  const c = cv(w, h), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#e6d5ae'); g.addColorStop(1, '#cdb88c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const R = rng(19); for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(120,90,50,${R() * 0.08})`; ctx.fillRect(R() * w, R() * h, 2 + R() * 6, 1 + R() * 3); }
  ctx.strokeStyle = 'rgba(80,50,25,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.fillStyle = 'rgba(160,130,90,1)'; ctx.beginPath(); ctx.arc(54, h / 2, 18, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(40,25,12,0.6)'; ctx.beginPath(); ctx.arc(54, h / 2, 9, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(48,28,14,0.92)'; ctx.textAlign = 'center';
  ctx.font = `italic 46px ${LATIN}`; ctx.fillText('N° 07', w * 0.58, 88);
  ctx.font = `56px ${KAI}`; ctx.fillText('拾光號', w * 0.58, 168);
  ctx.font = `italic 34px ${LATIN}`; ctx.fillText('Halcyon · 1887', w * 0.58, 226);
  return c;
}

export function sealCanvas() {
  const c = cv(256, 256), sc = c.getContext('2d');
  sc.fillStyle = '#fff'; sc.fillRect(0, 0, 256, 256);
  sc.strokeStyle = '#333'; sc.lineWidth = 7; sc.beginPath(); sc.arc(128, 128, 104, 0, 7); sc.stroke();
  sc.lineWidth = 3; sc.beginPath(); sc.arc(128, 128, 92, 0, 7); sc.stroke();
  // anchor
  sc.lineWidth = 10; sc.beginPath(); sc.moveTo(128, 58); sc.lineTo(128, 186); sc.moveTo(92, 84); sc.lineTo(164, 84); sc.stroke();
  sc.beginPath(); sc.arc(128, 150, 48, 0.25, Math.PI - 0.25); sc.stroke();
  sc.beginPath(); sc.arc(128, 50, 10, 0, 7); sc.stroke();
  return c;
}

// ---------------------------------------------------------------- ship decoration
export function sternCanvas(w = 1024, h = 512) {
  const c = cv(w, h), ctx = c.getContext('2d');
  const gl = cv(w, h), gx = gl.getContext('2d');
  gx.fillStyle = '#000'; gx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#16110d'; ctx.fillRect(0, 0, w, h);
  const R = rng(4); for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(60,48,36,${R() * 0.2})`; ctx.fillRect(R() * w, R() * h, R() * 120, 2); }
  ctx.strokeStyle = '#c8a050'; ctx.lineWidth = 8; ctx.strokeRect(24, 24, w - 48, h - 48);
  ctx.lineWidth = 3; ctx.strokeRect(40, 40, w - 80, h - 80);
  for (let i = 0; i < 3; i++) {
    const x = w * (0.3 + i * 0.2), y0 = h * 0.14, ww = 96, hh = h * 0.3;
    ctx.fillStyle = '#c8a050'; ctx.fillRect(x - ww / 2 - 8, y0 - 8, ww + 16, hh + 16);
    ctx.fillStyle = '#e8a050'; ctx.fillRect(x - ww / 2, y0, ww, hh);
    ctx.fillStyle = '#2a1c10'; ctx.fillRect(x - 2, y0, 4, hh); ctx.fillRect(x - ww / 2, y0 + hh / 2 - 2, ww, 4);
    gx.fillStyle = '#ffd9a0'; gx.fillRect(x - ww / 2, y0, ww, hh);
    gx.fillStyle = '#000'; gx.fillRect(x - 2, y0, 4, hh); gx.fillRect(x - ww / 2, y0 + hh / 2 - 2, ww, 4);
  }
  ctx.fillStyle = '#d9b25c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 104px ${LATIN}`; ctx.fillText('HALCYON', w / 2, h * 0.64);
  ctx.font = `56px ${SERIF}`; ctx.fillText('拾光號 · 拾光灣', w / 2, h * 0.83);
  ctx.strokeStyle = '#c8a050'; ctx.lineWidth = 4;
  [[-1, 0.64], [1, 0.64]].forEach(([s, y]) => { ctx.beginPath(); const x0 = w / 2 + s * 330; ctx.moveTo(x0, h * y); ctx.bezierCurveTo(x0 + s * 50, h * y - 40, x0 + s * 110, h * y + 30, x0 + s * 140, h * y - 10); ctx.stroke(); });
  return { col: c, glow: gl };
}

export function gratingCanvas(w = 256, h = 256) {
  const c = cv(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#0c0805'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#8a6a44';
  for (let i = 0; i < 8; i++) { ctx.fillRect(i * w / 8 + 4, 0, w / 8 - 14, h); }
  ctx.fillStyle = '#9a7a52';
  for (let j = 0; j < 8; j++) { ctx.fillRect(0, j * h / 8 + 4, w, 8); }
  return c;
}

export function bowNameCanvas(w = 512, h = 160) {
  const c = cv(w, h), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 110px ${SERIF}`;
  ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(20,14,8,0.9)'; ctx.strokeText('拾光號', w / 2, h / 2 + 4);
  const g = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.8); g.addColorStop(0, '#f2d58a'); g.addColorStop(0.5, '#c99a3e'); g.addColorStop(1, '#8a6424');
  ctx.fillStyle = g; ctx.fillText('拾光號', w / 2, h / 2 + 4);
  return c;
}

export function trailboardCanvas(w = 512, h = 96) {
  const c = cv(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#1a120c'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#d4ab55'; ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const x = 30 + i * 80; ctx.moveTo(x, h / 2); ctx.bezierCurveTo(x + 20, h * 0.1, x + 50, h * 0.1, x + 60, h / 2); ctx.bezierCurveTo(x + 66, h * 0.8, x + 44, h * 0.85, x + 38, h * 0.6); }
  ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeRect(6, 6, w - 12, h - 12);
  return c;
}

export function flagCanvas(kind = 'house', w = 256, h = 160) {
  const c = cv(w, h), ctx = c.getContext('2d');
  if (kind === 'house') {
    ctx.fillStyle = '#1d3a6a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8dcc0'; ctx.fillRect(0, h * 0.4, w, h * 0.2);
    // kingfisher silhouette
    ctx.save(); ctx.translate(w * 0.5, h * 0.5); ctx.fillStyle = '#e09030';
    ctx.beginPath(); ctx.ellipse(0, 0, 34, 16, -0.2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(30, -10, 13, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(40, -12); ctx.lineTo(72, -6); ctx.lineTo(40, -4); ctx.fill();
    ctx.fillStyle = '#2aa0b8'; ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(-56, -30); ctx.lineTo(-36, 6); ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = '#7a1612'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d9b25c'; ctx.translate(w * 0.5, h * 0.5);
    for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(0, -(i % 2 ? 26 : 50)); ctx.lineTo(8, 0); ctx.lineTo(-8, 0); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
  }
  return c;
}

// ---------------------------------------------------------------- dials
export function compassCardCanvas(w = 1024) {
  const c = cv(w, w), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, '#efe6cf'); g.addColorStop(1, '#d7c7a2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
  ctx.translate(w / 2, w / 2);
  ctx.strokeStyle = 'rgba(40,25,12,0.9)'; ctx.fillStyle = 'rgba(40,25,12,0.9)';
  ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, w * 0.47, 0, 7); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, w * 0.4, 0, 7); ctx.stroke();
  for (let i = 0; i < 360; i += 2) { const a = i / 180 * Math.PI, l = i % 30 === 0 ? 40 : i % 10 === 0 ? 24 : 12; ctx.lineWidth = i % 10 === 0 ? 2.5 : 1.2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * w * 0.47, Math.sin(a) * w * 0.47); ctx.lineTo(Math.cos(a) * (w * 0.47 - l), Math.sin(a) * (w * 0.47 - l)); ctx.stroke(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 34px ${LATIN}`;
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 - Math.PI / 2; if (i % 3) ctx.fillText(String(i * 30), Math.cos(a) * w * 0.355, Math.sin(a) * w * 0.355); }
  ctx.font = `600 78px ${LATIN}`;
  ['N', 'E', 'S', 'W'].forEach((t, i) => { const a = i * Math.PI / 2 - Math.PI / 2; ctx.fillText(t, Math.cos(a) * w * 0.33, Math.sin(a) * w * 0.33); });
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; const L = i % 2 ? 0.16 : 0.26; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * w * L, Math.sin(a) * w * L); ctx.stroke(); }
  ctx.font = `italic 30px ${LATIN}`; ctx.fillText('Halcyon & Co.', 0, w * 0.12);
  return c;
}

export function watchDialCanvas(w = 512) {
  const c = cv(w, w), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(w / 2, w * 0.45, 0, w / 2, w / 2, w / 2); g.addColorStop(0, '#fbf5e6'); g.addColorStop(1, '#e2d6bb');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
  ctx.translate(w / 2, w / 2);
  ctx.strokeStyle = '#2a1e12'; ctx.fillStyle = '#1e160e';
  ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, w * 0.46, 0, 7); ctx.stroke();
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; const l = i % 5 === 0 ? 16 : 7; ctx.lineWidth = i % 5 === 0 ? 3 : 1.4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * w * 0.44, Math.sin(a) * w * 0.44); ctx.lineTo(Math.cos(a) * (w * 0.44 - l), Math.sin(a) * (w * 0.44 - l)); ctx.stroke(); }
  const rom = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `500 46px ${LATIN}`;
  rom.forEach((t, i) => { const a = i / 12 * Math.PI * 2 - Math.PI / 2; ctx.save(); ctx.translate(Math.cos(a) * w * 0.34, Math.sin(a) * w * 0.34); ctx.rotate(a + Math.PI / 2); ctx.fillText(t, 0, 0); ctx.restore(); });
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, w * 0.2, w * 0.08, 0, 7); ctx.stroke();
  ctx.font = `italic 26px ${LATIN}`; ctx.fillText('Halcyon', 0, -w * 0.15);
  return c;
}

export function clockDialCanvas(w = 512, label = 'SHIP’S TIME') {
  const c = cv(w, w), ctx = c.getContext('2d');
  ctx.fillStyle = '#f1e9d6'; ctx.fillRect(0, 0, w, w);
  ctx.translate(w / 2, w / 2);
  ctx.strokeStyle = '#1e160e'; ctx.fillStyle = '#1e160e';
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; const l = i % 5 === 0 ? 20 : 8; ctx.lineWidth = i % 5 === 0 ? 4 : 1.5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * w * 0.45, Math.sin(a) * w * 0.45); ctx.lineTo(Math.cos(a) * (w * 0.45 - l), Math.sin(a) * (w * 0.45 - l)); ctx.stroke(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 54px ${LATIN}`;
  for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2 - Math.PI / 2; ctx.fillText(String(i), Math.cos(a) * w * 0.34, Math.sin(a) * w * 0.34); }
  ctx.font = `italic 28px ${LATIN}`; ctx.fillText(label, 0, w * 0.17);
  return c;
}

export function barometerDialCanvas(w = 512) {
  const c = cv(w, w), ctx = c.getContext('2d');
  ctx.fillStyle = '#efe6d0'; ctx.fillRect(0, 0, w, w);
  ctx.translate(w / 2, w / 2);
  ctx.strokeStyle = '#1e160e'; ctx.fillStyle = '#1e160e';
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  for (let i = 0; i <= 60; i++) { const a = a0 + (a1 - a0) * i / 60; const l = i % 5 === 0 ? 18 : 8; ctx.lineWidth = i % 5 === 0 ? 3 : 1.2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * w * 0.44, Math.sin(a) * w * 0.44); ctx.lineTo(Math.cos(a) * (w * 0.44 - l), Math.sin(a) * (w * 0.44 - l)); ctx.stroke(); }
  const words = ['暴風', '雨', '多變', '晴', '乾燥'];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 38px ${SERIF}`;
  words.forEach((t, i) => { const a = a0 + (a1 - a0) * (0.1 + i * 0.2); ctx.save(); ctx.translate(Math.cos(a) * w * 0.31, Math.sin(a) * w * 0.31); ctx.rotate(a + Math.PI / 2); ctx.fillText(t, 0, 0); ctx.restore(); });
  ctx.font = `italic 26px ${LATIN}`; ctx.fillText('Barometer', 0, w * 0.2);
  return c;
}

// ---------------------------------------------------------------- ship's plans (drawn from the real hull functions)
export function plansCanvas(sheetImg, dims) {
  const W = sheetImg && sheetImg.width ? sheetImg.width : 1536, H = sheetImg && sheetImg.height ? sheetImg.height : 1024;
  const c = cv(W, H), ctx = c.getContext('2d');
  if (sheetImg && sheetImg.width) ctx.drawImage(sheetImg, 0, 0, W, H); else { ctx.fillStyle = '#efe4c8'; ctx.fillRect(0, 0, W, H); }
  ctx.globalCompositeOperation = 'multiply';
  const ink = 'rgba(28,32,52,0.88)', faint = 'rgba(28,32,52,0.35)';
  ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.lineWidth = 1; ctx.strokeRect(46, 46, W - 92, H - 92);
  const { X0, LEN, halfBeam, sheer, keelY } = dims;
  const sx = (x) => 220 + (x - X0) / LEN * (W * 0.62);
  const sy = (y) => H * 0.5 - y * (W * 0.62 / LEN);
  ctx.lineWidth = 1; ctx.strokeStyle = faint;
  for (let i = 0; i <= 10; i++) { const x = X0 + LEN * i / 10; ctx.beginPath(); ctx.moveTo(sx(x), sy(0.3)); ctx.lineTo(sx(x), sy(-0.12)); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(sx(X0 - 0.1), sy(0)); ctx.lineTo(sx(X0 + LEN + 0.4), sy(0)); ctx.stroke();
  for (const y of [0.04, 0.08, -0.04]) { ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(sx(X0), sy(y)); ctx.lineTo(sx(X0 + LEN), sy(y)); ctx.stroke(); ctx.setLineDash([]); }
  // hull profile
  ctx.strokeStyle = ink; ctx.lineWidth = 2.6; ctx.beginPath();
  for (let i = 0; i <= 60; i++) { const u = i / 60; const x = X0 + u * LEN + 0.075 * (u > 0.78 ? (u - 0.78) / 0.22 : 0); const y = sheer(u) + 0.018; i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)); }
  for (let i = 60; i >= 0; i--) { const u = i / 60; const x = X0 + u * LEN; ctx.lineTo(sx(x), sy(keelY(u))); }
  ctx.closePath(); ctx.stroke();
  // masts & sails
  const mast = (x0, h, rake = 0.07) => { const x1 = x0 - Math.sin(rake) * h, y1 = sheer((x0 - X0) / LEN) + Math.cos(rake) * h; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx(x0), sy(sheer((x0 - X0) / LEN))); ctx.lineTo(sx(x1), sy(y1)); ctx.stroke(); return [x1, y1]; };
  mast(0.24, 0.9); mast(-0.16, 0.96);
  ctx.lineWidth = 1.4; ctx.strokeStyle = ink;
  const poly = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))); ctx.closePath(); ctx.stroke(); };
  poly([[-0.18, 0.2], [-0.72, 0.21], [-0.55, 0.78], [-0.2, 0.6]]);
  poly([[0.22, 0.19], [-0.1, 0.2], [-0.05, 0.6], [0.2, 0.55]]);
  poly([[0.2, 0.62], [0.2, 0.85], [0.19, 0.62]]);
  poly([[0.62, 0.2], [0.24, 0.62], [0.36, 0.16]]);
  poly([[0.86, 0.29], [0.22, 0.82], [0.47, 0.2]]);
  ctx.beginPath(); ctx.moveTo(sx(0.6), sy(sheer(1))); ctx.lineTo(sx(1.1), sy(sheer(1) + 0.11)); ctx.stroke();
  // half-breadth plan
  const by = H * 0.8;
  ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 60; i++) { const u = i / 60; const x = X0 + u * LEN; const z = halfBeam(u); i ? ctx.lineTo(sx(x), by - z * (W * 0.62 / LEN)) : ctx.moveTo(sx(x), by - z * (W * 0.62 / LEN)); }
  ctx.stroke(); ctx.lineWidth = 1; ctx.strokeStyle = faint; ctx.beginPath(); ctx.moveTo(sx(X0), by); ctx.lineTo(sx(X0 + LEN), by); ctx.stroke();
  for (let k = 1; k <= 3; k++) { ctx.beginPath(); for (let i = 0; i <= 60; i++) { const u = i / 60; const z = halfBeam(u) * (1 - k * 0.22); i ? ctx.lineTo(sx(X0 + u * LEN), by - z * (W * 0.62 / LEN)) : ctx.moveTo(sx(X0 + u * LEN), by - z * (W * 0.62 / LEN)); } ctx.stroke(); }
  // dimension line
  ctx.strokeStyle = ink; ctx.lineWidth = 1.2; const dy = sy(-0.2);
  ctx.beginPath(); ctx.moveTo(sx(X0), dy); ctx.lineTo(sx(X0 + LEN), dy); ctx.stroke();
  [[X0, 1], [X0 + LEN, -1]].forEach(([x, s]) => { ctx.beginPath(); ctx.moveTo(sx(x), dy); ctx.lineTo(sx(x) + 14 * s, dy - 6); ctx.lineTo(sx(x) + 14 * s, dy + 6); ctx.closePath(); ctx.fillStyle = ink; ctx.fill(); });
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.font = `italic 30px ${LATIN}`; ctx.fillText('62 ft. 6 in. on deck', (sx(X0) + sx(X0 + LEN)) / 2, dy - 12);
  // title block
  ctx.textAlign = 'left'; ctx.font = `600 54px ${SERIF}`; ctx.fillText('拾光號', W * 0.72, H * 0.17);
  ctx.font = `italic 40px ${LATIN}`; ctx.fillText('Halcyon — topsail schooner', W * 0.72, H * 0.23);
  ctx.font = `28px ${LATIN}`; ctx.fillText('Sail plan & half-breadth', W * 0.72, H * 0.28); ctx.fillText('Scale 1 : 192', W * 0.72, H * 0.32);
  ctx.font = `30px ${KAI}`; ctx.fillStyle = 'rgba(90,30,20,0.85)'; ctx.fillText('帆再收窄一些，好穿過瓶頸', W * 0.6, H * 0.9);
  return c;
}

export function letterCanvas(sheetImg) {
  const W = 1024, H = 1400;
  const c = cv(W, H), ctx = c.getContext('2d');
  if (sheetImg && sheetImg.width) ctx.drawImage(sheetImg, 0, 0, sheetImg.width * 0.66, sheetImg.height, 0, 0, W, H); else { ctx.fillStyle = '#efe4c8'; ctx.fillRect(0, 0, W, H); }
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(30,26,48,0.85)'; ctx.font = `52px ${KAI}`;
  const lines = ['親愛的船長：', '', '燈塔的光依舊每夜準時亮起，', '三秒一閃，像在數著你的歸期。', '', '等你把這片海裝進瓶子，', '記得在瓶口封上紅蠟，', '再寄一封信回來。', '', '　　　　　　—— 守燈人', '　　　　　　一八八七年 秋'];
  lines.forEach((l, i) => ctx.fillText(l, 110, 200 + i * 96));
  ctx.strokeStyle = 'rgba(30,26,48,0.15)'; ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo(90, 220 + i * 96); ctx.lineTo(W - 90, 220 + i * 96); ctx.stroke(); }
  return c;
}

export function logPageCanvas(sheetImg) {
  const W = 1024, H = 1400;
  const c = cv(W, H), ctx = c.getContext('2d');
  if (sheetImg && sheetImg.width) ctx.drawImage(sheetImg, sheetImg.width * 0.3, 0, sheetImg.width * 0.66, sheetImg.height, 0, 0, W, H); else { ctx.fillStyle = '#efe4c8'; ctx.fillRect(0, 0, W, H); }
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = 'rgba(120,40,30,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(150, 80); ctx.lineTo(150, H - 80); ctx.stroke();
  ctx.fillStyle = 'rgba(40,30,22,0.85)'; ctx.font = `44px ${KAI}`;
  const lines = ['九月十二日　西南風三級', '　　晨霧，見燈塔於東北。', '九月十三日　風轉北', '　　海豚三隻伴航半日。', '九月十四日　晴', '　　船貓又偷了一條魚。', '九月十五日　夜', '　　月很亮，海很小。'];
  lines.forEach((l, i) => ctx.fillText(l, 175, 180 + i * 120));
  return c;
}

export function ropeCanvas(w = 128, h = 32) {
  const c = cv(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#b79a6c'; ctx.fillRect(0, 0, w, h);
  for (let i = -h; i < w + h; i += 16) {
    const g = ctx.createLinearGradient(i, 0, i + 14, 0);
    g.addColorStop(0, 'rgba(70,50,25,0.7)'); g.addColorStop(0.5, 'rgba(255,240,200,0.25)'); g.addColorStop(1, 'rgba(70,50,25,0.7)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 16, 0); ctx.lineTo(i + 16 + h, h); ctx.lineTo(i + h, h); ctx.fill();
  }
  const R = rng(5); for (let i = 0; i < 200; i++) { ctx.fillStyle = `rgba(255,240,210,${R() * 0.15})`; ctx.fillRect(R() * w, R() * h, 3, 1); }
  return c;
}

// ---------------------------------------------------------------- sprites
export function softSprite(size = 64) {
  const c = cv(size, size), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export function cloudSprite(size = 256, seed = 3) {
  const c = cv(size, size), ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data, N = makeNoise(seed);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - size / 2) / (size / 2), dy = (y - size / 2) / (size / 2);
    const r = Math.sqrt(dx * dx + dy * dy * 1.6);
    const n = N.fbm(x * 0.03, y * 0.03, 5);
    const a = clamp((1 - r) * 1.6 + (n - 0.5) * 1.4 - 0.2, 0, 1);
    const sh = clamp(0.55 + 0.45 * (-dy) + (n - 0.5) * 0.4, 0.3, 1);
    const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255 * sh; d[i + 3] = 255 * a * a;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function featherCanvas(w = 128, h = 512) {
  const c = cv(w, h), ctx = c.getContext('2d');
  ctx.save(); ctx.translate(w / 2, 0);
  for (let y = 20; y < h - 10; y += 3) {
    const t = y / h; const half = Math.sin(t * Math.PI) * w * 0.46 * (0.6 + 0.4 * t);
    ctx.strokeStyle = `rgba(${235 - t * 40},${225 - t * 50},${205 - t * 60},0.9)`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(-half * 0.6, y - 8, -half, y - 22 + Math.sin(y) * 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(half * 0.6, y - 8, half, y - 22 + Math.cos(y) * 3); ctx.stroke();
  }
  ctx.strokeStyle = '#d8ccb0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, h); ctx.stroke();
  ctx.restore();
  return c;
}

export function grassBladeCanvas(w = 256, h = 256) {
  const c = cv(w, h), ctx = c.getContext('2d');
  const R = rng(77);
  for (let i = 0; i < 26; i++) {
    const x = w * (0.2 + R() * 0.6), lean = (R() - 0.5) * w * 0.5, hh = h * (0.5 + R() * 0.5);
    const g = ctx.createLinearGradient(0, h, 0, h - hh);
    const dry = R() < 0.3;
    g.addColorStop(0, dry ? '#4a4026' : '#22301a'); g.addColorStop(1, dry ? '#a8965a' : '#7a9a48');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 4, h); ctx.quadraticCurveTo(x + lean * 0.4, h - hh * 0.6, x + lean, h - hh); ctx.quadraticCurveTo(x + lean * 0.4 + 3, h - hh * 0.6, x + 4, h); ctx.fill();
  }
  return c;
}
