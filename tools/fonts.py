#!/usr/bin/env python3
"""Build subsetted, self-contained web fonts for the bottle scene.

Outputs (assets/fonts/):
  serif-400.woff2  Noto Serif CJK TC Regular  -> characters used in the sources (UI copy)
  serif-600.woff2  Noto Serif CJK TC SemiBold -> Big5 common set + sources (engraving, titles)
  kai-400.woff2    LXGW WenKai TC Regular     -> Big5 common set + sources (handwriting)
  corm-*.woff2     Cormorant Garamond (latin)
"""
import glob, os, re, shutil, sys, io
from fontTools.ttLib import TTFont, TTCollection
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'fonts')
# npm packages lxgw-wenkai-tc-webfont + @fontsource/cormorant-garamond (see README)
FW = os.environ.get('FONT_NODE_MODULES', os.path.join(ROOT, 'node_modules'))
NOTO = os.environ.get('NOTO_CJK_DIR', '/usr/share/fonts/opentype/noto')  # Debian/Ubuntu: apt install fonts-noto-cjk
os.makedirs(OUT, exist_ok=True)


def source_chars():
    s = set()
    for fn in glob.glob(os.path.join(ROOT, 'src', '**', '*.js'), recursive=True) + [os.path.join(ROOT, 'template.html')]:
        s |= set(open(fn, encoding='utf8').read())
    return {c for c in s if ord(c) > 0x7f}


def big5_common():
    chars = set()
    # symbols A140-A3BF, common hanzi A440-C67E
    for lead in range(0xA1, 0xC7):
        for trail in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
            b = bytes([lead, trail])
            try:
                c = b.decode('big5')
            except Exception:
                continue
            if lead == 0xC6 and trail > 0x7E:
                continue
            chars.add(c)
    return chars


ASCII = {chr(i) for i in range(0x20, 0x7f)}
EXTRA = set('，。、；：！？「」『』（）《》〈〉…—–·‧〇ー～・　 ’‘“”°×←→↑↓✦✧')


def subset_font(font, chars, out, layout=False):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern', 'liga', 'palt'] if layout else []
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    opts.notdef_outline = True
    opts.hinting = False
    opts.desubroutinize = False
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[ord(c) for c in chars])
    sub.subset(font)
    font.flavor = 'woff2'
    font.save(out)
    return os.path.getsize(out)


def merged_lxgw():
    files = sorted(glob.glob(f'{FW}/lxgw-wenkai-tc-webfont/files/lxgwwenkaitc-regular-subset-*.woff2'),
                   key=lambda f: int(re.findall(r'-(\d+)\.woff2', f)[0]))
    base = TTFont(files[0])
    base.flavor = None
    order = list(base.getGlyphOrder())
    have = set(order)
    glyf, hmtx = base['glyf'], base['hmtx']
    vmtx = base['vmtx'] if 'vmtx' in base else None
    cmap_add = {}
    for fn in files[1:]:
        f = TTFont(fn)
        g2, h2 = f['glyf'], f['hmtx']
        v2 = f['vmtx'] if 'vmtx' in f else None

        def copy(name):
            if name in have:
                return
            gl = g2[name]
            if gl.isComposite():
                for comp in gl.components:
                    copy(comp.glyphName)
            glyf[name] = gl
            hmtx[name] = h2[name]
            if vmtx is not None and v2 is not None and name in v2.metrics:
                vmtx[name] = v2[name]
            order.append(name)
            have.add(name)

        for cp, name in f.getBestCmap().items():
            copy(name)
            cmap_add[cp] = name
    base.setGlyphOrder(order)
    glyf.glyphOrder = order
    for t in base['cmap'].tables:
        if t.isUnicode():
            for cp, name in cmap_add.items():
                if t.format == 4 and cp > 0xFFFF:
                    continue
                t.cmap.setdefault(cp, name)
    base['maxp'].numGlyphs = len(order)
    for tag in ['GSUB', 'GPOS', 'morx', 'feat', 'bsln', 'FFTM']:
        if tag in base:
            del base[tag]
    buf = io.BytesIO()
    base.save(buf)
    buf.seek(0)
    return TTFont(buf)


def main():
    src = source_chars()
    b5 = big5_common()
    print('source chars', len(src), 'big5 common', len(b5))
    reg = TTCollection(f'{NOTO}/NotoSerifCJK-Regular.ttc').fonts[3]
    print('serif-400', subset_font(reg, src | ASCII | EXTRA, f'{OUT}/serif-400.woff2', layout=True))
    semi = TTCollection(f'{NOTO}/NotoSerifCJK-SemiBold.ttc').fonts[3]
    print('serif-600', subset_font(semi, src | ASCII | EXTRA | b5, f'{OUT}/serif-600.woff2', layout=True))
    kai = merged_lxgw()
    kai_set = src | ASCII | EXTRA | (b5 if '--kai-full' in sys.argv else set())
    print('kai-400', subset_font(kai, kai_set, f'{OUT}/kai-400.woff2'))
    cg = f'{FW}/@fontsource/cormorant-garamond/files'
    for w, st in [(400, 'normal'), (500, 'normal'), (600, 'normal'), (400, 'italic'), (500, 'italic')]:
        shutil.copy(f'{cg}/cormorant-garamond-latin-{w}-{st}.woff2', f'{OUT}/corm-{w}-{st}.woff2')
    tot = sum(os.path.getsize(p) for p in glob.glob(f'{OUT}/*.woff2'))
    print('total fonts KB', tot // 1024)


if __name__ == '__main__':
    main()
