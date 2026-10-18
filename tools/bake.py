#!/usr/bin/env python3
"""Offline texture baker. Usage: python3 tools/bake.py [--only a,b] [--scale 0.5] [--preview]"""
import os, sys, time, argparse
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
from texlib import *

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'tex')
PREV = os.environ.get('BAKE_PREVIEW_DIR', os.path.join(ROOT, '.preview'))  # jpg previews (only with --preview)
NOTO_SEMI = os.environ.get('NOTO_SERIF_CJK_SEMIBOLD', '/usr/share/fonts/opentype/noto/NotoSerifCJK-SemiBold.ttc')
PREVIEW = '--preview' in sys.argv
os.makedirs(OUT, exist_ok=True)
S = 1.0
SIZES = {}
FONT_DIR = os.path.join(ROOT, 'tools', '_ttf')


def R(n):
    return max(8, int(round(n * S)))


def out(name, arr, q=86, lossless=False):
    path = os.path.join(OUT, name + '.webp')
    n = save(arr, path, q=q, lossless=lossless)
    SIZES[name] = n
    im = to_img(arr) if isinstance(arr, np.ndarray) else arr
    size = im.size
    if PREVIEW:
        os.makedirs(PREV, exist_ok=True)
        im.thumbnail((768, 768))
        im.convert('RGB').save(os.path.join(PREV, name + '.jpg'), quality=85)
    print(f'  {name:18s} {size} {n // 1024} KB', flush=True)


def ttf(name):
    return os.path.join(FONT_DIR, name)


# ------------------------------------------------------------------ wood
def wood(X, Y, seed, rings=18.0, warp=1.0, figure=0.25, stops=None, pore=0.12, knots=0, late_k=0.24):
    """Grain runs along X. Returns (rgb, height, latewood)."""
    bend = fbm(X, Y, 1, 1, 3, seed=seed) * 0.9 + fbm(X, Y, 3, 2, 3, seed=seed + 1) * 0.3
    wig = fbm(X, Y, 8, 40, 3, seed=seed + 7)
    t = Y * rings + bend * warp * 1.4 + wig * 0.18
    if knots:
        r = np.random.default_rng(seed + 11)
        for _ in range(knots):
            kx, ky, kr = r.random(), r.random(), r.uniform(0.004, 0.012)
            d = np.sqrt(((X - kx) * 4.0) ** 2 + (Y - ky) ** 2) + 1e-4
            t = t + kr / d * np.exp(-d * 30) * rings * 0.3
    f = t - np.floor(t)
    late = sstep(0.45, 0.85, f) * (1 - sstep(0.88, 1.0, f))
    p1 = Perlin(40, 1400, seed + 3)(X * 40, Y * 1400)
    p2 = Perlin(90, 2200, seed + 5)(X * 90, Y * 2200)
    pores = sstep(0.45, 0.85, p1) * 0.6 + sstep(0.5, 0.9, p2) * 0.4
    streak = Perlin(2, 50, seed + 19)(X * 2, Y * 50) + 0.5 * Perlin(4, 120, seed + 21)(X * 4, Y * 120)
    fig = 0.5 + 0.5 * np.sin(2 * np.pi * (Y * rings * 0.22 + bend * 1.0))
    mott = fbm(X, Y, 3, 5, 4, seed=seed + 13)
    lv = 0.6 + 0.4 * fbm(X, Y, 4, 12, 3, seed=seed + 17)
    k = 0.6 + 0.14 * mott + 0.12 * streak + figure * (fig - 0.5) * 0.4 - late_k * late * lv
    rgb = ramp(k, stops)
    rgb = rgb * (1 - pore * pores[..., None])
    height = 0.35 * (1 - late) - 0.5 * pores * pore * 4
    return rgb, height, late


MAHOGANY = [(0.0, '#170804'), (0.35, '#311107'), (0.6, '#4a1c0c'), (0.82, '#662b14'), (1.0, '#80401f')]
WALNUT = [(0.0, '#160d07'), (0.3, '#2f1e12'), (0.55, '#4a3020'), (0.8, '#6a4a30'), (1.0, '#82603e')]
OAK_DARK = [(0.0, '#140b05'), (0.3, '#2a180c'), (0.55, '#402714'), (0.8, '#5c3c20'), (1.0, '#74502e')]
OAK_FLOOR = [(0.0, '#1c1209'), (0.3, '#3a2614'), (0.55, '#56391f'), (0.8, '#745030'), (1.0, '#8f683f')]
DECK = [(0.0, '#5e4c35'), (0.3, '#86704f'), (0.6, '#a68e68'), (0.85, '#bda783'), (1.0, '#cdb894')]


