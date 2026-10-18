import * as THREE from 'three';

const LINEAR = (n) => /(_n|_orm)$/.test(n) || n === 'glasswear';

// Textures are embedded by the build as data URIs inside <script id="asset-data" type="application/json">.
export async function loadAssets(renderer, onProgress = () => { }) {
  const el = document.getElementById('asset-data');
  let data = { tex: {} };
  try { data = JSON.parse(el ? el.textContent : '{"tex":{}}'); } catch (e) { console.warn('asset data', e); }
  const names = Object.keys(data.tex || {});
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = {};
  let done = 0;
  await Promise.all(names.map(async (n) => {
    const img = new Image();
    img.src = data.tex[n];
    try { await img.decode(); } catch (e) { console.warn('decode', n, e); }
    const t = new THREE.Texture(img);
    t.colorSpace = LINEAR(n) ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    t.needsUpdate = true;
    t.name = n;
    tex[n] = t;
    onProgress(++done / Math.max(1, names.length));
  }));
  // fallback 1x1 textures for anything missing
  const fallback = (rgb) => { const d = new THREE.DataTexture(new Uint8Array([...rgb, 255]), 1, 1); d.needsUpdate = true; return d; };
  return new Proxy(tex, {
    get(o, k) {
      if (k in o) return o[k];
      if (typeof k !== 'string') return undefined;
      const f = /_n$/.test(k) ? fallback([128, 128, 255]) : /_orm$/.test(k) ? fallback([255, 160, 0]) : fallback([160, 150, 140]);
      if (!/_n$|_orm$/.test(k)) f.colorSpace = THREE.SRGBColorSpace;
      o[k] = f; return f;
    },
  });
}

// Clone a texture with its own repeat/offset (shares the GPU image)
export function rep(t, x, y = x, rot = 0) {
  const c = t.clone();
  c.repeat.set(x, y);
  c.rotation = rot;
  c.needsUpdate = true;
  return c;
}

export const FONTS = {
  serif: '"BV Serif", "Noto Serif TC", "Noto Serif CJK TC", "Songti TC", "PMingLiU", serif',
  kai: '"BV Kai", "LXGW WenKai TC", "Kaiti TC", "DFKai-SB", "BiauKai", serif',
  latin: '"BV Garamond", "Cormorant Garamond", "Garamond", "Baskerville", serif',
};

export async function fontsReady() {
  const tests = ['400 32px "BV Serif"', '600 32px "BV Serif"', '400 32px "BV Kai"', 'italic 400 32px "BV Garamond"', '600 32px "BV Garamond"', '500 32px "BV Garamond"'];
  try {
    await Promise.race([Promise.all(tests.map(f => document.fonts.load(f, '拾光號 Halcyon 1887'))), new Promise(r => setTimeout(r, 4000))]);
  } catch (e) { }
}
