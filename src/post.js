import * as THREE from 'three';
import { LAYER } from './common.js';

const FS_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
const SS = `float ss(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }`;

export class Pipeline {
  constructor(renderer, { samples = 4, dofTaps = 32 } = {}) {
    this.r = renderer;
    this.samples = samples;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(g, null); this.quad.frustumCulled = false;
    this.fs = new THREE.Scene(); this.fs.add(this.quad);
    this.mats = {
      copyDepth: new THREE.ShaderMaterial({
        uniforms: { tColor: { value: null }, tDepth: { value: null } }, vertexShader: FS_VERT,
        fragmentShader: `uniform sampler2D tColor; uniform sampler2D tDepth; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tColor, vUv); gl_FragDepth = texture2D(tDepth, vUv).r; }`,
        depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,
      }),
      copy: new THREE.ShaderMaterial({ uniforms: { tColor: { value: null } }, vertexShader: FS_VERT, fragmentShader: `uniform sampler2D tColor; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tColor, vUv); }`, depthTest: false, depthWrite: false }),
      bright: new THREE.ShaderMaterial({
        uniforms: { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uTh: { value: 1.0 } }, vertexShader: FS_VERT,
        fragmentShader: `${SS} uniform sampler2D tColor; uniform vec2 uTexel; uniform float uTh; varying vec2 vUv;
          void main(){ vec3 c = (texture2D(tColor, vUv + uTexel*vec2(-1,-1)).rgb + texture2D(tColor, vUv + uTexel*vec2(1,-1)).rgb + texture2D(tColor, vUv + uTexel*vec2(-1,1)).rgb + texture2D(tColor, vUv + uTexel*vec2(1,1)).rgb)*0.25;
            float l = max(max(c.r,c.g),c.b); float k = ss(uTh, uTh*2.5, l); gl_FragColor = vec4(min(c*k, vec3(30.)), 1.); }`,
        depthTest: false, depthWrite: false,
      }),
      blur: new THREE.ShaderMaterial({
        uniforms: { tColor: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: FS_VERT,
        fragmentShader: `uniform sampler2D tColor; uniform vec2 uDir; varying vec2 vUv;
          void main(){ vec3 c = texture2D(tColor, vUv).rgb*0.2270;
            c += (texture2D(tColor, vUv + uDir*1.3846).rgb + texture2D(tColor, vUv - uDir*1.3846).rgb)*0.3162;
            c += (texture2D(tColor, vUv + uDir*3.2308).rgb + texture2D(tColor, vUv - uDir*3.2308).rgb)*0.0703;
            gl_FragColor = vec4(c, 1.); }`,
        depthTest: false, depthWrite: false,
      }),
      coc: new THREE.ShaderMaterial({
        uniforms: { tColor: { value: null }, tDepth: { value: null }, uNear: { value: 0.05 }, uFar: { value: 80 }, uFocus: { value: 6 }, uAperture: { value: 0.01 }, uH: { value: 1000 }, uTexel: { value: new THREE.Vector2() } }, vertexShader: FS_VERT,
        fragmentShader: `uniform sampler2D tColor; uniform sampler2D tDepth; uniform float uNear, uFar, uFocus, uAperture, uH; uniform vec2 uTexel; varying vec2 vUv;
          float linD(float d){ float z = d*2.-1.; return 2.*uNear*uFar/(uFar+uNear - z*(uFar-uNear)); }
          void main(){ vec3 c = (texture2D(tColor, vUv + uTexel*vec2(-.5,-.5)).rgb + texture2D(tColor, vUv + uTexel*vec2(.5,-.5)).rgb + texture2D(tColor, vUv + uTexel*vec2(-.5,.5)).rgb + texture2D(tColor, vUv + uTexel*vec2(.5,.5)).rgb)*0.25;
            float z = linD(texture2D(tDepth, vUv).r); float coc = clamp(uAperture*abs(z-uFocus)/z*uH, 0., 22.);
            gl_FragColor = vec4(c, coc); }`,
        depthTest: false, depthWrite: false,
      }),
      dof: new THREE.ShaderMaterial({
        defines: { TAPS: dofTaps },
        uniforms: { tHalf: { value: null }, uTexel: { value: new THREE.Vector2() } }, vertexShader: FS_VERT,
        fragmentShader: `${SS} uniform sampler2D tHalf; uniform vec2 uTexel; varying vec2 vUv;
          void main(){ vec4 c0 = texture2D(tHalf, vUv); float cc = c0.a; if(cc < 0.6){ gl_FragColor = c0; return; }
            vec3 acc = c0.rgb; float ws = 1.;
            float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)))*43758.5453)*6.2831;
            for(int i=0;i<TAPS;i++){ float fi = float(i)+0.5; float r = sqrt(fi/float(TAPS))*cc; float a = fi*2.39996 + jit;
              vec4 s = texture2D(tHalf, vUv + vec2(cos(a), sin(a))*r*uTexel);
              float w = ss(r*0.5-0.5, r*0.5+1.0, s.a) + 0.04;
              float lum = dot(s.rgb, vec3(0.3,0.59,0.11));
              w *= 1.0 + ss(1.2, 4.0, lum) * 2.0; // bokeh highlights
              acc += s.rgb*w; ws += w; }
            gl_FragColor = vec4(acc/ws, cc); }`,
        depthTest: false, depthWrite: false,
      }),
      final: new THREE.ShaderMaterial({
        uniforms: {
          tScene: { value: null }, tDof: { value: null }, tB1: { value: null }, tB2: { value: null }, tDepth: { value: null },
          uNear: { value: 0.05 }, uFar: { value: 80 }, uFocus: { value: 6 }, uAperture: { value: 0.01 }, uH: { value: 1000 },
          uExposure: { value: 1.0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2() }, uBloom: { value: 0.5 }, uVig: { value: 1.0 }, uFlash: { value: 0 }, uFade: { value: 1 }, uWarm: { value: 1 }, uGrain: { value: 1 },
        }, vertexShader: FS_VERT,
        fragmentShader: `${SS} uniform sampler2D tScene, tDof, tB1, tB2, tDepth; uniform float uNear, uFar, uFocus, uAperture, uH, uExposure, uTime, uBloom, uVig, uFlash, uFade, uWarm, uGrain; uniform vec2 uRes; varying vec2 vUv;
          float linD(float d){ float z = d*2.-1.; return 2.*uNear*uFar/(uFar+uNear - z*(uFar-uNear)); }
          vec3 aces(vec3 x){ const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0., 1.); }
          float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
          vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - 0.055, step(0.0031308, c)); }
          void main(){
            vec2 uv = vUv; vec2 d = uv - 0.5;
            float ca = dot(d,d)*0.0035;
            vec3 sharp; sharp.r = texture2D(tScene, uv - d*ca).r; sharp.g = texture2D(tScene, uv).g; sharp.b = texture2D(tScene, uv + d*ca).b;
            float z = linD(texture2D(tDepth, uv).r); float coc = clamp(uAperture*abs(z-uFocus)/z*uH, 0., 22.);
            vec4 dof = texture2D(tDof, uv);
            float m = ss(1.0, 3.5, coc);
            vec3 col = mix(sharp, dof.rgb, m);
            vec3 b1 = texture2D(tB1, uv).rgb, b2 = texture2D(tB2, uv).rgb;
            col += (b1*0.6 + b2*0.8)*uBloom;
            col += b2*vec3(1.0, 0.35, 0.12)*0.16*uBloom;
            col *= uExposure;
            col += vec3(0.7,0.75,1.0)*uFlash*0.08;
            col = aces(col);
            float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
            vec3 sh = vec3(0.96, 1.0, 1.02), hi = vec3(1.05, 1.0, 0.9);
            col *= mix(sh, hi, ss(0.1, 0.8, l) * uWarm);
            col = mix(vec3(l), col, 0.92);
            col = col*0.968 + 0.01;
            float vig = 1.0 - ss(0.25, 1.05, length(d*vec2(1.1, 1.0)));
            col *= mix(1.0, vig, 0.55*uVig);
            col = toSRGB(clamp(col, 0., 1.));
            float gr = hash(uv*uRes + fract(uTime*7.13)*100.) - 0.5;
            col += gr*0.03*uGrain;
            col *= uFade;
            gl_FragColor = vec4(col, 1.);
          }`,
        depthTest: false, depthWrite: false,
      }),
    };
    this.setSize(2, 2);
  }
  rt(w, h, opt = {}) { return new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, ...opt }); }
  setSamples(n) { this.samples = n; this.setSize(this.w, this.h); }
  setTaps(n) { this.mats.dof.defines.TAPS = n; this.mats.dof.needsUpdate = true; }
  setSize(w, h) {
    this.w = w; this.h = h;
    [this.rtA, this.rtB, this.rtC, this.rtH, this.rtH2, this.q1, this.q2, this.e1, this.e2].forEach(t => t && t.dispose());
    const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType;
    this.rtA = this.rt(w, h, { depthBuffer: true, depthTexture: dt, samples: this.samples });
    this.rtB = this.rt(w, h, { depthBuffer: true, samples: this.samples });
    this.rtC = this.rt(w, h);
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.rtH = this.rt(hw, hh); this.rtH2 = this.rt(hw, hh);
    const qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2), ew = Math.max(1, w >> 3), eh = Math.max(1, h >> 3);
    this.q1 = this.rt(qw, qh); this.q2 = this.rt(qw, qh); this.e1 = this.rt(ew, eh); this.e2 = this.rt(ew, eh);
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.fs, this.cam); }
  render(scene, camera, P) {
    const r = this.r; const m = this.mats;
    camera.layers.set(LAYER.MAIN);
    r.setRenderTarget(this.rtA); r.clear(true, true, true); r.render(scene, camera);
    m.copyDepth.uniforms.tColor.value = this.rtA.texture; m.copyDepth.uniforms.tDepth.value = this.rtA.depthTexture;
    this.pass(m.copyDepth, this.rtB);
    camera.layers.set(LAYER.WATER);
    r.setRenderTarget(this.rtB); r.render(scene, camera);
    m.copy.uniforms.tColor.value = this.rtB.texture; this.pass(m.copy, this.rtC);
    camera.layers.set(LAYER.GLASS);
    r.setRenderTarget(this.rtB); r.render(scene, camera);
    camera.layers.set(LAYER.MAIN);
    m.bright.uniforms.tColor.value = this.rtB.texture; m.bright.uniforms.uTexel.value.set(1 / this.w, 1 / this.h); m.bright.uniforms.uTh.value = P.bloomTh;
    this.pass(m.bright, this.q1);
    m.blur.uniforms.tColor.value = this.q1.texture; m.blur.uniforms.uDir.value.set(1 / this.q1.width, 0); this.pass(m.blur, this.q2);
    m.blur.uniforms.tColor.value = this.q2.texture; m.blur.uniforms.uDir.value.set(0, 1 / this.q1.height); this.pass(m.blur, this.q1);
    m.copy.uniforms.tColor.value = this.q1.texture; this.pass(m.copy, this.e1);
    m.blur.uniforms.tColor.value = this.e1.texture; m.blur.uniforms.uDir.value.set(1.5 / this.e1.width, 0); this.pass(m.blur, this.e2);
    m.blur.uniforms.tColor.value = this.e2.texture; m.blur.uniforms.uDir.value.set(0, 1.5 / this.e1.height); this.pass(m.blur, this.e1);
    const cu = m.coc.uniforms; cu.tColor.value = this.rtB.texture; cu.tDepth.value = this.rtA.depthTexture; cu.uNear.value = camera.near; cu.uFar.value = camera.far; cu.uFocus.value = P.focus; cu.uAperture.value = P.aperture; cu.uH.value = this.rtH.height; cu.uTexel.value.set(1 / this.w, 1 / this.h);
    this.pass(m.coc, this.rtH);
    m.dof.uniforms.tHalf.value = this.rtH.texture; m.dof.uniforms.uTexel.value.set(1 / this.rtH.width, 1 / this.rtH.height);
    this.pass(m.dof, this.rtH2);
    const f = m.final.uniforms;
    f.tScene.value = this.rtB.texture; f.tDof.value = this.rtH2.texture; f.tB1.value = this.q1.texture; f.tB2.value = this.e1.texture; f.tDepth.value = this.rtA.depthTexture;
    f.uNear.value = camera.near; f.uFar.value = camera.far; f.uFocus.value = P.focus; f.uAperture.value = P.aperture; f.uH.value = this.rtH.height * 2.0;
    f.uExposure.value = P.exposure; f.uTime.value = P.time; f.uRes.value.set(this.w, this.h); f.uBloom.value = P.bloom; f.uFlash.value = P.flash; f.uFade.value = P.fade; f.uVig.value = P.vig ?? 1; f.uGrain.value = P.grain ?? 1;
    this.pass(m.final, P.target || null);
  }
}