# ------------------------------------------------------------------ desk
def bake_desk():
    W, H = R(4096), R(2504)
    X, Y = grid(W, H)
    wx = -18 + 36 * X
    wz = -12 + 22 * Y
    # border sides (mitered)
    dl, dr, db, df = wx + 18, 18 - wx, wz + 12, 10 - wz
    side = np.argmin(np.stack([dl, dr, db, df]), 0)
    # wood along x (back/front) and along z (left/right)
    ga, ha, la = wood(X * 1.0, Y * 1.0, 11, rings=55, warp=1.0, figure=0.3, stops=WALNUT, pore=0.14)
    gb, hb, lb = wood(Y * 1.0, X * 1.0, 23, rings=90, warp=1.0, figure=0.3, stops=WALNUT, pore=0.14)
    along_x = (side >= 2)
    wood_rgb = np.where(along_x[..., None], ga, gb)
    wood_h = np.where(along_x, ha, hb)
    # leather region
    lx0, lx1, lz0, lz1 = -15.8, 15.8, -9.8, 7.8
    inl = (wx > lx0) & (wx < lx1) & (wz > lz0) & (wz < lz1)
    ed = np.minimum(np.minimum(wx - lx0, lx1 - wx), np.minimum(wz - lz0, lz1 - wz))
    # leather
    F1, F2, _ = worley(X, Y, R(1100), R(680), seed=5)
    peb = sstep(0.0, 0.35, F2 - F1)
    mott = fbm(X, Y, 7, 4, 5, seed=31)
    crease = fbm(X, Y, 22, 14, 3, seed=37, ridged=True)
    wear = np.exp(-(((wx - 0.0) / 9) ** 2 + ((wz - 3.5) / 5) ** 2)) * 0.7 + np.exp(-((wz - 7.6) / 1.2) ** 2) * 0.5 * sstep(14, 6, np.abs(wx))
    wear = np.clip(wear + fbm(X, Y, 10, 6, 3, seed=41) * 0.4, 0, 1)
    lk = 0.42 + 0.25 * mott + 0.12 * (peb - 0.5) - 0.1 * sstep(0.5, 0.9, crease) + 0.25 * wear
    lea = ramp(lk, [(0.0, '#0b1a12'), (0.35, '#16291e'), (0.6, '#21382a'), (0.85, '#344936'), (1.0, '#4b5a40')])
    # stains: ink near inkwell, rings, small scuffs
    r = np.random.default_rng(3)
    stain = np.zeros((H, W), F32)
    for _ in range(9):
        cx, cz = 3.4 + r.normal(0, 0.9), -2.3 + r.normal(0, 0.7)
        rr = r.uniform(0.05, 0.22)
        d = np.sqrt((wx - cx) ** 2 + (wz - cz) ** 2)
        stain = np.maximum(stain, sstep(rr, rr * 0.4, d + fbm(X, Y, 60, 37, 2, seed=int(r.integers(1e6))) * 0.06) * r.uniform(0.5, 0.9))
    ring = np.zeros((H, W), F32)
    for cx, cz, rr in [(-8.4, -6.6, 0.95), (9.2, 5.6, 0.8), (-11.2, 4.4, 0.7)]:
        d = np.sqrt((wx - cx) ** 2 + (wz - cz) ** 2) + fbm(X, Y, 40, 24, 3, seed=int(cx * 10)) * 0.08
        ring = np.maximum(ring, np.exp(-((d - rr) / 0.035) ** 2) * 0.55 + sstep(rr, rr - 0.1, d) * 0.12)
    scr = scratches(W, H, int(600 * S * S) + 40, 9, length=(0.004, 0.03), width=max(1, R(2)), alpha=(0.15, 0.6))
    lea = lea * (1 - 0.65 * stain[..., None]) * (1 - 0.35 * ring[..., None]) + scr[..., None] * np.array([0.05, 0.06, 0.04], F32) * inl[..., None]
    lea = lea * (1 - 0.25 * (1 - sstep(0.0, 0.35, ed)))[..., None]
    # gold tooling (drawn as vector)
    tool = Image.new('L', (W, H), 0)
    dd = ImageDraw.Draw(tool)
    def P(x, z):
        return ((x + 18) / 36 * W, (z + 12) / 22 * H)
    def rect(inset, width):
        x0, z0 = P(lx0 + inset, lz0 + inset)
        x1, z1 = P(lx1 - inset, lz1 - inset)
        dd.rectangle([x0, z0, x1, z1], outline=255, width=max(1, int(width / 36 * W)))
    rect(0.14, 0.05)
    rect(0.26, 0.025)
    rect(0.58, 0.02)
    # dotted roll
    inset = 0.42
    step = 0.11
    for xx in np.arange(lx0 + inset, lx1 - inset, step):
        for zz in (lz0 + inset, lz1 - inset):
            x, z = P(xx, zz)
            rr_ = 0.018 / 36 * W
            dd.ellipse([x - rr_, z - rr_, x + rr_, z + rr_], fill=255)
    for zz in np.arange(lz0 + inset, lz1 - inset, step):
        for xx in (lx0 + inset, lx1 - inset):
            x, z = P(xx, zz)
            rr_ = 0.018 / 36 * W
            dd.ellipse([x - rr_, z - rr_, x + rr_, z + rr_], fill=255)
    # corner fleurons
    for sx, sz in [(1, 1), (-1, 1), (1, -1), (-1, -1)]:
        cx = (lx0 + 0.58) if sx > 0 else (lx1 - 0.58)
        cz = (lz0 + 0.58) if sz > 0 else (lz1 - 0.58)
        for rad, wdt in [(0.9, 0.022), (0.7, 0.014)]:
            x0, z0 = P(cx - rad, cz - rad)
            x1, z1 = P(cx + rad, cz + rad)
            a0 = {(1, 1): 0, (-1, 1): 90, (-1, -1): 180, (1, -1): 270}[(sx, sz)]
            dd.arc([x0, z0, x1, z1], a0, a0 + 90, fill=255, width=max(1, int(wdt / 36 * W)))
        for k in range(5):
            ang = np.radians(a0 + 9 + k * 18)
            px_, pz_ = cx + np.cos(ang) * 0.5, cz + np.sin(ang) * 0.5
            x, z = P(px_, pz_)
            rr_ = 0.06 / 36 * W
            dd.ellipse([x - rr_ * 0.5, z - rr_ * 0.5, x + rr_ * 0.5, z + rr_ * 0.5], fill=255)
    tm = np.asarray(tool.filter(ImageFilter.GaussianBlur(radius=max(0.6, 1.2 * S)))).astype(F32) / 255
    gwear = sstep(0.15, 0.45, fbm(X, Y, 40, 24, 4, seed=77) + 0.25 + wear * 0.25)
    gold = tm * (1 - 0.8 * gwear) * inl
    gold_rgb = ramp(0.5 + 0.4 * fbm(X, Y, 60, 40, 2, seed=78), [(0, '#5e4518'), (0.5, '#a07d36'), (1, '#d9b766')])
    rgb = np.where(inl[..., None], lea, wood_rgb)
    rgb = lerp(rgb, gold_rgb, gold[..., None])
    # wood: lighter scratches + front edge wear + slight darkening at leather groove
    wscr = scratches(W, H, int(900 * S * S) + 60, 19, length=(0.003, 0.02), width=1, alpha=(0.1, 0.5))
    fwear = np.exp(-((wz - 10) / 0.9) ** 2) * 0.35
    rgb = np.where(inl[..., None], rgb, rgb * (1 + 0.25 * wscr[..., None] + fwear[..., None]))
    groove = np.exp(-(np.minimum(np.abs(wx - lx0), np.abs(wx - lx1)) / 0.05) ** 2) * ((wz > lz0 - 0.05) & (wz < lz1 + 0.05)) + \
        np.exp(-(np.minimum(np.abs(wz - lz0), np.abs(wz - lz1)) / 0.05) ** 2) * ((wx > lx0 - 0.05) & (wx < lx1 + 0.05))
    rgb = rgb * (1 - 0.55 * groove[..., None])
    # miter lines
    mit = np.zeros((H, W), F32)
    for (cx, cz) in [(-18, -12), (18, -12), (-18, 10), (18, 10)]:
        sxn, szn = np.sign(-cx), np.sign(-cz)
        dist = np.abs((wx - cx) * szn - (wz - cz) * sxn) / np.sqrt(2)
        mit = np.maximum(mit, np.exp(-(dist / 0.02) ** 2) * ((~inl) & (np.abs(wx - cx) < 2.3) & (np.abs(wz - cz) < 2.3)))
    rgb = rgb * (1 - 0.5 * mit[..., None])
    out('desk', rgb, q=84)
    # height / normal (half res)
    hgt = np.where(inl, -0.6 + 0.25 * peb - 0.15 * sstep(0.5, 0.9, crease) - 0.9 * tm, wood_h * 0.6 + 0.0)
    hgt = hgt - 1.2 * groove - 0.6 * mit - 0.3 * wscr * (~inl) - 0.2 * scr * inl - 0.25 * stain
    h2 = hgt.reshape(H // 2, 2, W // 2, 2).mean((1, 3)) if (H % 2 == 0 and W % 2 == 0) else hgt[::2, ::2]
    out('desk_n', normal_from_height(h2, 1.6, wrap=False), q=90)
    # ORM: R=ao, G=rough, B=metal
    rough = np.where(inl, 0.62 - 0.18 * wear + 0.1 * peb, 0.3 + 0.18 * wscr + 0.15 * fwear + 0.06 * fbm(X, Y, 8, 5, 3, seed=88))
    rough = lerp(rough, 0.32, gold)
    rough = rough + 0.15 * stain
    ao = 1 - 0.5 * groove - 0.2 * mit
    orm = np.stack([ao, rough, gold * 0.95], -1)
    o4 = orm.reshape(H // 4, 4, W // 4, 4, 3).mean((1, 3)) if (H % 4 == 0 and W % 4 == 0) else orm[::4, ::4]
    out('desk_orm', o4, q=88)


# ------------------------------------------------------------------ stand mahogany
def bake_stand():
    W, H = R(2048), R(1024)
    X, Y = grid(W, H)
    rgb, h, late = wood(X, Y, 101, rings=26, warp=0.7, figure=0.9, stops=MAHOGANY, pore=0.18)
    ribbon = 0.5 + 0.5 * np.sin(2 * np.pi * (Y * 9 + fbm(X, Y, 2, 2, 3, seed=103) * 1.2))
    rgb = rgb * (0.86 + 0.24 * ribbon[..., None])
    out('stand', rgb, q=86)
    out('stand_n', normal_from_height(h * 0.6 - 0.4 * late, 1.4), q=90)


# ------------------------------------------------------------------ floor
def bake_floor():
    W = H = R(2048)
    X, Y = grid(W, H)
    nplank = 5
    pi = np.floor(Y * nplank)
    r = np.random.default_rng(7)
    offs = r.random(64)
    lens = r.uniform(0.45, 1.0, 64)
    u = X + offs[pi.astype(int) % 64]
    seg = np.floor(u / lens[pi.astype(int) % 64])
    pid = (pi * 13 + seg * 7) % 64
    rgb, h, late = wood(np.mod(u, 1.0), np.mod(Y * nplank, 1.0) * 0.2 + pid / 64.0, 201, rings=26, warp=1.0, figure=0.15, stops=OAK_FLOOR, pore=0.16, knots=4)
    tone = (r.random(64)[pid.astype(int)] - 0.5) * 0.22
    rgb = rgb * (1 + tone[..., None])
    vy = np.mod(Y * nplank, 1.0)
    seam_y = sstep(0.012, 0.0, np.minimum(vy, 1 - vy))
    ul = np.mod(u, lens[pi.astype(int) % 64]) / lens[pi.astype(int) % 64]
    seam_x = sstep(0.004, 0.0, np.minimum(ul, 1 - ul))
    seam = np.maximum(seam_y, seam_x)
    wear = sstep(0.2, 0.7, fbm(X, Y, 3, 3, 4, seed=209)) * 0.25
    rgb = rgb * (1 - 0.7 * seam[..., None]) * (1 + wear[..., None])
    # nails
    nail = np.zeros((H, W), F32)
    for k in range(nplank):
        for xx in np.arange(0.03, 1, 0.18):
            for vv in (0.25, 0.75):
                cx, cy = (xx + k * 0.07) % 1, (k + vv) / nplank
                d = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
                nail = np.maximum(nail, sstep(0.0035, 0.0015, d))
    rgb = rgb * (1 - 0.6 * nail[..., None])
    out('floor', rgb, q=82)
    out('floor_n', normal_from_height(h * 0.5 - 2.0 * seam - 0.5 * nail, 1.6), q=88)


# ------------------------------------------------------------------ wall panel
def bake_panel():
    W, H = R(1536), R(2048)  # one bay: 8 units wide x 10.67 tall
    X, Y = grid(W, H)
    stile, rail = 0.07, 0.055
    bev = 0.06
    # distances to the frame
    dx = np.minimum(X, 1 - X)
    dy = np.minimum(Y, 1 - Y) * (H / W)
    infield = np.minimum(dx - stile, dy - rail * (H / W) / (H / W))
    fx = dx - stile
    fy = Y.copy()
    fy = np.minimum(Y, 1 - Y) - rail
    m = np.minimum(fx / 1.0, fy * (H / W))
    frame = m < 0
    hh = np.where(frame, 1.0, 0.0)
    ramp_ = np.clip(m / bev, 0, 1)
    panel_h = np.where(frame, 1.0, 0.45 + 0.4 * sstep(0, 1, ramp_))
    groove = np.exp(-(m / 0.004) ** 2) * 0.7
    height = panel_h - groove
    # wood: vertical grain on stiles and panel, horizontal on rails
    gv, hv, lv = wood(Y, X * 0.75, 301, rings=22, warp=0.9, figure=0.25, stops=OAK_DARK, pore=0.15)
    gh, hh2, lh = wood(X, Y * 1.33, 307, rings=30, warp=0.9, figure=0.25, stops=OAK_DARK, pore=0.15)
    is_rail = frame & (np.minimum(Y, 1 - Y) - rail < 0) & (dx > stile * 0.98)
    rgb = np.where(is_rail[..., None], gh, gv)
    lit = 1 + 0.25 * (sstep(0, 1, ramp_) - 0.5) * (~frame)
    rgb = rgb * lit[..., None] * (1 - 0.6 * groove[..., None])
    # joints between stiles and rails
    out('panel', rgb, q=84)
    out('panel_n', normal_from_height(height * 3.0 + 0.3 * np.where(is_rail, hh2, hv), 2.0), q=90)


# ------------------------------------------------------------------ parchment / chart paper
def paper(W, H, seed, folds=True, tone=('#e7d8b4', '#d2bd8f', '#a88a58')):
    X, Y = grid(W, H)
    m1 = fbm(X, Y, 4, 3, 6, seed=seed)
    m2 = fbm(X, Y, 18, 13, 4, seed=seed + 1)
    fib = Perlin(int(220 * S) + 1, int(160 * S) + 1, seed + 2)(X * (int(220 * S) + 1), Y * (int(160 * S) + 1))
    k = 0.6 + 0.35 * m1 + 0.12 * m2 + 0.05 * fib
    rgb = ramp(k, [(0.0, tone[2]), (0.45, tone[1]), (1.0, tone[0])])
    # foxing spots
    r = np.random.default_rng(seed + 3)
    fox = np.zeros((H, W), F32)
    for _ in range(int(140)):
        cx, cy, rr = r.random(), r.random(), r.uniform(0.0015, 0.008)
        d = np.sqrt(((X - cx) * W / H) ** 2 + (Y - cy) ** 2)
        fox = np.maximum(fox, sstep(rr, rr * 0.2, d) * r.uniform(0.2, 0.7))
    # water stains (tide lines)
    st = fbm(X, Y, 3, 2, 5, seed=seed + 4)
    tide = (np.exp(-((st - 0.3) / 0.01) ** 2) * 0.22 + sstep(0.3, 0.4, st) * 0.08) * sstep(0.25, 0.32, fbm(X, Y, 2, 2, 3, seed=seed + 9) + 0.2)
    # edge darkening
    e = np.minimum(np.minimum(X, 1 - X) * W / H, np.minimum(Y, 1 - Y))
    edge = sstep(0.06, 0.0, e + fbm(X, Y, 30, 20, 3, seed=seed + 5) * 0.02)
    dark = np.clip(fox * 0.6 + tide + edge * 0.45, 0, 1)
    rgb = rgb * (1 - dark[..., None] * np.array([0.35, 0.45, 0.6], F32))
    height = 0.15 * fib + 0.3 * m2
    if folds:
        fx = np.exp(-(((X - 0.5) * W / H) / 0.004) ** 2)
        fy = np.exp(-((Y - 0.5) / 0.004) ** 2)
        crease = np.maximum(fx, fy)
        wearf = np.exp(-(((X - 0.5) * W / H) / 0.02) ** 2) + np.exp(-((Y - 0.5) / 0.02) ** 2)
        rgb = rgb * (1 - 0.22 * crease[..., None]) * (1 + 0.05 * np.clip(wearf, 0, 1)[..., None])
        height = height - 1.5 * crease + 0.4 * np.clip(wearf, 0, 1)
    return rgb, height


def bake_paper():
    W, H = R(4096), R(2880)
    rgb, h = paper(W, H, 51)
    out('paper', rgb, q=84)
    h2 = h[::2, ::2]
    out('paper_n', normal_from_height(h2, 2.0, wrap=False), q=88)
    # plain sheet (plans / letters / pages), no folds, lighter
    W2, H2 = R(1536), R(1024)
    rgb2, h2b = paper(W2, H2, 61, folds=False, tone=('#efe4c8', '#ddcca4', '#b89c6c'))
    out('sheet', rgb2, q=84)


# ------------------------------------------------------------------ leather (neutral, tinted in material)
def bake_leather():
    W = H = R(1024)
    X, Y = grid(W, H)
    F1, F2, _ = worley(X, Y, R(220), R(220), seed=401)
    peb = sstep(0.0, 0.4, F2 - F1)
    cr = fbm(X, Y, 10, 10, 4, seed=403, ridged=True)
    mott = fbm(X, Y, 4, 4, 5, seed=405)
    k = 0.55 + 0.2 * mott + 0.15 * (peb - 0.5) - 0.12 * sstep(0.6, 0.95, cr)
    g = np.clip(k, 0, 1)
    rgb = np.stack([g * 1.0, g * 0.93, g * 0.85], -1)
    out('leather', rgb, q=84)
    out('leather_n', normal_from_height(0.6 * peb - 0.4 * sstep(0.6, 0.95, cr), 2.5), q=88)


# ------------------------------------------------------------------ ship hull
def bake_hull():
    W, H = R(4096), R(1024)
    X, Y = grid(W, H)
    # image row 0 = y 0.19 (rail top), bottom = keel (y=-0.1); u = station along hull (stern 0 -> bow 1)
    yy = 0.19 - Y * 0.29
    u = X
    sheer = 0.075 + 0.18 * (u - 0.42) ** 2 + 0.03 * sstep(0.85, 1.0, u)
    wl = 0.0
    r = np.random.default_rng(9)
    pw, ph = 0.012, 0.006
    row = np.floor((wl - yy) / ph)
    cu = (u * 1.25 + (row % 2) * pw * 0.5) / pw
    cv = (wl - yy) / ph
    fu, fv = cu - np.floor(cu), cv - np.floor(cv)
    pid = (np.floor(cu) * 31 + row * 17) % 97
    plate_edge = np.maximum(sstep(0.06, 0.0, np.minimum(fu, 1 - fu)), sstep(0.1, 0.0, np.minimum(fv, 1 - fv)))
    nails = sstep(0.05, 0.02, np.sqrt(((fu - 0.08) * 1.0) ** 2 + ((fv - 0.15) * 0.5) ** 2)) + sstep(0.05, 0.02, np.sqrt(((fu - 0.92)) ** 2 + ((fv - 0.15) * 0.5) ** 2))
    ptone = (np.sin(pid * 12.9898) * 43758.5453) % 1.0
    patina = sstep(0.45, 0.85, fbm(X, Y, 14, 3, 5, seed=11) + 0.35 * sstep(-0.06, 0.0, yy) + 0.15 * (ptone - 0.5))
    streak = sstep(0.55, 0.9, Perlin(220, 6, 13)(X * 220, Y * 6)) * sstep(-0.1, 0.0, yy)
    cop = ramp(0.45 + 0.25 * fbm(X, Y, 30, 6, 3, seed=12) + 0.2 * (ptone - 0.5), [(0, '#4a2412'), (0.5, '#8a4b26'), (1, '#c07a46')])
    ver = ramp(0.5 + 0.3 * fbm(X, Y, 40, 8, 3, seed=15), [(0, '#2f5a4a'), (0.5, '#4f8a72'), (1, '#86b8a0')])
    copper = lerp(cop, ver, np.clip(patina + streak * 0.5, 0, 1)[..., None]) * (1 - 0.35 * plate_edge[..., None]) * (1 - 0.4 * nails[..., None])
    # planking strakes follow the sheer
    rel = sheer - yy
    strake = 0.011
    sr = np.floor(rel / strake)
    sv = rel / strake - sr
    su = (u * 1.25 + (sr % 3) * 0.13) / 0.32
    butt = sstep(0.01, 0.0, np.minimum(su % 1, 1 - su % 1))
    seam = np.maximum(sstep(0.08, 0.0, np.minimum(sv, 1 - sv)), butt)
    pg = fbm(X, Y, 40, 6, 3, seed=21)
    black = ramp(0.45 + 0.3 * pg + 0.1 * ((sr * 0.37) % 1), [(0, '#0b0907'), (0.6, '#1d1915'), (1, '#2e2822')])
    topside = black * (1 - 0.5 * seam[..., None])
    band = (rel > 0.006) & (rel < 0.032)
    ochre = ramp(0.5 + 0.3 * fbm(X, Y, 50, 8, 3, seed=23), [(0, '#8a6a36'), (0.5, '#b08d4c'), (1, '#c9a865')])
    pu = (u * 1.25 - 0.2) / 0.072
    port = (np.abs(pu - np.floor(pu) - 0.5) < 0.22) & (rel > 0.01) & (rel < 0.028) & (u > 0.16) & (u < 0.86)
    bandc = np.where(port[..., None], np.array([0.06, 0.05, 0.045], F32), ochre)
    topside = np.where(band[..., None], bandc * (1 - 0.4 * seam[..., None]), topside)
    cove = np.exp(-((yy - (sheer + 0.014)) / 0.0013) ** 2) + 0.6 * np.exp(-((rel - 0.036) / 0.001) ** 2)
    boot = (yy > 0.0) & (yy < 0.009)
    topside = np.where(boot[..., None], ramp(0.6 + 0.2 * pg, [(0, '#b8ad95'), (1, '#e6dcc4')]), topside)
    topside = lerp(topside, np.array([0.85, 0.66, 0.3], F32), np.clip(cove, 0, 1)[..., None])
    scup = np.zeros_like(X)
    for xx in np.arange(0.12, 0.92, 0.055):
        d = np.abs(X - xx - r.normal(0, 0.004))
        scup = np.maximum(scup, np.exp(-(d / 0.0025) ** 2) * sstep(0.0, -0.06, -rel) * sstep(0.0, 0.12, yy) * r.uniform(0.3, 0.8))
    topside = topside + scup[..., None] * np.array([0.12, 0.09, 0.06], F32)
    grime = np.exp(-((yy - 0.002) / 0.006) ** 2) * (0.5 + 0.5 * fbm(X, Y, 60, 4, 3, seed=29))
    under = yy < 0.0
    rgb = np.where(under[..., None], copper, topside)
    rgb = lerp(rgb, np.array([0.17, 0.22, 0.12], F32), (grime * 0.6)[..., None])
    out('hull', rgb, q=88)
    hgt = np.where(under, -0.6 * plate_edge + 0.5 * nails, -0.8 * seam + 0.1 * pg) - 0.3 * np.clip(cove, 0, 1)
    out('hull_n', normal_from_height(hgt, 2.0, wrap=False), q=90)
    rough = np.where(under, 0.42 + 0.4 * patina, 0.55 - 0.1 * band) - 0.25 * np.clip(cove, 0, 1)
    metal = np.where(under, 0.85 - 0.6 * patina, 0.0) + 0.9 * np.clip(cove, 0, 1)
    out('hull_orm', np.stack([np.ones_like(X) - 0.3 * seam, np.clip(rough, 0, 1), np.clip(metal, 0, 1)], -1), q=90)


def bake_deck():
    W = H = R(2048)
    X, Y = grid(W, H)
    n = 12
    pr = np.floor(Y * n)
    r = np.random.default_rng(5)
    off = r.random(64)
    u = X + off[pr.astype(int) % 64]
    seg = np.floor(u * 1.6)
    pid = (pr * 7 + seg * 3) % 64
    rgb, h, late = wood(np.mod(u, 1), np.mod(Y * n, 1) * 0.15 + pid / 64, 501, rings=12, warp=0.8, figure=0.1, stops=DECK, pore=0.1)
    tone = (r.random(64)[pid.astype(int)] - 0.5) * 0.18
    vy = np.mod(Y * n, 1)
    caulk = sstep(0.05, 0.02, np.minimum(vy, 1 - vy))
    butt = sstep(0.004, 0.0, np.minimum(np.mod(u * 1.6, 1), 1 - np.mod(u * 1.6, 1)))
    rgb = rgb * (1 + tone[..., None])
    rgb = lerp(rgb, np.array([0.05, 0.04, 0.03], F32), np.maximum(caulk, butt)[..., None] * 0.9)
    out('deck', rgb, q=84)
    out('deck_n', normal_from_height(h * 0.4 - 1.5 * caulk - butt, 1.5), q=88)


def bake_sail():
    W = H = R(2048)
    X, Y = grid(W, H)
    weave = (np.sin(X * W * 0.9) * np.sin(Y * H * 0.9)) * 0.5 + 0.5
    m = fbm(X, Y, 3, 3, 5, seed=601)
    k = 0.62 + 0.2 * m + 0.04 * weave
    rgb = ramp(k, [(0, '#9b8c6c'), (0.5, '#cfc0a0'), (1, '#efe5cf')])
    nseam = 9
    su = X * nseam
    sd = np.minimum(su % 1, 1 - su % 1)
    seam = sstep(0.05, 0.0, sd) + 0.5 * sstep(0.05, 0.0, np.abs(sd - 0.07))
    # reef bands + points
    reef = np.zeros_like(X)
    for v0 in (0.16, 0.3):
        reef = np.maximum(reef, sstep(0.012, 0.004, np.abs((1 - Y) - v0)))
        pts = (np.abs((X * 24) % 1 - 0.5) < 0.04) & ((1 - Y) > v0 - 0.04) & ((1 - Y) < v0 + 0.01)
        reef = np.maximum(reef, pts * 1.0)
    # bolt rope edges & corner patches
    e = np.minimum(np.minimum(X, 1 - X), np.minimum(Y, 1 - Y))
    bolt = sstep(0.018, 0.006, e)
    corner = sstep(0.16, 0.12, np.minimum(np.sqrt(X ** 2 + (1 - Y) ** 2), np.sqrt((1 - X) ** 2 + (1 - Y) ** 2)))
    dirt = (1 - Y) ** 0  # placeholder
    foot = sstep(0.2, 0.0, 1 - Y) * 0.12 + sstep(0.6, 1.0, fbm(X, Y, 6, 6, 4, seed=603)) * 0.15
    rgb = rgb * (1 - 0.18 * seam[..., None]) * (1 - 0.25 * reef[..., None]) * (1 - 0.3 * bolt[..., None]) * (1 - foot[..., None])
    rgb = rgb * (1 - 0.06 * corner[..., None])
    out('sail', rgb, q=86)
    out('sail_n', normal_from_height(0.6 * seam + 0.15 * weave + 0.8 * bolt + 0.4 * reef + 0.3 * corner, 1.8, wrap=False), q=88)


# ------------------------------------------------------------------ natural
def bake_rock():
    W = H = R(1024)
    X, Y = grid(W, H)
    wx = fbm(X, Y, 4, 4, 4, seed=711) * 0.06
    wy = fbm(X, Y, 4, 4, 4, seed=713) * 0.06
    F1, F2, ID = worley(np.mod(X + wx, 1), np.mod(Y + wy, 1), 5, 5, seed=701)
    blocks = sstep(0.0, 0.05, F2 - F1) * 0.4 + 0.6
    n = fbm(X, Y, 5, 5, 6, seed=703)
    n2 = fbm(X, Y, 20, 20, 4, seed=705)
    rid = fbm(X, Y, 6, 6, 5, seed=715, ridged=True)
    crack = sstep(0.86, 0.97, rid)
    strata = 0.5 + 0.5 * np.sin(Y * 2 * np.pi * 9 + n * 5)
    k = 0.48 + 0.3 * n + 0.12 * n2 + 0.08 * (ID - 0.5) + 0.06 * strata
    rgb = ramp(k, [(0, '#2a2724'), (0.4, '#4d4842'), (0.7, '#6c655b'), (1, '#8c8478')])
    lich = sstep(0.58, 0.78, fbm(X, Y, 8, 8, 5, seed=707))
    lcol = ramp(fbm(X, Y, 30, 30, 2, seed=709) + 0.5, [(0, '#8a8a6a'), (0.5, '#b0a46a'), (1, '#c8b47a')])
    rgb = lerp(rgb, lcol, (lich * 0.6)[..., None])
    rgb = rgb * (1 - 0.55 * crack[..., None]) * (0.7 + 0.3 * blocks[..., None])
    out('rock', rgb, q=84)
    out('rock_n', normal_from_height(0.9 * n + 0.35 * n2 - 0.8 * crack + 0.3 * blocks + 0.12 * strata + 0.1 * lich, 6.0), q=88)


def bake_sand():
    W = H = R(1024)
    X, Y = grid(W, H)
    w = fbm(X, Y, 3, 3, 4, seed=801)
    rip = 0.5 + 0.5 * np.sin((X * 14 + w * 3.5 + fbm(X, Y, 6, 6, 3, seed=803) * 0.6) * 2 * np.pi)
    rip = rip ** 1.5
    gr = np.random.default_rng(805).random((H, W)).astype(F32)
    gr = blur(gr, 1)
    k = 0.5 + 0.2 * fbm(X, Y, 8, 8, 4, seed=807) + 0.12 * (rip - 0.5) + 0.3 * (gr - 0.5)
    rgb = ramp(k, [(0, '#7f6c4c'), (0.5, '#b49c74'), (1, '#dcc8a0')])
    shells = np.random.default_rng(809).random((H, W)) > 0.9985
    shells = blur(shells.astype(F32), 1) * 9
    rgb = lerp(rgb, np.array([0.92, 0.88, 0.8], F32), np.clip(shells, 0, 1)[..., None])
    out('sand', rgb, q=84)
    out('sand_n', normal_from_height(1.2 * rip + 0.4 * gr, 3.0), q=86)


def bake_grass():
    W = H = R(512)
    X, Y = grid(W, H)
    b = Perlin(160, 20, 901)(X * 160, Y * 20)
    m = fbm(X, Y, 5, 5, 5, seed=903)
    dry = sstep(0.1, 0.5, fbm(X, Y, 3, 3, 4, seed=905))
    k = 0.45 + 0.3 * m + 0.2 * b
    green = ramp(k, [(0, '#1f2d14'), (0.5, '#3d5626'), (1, '#6a7f3a')])
    straw = ramp(k, [(0, '#3a3220'), (0.5, '#6e6038'), (1, '#9c8a52')])
    rgb = lerp(green, straw, (dry * 0.5)[..., None])
    flowers = (np.random.default_rng(907).random((H, W)) > 0.9975).astype(F32)
    flowers = np.clip(blur(flowers, 1) * 6, 0, 1)
    rgb = lerp(rgb, np.array([0.9, 0.86, 0.7], F32), flowers[..., None] * 0.8)
    out('grass', rgb, q=84)


def bake_lighthouse():
    W, H = R(1024), R(2048)
    X, Y = grid(W, H)
    v = 1 - Y  # 0 bottom .. 1 top
    nb = 5
    band = np.floor(v * nb) % 2
    course = v * 46
    cr = np.floor(course)
    cu = X * 22 + (cr % 2) * 0.5
    joint = np.maximum(sstep(0.08, 0.0, np.minimum(course % 1, 1 - course % 1)), sstep(0.04, 0.0, np.minimum(cu % 1, 1 - cu % 1)))
    n = fbm(X, Y, 8, 16, 5, seed=1001)
    white = ramp(0.6 + 0.3 * n, [(0, '#8f8a80'), (0.5, '#d2cdbf'), (1, '#efe9dc')])
    red = ramp(0.55 + 0.3 * n, [(0, '#4a120d'), (0.5, '#8b2219'), (1, '#a83a2a')])
    rgb = np.where((band > 0.5)[..., None], red, white)
    # rust & rain streaks from the gallery
    streak = sstep(0.45, 0.9, Perlin(60, 3, 1003)(X * 60, Y * 3)) * sstep(0.4, 1.0, v)
    rgb = lerp(rgb, np.array([0.33, 0.2, 0.12], F32), (streak * 0.35)[..., None])
    damp = sstep(0.12, 0.0, v) * (0.5 + 0.5 * fbm(X, Y, 20, 8, 3, seed=1005))
    rgb = lerp(rgb, np.array([0.22, 0.26, 0.17], F32), (damp * 0.6)[..., None])
    rgb = rgb * (1 - 0.35 * joint[..., None])
    # windows (dark recessed) and door
    win = np.zeros_like(X)
    for (cu0, cv0) in [(0.25, 0.32), (0.75, 0.55), (0.25, 0.78)]:
        win = np.maximum(win, ((np.abs(X - cu0) < 0.025) & (np.abs(v - cv0) < 0.022)).astype(F32))
    door = ((np.abs(X - 0.5) < 0.04) & (v < 0.07)).astype(F32)
    rgb = lerp(rgb, np.array([0.05, 0.045, 0.04], F32), np.maximum(win, door)[..., None])
    frame = ((np.abs(X - 0.5) < 0.05) & (v < 0.08)).astype(F32) - door
    rgb = lerp(rgb, np.array([0.55, 0.52, 0.45], F32), np.clip(frame, 0, 1)[..., None])
    out('lighthouse', rgb, q=86)
    out('lighthouse_n', normal_from_height(-0.8 * joint + 0.2 * n - 0.8 * np.maximum(win, door), 2.5, wrap=False), q=88)


def bake_cork():
    W = H = R(512)
    X, Y = grid(W, H)
    F1, F2, ID = worley(X, Y, R(70), R(70), seed=1101)
    cell = sstep(0.0, 0.25, F2 - F1)
    pores = sstep(0.8, 0.95, fbm(X, Y, 28, 28, 3, seed=1103))
    big = (np.random.default_rng(1105).random((H, W)) > 0.9993).astype(F32)
    big = np.clip(blur(big, R(2)) * 12, 0, 1)
    k = 0.5 + 0.25 * (ID - 0.5) + 0.15 * fbm(X, Y, 6, 6, 4, seed=1107) + 0.1 * cell
    rgb = ramp(k, [(0, '#5a3a20'), (0.5, '#9a7046'), (1, '#c79a68')])
    rgb = rgb * (1 - 0.6 * np.clip(pores + big, 0, 1)[..., None])
    out('cork', rgb, q=86)
    out('cork_n', normal_from_height(0.6 * cell - 1.0 * np.clip(pores + big, 0, 1), 3.0), q=88)


def bake_brass():
    W = H = R(1024)
    X, Y = grid(W, H)
    brush = Perlin(4, 700, 1201)(X * 4, Y * 700) * 0.5 + 0.5
    tarn = sstep(0.1, 0.6, fbm(X, Y, 5, 5, 5, seed=1203))
    scr = scratches(W, H, int(350 * S * S) + 20, 1205, length=(0.01, 0.12), width=1, alpha=(0.2, 0.9))
    rough = 0.22 + 0.08 * brush + 0.3 * tarn + 0.15 * scr
    ao = 1 - 0.45 * tarn
    out('brass_orm', np.stack([ao, np.clip(rough, 0, 1), np.ones_like(X)], -1), q=88)


def bake_glasswear():
    """Bottle surface: R scratches, G smudges, B dust, A emboss height. u = along axis, v = around."""
    W, H = R(2048), R(1024)
    X, Y = grid(W, H)
    scr = scratches(W, H, int(1200 * S * S) + 50, 1301, length=(0.004, 0.04), width=1, alpha=(0.15, 0.7))
    sm = sstep(0.2, 0.7, fbm(X, Y, 8, 4, 5, seed=1303))
    # fingerprint ovals
    r = np.random.default_rng(1305)
    fp = np.zeros_like(X)
    for _ in range(9):
        cx, cy, rx, ry = r.uniform(0.15, 0.85), r.uniform(0.1, 0.9), r.uniform(0.012, 0.02), r.uniform(0.03, 0.05)
        a = r.uniform(0, np.pi)
        dx, dy = X - cx, Y - cy
        xr = dx * np.cos(a) + dy * np.sin(a)
        yr = -dx * np.sin(a) + dy * np.cos(a)
        e = (xr / rx) ** 2 + (yr / ry) ** 2
        ridge = 0.5 + 0.5 * np.sin(np.sqrt(e) * 40)
        fp = np.maximum(fp, sstep(1.0, 0.6, e) * ridge * r.uniform(0.4, 0.9))
    smudge = np.clip(sm * 0.5 + fp, 0, 1)
    # dust: mostly on the top (v around 0.5 = top if v=0 is bottom)
    top = np.exp(-((Y - 0.0) / 0.16) ** 2) + np.exp(-((Y - 1.0) / 0.16) ** 2)
    dust = np.clip(top * (0.4 + 0.6 * fbm(X, Y, 40, 20, 3, seed=1307)) + (np.random.default_rng(1309).random((H, W)) > 0.997) * 0.8, 0, 1)
    emb = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(emb)
    # medallion around u=0.78 (shoulder), v=0.75 (front side)
    cx, cy, rad = 0.795 * W, 0.75 * H, 0.058 * W
    for rr, wdt in [(1.0, 0.07), (0.86, 0.035)]:
        d.ellipse([cx - rad * rr, cy - rad * rr * 1.25, cx + rad * rr, cy + rad * rr * 1.25], outline=255, width=max(1, int(rad * wdt)))
    try:
        f1 = ImageFont.truetype(ttf('cormorant-600.ttf'), max(8, int(rad * 0.24)))
        f2 = ImageFont.truetype(NOTO_SEMI, max(8, int(rad * 0.42)), index=3)
        txt = 'HALCYON · GLASS · 1887 · '
        for i, ch in enumerate(txt):
            a = -np.pi / 2 + i / len(txt) * 2 * np.pi
            px, py = cx + np.cos(a) * rad * 0.72, cy + np.sin(a) * rad * 0.72 * 1.25
            ci = Image.new('L', (int(rad * 0.4), int(rad * 0.4)), 0)
            ImageDraw.Draw(ci).text((rad * 0.2, rad * 0.2), ch, font=f1, fill=255, anchor='mm')
            ci = ci.rotate(-np.degrees(a) - 90, resample=Image.BICUBIC)
            emb.paste(255, (int(px - rad * 0.2), int(py - rad * 0.2)), ci)
        d.text((cx, cy + rad * 0.05), '拾光', font=f2, fill=255, anchor='mm')
    except Exception as e:
        print('emboss font', e)
    # mold seams along the length (v = 0.0 and 0.5 ... at sides: v=0.25, 0.75?) -> faint lines at v=0 / 0.5 (bottom/top)
    embA = np.asarray(emb.filter(ImageFilter.GaussianBlur(max(1.0, 2.2 * S)))).astype(F32) / 255
    seam = np.exp(-((Y - 0.0) / 0.002) ** 2) + np.exp(-((Y - 1.0) / 0.002) ** 2) + np.exp(-((Y - 0.5) / 0.002) ** 2)
    seam = seam * sstep(0.02, 0.1, X) * sstep(0.98, 0.9, X)
    A = np.clip(embA * 0.9 + seam * 0.5, 0, 1)
    rgba = np.stack([scr, smudge, dust, A], -1)
    out('glasswear', rgba, q=88)


def bake_painting():
    W, H = R(1024), R(768)
    X, Y = grid(W, H)
    hor = 0.62
    cl = fbm(X * 1.0, Y, 3, 2, 6, seed=1401)
    cl2 = fbm(X, Y, 8, 6, 4, seed=1403)
    sky = ramp((1 - Y) * 0.9 + cl * 0.6 + 0.1, [(0, '#1b1a1c'), (0.35, '#3b3a3c'), (0.6, '#6b6255'), (0.8, '#b39a6a'), (1, '#e0c68a')])
    glow = np.exp(-(((X - 0.68) * 1.3) ** 2 + ((Y - 0.55) * 2.5) ** 2) * 6)
    sky = sky + glow[..., None] * np.array([0.5, 0.38, 0.2], F32)
    sea_t = 0.35 + 0.25 * fbm(X, Y * 3, 6, 4, 5, seed=1405) + 0.25 * Perlin(30, 90, 1407)(X * 30, Y * 90)
    sea = ramp(sea_t, [(0, '#0d1414'), (0.4, '#1f2c2a'), (0.7, '#3d4d44'), (1, '#9aa58a')])
    sea = sea + (glow * np.exp(-((X - 0.68) * 8) ** 2))[..., None] * np.array([0.6, 0.5, 0.3], F32) * (Perlin(40, 120, 1409)(X * 40, Y * 120) > 0.2)[..., None]
    rgb = np.where((Y > hor)[..., None], sea, sky)
    # ship silhouette (simple brush polygons)
    im = to_img(rgb)
    d = ImageDraw.Draw(im)
    sx, sy = 0.36 * W, hor * H + 0.02 * H
    d.polygon([(sx - 70 * S, sy), (sx + 85 * S, sy - 4 * S), (sx + 60 * S, sy + 14 * S), (sx - 55 * S, sy + 12 * S)], fill=(18, 14, 12))
    for mx, mh in [(-20, 150), (30, 170)]:
        d.line([(sx + mx * S, sy), (sx + mx * S - 6 * S, sy - mh * S)], fill=(20, 16, 14), width=max(1, int(3 * S)))
    for mx, mh, ww in [(-20, 140, 50), (30, 160, 56)]:
        d.polygon([(sx + mx * S - 4, sy - mh * S + 10), (sx + mx * S - 4, sy - 18 * S), (sx + mx * S - ww * S, sy - 22 * S)], fill=(150, 130, 100))
    d.polygon([(sx + 34 * S, sy - 150 * S), (sx + 100 * S, sy - 10 * S), (sx + 34 * S, sy - 20 * S)], fill=(170, 150, 115))
    # lighthouse on rock at right
    lx, ly = 0.86 * W, hor * H
    d.polygon([(lx - 90 * S, ly + 30 * S), (lx - 40 * S, ly - 20 * S), (lx + 60 * S, ly - 25 * S), (lx + 140 * S, ly + 30 * S)], fill=(14, 14, 13))
    d.polygon([(lx - 12 * S, ly - 22 * S), (lx + 12 * S, ly - 22 * S), (lx + 8 * S, ly - 120 * S), (lx - 8 * S, ly - 120 * S)], fill=(40, 34, 30))
    d.ellipse([lx - 9 * S, ly - 136 * S, lx + 9 * S, ly - 118 * S], fill=(255, 230, 170))
    arr = from_img(im)
    # brush texture
    st = Perlin(160, 30, 1411)(X * 160, Y * 30) * 0.5 + Perlin(40, 200, 1413)(X * 40, Y * 200) * 0.5
    arr = arr * (1 + 0.08 * st[..., None])
    # varnish yellowing + craquelure
    F1, F2, _ = worley(X, Y, 40, 30, seed=1415)
    craq = sstep(0.03, 0.0, F2 - F1)
    arr = arr * np.array([1.0, 0.93, 0.78], F32) * (1 - 0.25 * craq[..., None])
    arr = arr * (0.75 + 0.25 * (1 - np.clip(np.sqrt((X - 0.5) ** 2 + (Y - 0.5) ** 2) * 1.3, 0, 1)))[..., None]
    out('painting', arr, q=82)


def bake_books():
    """Spine atlas: 16 x 3 cells, each 128 x 680 px (spine width x height)."""
    cw, ch = R(128), R(680)
    W, H = cw * 16, ch * 3
    r = np.random.default_rng(1501)
    X, Y = grid(W, H)
    base = fbm(X, Y, 64, 12, 4, seed=1503)
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    cols = ['#4a1712', '#1d3326', '#1b2440', '#3a2a18', '#5a3a1a', '#2b2b2b', '#5c4a2a', '#6a1e16', '#22362e', '#40301f', '#2a1c30', '#7a5a2e']
    titles = ['ATLAS', 'TIDES', 'LOG', 'MARE', 'VOYAGES', 'STARS', 'CHARTS', 'WINDS', 'NAVIGATIO', 'HALCYON', 'CURRENTS', 'ISLES', 'ORBIS', 'MARINER', 'SEXTANT', 'LUX']
    try:
        f = ImageFont.truetype(ttf('cormorant-600.ttf'), max(8, int(cw * 0.32)))
        fz = ImageFont.truetype(NOTO_SEMI, max(8, int(cw * 0.42)), index=3)
    except Exception as e:
        f = fz = ImageFont.load_default()
    zh = ['海圖', '潮汐', '航誌', '星象', '燈塔', '風向', '島嶼', '洋流']
    for j in range(3):
        for i in range(16):
            x0, y0 = i * cw, j * ch
            c = cols[int(r.integers(len(cols)))]
            d.rectangle([x0, y0, x0 + cw - 1, y0 + ch - 1], fill=c)
            gold = (196, 160, 90)
            nb = int(r.integers(3, 6))
            for k in range(nb):
                yy = y0 + ch * (0.12 + 0.76 * k / (nb - 1))
                d.rectangle([x0 + 2, yy - ch * 0.012, x0 + cw - 3, yy + ch * 0.012], fill=tuple(int(v * 0.8) for v in Image.new('RGB', (1, 1), c).getpixel((0, 0))))
                d.line([x0 + 4, yy - ch * 0.02, x0 + cw - 5, yy - ch * 0.02], fill=gold, width=max(1, int(2 * S)))
                d.line([x0 + 4, yy + ch * 0.02, x0 + cw - 5, yy + ch * 0.02], fill=gold, width=max(1, int(2 * S)))
            # title label
            ly = y0 + ch * 0.22
            lab = r.random() < 0.6
            if lab:
                d.rectangle([x0 + cw * 0.12, ly, x0 + cw * 0.88, ly + ch * 0.12], fill=(28, 20, 14))
            t = titles[int(r.integers(len(titles)))]
            if r.random() < 0.3:
                t = zh[int(r.integers(len(zh)))]
                ti = Image.new('L', (cw, int(ch * 0.12)), 0)
                ImageDraw.Draw(ti).text((cw / 2, ch * 0.06), t[0], font=fz, fill=255, anchor='mm')
                im.paste(gold, (x0, int(ly)), ti)
                ti2 = Image.new('L', (cw, int(ch * 0.12)), 0)
                ImageDraw.Draw(ti2).text((cw / 2, ch * 0.06), t[1], font=fz, fill=255, anchor='mm')
                im.paste(gold, (x0, int(ly + ch * 0.12)), ti2)
            else:
                ti = Image.new('L', (int(ch * 0.5), cw), 0)
                ImageDraw.Draw(ti).text((ch * 0.25, cw / 2), t, font=f, fill=255, anchor='mm')
                ti = ti.rotate(90, expand=True)
                im.paste(gold, (x0, int(y0 + ch * 0.3)), ti)
    arr = from_img(im)
    arr = arr * (0.8 + 0.35 * base[..., None])
    edge = np.minimum((X * 16) % 1, 1 - (X * 16) % 1)
    arr = arr * (0.6 + 0.4 * sstep(0.0, 0.18, edge))[..., None]
    wear = sstep(0.55, 0.85, fbm(X, Y, 32, 8, 4, seed=1505))
    arr = lerp(arr, arr * 1.6 + 0.05, (wear * 0.35)[..., None])
    out('books', arr, q=82)


TASKS = {
    'desk': bake_desk, 'stand': bake_stand, 'floor': bake_floor, 'panel': bake_panel, 'paper': bake_paper,
    'leather': bake_leather, 'hull': bake_hull, 'deck': bake_deck, 'sail': bake_sail, 'rock': bake_rock,
    'sand': bake_sand, 'grass': bake_grass, 'lighthouse': bake_lighthouse, 'cork': bake_cork, 'brass': bake_brass,
    'glasswear': bake_glasswear, 'painting': bake_painting, 'books': bake_books,
}


def ensure_ttf():
    os.makedirs(FONT_DIR, exist_ok=True)
    from fontTools.ttLib import TTFont
    src = os.path.join(ROOT, 'assets', 'fonts', 'corm-600-normal.woff2')
    dst = ttf('cormorant-600.ttf')
    if not os.path.exists(dst):
        f = TTFont(src)
        f.flavor = None
        f.save(dst)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--scale', type=float, default=1.0)
    ap.add_argument('--preview', action='store_true')
    a = ap.parse_args()
    S = a.scale
    ensure_ttf()
    names = a.only.split(',') if a.only else list(TASKS)
    for n in names:
        t0 = time.time()
        print(n, flush=True)
        TASKS[n]()
        print(f'  ({time.time() - t0:.1f}s)', flush=True)
    tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print('TOTAL KB', tot // 1024)
