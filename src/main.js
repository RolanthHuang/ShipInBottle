import * as THREE from 'three';
import { B, D, FLOOR, U, LAYER, clamp, lerp, smooth, innerR, enableLayers, mergeStatic } from './common.js';
import { loadAssets, fontsReady } from './assets.js';
import { Sea, makeWater, addWaterline } from './water.js';
import { makeBottle, makeStopper } from './glass.js';
import { makeShip } from './ship.js';
import { makeIsland } from './island.js';
import { makeSeabed } from './seabed.js';
import { Dolphins, Gulls, FishSchool, Turtle, Jellies } from './creatures.js';
import { Splashes, Bubbles, Smoke, Embers, Storm, makeMiniBottle } from './fx.js';
import { makeRoom, WIN } from './room.js';
import { makeDesk, makeProps } from './desk.js';
import { makeStand, updatePlaque } from './stand.js';
import { CameraRig } from './camera.js';
import { Pipeline } from './post.js';
import { Audio } from './audio.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const store = {
  get(k, d) { try { const v = localStorage.getItem('bottledvoyage:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('bottledvoyage:' + k, JSON.stringify(v)); } catch (e) { } },
};

const QUALITY = {
  low: { label: '低', dpr: 1.0, samples: 0, shadow: 1024, moon: 0, taps: 16, ssr: false },
  mid: { label: '中', dpr: 1.25, samples: 4, shadow: 2048, moon: 1024, taps: 24, ssr: true },
  high: { label: '高', dpr: 1.5, samples: 4, shadow: 2048, moon: 2048, taps: 32, ssr: true },
  ultra: { label: '極致', dpr: 2.0, samples: 8, shadow: 4096, moon: 2048, taps: 48, ssr: true },
};
const QORDER = ['low', 'mid', 'high', 'ultra'];

const DISCOVER = [
  ['bell', '拾光號的船鐘', '點一下那艘船'],
  ['sails', '鬆帆又吃風', '帆，也可以點'],
  ['captain', '舵輪旁的船長', '船尾有個很小的人'],
  ['lookout', '桅頂的瞭望手', '前桅的橫桁上'],
  ['sailor', '船頭的水手', '絞盤旁邊'],
  ['cat', '船貓', '艉艙頂上縮著一團橘色'],
  ['figurehead', '翠鳥船首像', '船頭最前端'],
  ['stern', '艉窗的燈', '船尾的金色字'],
  ['dolphin', '躍出水面的海豚', '水下有影子在游'],
  ['gull', '受驚的海鷗', '瓶頂盤旋的白點'],
  ['perch', '停著的海鷗', '燈塔欄杆、碼頭樁上'],
  ['lighthouse', '燈塔的霧笛', '小島上的那座塔'],
  ['cottage', '守燈人的窗', '燈塔旁的小屋'],
  ['keeper', '提燈的守燈人', '小屋門口'],
  ['turtle', '慢吞吞的海龜', '海床上方'],
  ['jelly', '發光的水母', '在水裡飄'],
  ['water', '水面的漣漪', '點水面'],
  ['glass', '輕叩玻璃', '點瓶身空處'],
  ['rock', '搖晃整只瓶子', 'Shift＋拖曳瓶身'],
  ['chest', '沉沒的寶箱', '海床上藏著什麼'],
  ['minibottle', '瓶中之瓶', '海面漂著一個小東西'],
  ['cork', '拔起封蠟軟木塞', '瓶口的紅蠟'],
  ['tag', '晃動的吊牌', '瓶頸綁著一張紙牌'],
  ['plaque', '刻上自己的字', '底座的黃銅銘牌'],
  ['lamp', '調暗煤油燈', '桌角那盞燈'],
  ['candle', '吹熄蠟燭', '桌子右邊的燭台'],
  ['compass', '總是指向船的羅盤', '桌前的黃銅圓盒'],
  ['quill', '羽毛筆寫下的句子', '墨水瓶旁'],
  ['letter', '守燈人的信', '桌上壓著一封信'],
  ['logbook', '翻開的航海日誌', '桌子右後方'],
  ['plans', '拾光號的設計圖', '桌子左前方的圖紙'],
  ['spyglass', '從望遠鏡看出去', '桌上的黃銅望遠鏡'],
  ['watch', '懷錶', '鏈子拖在桌面上'],
  ['window', '窗外的天色', '窗'],
  ['fire', '撥旺壁爐', '轉身，房間左邊'],
  ['globe', '轉動地球儀', '書櫃旁'],
  ['barometer', '敲敲氣壓計', '窗邊牆上'],
  ['clock', '牆上的船鐘', '它走的是你現在的時間'],
];
const QUOTES = [
  '把一片海裝進瓶子，是為了讓遠方有個形狀。',
  '風從不問船要去哪裡，它只負責讓帆鼓起來。',
  '燈塔不追船，它只是一直亮著。',
  '最小的海，也有自己的潮汐。',
  '所有的航行，都是為了回來講給誰聽。',
  '玻璃很薄，薄到剛好隔開兩個世界。',
  '在瓶子裡，時間是一陣搖晃。',
];
const LETTER = '<em>致 拾光號的船長</em><br>燈塔的光依舊每夜準時亮起，<br>三秒一閃，像在數著你的歸期。<br>等你把這片海裝進瓶子，<br>記得在瓶口封上紅蠟，再寄一封信回來。<br><span style="float:right">—— 守燈人　一八八七年 秋</span>';

function setLoad(text, p) { const t = $('#load-text'); if (t) t.textContent = text; const b = $('#load-bar'); if (b) b.style.transform = `scaleX(${p})`; }
const tick = () => new Promise(r => setTimeout(r, 16));

async function main() {
  const canvas = $('#c');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, preserveDrawingBuffer: params.has('frames') });
  } catch (e) { $('#fallback').style.display = 'flex'; $('#loading').style.display = 'none'; return; }
  renderer.autoClear = false;
  renderer.setClearColor(0x040302, 1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.info.autoReset = false;
  let qName = params.get('q') || store.get('quality', 'high'); if (!QUALITY[qName]) qName = 'high';
  let Q = QUALITY[qName];

  setLoad('研墨、展開航海圖…', 0.03);
  await fontsReady();
  const tex = await loadAssets(renderer, (p) => setLoad('解開封蠟…', 0.05 + p * 0.3));
  await tick();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.02, 120);
  camera.layers.enable(LAYER.MAIN);
  const audio = new Audio();

  setLoad('擦亮書桌…', 0.4); await tick();
  const room = makeRoom(tex); scene.add(room);
  const desk = makeDesk(tex); scene.add(desk);
  const props = makeProps(tex); scene.add(props);
  const plaqueLines = [params.get('text') || store.get('plaque1', '一瓶，一海，一生遠方'), params.get('sub') || store.get('plaque2', 'HALCYON · TOPSAIL SCHOONER · MDCCCLXXXVII')];
  const stand = makeStand(plaqueLines, tex); scene.add(stand);
  const RU = room.userData, PU = props.userData;
  const mergeLog = [];
  mergeLog.push(mergeStatic(room, [room.children.find(o => o.material === RU.skyMat), RU.globe && RU.globe.parent, RU.baroNeedle.parent, RU.wallClock.h.parent, RU.mantelClock.h.parent, ...RU.curtains]));
  mergeLog.push(mergeStatic(desk, [desk.userData.chair]));
  mergeLog.push(mergeStatic(desk.userData.chair));
  for (const k of ['lamp', 'compass', 'books', 'ink', 'candle', 'spyglass', 'watch', 'tools', 'letter', 'logBook']) mergeLog.push(mergeStatic(PU[k], [PU.flame, PU.flameCore, PU.glow, PU.chimney, PU.needle, PU.candleFlame, PU.candleGlow, ...(PU.spyTubes || []), PU.watchHands.h, PU.watchHands.m, PU.watchHands.s]));
  mergeLog.push(mergeStatic(stand, [stand.userData.plaque]));
  setLoad('吹一只老玻璃瓶…', 0.5); await tick();

  const pivot = new THREE.Group(); pivot.position.set(-1.3, -1.0, 0); scene.add(pivot);
  const shaker = new THREE.Group(); pivot.add(shaker);
  const bottle = new THREE.Group(); bottle.position.set(1.3, 1.0, 0); shaker.add(bottle);

  const sea = new Sea();
  const pipe = new Pipeline(renderer, { samples: Q.samples, dofTaps: Q.taps });
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(0.2, 80, cubeRT); cubeCam.layers.set(LAYER.ROOM); scene.add(cubeCam);

  const lampPos = PU.lampFlamePos.clone();
  U.lampPos.value.copy(lampPos);
  const winC = RU.windowCenter.clone();
  const moonDir = new THREE.Vector3(-6, 14, -40).sub(new THREE.Vector3(0, D, 2)).normalize();
  const shared = {
    tEnv: { value: cubeRT.texture }, uEnvI: { value: 1.0 },
    uLampPos: { value: lampPos }, uLampCol: U.lampCol,
    uMoonDir: { value: moonDir }, uMoonCol: { value: new THREE.Color(0.3, 0.36, 0.55) },
    uBeamPos: { value: new THREE.Vector3() }, uBeamDir: { value: new THREE.Vector3(1, 0, 0) }, uBeamI: { value: 1 },
  };
  const GU = { ...shared, tScene: { value: null }, uRes: { value: new THREE.Vector2() }, uWet: { value: 0.32 }, uLevelY: { value: B.level }, uTint: { value: new THREE.Color(0.74, 0.9, 0.8) },
    uWinC: { value: winC }, uWinS: { value: new THREE.Vector2(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0) }, uWinZ: { value: WIN.z }, uWinCol: { value: new THREE.Color(0.25, 0.3, 0.5) },
    uFirePos: { value: RU.fireLightPos.clone() }, uFireCol: { value: new THREE.Color(1.0, 0.45, 0.15) }, uCandlePos: { value: PU.candleFlamePos.clone() }, uCandleCol: { value: new THREE.Color(1.0, 0.55, 0.22) } };
  const WU = { ...shared, tColor: { value: null }, tDepth: { value: null }, uRes: GU.uRes, uNear: { value: camera.near }, uFar: { value: camera.far }, uCamL: { value: new THREE.Vector3() }, uBotRot: { value: new THREE.Matrix3() }, uProjView: { value: new THREE.Matrix4() }, uDeep: { value: new THREE.Color(0x0f4a55) }, uAmbW: { value: new THREE.Color(0.5, 0.42, 0.32) }, uSSR: { value: Q.ssr ? 1 : 0 } };

  const glass = makeBottle(GU, tex); bottle.add(glass);
  const stopper = makeStopper(tex); bottle.add(stopper);
  const water = makeWater(sea, WU, qName === 'ultra' ? [400, 180] : qName === 'low' ? [180, 84] : [300, 140]); bottle.add(water);
  const waterMats = water.userData.mats;

  setLoad('放一片海進去…', 0.6); await tick();
  const seabed = makeSeabed(tex); bottle.add(seabed);
  const island = makeIsland(tex); bottle.add(island);
  const L = island.userData;
  const ship = makeShip(tex); bottle.add(ship);
  const S = ship.userData;
  const rowboat = L.rowboat; bottle.add(rowboat);
  const W2B = { value: new THREE.Matrix4() };
  addWaterline(S.hullMat, waterMats[0].uniforms, W2B);
  { const rbHull = rowboat.children.find(m => m.isMesh); if (rbHull) addWaterline(rbHull.material, waterMats[0].uniforms, W2B, { foam: 0.45 }); }
  mergeLog.push(mergeStatic(ship, [...S.sails.map(x => x.mesh), ...S.flags.map(f => f.mesh), S.captain, S.lookout, S.sailor, S.cat, S.figurehead, S.bell, S.wheel, S.rudder, ...S.lanterns.map(l => l.mesh)]));
  mergeLog.push(mergeStatic(L.lighthouse, [L.beamGroup, L.lensG, L.lens, L.vane]));
  mergeLog.push(mergeStatic(L.cottage));
  mergeLog.push(mergeStatic(island, [L.islandMesh, L.lighthouse, L.cottage, L.keeper, L.jetty, L.isleFlag, ...L.laundry]));
  mergeLog.push(mergeStatic(seabed, [seabed.userData.chest, seabed.userData.sand]));
  const mini = makeMiniBottle(); bottle.add(mini);
  setLoad('請海豚、海鷗與海龜入場…', 0.72); await tick();
  const dolphins = new Dolphins(3); bottle.add(dolphins.group);
  const gulls = new Gulls(L.perches); bottle.add(gulls.group);
  const fish = new FishSchool(44, { seed: 8 }); bottle.add(fish.mesh);
  const fish2 = new FishSchool(14, { seed: 19, palette: [0xe0b050, 0xd8a040, 0xe8c070], size: 1.25, speed: 0.7, y: -0.5, phase: 40 }); bottle.add(fish2.mesh);
  const turtle = new Turtle(); bottle.add(turtle.group);
  const jellies = new Jellies(3); bottle.add(jellies.group);
  const splashes = new Splashes(400); bottle.add(splashes.points);
  const bubbles = new Bubbles(90); bottle.add(bubbles.points);
  const smoke = new Smoke(110); bottle.add(smoke.points);
  smoke.add(L.chimTop.clone(), 2.2, 1.0);
  const storm = new Storm(); bottle.add(storm.group);
  const embers = new Embers(RU.emberOrigin, 70); scene.add(embers.points);

  // ---------- lights
  const lampSpot = new THREE.SpotLight(0xffa860, 130, 0, 0.62, 0.85, 2);
  lampSpot.position.copy(lampPos); lampSpot.target.position.set(0.3, -0.9, 0.3); scene.add(lampSpot, lampSpot.target);
  lampSpot.castShadow = true; lampSpot.shadow.mapSize.set(Q.shadow, Q.shadow); lampSpot.shadow.bias = -0.00025; lampSpot.shadow.normalBias = 0.012; lampSpot.shadow.radius = 3; lampSpot.shadow.camera.near = 1.0; lampSpot.shadow.camera.far = 24;
  const lampPoint = new THREE.PointLight(0xff9a4a, 7, 0, 2); lampPoint.position.copy(lampPos).add(new THREE.Vector3(0.4, 0.25, 0.4)); scene.add(lampPoint);
  const moon = new THREE.DirectionalLight(0x9fb2dc, 0.3);
  moon.position.set(-6, 14, -40); moon.target.position.set(0, D, 2); scene.add(moon, moon.target);
  const setMoonShadow = (res) => {
    moon.castShadow = res > 0;
    if (res > 0) { moon.shadow.mapSize.set(res, res); const sc = moon.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 95; sc.updateProjectionMatrix(); moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.03; }
    if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
  };
  setMoonShadow(Q.moon);
  const fireL = new THREE.PointLight(0xff7a30, 1300, 0, 2); fireL.position.copy(RU.fireLightPos); scene.add(fireL);
  const candleL = new THREE.PointLight(0xffa050, 5, 0, 2); candleL.position.copy(PU.candleFlamePos); scene.add(candleL);
  const hemi = new THREE.HemisphereLight(0x2a3040, 0x140b06, 0.15); scene.add(hemi);
  const mantelL = new THREE.PointLight(0xffa050, 60, 0, 2); mantelL.position.copy(RU.mantelLightPos); scene.add(mantelL);
  const sconces = RU.sconcePos.map(p => { const l = new THREE.PointLight(0xffa050, 160, 0, 2); l.position.copy(p); scene.add(l); return l; });
  const beamSpot = new THREE.SpotLight(0xffd59a, 30, 0, 0.14, 0.6, 2); L.beamGroup.add(beamSpot); const bt1 = new THREE.Object3D(); bt1.position.set(5, -0.25, 0); L.beamGroup.add(bt1); beamSpot.target = bt1;
  const beamSpot2 = new THREE.SpotLight(0xffd59a, 30, 0, 0.14, 0.6, 2); L.beamGroup.add(beamSpot2); const bt2 = new THREE.Object3D(); bt2.position.set(-5, -0.25, 0); L.beamGroup.add(bt2); beamSpot2.target = bt2;
  [lampSpot, lampPoint, moon, hemi, fireL, candleL, beamSpot, beamSpot2, storm.light, mantelL, ...sconces].forEach(l => l.layers.enableAll());
  [lampSpot.target, moon.target].forEach(o => o.layers.enableAll());

  enableLayers(room, LAYER.ROOM); enableLayers(desk, LAYER.ROOM); enableLayers(props, LAYER.ROOM); enableLayers(stand, LAYER.ROOM);
  [stand, ship, island, seabed, rowboat, dolphins.group, gulls.group, turtle.group, props, desk].forEach(o => o.traverse(m => { if (m.isMesh && !m.material.transparent && m.material.blending !== THREE.AdditiveBlending) { m.castShadow = m.castShadow !== false; m.receiveShadow = true; } }));
  [PU.flame, PU.flameCore, PU.glow, PU.chimney, PU.candleFlame, PU.candleGlow].forEach(o => { o.castShadow = false; });
  L.beamGroup.traverse(m => { if (m.isMesh) m.castShadow = false; });

  // ---------- environment
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  function refreshEnv() {
    glass.visible = false; water.visible = false;
    const ac = renderer.autoClear; renderer.autoClear = true;
    cubeCam.position.set(0, -0.2, 0);
    cubeCam.update(renderer, scene);
    renderer.autoClear = ac;
    if (envRT) envRT.dispose();
    envRT = pmrem.fromCubemap(cubeRT.texture);
    scene.environment = envRT.texture; scene.environmentIntensity = 0.5;
    glass.visible = true; water.visible = true;
  }

  // ---------- state
  const state = {
    wind: 1, tod: 2, todBlend: { moonI: 0.3, hemiI: 0.15, light: 1, exposure: 1.2, night: 1, beam: 1, fire: 1, candle: 1 },
    lampWick: 1, lampWickTarget: 1, candleOn: 1, candleK: 1, roll: 0, pitch: 0, rollV: 0, pitchV: 0, rollT: 0, pitchT: 0,
    shakeT: 0, uncorked: 0, uncorkT: 0, chestOpen: 0, chestT: 0, beamBoost: 0, cottageOn: 1, sternOn: 1, fireBoost: 0,
    tagA: 0, tagV: 0, tagAZ: 0, tagVZ: 0, needle: 0, needleV: 0, globeV: 0, baroJig: 0, baroP: 0.5,
    hatT: 0, bellT: 0, luffT: 0, heelV: 0, lookT: 0, waveT: 0, catT: 0, keeperT: 0, figT: 0,
    found: new Set(store.get('found', [])), intro: params.has('skip') ? 'done' : 'wait', introT: 0, uiHidden: false, scope: null,
  };
  const ship$ = { x: 0.04, z: 0.08, vx: 0, vz: 0, pitch: 0, roll: 0, heave: sea.height(0.04, 0.08) + 0.004, pv: 0, rv: 0, hv: 0 }; // start afloat, not dropping in
  const rb$ = { kick: 0 }; const mini$ = { a: 0, boost: 0 };

  const TOD = [
    { name: '晨光', win: [2.2, 2.1, 1.9], lamp: 0, moonCol: 0xfff0dc, moonI: 2.3, hs: 0xa8bcd4, hg: 0x4a3828, hemiI: 0.75, light: 0, exposure: 0.85, deep: 0x1f7280, amb: [0.95, 0.98, 1.0], night: 0, beam: 0, fire: 0.3, candle: 0 },
    { name: '暮色', win: [1.4, 0.65, 0.35], lamp: 0.85, moonCol: 0xff8c4a, moonI: 1.6, hs: 0x6a4a5a, hg: 0x2a160c, hemiI: 0.42, light: 0.7, exposure: 1.05, deep: 0x175665, amb: [0.85, 0.58, 0.42], night: 0.5, beam: 0.6, fire: 0.8, candle: 1 },
    { name: '月夜', win: [0.28, 0.34, 0.55], lamp: 1, moonCol: 0x9fb2dc, moonI: 0.3, hs: 0x3a3848, hg: 0x1c1008, hemiI: 0.32, light: 1, exposure: 1.2, deep: 0x0f4852, amb: [0.62, 0.48, 0.34], night: 1, beam: 1, fire: 1, candle: 1 },
  ];
  function applyTOD(i, instant) {
    state.tod = i; state.todFrom = { ...state.todBlend, moonCol: moon.color.clone(), hs: hemi.color.clone(), hg: hemi.groundColor.clone(), deep: WU.uDeep.value.clone(), amb: WU.uAmbW.value.clone(), win: GU.uWinCol.value.clone() };
    state.todT = instant ? 1 : 0; state.envPending = true;
    RU.skyMat.uniforms.uTOD.value = i;
    document.querySelectorAll('[data-tod]').forEach(b => b.classList.toggle('on', +b.dataset.tod === i));
    state.lampWickTarget = i === 0 ? 0 : 1;
    if (instant) updateTOD(0, true);
  }
  function updateTOD(dt, force) {
    if (!force && (state.todT === undefined || (state.todT >= 1 && !state.envPending))) return;
    state.todT = Math.min(1, (state.todT ?? 1) + dt / 1.6);
    const k = force ? 1 : smooth(0, 1, state.todT), T = TOD[state.tod], F = state.todFrom;
    const tb = state.todBlend;
    for (const key of ['moonI', 'hemiI', 'light', 'exposure', 'night', 'beam', 'fire', 'candle']) tb[key] = lerp(F[key] ?? T[key], T[key], k);
    moon.color.copy(F.moonCol).lerp(new THREE.Color(T.moonCol), k); hemi.color.copy(F.hs).lerp(new THREE.Color(T.hs), k); hemi.groundColor.copy(F.hg).lerp(new THREE.Color(T.hg), k);
    WU.uDeep.value.copy(F.deep).lerp(new THREE.Color(T.deep), k); WU.uAmbW.value.copy(F.amb).lerp(new THREE.Color(...T.amb), k);
    GU.uWinCol.value.copy(F.win).lerp(new THREE.Color(...T.win), k);
    if (state.todT >= 1 && state.envPending) { state.envPending = false; refreshEnv(); }
  }

  // ---------- resize / quality
  let dprMax = Math.min(window.devicePixelRatio || 1, Q.dpr);
  if (params.has('dpr')) dprMax = +params.get('dpr');
  let dpr = dprMax;
  const rig = new CameraRig(camera, canvas);
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    const Wp = Math.round(w * dpr), Hp = Math.round(h * dpr);
    pipe.setSize(Wp, Hp);
    GU.uRes.value.set(Wp, Hp); GU.tScene.value = pipe.rtC.texture;
    WU.tColor.value = pipe.rtA.texture; WU.tDepth.value = pipe.rtA.depthTexture;
    [splashes, smoke, embers].forEach(p => { p.mat.uniforms.uScale.value = Hp; });
    camera.aspect = w / h; camera.updateProjectionMatrix();
    PRESETS = rig.presets(camera.aspect);
  }
  let PRESETS = rig.presets(innerWidth / innerHeight);
  function setQuality(name, announce = true) {
    qName = name; Q = QUALITY[name]; store.set('quality', name);
    dprMax = Math.min(window.devicePixelRatio || 1, Q.dpr); dpr = dprMax;
    pipe.samples = Q.samples; pipe.setTaps(Q.taps); WU.uSSR.value = Q.ssr ? 1 : 0;
    lampSpot.shadow.mapSize.set(Q.shadow, Q.shadow); if (lampSpot.shadow.map) { lampSpot.shadow.map.dispose(); lampSpot.shadow.map = null; }
    setMoonShadow(Q.moon);
    resize();
    $('#q-label').textContent = Q.label;
    if (announce) log(`畫質切換為「${Q.label}」。`);
  }
  window.addEventListener('resize', resize);
  resize();
  $('#q-label').textContent = Q.label;

  // ---------- helpers: UI
  const logEl = $('#log-entries');
  function log(text) {
    const d = new Date(); const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    const e = document.createElement('div'); e.className = 'entry'; e.innerHTML = `<span class="t">${hh}:${mm}</span><span class="x"></span>`; e.querySelector('.x').textContent = text;
    logEl.prepend(e); requestAnimationFrame(() => e.classList.add('in'));
    while (logEl.children.length > 4) logEl.lastChild.remove();
  }
  function discover(id) {
    if (state.found.has(id)) return; state.found.add(id); store.set('found', [...state.found]);
    const d = DISCOVER.find(x => x[0] === id); if (!d) return;
    const t = $('#toast'); t.innerHTML = `<small>新的發現 · ${state.found.size} / ${DISCOVER.length}</small>${d[1]}`; t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
    renderDiscover();
  }
  function renderDiscover() {
    $('#disc-count').textContent = `${state.found.size} / ${DISCOVER.length}`;
    $('#disc-list').innerHTML = DISCOVER.map(([id, n, h]) => state.found.has(id) ? `<li class="f"><span>✦</span>${n}</li>` : `<li><span>·</span><em>${h}</em></li>`).join('');
  }
  renderDiscover();
  function note(html, ms = 6000) { const n = $('#note'); n.innerHTML = html; n.classList.add('in'); clearTimeout(note.t); note.t = setTimeout(() => n.classList.remove('in'), ms); }
  $('#note').addEventListener('click', () => $('#note').classList.remove('in'));

  // ---------- interactions
  const pickables = [];
  const handlers = {};
  const register = (obj, id, name, hint, fn) => { obj.userData.pickId = id; pickables.push(obj); handlers[id] = { name, hint, fn }; };
  const tmpV = new THREE.Vector3();
  const splashAt = (x, y, z, s) => { splashes.burst(x, y, z, s * 0.8, Math.round(26 * s)); sea.addRipple(x, z, 0.012 * s); audio.splash(s); };
  const isIn = (o, root) => { while (o) { if (o === root) return true; o = o.parent; } return false; };

  register(ship, 'ship', '拾光號 Halcyon', '一八八七年下水的雙桅縱帆船', (hit) => {
    const o = hit.object;
    if (isIn(o, S.captain)) { state.hatT = 1.6; audio.creak(); log('船長舉帽致意，像是認出了你。'); discover('captain'); return; }
    if (isIn(o, S.lookout)) { state.lookT = 3; audio.whistle(); log('瞭望手舉起望遠鏡：「燈塔！左舷後方！」'); discover('lookout'); return; }
    if (isIn(o, S.sailor)) { state.waveT = 2.2; audio.whistle(); log('船頭的水手吹了聲口哨，朝你揮手。'); discover('sailor'); return; }
    if (isIn(o, S.cat)) { state.catT = 2.4; audio.meow(); log('船貓伸了個懶腰，又縮回艙頂。'); discover('cat'); return; }
    if (isIn(o, S.figurehead)) { state.figT = 1.6; audio.chime(); log('翠鳥船首像閃了一下金光——Halcyon，就是翠鳥。'); discover('figurehead'); return; }
    if (o.material === S.sternMat) { state.sternOn = state.sternOn ? 0 : 1; audio.click(audio.ctx ? audio.ctx.currentTime : 0, 2600); log(state.sternOn ? '船長室的燈亮了。' : '艉窗暗了，有人在下面睡覺。'); discover('stern'); return; }
    if (S.sails.some(s => s.mesh === o)) { state.luffT = 2.6; audio.noise(0.6, 900, 0.8, 0.12, 'bandpass', 'white', 300); log('帆鬆了一下，又吃滿了風。'); discover('sails'); return; }
    state.bellT = 2.5; state.heelV += 0.35; audio.bell(); log('拾光號敲響了船鐘：八響，換班。'); discover('bell');
  });
  dolphins.list.forEach((d, i) => register(d.root, 'dolphin' + i, '海豚', '點牠一下', () => { if (dolphins.jump(d, true)) { log('一隻海豚翻身躍出了水面。'); discover('dolphin'); } }));
  gulls.list.forEach((g, i) => register(g.root, 'gull' + i, '海鷗', g.perch ? '停著休息' : '瓶子裡的天空不大，但夠飛', () => { const was = g.mode; gulls.startle(g); audio.gull(); if (was === 'perch') { log('停著的海鷗被嚇飛了，繞了一圈。'); discover('perch'); } else { log('海鷗叫了兩聲，俯衝掠過浪尖。'); discover('gull'); } }));
  register(L.lighthouse, 'lighthouse', '燈塔', '守夜的光', () => { state.beamBoost = 3.5; audio.foghorn(); log('霧笛響起，燈塔的光掃過整間書房。'); discover('lighthouse'); });
  register(L.cottage, 'cottage', '守燈人小屋', '窗裡有人', () => { state.cottageOn = state.cottageOn ? 0 : 1; audio.click(audio.ctx ? audio.ctx.currentTime : 0, 2600); log(state.cottageOn ? '守燈人點亮了窗。' : '守燈人熄了燈，大概睡了。'); discover('cottage'); });
  register(L.keeper, 'keeper', '守燈人', '提著一盞小燈', () => { state.keeperT = 2.5; log('守燈人舉起提燈晃了晃，像在打招呼。'); discover('keeper'); });
  register(turtle.group, 'turtle', '海龜', '慢慢地游', () => { turtle.poke(); audio.slosh(); log('海龜划了兩下前鰭，加速游開了。'); discover('turtle'); });
  jellies.list.forEach((j, i) => register(j.root, 'jelly' + i, '水母', '在夜裡會發光', () => { jellies.poke(j); audio.chime(); log('水母一縮一放，亮了一下。'); discover('jelly'); }));
  register(seabed.userData.chest, 'chest', '沉沒的寶箱', '海床上的老東西', () => { state.chestOpen = state.chestOpen ? 0 : 1; if (state.chestOpen) { audio.chime(); bubbles.boost = 3; bubbles.boostSrc = [1.05, -0.28]; log('寶箱開了：裡面只有一點點光。'); } else { audio.creak(); log('寶箱闔上了。有些東西最好留在海底。'); } discover('chest'); });
  register(mini, 'minibottle', '漂流瓶', '瓶中之瓶', () => { mini$.boost = 1; audio.clink(); note('<em>瓶中之瓶</em><br>裡面的紙條寫著：<br>「你也在某個人的瓶子裡嗎？」', 5200); log('撈起漂流瓶，紙條上的字很小。'); discover('minibottle'); });
  register(rowboat, 'rowboat', '小划艇', '繫在碼頭邊', () => { rb$.kick = 1; audio.splash(0.4); log('小划艇晃了晃，纜繩繃緊。'); });
  register(stopper.userData.cork, 'cork', '封蠟軟木塞', '一八八七年封上的', () => toggleCork());
  stopper.userData.waxParts.forEach(p => { p.userData.pickId = 'cork'; pickables.push(p); });
  register(stopper.userData.tagPivot, 'tag', '吊牌', 'N° 07 · 拾光號', () => { state.tagV += 3.5; state.tagVZ += 1.2; log('吊牌在瓶頸下晃了晃。'); discover('tag'); });
  register(stand.userData.plaque, 'plaque', '黃銅銘牌', '點擊刻上你的字', () => openEngrave());
  register(PU.lamp, 'lamp', '煤油燈', '捻一捻燈芯', () => { state.lampWickTarget = state.lampWickTarget > 0.5 ? 0.18 : 1; audio.wick(); log(state.lampWickTarget > 0.5 ? '燈芯捻亮，瓶中的月亮又升起。' : '燈芯捻低，瓶裡的海暗了下來。'); discover('lamp'); });
  register(PU.candle, 'candle', '燭台', '一根快燒完的蠟燭', () => { state.candleOn = state.candleOn ? 0 : 1; audio.noise(0.3, 600, 0.6, 0.06, 'lowpass', 'brown', 200); log(state.candleOn ? '重新點亮了蠟燭。' : '呼——蠟燭熄了，冒出一縷煙。'); discover('candle'); });
  register(PU.compass, 'compass', '黃銅羅盤', '它不指北', () => { state.needleV += 26; audio.tickSpin(); log('羅盤轉了幾圈，又停回船的方向。'); discover('compass'); });
  register(PU.ink, 'quill', '羽毛筆與墨水', '寫一句話', () => { const q = QUOTES[Math.floor(Math.random() * QUOTES.length)]; log(q); audio.scratch(); setTimeout(() => audio.scratch(), 120); discover('quill'); });
  register(PU.books, 'books', '舊書', '海圖、潮汐與航誌', () => { log('最上面那本叫《Logbook》，書脊已經裂開。'); audio.noise(0.3, 3000, 0.5, 0.05); });
  register(PU.letter, 'letter', '一封信', '壓著紅色封蠟', () => { note(LETTER, 9000); audio.noise(0.4, 3000, 0.5, 0.05); discover('letter'); });
  register(PU.logBook, 'logbook', '航海日誌', '翻開到九月', () => { note('<em>九月十五日　夜</em><br>月很亮，海很小。<br>船貓又偷了一條魚。<br>明天要經過燈塔。', 7000); audio.noise(0.4, 3000, 0.5, 0.05); discover('logbook'); });
  register(PU.plans, 'plans', '拾光號設計圖', '帆船的側視與半寬圖', () => { log('設計圖角落寫著：「帆再收窄一些，好穿過瓶頸。」'); discover('plans'); });
  register(PU.tools, 'tools', '造瓶中船的工具', '長鑷子、線軸、下一艘船', () => { log('長鑷子、線軸、還沒上桅的船殼——下一艘船已經在路上。'); discover('plans'); });
  register(PU.spyglass, 'spyglass', '黃銅望遠鏡', '湊近看看', () => { enterScope(); discover('spyglass'); });
  register(PU.watch, 'watch', '懷錶', '還在走', () => { const d = new Date(); log(`懷錶指著 ${d.getHours()} 點 ${String(d.getMinutes()).padStart(2, '0')} 分，和你的時間一樣。`); audio.chime(); discover('watch'); });
  const skyMesh = room.children.find(o => o.material === RU.skyMat);
  register(skyMesh, 'window', '窗', '外面的天色', () => { const n = (state.tod + 1) % 3; applyTOD(n); log(`窗外換成了${TOD[n].name}。`); discover('window'); });
  const fireGroup = new THREE.Group(); scene.add(fireGroup);
  const fireHit = new THREE.Mesh(new THREE.BoxGeometry(4, 14, 16), new THREE.MeshBasicMaterial({ visible: false })); fireHit.position.set(-34, FLOOR + 7, 8); fireGroup.add(fireHit);
  register(fireHit, 'fire', '壁爐', '撥一撥柴火', () => { state.fireBoost = 3; audio.crackle && [0, 60, 130, 210].forEach(d => setTimeout(() => audio.ctx && audio.on && audio.crackle(audio.ctx.currentTime, 2), d)); log('撥了撥柴火，火星往上竄。'); discover('fire'); });
  register(RU.globe, 'globe', '地球儀', '轉一轉', () => { state.globeV += 4; audio.noise(0.8, 400, 0.5, 0.05, 'lowpass', 'brown'); log('地球儀轉起來，拾光灣一閃而過。'); discover('globe'); });
  register(RU.baroNeedle.parent, 'barometer', '氣壓計', '敲一敲玻璃', () => { state.baroJig = 1; audio.clink(); log(state.wind >= 3 ? '指針跳向「暴風」。瓶子裡的天氣，連牆上都知道。' : '敲了敲氣壓計，指針抖了一下。'); discover('barometer'); });
  register(RU.wallClock.h.parent, 'clock', '船鐘', '走的是你現在的時間', () => { audio.bell(); const d = new Date(); log(`船鐘指著 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}，現實的時間也流進了瓶子旁邊。`); discover('clock'); });
  register(RU.mantelClock.h.parent, 'clock2', '壁爐上的鐘', '走的是你現在的時間', () => { audio.bell(); log('壁爐上的鐘敲了一下。'); discover('clock'); });
  const glassPick = glass.userData.pick; pickables.push(glassPick);

  function toggleCork() {
    state.uncorked = state.uncorked ? 0 : 1; audio.pop();
    if (state.uncorked) { log('封蠟碎了一角，軟木塞被拔起——聽得見海了。'); audio.setWind(state.wind + 1.5); }
    else { log('軟木塞塞回去，海又安靜了。'); audio.setWind(state.wind); }
    discover('cork');
  }

  const ray = new THREE.Raycaster(); ray.params.Line.threshold = 0.004; ray.params.Points.threshold = 0.01; const ndc = new THREE.Vector2();
  function setRay(cx, cy) { ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); }
  function pick(cx, cy) {
    setRay(cx, cy);
    const hits = ray.intersectObjects(pickables, true);
    let glassHit = null, best = null;
    for (const h of hits) {
      let o = h.object, id = null; while (o) { if (o.userData.pickId) { id = o.userData.pickId; break; } if (o.userData.isGlass) { id = '__glass'; break; } o = o.parent; }
      if (!id) continue;
      if (id === '__glass') { if (!glassHit) glassHit = h; continue; }
      if (h.object.isSprite || h.object.isPoints) continue;
      best = { id, hit: h }; break;
    }
    const inv = new THREE.Matrix4().copy(bottle.matrixWorld).invert();
    const o = ray.ray.origin.clone().applyMatrix4(inv), d = ray.ray.direction.clone().transformDirection(inv);
    const n = sea.uN; const t = (B.level + n.x * B.cx - n.dot(o)) / n.dot(d);
    let waterHit = null;
    if (t > 0) { const p = o.clone().addScaledVector(d, t); if (Math.hypot(p.y, p.z) < innerR(p.x) && p.x > -2 && p.x < 2) { waterHit = { p, dist: t }; } }
    return { best, glassHit, waterHit };
  }
  function doClick(cx, cy) {
    if (state.scope) { exitScope(); return; }
    const { best, glassHit, waterHit } = pick(cx, cy);
    if (best) { handlers[best.id].fn(best.hit); return; }
    if (waterHit) {
      const p = waterHit.p; sea.addRipple(p.x, p.z, 0.016); splashes.burst(p.x, sea.height(p.x, p.z), p.z, 0.35, 10); audio.splash(0.35);
      if (p.distanceTo(fish.center(U.time.value, tmpV)) < 0.6) fish.startle();
      if (!state.waterLogged) { log('指尖點過水面，漣漪一圈圈撞上玻璃。'); state.waterLogged = true; }
      discover('water'); return;
    }
    if (glassHit) {
      audio.clink(); fish.startle(); fish2.startle(); gulls.list.forEach(g => g.mode === 'fly' && Math.random() < 0.5 && gulls.startle(g)); GU.uWet.value = Math.min(0.75, GU.uWet.value + 0.06);
      const pl = glassHit.point.clone().applyMatrix4(new THREE.Matrix4().copy(bottle.matrixWorld).invert());
      sea.addRipple(clamp(pl.x, -1.9, 1.7), clamp(pl.z, -0.8, 0.8) * 0.9, 0.01);
      if (!state.glassLogged) { log('叩、叩。瓶裡的魚群全都散開了。'); state.glassLogged = true; }
      discover('glass');
    }
  }
  // double click: focus on the exact point under the cursor
  const focusTargets = [room, desk, props, stand, ship, island, seabed, rowboat, dolphins.group, gulls.group, turtle.group, stopper, mini];
  function focusAt(cx, cy) {
    setRay(cx, cy);
    const hits = ray.intersectObjects(focusTargets, true).filter(h => h.object.isMesh && h.object.visible !== false && !(h.object.material && h.object.material.transparent && h.object.material.blending === THREE.AdditiveBlending));
    const { waterHit } = pick(cx, cy);
    let pt = hits.length ? hits[0].point.clone() : null;
    if (waterHit) { const wp = waterHit.p.clone().applyMatrix4(bottle.matrixWorld); if (!pt || wp.distanceTo(camera.position) < pt.distanceTo(camera.position)) pt = wp; }
    if (pt) { rig.focusOn(pt); view.mode = 'free'; markView(null); }
  }
  let down = null, longT = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (state.intro !== 'done' || state.scope) return;
    rig.tween = null;
    const wantsRock = e.shiftKey || e.pointerType === 'touch';
    const { glassHit } = wantsRock ? pick(e.clientX, e.clientY) : { glassHit: null };
    down = { x: e.clientX, y: e.clientY, t: performance.now(), rock: false, moved: false, id: e.pointerId, detail: e.detail };
    const startRock = () => { down.rock = true; rig.controls.enabled = false; try { canvas.setPointerCapture(e.pointerId); } catch (er) { } down.roll0 = state.rollT; };
    if (glassHit) {
      if (e.shiftKey) startRock();
      else if (e.pointerType === 'touch') longT = setTimeout(() => { if (down && !down.moved) { startRock(); tipEl.innerHTML = '<b>搖晃瓶子</b><span>左右拖曳</span>'; } }, 380);
    }
  }, { capture: true });
  canvas.addEventListener('pointermove', (e) => {
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > 6) { down.moved = true; }
      if (down.rock) {
        state.rollT = clamp(dx * 0.0032, -0.5, 0.5); state.pitchT = clamp(-dy * 0.0012, 0, 0.12);
        if (!state.rockLogged && Math.abs(dx) > 60) { state.rockLogged = true; log('整片海在手心裡傾斜，船卻努力站直。'); audio.slosh(); discover('rock'); }
      } else if (down.moved && longT) { clearTimeout(longT); longT = null; }
    } else if (!state.scope) hover(e.clientX, e.clientY);
  });
  const up = (e) => {
    if (longT) { clearTimeout(longT); longT = null; }
    if (!down) return;
    if (!down.moved && !down.rock && performance.now() - down.t < 450 && (e.detail || 1) <= 1) doClick(e.clientX, e.clientY);
    if (down.rock) { state.rollT = 0; state.pitchT = 0; rig.controls.enabled = true; if (down.moved) audio.creak(); }
    down = null;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('dblclick', (e) => { if (state.intro === 'done' && !state.scope) focusAt(e.clientX, e.clientY); });
  const tipEl = $('#tip'); let hoverT = 0;
  function hover(x, y) {
    const now = performance.now(); if (now - hoverT < 80) return; hoverT = now;
    if (state.intro !== 'done') return;
    const { best, glassHit, waterHit } = pick(x, y);
    let txt = null;
    if (best) {
      const h = handlers[best.id]; let name = h.name, hint = h.hint;
      const o = best.hit.object;
      if (best.id === 'ship') {
        if (isIn(o, S.captain)) { name = '船長'; hint = '他好像在看你'; } else if (isIn(o, S.lookout)) { name = '瞭望手'; hint = '前桅橫桁上'; } else if (isIn(o, S.sailor)) { name = '水手'; hint = '在絞盤旁'; } else if (isIn(o, S.cat)) { name = '船貓'; hint = '別吵牠'; } else if (isIn(o, S.figurehead)) { name = '翠鳥船首像'; hint = 'Halcyon 的由來'; } else if (o.material === S.sternMat) { name = '艉板與艉窗'; hint = '船長室在裡面'; } else if (S.sails.some(s => s.mesh === o)) { name = '帆'; hint = '點一下讓它鬆一鬆'; }
      }
      txt = `<b>${name}</b><span>${hint}</span>`;
    }
    else if (waterHit) txt = '<b>海面</b><span>點一下，起漣漪</span>';
    else if (glassHit) txt = '<b>玻璃瓶</b><span>點擊輕叩 · Shift＋拖曳搖晃 · 雙擊聚焦</span>';
    canvas.style.cursor = txt ? 'pointer' : '';
    if (txt) { tipEl.innerHTML = txt; tipEl.style.transform = `translate(${Math.min(x + 16, innerWidth - 250)}px, ${y + 14}px)`; tipEl.classList.add('in'); } else tipEl.classList.remove('in');
  }
  canvas.addEventListener('pointerleave', () => tipEl.classList.remove('in'));

  // ---------- spyglass mode
  function enterScope() {
    const sp = PU.spyglass; sp.updateMatrixWorld();
    const eye = new THREE.Vector3(-1.6, 0, 0).applyMatrix4(sp.matrixWorld); eye.y += 0.25;
    state.scope = { pos: camera.position.clone(), tgt: rig.controls.target.clone(), fov: camera.fov, ap: rig.ap, mode: view.mode };
    rig.controls.enabled = false; rig.follow = null; rig.tween = null;
    const tgt = ship.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.2, 0));
    rig.tween = { t: 0, dur: 1.4, fromPos: camera.position.clone(), fromTgt: rig.controls.target.clone(), toPos: eye, toTgt: tgt, fromFov: camera.fov, toFov: 9, fromAp: rig.ap, toAp: 0.002, path: null };
    $('#scope').classList.add('in'); document.body.classList.add('clean'); audio.creak();
    log('把眼睛湊上望遠鏡：拾光號就在圓圈中央。');
  }
  function exitScope() {
    const s = state.scope; if (!s) return; state.scope = null;
    rig.tween = { t: 0, dur: 1.2, fromPos: camera.position.clone(), fromTgt: rig.controls.target.clone(), toPos: s.pos, toTgt: s.tgt, fromFov: camera.fov, toFov: s.fov, fromAp: rig.ap, toAp: s.ap, path: null };
    setTimeout(() => { rig.controls.enabled = true; }, 1250);
    $('#scope').classList.remove('in'); if (!state.uiHidden) document.body.classList.remove('clean');
  }
  $('#scope-exit').onclick = () => exitScope();

  // ---------- engraving
  function openEngrave() {
    discover('plaque');
    $('#eng1').value = plaqueLines[0]; $('#eng2').value = plaqueLines[1];
    $('#engrave').classList.add('in'); setTimeout(() => $('#eng1').focus(), 50);
  }
  $('#eng-cancel').onclick = () => $('#engrave').classList.remove('in');
  $('#eng-ok').onclick = () => {
    const a = $('#eng1').value.trim() || ' ', b = $('#eng2').value.trim();
    $('#engrave').classList.remove('in');
    let i = 0; const chars = [...a];
    const step = () => { i++; plaqueLines[0] = chars.slice(0, i).join(''); plaqueLines[1] = i >= chars.length ? b : ''; updatePlaque(stand.userData.plaque, plaqueLines); audio.scratch(); if (i < chars.length) setTimeout(step, 110); else { store.set('plaque1', a); store.set('plaque2', b); log(`銘牌刻上了：「${a}」`); refreshEnv(); } };
    plaqueLines[0] = ''; plaqueLines[1] = ''; updatePlaque(stand.userData.plaque, plaqueLines); setTimeout(step, 300);
  };
  $('#eng1').addEventListener('keydown', e => { if (e.key === 'Enter') $('#eng-ok').click(); });

  // ---------- views
  const view = { mode: 'overview' };
  function markView(name) { document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === name)); }
  function goView(name, dur = 2.2) { view.mode = name; markView(name); rig.goTo(PRESETS[name], dur, null, ship); }
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { if (state.scope) exitScope(); goView(b.dataset.view); });

  // ---------- dock
  document.querySelectorAll('[data-wind]').forEach(b => b.onclick = () => setWind(+b.dataset.wind));
  function setWind(w) {
    state.wind = w; sea.setWind(w); storm.target = w === 3 ? 1 : 0; audio.setWind(w + (state.uncorked ? 1.5 : 0));
    document.querySelectorAll('[data-wind]').forEach(b => b.classList.toggle('on', +b.dataset.wind === w));
    if (w === 3) log('瓶頂聚起了雲，一場只有掌心大的暴風雨。窗外也下起雨來。'); else if (w === 0) log('風停了，海面平得像一面鏡子。');
  }
  document.querySelectorAll('[data-tod]').forEach(b => b.onclick = () => { applyTOD(+b.dataset.tod); log(`光線換成了${TOD[+b.dataset.tod].name}。`); });
  $('#btn-shake').onclick = () => { state.shakeT = 1.8; audio.slosh(); setTimeout(() => audio.creak(), 300); log('你搖了搖瓶子。整片海都醒了。'); discover('rock'); };
  rig.onSpin = (v) => $('#btn-spin').classList.toggle('on', v);
  $('#btn-spin').onclick = () => { rig.setSpin(!rig.controls.autoRotate); if (rig.controls.autoRotate) { rig.follow = null; log('慢慢地繞著瓶子走一圈。'); } };
  $('#btn-sound').onclick = () => { audio.setOn(!audio.on); audio.setWind(state.wind); $('#btn-sound').classList.toggle('on', audio.on); };
  $('#btn-shot').onclick = () => { state.shot = true; };
  $('#btn-hide').onclick = () => { state.uiHidden = !state.uiHidden; document.body.classList.toggle('clean', state.uiHidden); };
  $('#btn-quality').onclick = () => { const i = QORDER.indexOf(qName); setQuality(QORDER[(i + 1) % QORDER.length]); state.userQ = true; };
  $('#btn-help').onclick = () => $('#help').classList.add('in');
  $('#help-ok').onclick = () => $('#help').classList.remove('in');
  $('#disc-btn').onclick = () => $('#disc-panel').classList.toggle('in');
  $('#disc-close').onclick = () => $('#disc-panel').classList.remove('in');
  const VIEWKEYS = ['sea', 'deck', 'overview', 'ship', 'lighthouse', 'back', 'study'];
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') { if (state.scope) exitScope(); $('#help').classList.remove('in'); $('#engrave').classList.remove('in'); $('#disc-panel').classList.remove('in'); $('#note').classList.remove('in'); return; }
    if (state.intro !== 'done') return;
    const k = e.key;
    if (k === 'h' || k === 'H') $('#btn-hide').click();
    else if (k === 's' || k === 'S') $('#btn-shake').click();
    else if (k === 'r' || k === 'R') $('#btn-spin').click();
    else if (k === 'm' || k === 'M') $('#btn-sound').click();
    else if (k === 'p' || k === 'P') $('#btn-shot').click();
    else if (k === '?' || k === '/') $('#btn-help').click();
    else if (k >= '1' && k <= '7') goView(VIEWKEYS[+k - 1]);
    else if (k === 'ArrowLeft') { rig.orbitBy(-0.12, 0); rig.tween = null; }
    else if (k === 'ArrowRight') { rig.orbitBy(0.12, 0); rig.tween = null; }
    else if (k === 'ArrowUp') { rig.orbitBy(0, -0.08); rig.tween = null; }
    else if (k === 'ArrowDown') { rig.orbitBy(0, 0.08); rig.tween = null; }
    else if (k === '+' || k === '=') rig.dolly(0.85);
    else if (k === '-' || k === '_') rig.dolly(1.18);
    else return;
    e.preventDefault();
  });

  // ---------- intro
  rig.set(PRESETS.sea);
  if (state.intro !== 'done') rig.controls.enabled = false;
  applyTOD(params.has('tod') ? +params.get('tod') : 2, true);
  setWind(params.has('wind') ? +params.get('wind') : 1); if (params.has('wind')) { storm.level = storm.target; sea.amp = sea.ampTarget; }
  setLoad('點亮燈塔…', 0.85); await tick();
  refreshEnv();
  if (state.intro === 'done') { const v = params.get('view') || 'overview'; view.mode = v; markView(v); rig.set(PRESETS[v] || PRESETS.overview, ship); document.body.classList.add('ready'); $('#intro').classList.add('gone'); rig.controls.enabled = true; }
  const lines = [$('#il1'), $('#il2'), $('#il3')];
  const revealPath = () => new THREE.CatmullRomCurve3([new THREE.Vector3(...PRESETS.sea.pos), new THREE.Vector3(0.95, -0.05, 1.25), new THREE.Vector3(1.2, 0.1, 2.4), new THREE.Vector3(0.9, 0.35, 4.3), new THREE.Vector3(...PRESETS.overview.pos)], false, 'centripetal');
  function startVoyage(withSound) {
    if (state.intro !== 'wait') return;
    if (withSound) { audio.setOn(true); audio.setWind(state.wind); $('#btn-sound').classList.add('on'); }
    state.intro = 'play'; state.introT = 0; $('#intro').classList.add('playing');
  }
  $('#start-sound').onclick = () => startVoyage(true);
  $('#start-quiet').onclick = () => startVoyage(false);
  $('#skip').onclick = () => { if (state.intro === 'play') state.introT = Math.max(state.introT, 7.6); };
  if (params.has('introAt')) { const ia = +params.get('introAt'); startVoyage(false); state.introT = ia; if (ia > 7) { state.revealStarted = true; rig.goTo(PRESETS.overview, 6.8, revealPath()); rig.tween.t = Math.min(0.999, (ia - 7) / 6.8); } }
  function updateIntro(dt) {
    if (state.intro !== 'play') return;
    state.introT += dt; const t = state.introT;
    lines[0].classList.toggle('in', t > 0.3 && t < 3.4);
    lines[1].classList.toggle('in', t > 3.6 && t < 6.6);
    lines[2].classList.toggle('in', t > 9.6 && t < 14.2);
    if (t > 7.0 && !rig.tween && !state.revealStarted) { state.revealStarted = true; rig.goTo(PRESETS.overview, 6.8, revealPath()); }
    if (t > 14.6) {
      state.intro = 'done'; $('#intro').classList.add('gone'); document.body.classList.add('ready'); rig.controls.enabled = true; view.mode = 'overview'; markView('overview');
      log('你找到一只封著海的瓶子。');
      setTimeout(() => log('提示：拖曳可以繞到瓶子背面，雙擊任何細節就會湊近。'), 1600);
      $('#hint').classList.add('in'); setTimeout(() => $('#hint').classList.remove('in'), 14000);
    }
  }

  setLoad('', 1);
  try { await renderer.compileAsync(scene, camera); } catch (e) { }
  $('#loading').classList.add('gone');

  // ---------- main loop
  let lastT = performance.now();
  let frameAvg = 16, lastAdapt = 0, adaptCount = 0;
  const prevRef = new THREE.Vector3(), prevVel = new THREE.Vector3(), acc = new THREE.Vector3(), refP = new THREE.Vector3();
  const invQ = new THREE.Quaternion(), wq = new THREE.Quaternion();
  let firstFrame = true; let frameCount = 0; let TEST_FRAMES = params.has('frames') ? +params.get('frames') : 0;
  if (params.has('warm')) { for (let i = 0; i < +params.get('warm') * 30; i++) { U.time.value += 1 / 30; sea.update(1 / 30, invQ, acc); dolphins.update(1 / 30, U.time.value, sea, () => { }); gulls.update(1 / 30, U.time.value, sea); fish.update(1 / 30, U.time.value); fish2.update(1 / 30, U.time.value); turtle.update(1 / 30, U.time.value); } }
  const camInv = new THREE.Matrix4();

  function frame() {
    renderer.info.reset();
    const nowT = performance.now(); const rawDt = Math.max(0, (nowT - lastT) / 1000); lastT = nowT;
    const dt = TEST_FRAMES ? 1 / 30 : Math.min(rawDt, 1 / 20);
    frameCount++;
    const t = (U.time.value += dt);
    frameAvg = lerp(frameAvg, rawDt * 1000, 0.05);
    if (!TEST_FRAMES && t - lastAdapt > 4 && t > 8 && state.intro === 'done') {
      lastAdapt = t;
      if (frameAvg > 42 && !state.userQ && adaptCount < 2 && QORDER.indexOf(qName) > 0) { adaptCount++; setQuality(QORDER[QORDER.indexOf(qName) - 1], false); log(`為了順暢，畫質自動調為「${Q.label}」。可在右下角切換。`); }
      else if (frameAvg > 34 && dpr > 1.0) { dpr = Math.max(1.0, dpr - 0.25); resize(); }
    }

    updateIntro(dt); updateTOD(dt);
    rig.surfaceY = (x, z) => sea.height(x, z);
    rig.bottleInv.copy(bottle.matrixWorld).invert(); W2B.value.copy(rig.bottleInv);
    rig.update(dt);

    // bottle rocking + shake
    const kR = 22, cR = 2.4;
    state.rollV += (-(state.roll - state.rollT) * kR - state.rollV * cR) * dt; state.roll += state.rollV * dt;
    state.pitchV += (-(state.pitch - state.pitchT) * 30 - state.pitchV * 4) * dt; state.pitch = Math.max(0, state.pitch + state.pitchV * dt);
    let sx = 0, sr = 0;
    if (state.shakeT > 0) { state.shakeT -= dt; const k = Math.max(0, state.shakeT / 1.8); sx = Math.sin(t * 17) * 0.045 * k; sr = Math.sin(t * 11 + 1) * 0.06 * k; }
    shaker.position.set(sx, Math.abs(sx) * 0.2, 0);
    bottle.rotation.x = state.roll + sr; pivot.rotation.z = state.pitch;
    scene.updateMatrixWorld();
    refP.set(-0.3, -0.5, 0).applyMatrix4(bottle.matrixWorld);
    if (firstFrame) { prevRef.copy(refP); firstFrame = false; }
    const vel = refP.clone().sub(prevRef).divideScalar(Math.max(dt, 1e-3));
    acc.lerp(vel.clone().sub(prevVel).divideScalar(Math.max(dt, 1e-3)).clampLength(0, 30), 0.5);
    prevVel.copy(vel); prevRef.copy(refP);
    bottle.getWorldQuaternion(wq); invQ.copy(wq).invert();
    sea.update(dt, invQ, acc);
    for (const m of waterMats) { m.uniforms.uSeaT.value = sea.time; m.uniforms.uAmp.value = sea.amp + sea.chop; }
    U.waterY.value = new THREE.Vector3(-0.3, B.level, 0).applyMatrix4(bottle.matrixWorld).y;

    // ship buoyancy
    const W = state.wind / 3;
    const n = sea.uN; const slx = -n.x / n.y, slz = -n.z / n.y;
    ship$.vx += (-1.4 * slx - 1.3 * (ship$.x - 0.04) - 1.1 * ship$.vx) * dt;
    ship$.vz += (-1.6 * slz - 1.8 * (ship$.z - 0.08) - 1.3 * ship$.vz) * dt;
    ship$.x += ship$.vx * dt; ship$.z = clamp(ship$.z + ship$.vz * dt, -0.42, 0.42);
    const yaw = 0.05 * Math.sin(t * 0.17) + 0.025 * Math.sin(t * 0.41) - ship$.vz * 0.6;
    const cy = Math.cos(yaw), syw = Math.sin(yaw);
    const sample = (fx, fz) => sea.height(ship$.x + fx * cy + fz * syw, ship$.z - fx * syw + fz * cy);
    const hb = sample(0.45, 0), hs = sample(-0.45, 0), hp = sample(0, 0.13), hst = sample(0, -0.13);
    const pT = Math.atan2(hb - hs, 0.9), rT = Math.atan2(hp - hst, 0.26) - 0.07 * W;
    ship$.pv += ((pT - ship$.pitch) * 40 - ship$.pv * 6) * dt; ship$.pitch += ship$.pv * dt;
    ship$.rv += ((rT - ship$.roll) * 30 - ship$.rv * 3.2) * dt; ship$.roll += ship$.rv * dt;
    if (state.heelV) { ship$.rv += state.heelV; state.heelV = 0; }
    const hT = (hb + hs + hp + hst) / 4 + 0.004;
    ship$.hv += ((hT - ship$.heave) * 60 - ship$.hv * 9) * dt; ship$.heave += ship$.hv * dt;
    ship.position.set(ship$.x, ship$.heave, ship$.z); ship.rotation.set(ship$.roll, yaw, ship$.pitch, 'YZX');
    const windK = 0.35 + W * 0.65 + storm.level * 0.3;
    S.sails.forEach(s => { s.luff = state.luffT > 0 ? Math.min(1, state.luffT / 0.6) : 0; s.update(t, windK); });
    state.luffT = Math.max(0, state.luffT - dt);
    S.flags.forEach(f => f.update(t, 0.3 + W * 0.7));
    // crew & cat
    const cap = S.captain.userData;
    if (state.hatT > 0) { state.hatT -= dt; const k = Math.sin(Math.min(1, (1.6 - state.hatT) / 1.6) * Math.PI); cap.hat.position.y = 0.066 + k * 0.012; cap.hat.rotation.z = k * 0.5; cap.armR.rotation.z = 0.9 + k * 1.8; } else { cap.hat.position.y = 0.066; cap.hat.rotation.z = 0; cap.armR.rotation.z = 0.9; }
    cap.head.rotation.y = Math.sin(t * 0.3) * 0.4;
    const lk = S.lookout.userData;
    state.lookT = Math.max(0, state.lookT - dt);
    lk.armR.rotation.z = lerp(0.4, 2.6, smooth(0, 0.5, state.lookT) * (state.lookT > 0 ? 1 : 0)); lk.armR.rotation.x = state.lookT > 0 ? -0.3 : 0;
    S.lookout.rotation.y = 0.1 + (state.lookT > 0 ? Math.PI * 0.9 : Math.sin(t * 0.2) * 0.6);
    const sl = S.sailor.userData;
    state.waveT = Math.max(0, state.waveT - dt);
    sl.armR.rotation.z = state.waveT > 0 ? 2.6 + Math.sin(t * 12) * 0.4 : 0.15 + Math.sin(t * 1.3) * 0.1;
    const ct = S.cat.userData;
    state.catT = Math.max(0, state.catT - dt);
    ct.tailG.rotation.x = Math.sin(t * (state.catT > 0 ? 6 : 1.4)) * (state.catT > 0 ? 0.5 : 0.25);
    ct.headG.rotation.z = state.catT > 0 ? Math.sin(Math.min(1, (2.4 - state.catT) / 0.6) * Math.PI) * 0.5 : Math.sin(t * 0.5) * 0.08;
    ct.body.scale.x = 1.5 * (1 + (state.catT > 0 ? Math.sin(Math.min(1, (2.4 - state.catT) / 1.2) * Math.PI) * 0.2 : 0));
    state.figT = Math.max(0, state.figT - dt);
    S.figurehead.traverse(o => { if (o.isMesh && o.material.metalness > 0.8) o.material.emissive && o.material.emissive.setRGB(state.figT * 0.8, state.figT * 0.6, state.figT * 0.2); });
    if (state.bellT > 0) { state.bellT -= dt; S.bell.rotation.x = Math.sin(state.bellT * 14) * 0.5 * (state.bellT / 2.5); }
    const nightL = 0.25 + 0.75 * state.todBlend.light;
    S.lanterns.forEach((l, i) => { l.mat.emissiveIntensity = (i ? 4 : 5 + Math.sin(t * 7) * 0.4 + (state.bellT > 0 ? 6 * state.bellT / 2.5 : 0)) * nightL; l.glow.material.opacity = 0.7 * state.todBlend.light; });
    S.skyMat.emissiveIntensity = 1.2 * state.todBlend.light * state.sternOn;
    S.sternMat.emissiveIntensity = 1.6 * state.todBlend.light * state.sternOn + 0.05;
    S.wheel.rotation.x = Math.sin(t * 0.4) * 0.6;
    S.rudder.rotation.y = Math.sin(t * 0.4) * 0.15;

    // rowboat & mini bottle & laundry & flag
    const rbx = -1.02, rbz = 0.2;
    const rh = sea.height(rbx, rbz); rb$.kick = Math.max(0, rb$.kick - dt * 0.6);
    rowboat.position.set(rbx, rh + 0.002, rbz);
    rowboat.rotation.set(Math.atan2(sea.height(rbx, rbz + 0.04) - sea.height(rbx, rbz - 0.04), 0.08) + Math.sin(t * 6) * 0.2 * rb$.kick, 0.4 + Math.sin(t * 0.3) * 0.15, Math.atan2(sea.height(rbx + 0.08, rbz) - sea.height(rbx - 0.08, rbz), 0.16), 'YZX');
    mini$.a += dt * 0.05; mini$.boost = Math.max(0, mini$.boost - dt * 0.5);
    const mx = -0.55 + Math.cos(mini$.a) * 0.25, mz = 0.42 + Math.sin(mini$.a * 1.3) * 0.08;
    mini.position.set(mx, sea.height(mx, mz) + 0.002 + mini$.boost * 0.04 * Math.sin(Math.PI * mini$.boost), mz); mini.rotation.set(Math.sin(t * 1.3) * 0.25, mini$.a * 2, -0.25 + Math.sin(t * 0.9) * 0.2);
    L.laundry.forEach((p, i) => { p.rotation.x = Math.sin(t * (2 + W * 4) + i) * (0.15 + W * 0.45); });
    { const fg = L.isleFlag.geometry.attributes.position, b = L.isleFlag.userData.base; for (let i = 0; i < fg.count; i++) { const x = b[i * 3]; fg.setZ(i, Math.sin(t * (6 + W * 6) - x * 200) * x * 0.4 * (0.3 + W)); } fg.needsUpdate = true; }
    L.vane.rotation.y = -0.3 + Math.sin(t * 0.2) * 0.15 * (1 + W);

    // creatures & particles
    dolphins.update(dt, t, sea, (x, y, z, s) => splashAt(x, y, z, s));
    gulls.update(dt, t, sea); fish.update(dt, t); fish2.update(dt, t); turtle.update(dt, t); jellies.update(dt, t);
    splashes.update(dt, sea); bubbles.update(dt, t, sea); smoke.update(dt, W); embers.update(dt, t, state.todBlend.fire * (1 + state.fireBoost * 0.6));
    const fl = storm.update(dt, t, sea, (x, z) => { audio.thunder(0.35 + Math.random() * 0.5); sea.addRipple(x, z, 0.02); });
    U.flash.value = fl;
    RU.skyMat.uniforms.uStorm.value = storm.level; RU.paneMat.uniforms.uRain.value = storm.level;

    // chest, cork, tag
    state.chestT = lerp(state.chestT, state.chestOpen, Math.min(1, dt * 3));
    seabed.userData.lid.rotation.x = -state.chestT * 1.25; seabed.userData.gold.material.emissiveIntensity = state.chestT * (2.5 + Math.sin(t * 3) * 0.4);
    state.uncorkT = lerp(state.uncorkT, state.uncorked, Math.min(1, dt * 4));
    const cu = state.uncorkT; stopper.userData.cork.position.x = stopper.userData.corkBaseX + cu * 0.42; stopper.userData.cork.rotation.x = cu * 0.15;
    stopper.userData.waxParts.forEach(p => { if (p.userData.bx === undefined) p.userData.bx = p.position.x; p.position.x = p.userData.bx + cu * 0.42; p.rotation.x = cu * 0.15; });
    const bAng = bottle.rotation.x;
    state.tagV += (-(state.tagA) * 16 - state.tagV * 0.55) * dt - state.rollV * 0.09 * dt * 10 - acc.z * 0.05 * dt;
    state.tagA += state.tagV * dt;
    state.tagVZ += (-(state.tagAZ) * 16 - state.tagVZ * 0.55) * dt + acc.x * 0.12 * dt;
    state.tagAZ += state.tagVZ * dt;
    stopper.userData.tagPivot.rotation.set(state.tagA - bAng, 0, state.tagAZ - state.pitch);

    // lighthouse
    state.beamBoost = Math.max(0, state.beamBoost - dt);
    const beamOn = state.todBlend.beam;
    L.beamGroup.rotation.y += dt * (0.65 + state.beamBoost * 1.2);
    L.lensG.rotation.y = L.beamGroup.rotation.y;
    L.beamMat.uniforms.uI.value = beamOn * (1 + state.beamBoost * 0.4);
    beamSpot.intensity = beamSpot2.intensity = 34 * beamOn * (1 + state.beamBoost * 0.3);
    L.lensMat.emissiveIntensity = 2 + 14 * beamOn * (1 + state.beamBoost * 0.5);
    L.prismMat.emissiveIntensity = 0.8 + 3 * beamOn;
    L.lens.getWorldPosition(shared.uBeamPos.value);
    shared.uBeamDir.value.set(1, 0, 0).transformDirection(L.beamGroup.matrixWorld);
    shared.uBeamI.value = beamOn;
    L.winMat.emissiveIntensity = state.cottageOn * 3 * nightL;
    state.keeperT = Math.max(0, state.keeperT - dt);
    const kp = L.keeper.userData; kp.armR.rotation.z = 0.15 + (state.keeperT > 0 ? Math.sin(Math.min(1, (2.5 - state.keeperT) / 0.5) * Math.PI / 2) * 2.2 + Math.sin(t * 8) * 0.2 * (state.keeperT > 0.3 ? 1 : 0) : 0);
    L.kLampMat.emissiveIntensity = (3 + state.keeperT * 3) * nightL; L.kGlow.material.opacity = 0.8 * nightL + state.keeperT * 0.3;

    // lamp, candle, fire
    state.lampWick = lerp(state.lampWick, state.lampWickTarget * TOD[state.tod].lamp, Math.min(1, dt * 2.5));
    const flick = 1 + 0.05 * Math.sin(t * 9.1) + 0.035 * Math.sin(t * 23.7 + 1.3) + 0.02 * Math.sin(t * 41.3);
    const lw = state.lampWick;
    lampSpot.intensity = 130 * lw * flick; lampPoint.intensity = 7 * lw * flick;
    PU.flame.visible = PU.flameCore.visible = lw > 0.02; PU.flame.scale.set(0.6 + 0.4 * lw, (0.45 + 0.55 * lw) * (0.96 + 0.06 * Math.sin(t * 13)), 0.6 + 0.4 * lw); PU.flame.rotation.z = Math.sin(t * 3.1) * 0.03;
    PU.glow.material.opacity = lw * 0.9 * flick; PU.chimney.material.emissiveIntensity = 0.3 * lw;
    U.lampCol.value.setRGB(1.0, 0.62, 0.3).multiplyScalar(lw * flick + 0.001);
    state.candleK = lerp(state.candleK, state.candleOn * state.todBlend.candle, Math.min(1, dt * 4));
    const cflick = 1 + 0.08 * Math.sin(t * 11.3 + 2) + 0.05 * Math.sin(t * 27.1);
    candleL.intensity = 5 * state.candleK * cflick; PU.candleFlame.visible = state.candleK > 0.05; PU.candleFlame.scale.setScalar(0.6 + 0.4 * state.candleK); PU.candleGlow.material.opacity = state.candleK * 0.8;
    GU.uCandleCol.value.setRGB(1.0, 0.55, 0.22).multiplyScalar(state.candleK * cflick * 0.6);
    state.fireBoost = Math.max(0, state.fireBoost - dt * 0.6);
    const fk = state.todBlend.fire * (1 + 0.12 * Math.sin(t * 7.3) + 0.08 * Math.sin(t * 17.9 + 1) + 0.06 * Math.sin(t * 31.7) + state.fireBoost * 0.5);
    fireL.intensity = 1300 * fk; sconces.forEach((sc, i) => { sc.intensity = 160 * state.todBlend.candle * (1 + 0.06 * Math.sin(t * 9 + i * 2)); }); mantelL.intensity = 60 * state.todBlend.candle * (1 + 0.05 * Math.sin(t * 11)); RU.flames.forEach(m => { m.uniforms.uI.value = 0.6 + 0.6 * fk; }); RU.emberMat.uniforms.uI.value = 0.5 + 0.6 * fk;
    GU.uFireCol.value.setRGB(1.0, 0.45, 0.15).multiplyScalar(fk * 0.8);
    RU.mantelCandles.forEach((c, i) => { c.flame.scale.set(0.8, 1.8 * (0.9 + 0.12 * Math.sin(t * 13 + i * 3)), 0.8); });
    moon.intensity = state.todBlend.moonI; hemi.intensity = state.todBlend.hemiI;
    shared.uMoonCol.value.copy(moon.color).multiplyScalar(state.todBlend.moonI * 0.6);
    U.night.value = state.todBlend.night;

    // compass → ship, clocks, watch, barometer, globe
    const sp = ship.getWorldPosition(tmpV); const cpos = new THREE.Vector3(); PU.compass.getWorldPosition(cpos);
    const dl = sp.sub(cpos).applyQuaternion(PU.compass.quaternion.clone().invert());
    let target = Math.atan2(-dl.x, -dl.z); let diff = target - state.needle; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    state.needleV += (diff * 9 - state.needleV * 1.1) * dt; state.needle += state.needleV * dt; PU.needle.rotation.y = state.needle;
    const now = new Date(); const sec = now.getSeconds() + now.getMilliseconds() / 1000; const tickSec = now.getSeconds();
    const mins = now.getMinutes() + sec / 60, hrs = (now.getHours() % 12) + mins / 60;
    for (const c of [RU.wallClock, RU.mantelClock]) { c.s.rotation.z = -tickSec / 60 * Math.PI * 2; c.m.rotation.z = -mins / 60 * Math.PI * 2; c.h.rotation.z = -hrs / 12 * Math.PI * 2; }
    const wh = PU.watchHands; wh.s.rotation.y = -tickSec / 60 * Math.PI * 2; wh.m.rotation.y = -mins / 60 * Math.PI * 2; wh.h.rotation.y = -hrs / 12 * Math.PI * 2;
    const baroTarget = [0.85, 0.65, 0.4, 0.12][state.wind];
    state.baroP = lerp(state.baroP, baroTarget, Math.min(1, dt * 0.6)); state.baroJig = Math.max(0, state.baroJig - dt * 1.5);
    RU.baroNeedle.rotation.z = -Math.PI * 1.25 - Math.PI * 1.5 * state.baroP + Math.sin(t * 30) * 0.05 * state.baroJig;
    RU.baroSet.rotation.z = -Math.PI * 1.25 - Math.PI * 1.5 * 0.6;
    state.globeV = Math.max(0, state.globeV - dt * 0.6); RU.globe.rotation.y += state.globeV * dt;

    GU.uWet.value = lerp(GU.uWet.value, 0.32 + (state.uncorked ? -0.15 : 0) + storm.level * 0.2, dt * 0.05);

    // camera-dependent uniforms
    camera.updateMatrixWorld();
    camInv.copy(camera.matrixWorld).invert();
    WU.uCamL.value.copy(camera.position).applyMatrix4(new THREE.Matrix4().copy(bottle.matrixWorld).invert());
    WU.uBotRot.value.setFromMatrix4(bottle.matrixWorld);
    WU.uNear.value = camera.near; WU.uFar.value = camera.far;
    WU.uProjView.value.multiplyMatrices(camera.projectionMatrix, camInv);
    if (U.lampV) U.lampV.value.copy(lampPos).applyMatrix4(camInv);
    shared.uEnvI.value = 1.4;

    let focus = rig.focusDist;
    if ((view.mode === 'sea' && !rig.tween) || (state.intro === 'play' && !state.revealStarted)) focus = camera.position.distanceTo(ship.getWorldPosition(tmpV)) + 0.1;
    if (state.scope) focus = camera.position.distanceTo(ship.getWorldPosition(tmpV));
    rig.focusSmooth = lerp(rig.focusSmooth || focus, focus, Math.min(1, dt * 6));
    const introFade = state.intro === 'wait' ? 0.55 : 1;
    pipe.render(scene, camera, { focus: rig.focusSmooth, aperture: params.has('ap') ? +params.get('ap') : rig.ap, exposure: state.todBlend.exposure, bloom: 0.55, bloomTh: 1.1, time: t, flash: fl, fade: introFade, vig: state.scope ? 1.6 : 1 });
    if (state.shot) { state.shot = false; try { const a = document.createElement('a'); a.download = 'bottled-voyage.png'; a.href = canvas.toDataURL('image/png'); a.click(); log('拍下了一張瓶中的照片。'); } catch (e) { } }
    audio.update(state.todBlend.fire * (1 + state.fireBoost));
    if (TEST_FRAMES && frameCount >= TEST_FRAMES) { try { window.__shot = canvas.toDataURL('image/jpeg', 0.9); } catch (e) { window.__shot = 'err:' + e.message; } document.title = 'done'; return; }
    requestAnimationFrame(frame);
  }
  window.__app = { more: (n) => { TEST_FRAMES = frameCount + n; document.title = 'run'; requestAnimationFrame(frame); }, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, programs: renderer.info.programs.length }), THREE, scene, camera, rig, state, goView, applyTOD, setWind, setQuality, sea, ship, dolphins, gulls, doClick, focusAt, pipe, renderer, handlers, discover, toggleCork, refreshEnv, PRESETS: () => PRESETS, enterScope, exitScope };
  requestAnimationFrame(frame);
}

main().catch(e => { console.error(e); const f = $('#fallback'); f.style.display = 'flex'; f.querySelector('p').textContent = '載入失敗：' + e.message; });
