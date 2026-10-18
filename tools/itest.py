#!/usr/bin/env python3
"""Headless interaction smoke test (Playwright + SwiftShader).

  python3 tools/itest.py

Drives orbit / zoom / keys / double-click focus / shift-drag rocking / every click handler /
quality switching / the spyglass, and prints the camera after each step plus any page errors.
Software rendering is slow: expect several minutes.
"""
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.environ.get('SHOT_HTML', os.path.join(ROOT, 'index.html'))


def wait(pg):
    pg.wait_for_function('document.title=="done"', timeout=600000, polling=500)


def run(pg, n=2):
    pg.evaluate(f'__app.more({n})')
    wait(pg)


with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 800, 'height': 500})
    logs = []
    pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
    pg.goto(f'file://{HTML}?dpr=0.5&frames=2&skip&view=overview')
    wait(pg)
    cam = lambda: pg.evaluate('JSON.stringify([__app.camera.position.toArray().map(v=>+v.toFixed(2)), __app.rig.controls.target.toArray().map(v=>+v.toFixed(2))])')
    print('start', cam())
    pg.mouse.move(400, 250); pg.mouse.down()
    for i in range(10):
        pg.mouse.move(400 + i * 30, 250 + i * 3)
    pg.mouse.up(); run(pg, 6); print('after drag', cam())
    pg.mouse.move(500, 220)
    for i in range(5):
        pg.mouse.wheel(0, -200)
    run(pg, 8); print('after wheel', cam())
    for i in range(14):
        pg.keyboard.press('ArrowLeft')
    run(pg, 3); print('after keys', cam())
    for i in range(30):
        pg.keyboard.press('ArrowDown')
    run(pg, 3); print('after down (must stay above the desk)', cam())
    pg.mouse.dblclick(400, 230); run(pg, 40); print('after dblclick', cam())
    pg.keyboard.press('3'); run(pg, 70); print('overview', cam())
    pg.keyboard.down('Shift'); pg.mouse.move(400, 250); pg.mouse.down()
    for i in range(8):
        pg.mouse.move(400 + i * 25, 250)
    run(pg, 3); print('roll', pg.evaluate('__app.state.rollT'))
    pg.mouse.up(); pg.keyboard.up('Shift'); run(pg, 3)
    res = pg.evaluate('''() => { const out=[]; for (const [id,h] of Object.entries(__app.handlers)) { try { h.fn({object: __app.ship}); out.push(id); } catch(e) { out.push(id+':ERR '+e.message); } } return out.join(' '); }''')
    print(res)
    run(pg, 10)
    print('found', pg.evaluate('__app.state.found.size'))
    pg.evaluate('__app.setQuality("low")'); run(pg, 3)
    pg.evaluate('__app.setQuality("ultra")'); run(pg, 3)
    pg.evaluate('__app.setQuality("high")'); run(pg, 2)
    pg.evaluate('__app.enterScope()'); run(pg, 50); print('scope', cam())
    pg.keyboard.press('Escape'); run(pg, 40); print('unscope', cam())
    pg.keyboard.press('2'); run(pg, 70); print('deck', cam(), pg.evaluate('!!__app.rig.follow'))
    pg.keyboard.press('r'); run(pg, 30); print('spin', cam(), pg.evaluate('__app.rig.controls.autoRotate'))
    errs = [l for l in logs if 'error' in l.lower()]
    for line in errs[:30]:
        print(line[:300])
    print('errors:', len(errs))
    b.close()
