// Crown Hills — cheap animated materials: pool water (procedural caustics + sky fresnel), falling water sheets,
// and vertex-sway patches for palms / banners. All driven by one shared { value: t } time uniform.
import * as THREE from 'three';

const FOG_UNIFORMS = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

/**
 * Opaque stylised pool / fountain water. uScale = caustic cells per metre, glow = emissive boost (night).
 */
export function poolMaterial(time, { deep = '#0a6f9a', shallow = '#32c6d4', sky = '#c9b8e6', scale = 0.55, glow = 0.35, edge = [16, 14], speed = 0.6 } = {}) {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: {
      ...FOG_UNIFORMS(),
      uTime: time,
      uDeep: { value: new THREE.Color(deep) },
      uShallow: { value: new THREE.Color(shallow) },
      uSky: { value: new THREE.Color(sky) },
      uScale: { value: scale },
      uGlow: { value: glow },
      uSpeed: { value: speed },
      uEdge: { value: new THREE.Vector2(edge[0], edge[1]) },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uScale, uGlow, uSpeed; uniform vec3 uDeep, uShallow, uSky; uniform vec2 uEdge;
      varying vec2 vUv; varying vec3 vWorld;
      #include <fog_pars_fragment>
      float caustic(vec2 p, float t){
        vec2 i = p; float c = 1.0; float inten = 0.005;
        for (int n = 0; n < 3; n++) {
          float tt = t * (1.0 - (3.5 / float(n + 1)));
          i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
          c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
        }
        c /= 3.0; c = 1.17 - pow(c, 1.4);
        return clamp(pow(abs(c), 9.0), 0.0, 1.0);
      }
      void main(){
        float t = uTime * uSpeed;
        vec2 p = vWorld.xz * uScale * 6.2831;
        float cs = caustic(p, t);
        // distance to the pool edge (uv space scaled to metres)
        vec2 d2 = min(vUv, 1.0 - vUv) * uEdge;
        float ed = min(d2.x, d2.y);
        float shallow = 1.0 - smoothstep(0.0, 2.2, ed);
        vec3 col = mix(uDeep, uShallow, 0.25 + 0.55 * shallow);
        // tile grid under water
        vec2 g = abs(fract(vWorld.xz * 2.0 + 0.02 * sin(vWorld.zx * 3.0 + t)) - 0.5);
        col *= 0.93 + 0.07 * smoothstep(0.46, 0.5, max(g.x, g.y));
        col += vec3(0.75, 1.0, 1.0) * cs * 0.3;
        // sky fresnel
        vec3 v = normalize(cameraPosition - vWorld);
        float fr = pow(1.0 - clamp(v.y, 0.0, 1.0), 4.0);
        col = mix(col, uSky, fr * 0.4);
        col *= 1.0 + uGlow;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
}

/** Transparent falling water sheet (open cylinder / quad). v runs 0 (bottom) → 1 (top). */
export function fallMaterial(time, { color = '#dff9ff', opacity = 0.55, speed = 1.4, streaks = 40 } = {}) {
  return new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { ...FOG_UNIFORMS(), uTime: time, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uSpeed: { value: speed }, uStreaks: { value: streaks } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uOpacity, uSpeed, uStreaks; uniform vec3 uColor; varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){
        float s = sin(vUv.x * uStreaks * 6.2831 + sin(vUv.x * 17.0) * 2.0);
        float f = fract(vUv.y * 3.0 + uTime * uSpeed + sin(vUv.x * 40.0) * 0.3);
        float a = (0.45 + 0.35 * s) * (0.6 + 0.4 * f);
        a *= smoothstep(0.0, 0.25, vUv.y) * (0.6 + 0.4 * smoothstep(1.0, 0.8, vUv.y));
        gl_FragColor = vec4(uColor, a * uOpacity);
        #include <fog_fragment>
      }`,
  });
}

/**
 * Patches a standard material so vertices sway with height (world-space merged geometry). base = ground y.
 * amp in metres at 1 m height squared (so the top of a 6 m palm moves ≈ amp·36).
 */
export function swayPatch(mat, time, { base = -0.42, amp = 0.003, freq = 0.8 } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { float hh = max(0.0, position.y - (${base.toFixed(3)}));
        float ph = position.x * 0.13 + position.z * 0.07;
        float k = hh * hh * ${amp.toFixed(5)};
        transformed.x += sin(uTime * ${freq.toFixed(3)} + ph) * k;
        transformed.z += cos(uTime * ${(freq * 0.73).toFixed(3)} + ph * 1.3) * k * 0.6; }`);
  };
  mat.customProgramCacheKey = () => 'crown_sway_' + amp + '_' + freq;
  return mat;
}

/** Patches a standard material so a vertical banner/flag ripples: uv.x = 0 at the pole. */
export function wavePatch(mat, time, { amp = 0.12, speed = 1.6 } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { float w = uv.x; transformed.z += sin(uv.x * 5.0 - uTime * ${speed.toFixed(3)} + position.y * 0.6) * ${amp.toFixed(3)} * w; }`);
  };
  mat.customProgramCacheKey = () => 'crown_wave_' + amp;
  return mat;
}
