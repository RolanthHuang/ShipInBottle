"""Small numpy texture toolkit: tileable Perlin/fBm, Worley, normal maps, ramps, IO."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

F32 = np.float32


def grid(w, h):
    x = (np.arange(w, dtype=F32) + 0.5) / w
    y = (np.arange(h, dtype=F32) + 0.5) / h
    return np.meshgrid(x, y)


def _fade(t):
    return t * t * t * (t * (t * 6 - 15) + 10)


class Perlin:
    """Gradient noise, periodic with integer period (px, py) in lattice units."""

    def __init__(self, px, py, seed=0):
        r = np.random.default_rng(abs(int(seed)))
        a = r.uniform(0, 2 * np.pi, (max(1, py), max(1, px))).astype(F32)
        self.gx, self.gy, self.px, self.py = np.cos(a), np.sin(a), max(1, px), max(1, py)

    def __call__(self, x, y):
        x0 = np.floor(x)
        y0 = np.floor(y)
        fx = (x - x0).astype(F32)
        fy = (y - y0).astype(F32)
        x0 = x0.astype(np.int64) % self.px
        y0 = y0.astype(np.int64) % self.py
        x1 = (x0 + 1) % self.px
        y1 = (y0 + 1) % self.py
        gx, gy = self.gx, self.gy
        n00 = gx[y0, x0] * fx + gy[y0, x0] * fy
        n10 = gx[y0, x1] * (fx - 1) + gy[y0, x1] * fy
        n01 = gx[y1, x0] * fx + gy[y1, x0] * (fy - 1)
        n11 = gx[y1, x1] * (fx - 1) + gy[y1, x1] * (fy - 1)
        u = _fade(fx)
        v = _fade(fy)
        a = n00 + u * (n10 - n00)
        b = n01 + u * (n11 - n01)
        return (a + v * (b - a)) * 1.41


def fbm(X, Y, px, py, octaves=5, gain=0.5, lac=2, seed=0, ridged=False):
    tot = np.zeros_like(X)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        f = lac ** o
        n = Perlin(int(round(px * f)), int(round(py * f)), seed + o * 1013)(X * px * f, Y * py * f)
        if ridged:
            n = 1 - np.abs(n) * 2
        tot += amp * n
        norm += amp
        amp *= gain
    return tot / norm


def worley(X, Y, cx, cy, seed=0, jitter=0.9):
    r = np.random.default_rng(abs(int(seed)))
    pts = (r.random((cy, cx, 2)) * jitter + (1 - jitter) / 2).astype(F32)
    rid = r.random((cy, cx)).astype(F32)
    gx, gy = X * cx, Y * cy
    ix, iy = np.floor(gx).astype(np.int64), np.floor(gy).astype(np.int64)
    F1 = np.full(X.shape, 1e9, F32)
    F2 = np.full(X.shape, 1e9, F32)
    ID = np.zeros(X.shape, F32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            cxi, cyi = ix + dx, iy + dy
            mx, my = cxi % cx, cyi % cy
            p = pts[my, mx]
            ddx = cxi + p[..., 0] - gx
            ddy = cyi + p[..., 1] - gy
            d = np.sqrt(ddx * ddx + ddy * ddy)
            closer = d < F1
            F2 = np.where(closer, F1, np.minimum(F2, d))
            ID = np.where(closer, rid[my, mx], ID)
            F1 = np.where(closer, d, F1)
    return F1, F2, ID


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], F32)


def ramp(t, stops):
    """stops: list of (pos, '#hex'). t: array -> (...,3)."""
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,), F32)
    pos = [s[0] for s in stops]
    cols = [hexc(s[1]) for s in stops]
    for i in range(len(stops) - 1):
        a, b = pos[i], pos[i + 1]
        m = (t >= a) & (t <= b) if i == len(stops) - 2 else (t >= a) & (t < b)
        k = ((t - a) / max(b - a, 1e-6))[..., None]
        seg = cols[i] + (cols[i + 1] - cols[i]) * k
        out = np.where(m[..., None], seg, out)
    out = np.where((t < pos[0])[..., None], cols[0], out)
    return out


def blur(a, r, wrap=True):
    """Separable box-ish blur (3 passes) for float arrays (H,W) or (H,W,C)."""
    if r < 1:
        return a
    out = a.astype(F32)
    for _ in range(3):
        for ax in (0, 1):
            acc = np.zeros_like(out)
            for k in range(-r, r + 1):
                acc += np.roll(out, k, axis=ax)
            out = acc / (2 * r + 1)
    return out


def normal_from_height(h, strength=1.0, wrap=True):
    if wrap:
        dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
        dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    else:
        dy, dx = np.gradient(h)
    nx = -dx * strength
    ny = dy * strength
    nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5


def to_img(a):
    a = np.clip(a, 0, 1)
    a = (a * 255 + 0.5).astype(np.uint8)
    if a.ndim == 2:
        return Image.fromarray(a, 'L')
    return Image.fromarray(a, 'RGBA' if a.shape[2] == 4 else 'RGB')


def save(a, path, q=86, lossless=False):
    im = to_img(a) if isinstance(a, np.ndarray) else a
    if im.mode == 'L':
        im = im.convert('RGB')
    kw = dict(quality=q, method=6)
    if im.mode == 'RGBA':
        kw['alpha_quality'] = 95
    if lossless:
        kw = dict(lossless=True, quality=100, method=6)
    im.save(path, 'WEBP', **kw)
    import os
    return os.path.getsize(path)


def from_img(im):
    return np.asarray(im).astype(F32) / 255.0


def scratches(w, h, n, seed, length=(0.02, 0.15), angle=None, width=1, alpha=(0.2, 0.8), wrap=True):
    """Thin random scratch lines; returns float mask (H,W)."""
    r = np.random.default_rng(seed)
    im = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(im)
    for _ in range(n):
        x, y = r.random() * w, r.random() * h
        L = r.uniform(*length) * max(w, h)
        a = r.uniform(0, np.pi) if angle is None else angle + r.normal(0, 0.15)
        bend = r.normal(0, 0.15)
        pts = []
        for k in range(8):
            t = k / 7
            aa = a + bend * (t - 0.5)
            pts.append((x + np.cos(aa) * L * t, y + np.sin(aa) * L * t))
        v = int(255 * r.uniform(*alpha))
        d.line(pts, fill=v, width=width)
    m = np.asarray(im).astype(F32) / 255
    return m
