import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { D, FLOOR, clamp, lerp, smooth, ease, innerR, outerR } from './common.js';
import { ROOM } from './room.js';
import { DESK } from './desk.js';

// Manual camera: full 360° orbit, zoom-to-cursor, pan, focus, follow-the-ship, turntable.
export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    const c = this.controls = new OrbitControls(camera, dom);
    c.enableDamping = true; c.dampingFactor = 0.08;
    c.rotateSpeed = 0.6; c.zoomSpeed = 0.9; c.panSpeed = 0.9;
    c.screenSpacePanning = true;
    c.zoomToCursor = true;
    c.minDistance = 0.25; c.maxDistance = 17;
    c.minPolarAngle = 0.02; c.maxPolarAngle = Math.PI - 0.05;
    c.autoRotateSpeed = 0.55;
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.tween = null;
    this.follow = null; // { obj, prev: Matrix4 }
    this.ap = 0.011; this.focusDist = 6; this.mode = 'overview';
    this.bottleInv = new THREE.Matrix4();
    this.surfaceY = null;
    c.addEventListener('start', () => { this.tween = null; this.userActive = true; if (c.autoRotate && !this.keepSpin) this.setSpin(false); });
    c.addEventListener('end', () => { this.userActive = false; });
    this.onSpin = () => { };
  }
  setSpin(v) { this.controls.autoRotate = v; this.onSpin(v); }
  presets(aspect) {
    // overview distance adapts to aspect so the whole bottle always fits
    const hf = Math.tan(THREE.MathUtils.degToRad(34) / 2);
    const needH = 3.3 / (hf * Math.max(0.6, Math.min(aspect, 2.2)));
    const needV = 1.9 / hf;
    const dist = Math.max(needH, needV, 5.4) * 1.12;
    const dir = new THREE.Vector3(0.08, 0.24, 1).normalize();
    const tgt = new THREE.Vector3(0.25, -0.45, 0);
    return {
      sea: { pos: [0.98, -0.1, 0.68], tgt: [-0.55, 0.06, -0.24], fov: 54, ap: 0.026 },
      deck: { follow: true, pos: [-0.66, 0.24, 0.17], tgt: [0.62, 0.2, -0.04], fov: 64, ap: 0.005 },
      overview: { pos: tgt.clone().addScaledVector(dir, dist).toArray(), tgt: tgt.toArray(), fov: 34, ap: 0.011 },
      ship: { pos: [1.55, 0.3, 2.3], tgt: [0.15, 0.02, 0.0], fov: 34, ap: 0.022 },
      lighthouse: { pos: [-0.45, 0.2, 2.15], tgt: [-1.55, -0.02, -0.25], fov: 34, ap: 0.024 },
      back: { pos: [-1.4, 0.55, -6.6], tgt: [0.25, -0.45, 0], fov: 34, ap: 0.011 },
      study: { pos: [3.2, 2.9, 10.2], tgt: [-0.9, -0.5, -1.8], fov: 40, ap: 0.006 },
    };
  }
  goTo(P, dur = 2.2, path = null, ship = null) {
    this.follow = null;
    const toPos = new THREE.Vector3(...P.pos), toTgt = new THREE.Vector3(...P.tgt);
    if (P.follow && ship) {
      ship.updateMatrixWorld();
      toPos.applyMatrix4(ship.matrixWorld); toTgt.applyMatrix4(ship.matrixWorld);
      this.pendingFollow = ship;
    } else this.pendingFollow = null;
    this.tween = { t: 0, dur, fromPos: this.camera.position.clone(), fromTgt: this.controls.target.clone(), toPos, toTgt, fromFov: this.camera.fov, toFov: P.fov, fromAp: this.ap, toAp: P.ap, path };
  }
  set(P, ship = null) {
    this.tween = null;
    const pos = new THREE.Vector3(...P.pos), tgt = new THREE.Vector3(...P.tgt);
    if (P.follow && ship) { ship.updateMatrixWorld(); pos.applyMatrix4(ship.matrixWorld); tgt.applyMatrix4(ship.matrixWorld); this.startFollow(ship); } else this.follow = null;
    this.camera.position.copy(pos); this.controls.target.copy(tgt);
    this.camera.fov = P.fov; this.camera.updateProjectionMatrix(); this.ap = P.ap;
    this.focusDist = pos.distanceTo(tgt);
    this.controls.update();
  }
  startFollow(obj) { obj.updateMatrixWorld(); this.follow = { obj, prev: obj.matrixWorld.clone() }; }
  focusOn(point, dist = null) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const d = dist ?? clamp(this.camera.position.distanceTo(this.controls.target) * 0.45, 0.5, 3.0);
    this.follow = null;
    this.tween = { t: 0, dur: 1.1, fromPos: this.camera.position.clone(), fromTgt: this.controls.target.clone(), toPos: point.clone().addScaledVector(dir, d), toTgt: point.clone(), fromFov: this.camera.fov, toFov: Math.min(this.camera.fov, 40), fromAp: this.ap, toAp: clamp(0.03 / Math.max(d, 0.5), 0.008, 0.03), path: null };
  }
  orbitBy(dAz, dPol) {
    const off = this.camera.position.clone().sub(this.controls.target);
    const s = new THREE.Spherical().setFromVector3(off);
    s.theta += dAz; s.phi = clamp(s.phi + dPol, 0.03, Math.PI - 0.05);
    off.setFromSpherical(s); this.camera.position.copy(this.controls.target).add(off);
  }
  dolly(k) {
    const off = this.camera.position.clone().sub(this.controls.target);
    off.multiplyScalar(k); const l = clamp(off.length(), this.controls.minDistance, this.controls.maxDistance);
    off.setLength(l); this.camera.position.copy(this.controls.target).add(off);
  }
  update(dt) {
    const cam = this.camera, c = this.controls;
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur); const k = ease(tw.t);
      if (tw.path) cam.position.copy(tw.path.getPoint(k)); else cam.position.lerpVectors(tw.fromPos, tw.toPos, k);
      c.target.lerpVectors(tw.fromTgt, tw.toTgt, tw.path ? smooth(0.0, 0.85, tw.t) : k);
      cam.fov = lerp(tw.fromFov, tw.toFov, k); cam.updateProjectionMatrix();
      this.ap = lerp(tw.fromAp, tw.toAp, tw.path ? smooth(0.05, 0.6, tw.t) : k);
      cam.lookAt(c.target);
      if (tw.t >= 1) { this.tween = null; if (this.pendingFollow) { this.startFollow(this.pendingFollow); this.pendingFollow = null; } }
    } else {
      if (this.follow) {
        const o = this.follow.obj; o.updateMatrixWorld();
        const delta = o.matrixWorld.clone().multiply(this.follow.prev.clone().invert());
        cam.position.applyMatrix4(delta); c.target.applyMatrix4(delta);
        this.follow.prev.copy(o.matrixWorld);
      }
      c.update(dt);
    }
    this.constrain();
  }
  constrain() {
    const cam = this.camera, c = this.controls, p = cam.position, t = c.target;
    // keep the pivot near the bottle / desk area
    t.x = clamp(t.x, -9, 9); t.y = clamp(t.y, D + 0.05, 5); t.z = clamp(t.z, -7, 7);
    // inside the room
    const m = 0.8;
    p.x = clamp(p.x, ROOM.x0 + m, ROOM.x1 - m); p.z = clamp(p.z, ROOM.z0 + m, ROOM.z1 - m); p.y = clamp(p.y, ROOM.y0 + 1.5, ROOM.y1 - 1.5);
    // above the desk top
    if (p.x > DESK.x0 - 0.4 && p.x < DESK.x1 + 0.4 && p.z > DESK.z0 - 0.4 && p.z < DESK.z1 + 0.4) p.y = Math.max(p.y, D + 0.12);
    // above the bottle stand (never inside the plinth or under the bottle)
    const ex = (p.x - 0.15) / 3.1, ez = p.z / 1.55;
    if (ex * ex + ez * ez < 1) p.y = Math.max(p.y, D + 0.42);

    // never under the bottle's water (inside the bottle)
    if (this.surfaceY) {
      const lp = p.clone().applyMatrix4(this.bottleInv);
      let moved = false;
      if (lp.x > -2.3 && lp.x < 2.75) {
        const rad = Math.hypot(lp.y, lp.z), ri = innerR(lp.x), ro = outerR(lp.x);
        // inside the glass wall itself: step out to the nearest side
        if (rad > ri - 0.03 && rad < ro + 0.035) {
          const k = (rad < (ri + ro) / 2 ? ri - 0.03 : ro + 0.035) / Math.max(rad, 1e-4);
          lp.y *= k; lp.z *= k; moved = true;
        }
        if (lp.x > -2.05 && lp.x < 2.3 && Math.hypot(lp.y, lp.z) < ri) {
          const sy = this.surfaceY(lp.x, lp.z) + 0.04;
          if (lp.y < sy) { lp.y = sy; moved = true; }
        }
      }
      if (moved) p.copy(lp.applyMatrix4(this.bottleInv.clone().invert()));
    }
    const d = p.distanceTo(t);
    this.focusDist = lerp(this.focusDist, d, 0.25);
  }
}
