// Bundles src/ + template.html + assets/ into ONE self-contained HTML file.
//   node build.mjs --min                 -> index.html (what GitHub Pages serves)
//   node build.mjs --out=dist/index.html -> unminified dev build
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

const MIN = process.argv.includes('--min');
const OUTF = (process.argv.find(a => a.startsWith('--out=')) || '--out=index.html').slice(6);

// three.js is MIT: keep its notice inside the bundle (esbuild strips legal comments otherwise)
const threeLicense = fs.readFileSync('node_modules/three/LICENSE', 'utf8').trim();
const r = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: MIN, write: false,
  target: 'chrome100', legalComments: 'none',
  banner: { js: '/*! three.js (https://threejs.org) bundled under the MIT License:\n' + threeLicense + '\n*/' },
});
let js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// fonts (SIL OFL 1.1 subsets, see THIRD_PARTY_NOTICES.md)
const F = 'assets/fonts';
const face = (fam, file, weight, style = 'normal') => `@font-face{font-family:"${fam}";src:url(data:font/woff2;base64,${fs.readFileSync(path.join(F, file)).toString('base64')}) format("woff2");font-weight:${weight};font-style:${style};font-display:block}`;
const fonts = [
  '/*! Fonts: Noto Serif CJK TC (c) Adobe; LXGW WenKai TC (c) LXGW, The Klee Project Authors; Cormorant Garamond (c) The Cormorant Project Authors. Subsets, SIL Open Font License 1.1 (https://openfontlicense.org). */',
  face('BV Serif', 'serif-400.woff2', 400), face('BV Serif', 'serif-600.woff2', 600),
  face('BV Serif', 'serif-400.woff2', 500), face('BV Kai', 'kai-400.woff2', 400),
  face('BV Garamond', 'corm-400-normal.woff2', 400), face('BV Garamond', 'corm-500-normal.woff2', 500), face('BV Garamond', 'corm-600-normal.woff2', 600),
  face('BV Garamond', 'corm-400-italic.woff2', 400, 'italic'), face('BV Garamond', 'corm-500-italic.woff2', 500, 'italic'),
].join('\n');

// textures (procedurally baked by tools/bake.py)
const T = 'assets/tex';
const tex = {};
for (const f of fs.readdirSync(T).filter(f => f.endsWith('.webp')).sort()) tex[f.replace('.webp', '')] = 'data:image/webp;base64,' + fs.readFileSync(path.join(T, f)).toString('base64');
const assets = JSON.stringify({ tex });

let html = fs.readFileSync('template.html', 'utf8');
html = html.replace('/*__FONTS__*/', () => fonts).replace('/*__ASSETS__*/', () => assets).replace('<script>/*__APP__*/</script>', () => '<script>\n' + js + '\n</script>');
fs.mkdirSync(path.dirname(path.resolve(OUTF)), { recursive: true });
fs.writeFileSync(OUTF, html);
const mb = (n) => (n / 1048576).toFixed(2) + 'MB';
console.log('ok', OUTF, mb(Buffer.byteLength(html)), 'js', mb(js.length), 'fonts', mb(fonts.length), 'tex', mb(assets.length));
