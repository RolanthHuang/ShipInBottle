#!/usr/bin/env python3
"""Headless render helper: Playwright + SwiftShader, so no GPU is needed (slow but exact).

  pip install playwright            # uses Playwright's Chromium (or PLAYWRIGHT_BROWSERS_PATH)
  python3 tools/shot.py "skip&view=ship" ship 3               -> .shots/ship.jpg
  python3 tools/shot.py "skip&view=overview" ov 3 "" 1440 --ui -> also .shots/ov_ui.png (page incl. UI)

Arguments: <url query> <name> [frames=3] [js to evaluate] [width=1280] [--ui] [--rerender]
The query takes the page's own URL parameters (skip, view, tod, wind, q, text, sub, ...).
`frames=N` renders N frames, stops and exposes the last frame as window.__shot.
"""
import sys, os, time, base64
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.environ.get('SHOT_HTML', os.path.join(ROOT, 'index.html'))
OUT = os.environ.get('SHOT_DIR', os.path.join(ROOT, '.shots'))
os.makedirs(OUT, exist_ok=True)

query = sys.argv[1]
name = sys.argv[2]
frames = int(sys.argv[3]) if len(sys.argv) > 3 else 3
js = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None
W = int(sys.argv[5]) if len(sys.argv) > 5 else 1280
H = int(W * 0.625)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': W, 'height': H})
    logs = []
    pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
    t0 = time.time()
    pg.goto('file://%s?dpr=1&frames=%d&%s' % (HTML, frames, query))
    try:
        pg.wait_for_function('document.title=="done"', timeout=600000, polling=1000)
    except Exception as e:
        print('timeout waiting', str(e)[:200])
    for line in logs[:40]:
        print(line[:700])
    if js:
        try:
            print('js->', pg.evaluate(js))
        except Exception as e:
            print('jserr', str(e)[:300])
        if '--rerender' in sys.argv:
            pg.evaluate('__app.more(%d)' % frames)
            pg.wait_for_function('document.title=="done"', timeout=600000, polling=1000)
    d = pg.evaluate('window.__shot || ""')
    if d.startswith('data:'):
        open(os.path.join(OUT, name + '.jpg'), 'wb').write(base64.b64decode(d.split(',')[1]))
        print('saved', os.path.join(OUT, name + '.jpg'))
    else:
        print('noshot', d[:100])
    if '--ui' in sys.argv:
        try:
            pg.screenshot(path=os.path.join(OUT, name + '_ui.png'), timeout=120000)
            print('ui saved')
        except Exception as e:
            print('ui fail', str(e)[:100])
    print('elapsed', round(time.time() - t0, 1))
    b.close()
