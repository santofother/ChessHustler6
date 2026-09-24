// Sunset Strand — turquoise sea with slow rolling waves, a swash line that creeps up the sand, wet-sand band
// and soft sun glitter. One transparent plane, fog-aware, no textures.
import * as THREE from 'three';

export function createSea({ shoreZ, waterY, colors, reducedMotion }) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uShore: { value: shoreZ },
      uShallow: { value: new THREE.Color(colors.shallow) },
      uDeep: { value: new THREE.Color(colors.deep) },
      uFar: { value: new THREE.Color(colors.far) },
      uFoam: { value: new THREE.Color(colors.foam) },
      uWet: { value: new THREE.Color(colors.wet) },
      uGlint: { value: new THREE.Color(colors.glint) },
      uSunDir: { value: new THREE.Vector3(...colors.sunDir).normalize() },
      uMotion: { value: reducedMotion ? 0.3 : 1 },
    },
  ]);
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: true,
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform float uTime, uShore, uMotion;
      uniform vec3 uShallow, uDeep, uFar, uFoam, uWet, uGlint, uSunDir;
      varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float t = uTime * uMotion;
        // shoreline wiggle + slow swash (period ~7 s)
        float edge = uShore + 0.9*sin(vW.x*0.07) + 0.5*sin(vW.x*0.19 + 1.3);
        float swash = 1.1 * (0.5 + 0.5*sin(t * 0.9 + vW.x*0.02));
        float shore = edge + swash;              // water reaches up to z = shore
        float d = shore - vW.z;                  // > 0 in the water
        // wet sand band just above the current waterline (lingers where the swash retreated)
        float wet = smoothstep(2.2, 0.0, -d) * step(d, 0.0);
        if (d < 0.0) {
          if (wet < 0.01) discard;
          gl_FragColor = vec4(uWet, wet * 0.35);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
          return;
        }
        float depth = d;
        vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 22.0, depth));
        col = mix(col, uFar, smoothstep(30.0, 180.0, depth));
        // animated ripples
        vec2 q = vW.xz * 0.35 + vec2(t*0.05, t*0.08);
        float n = noise(q) * 0.6 + noise(q*2.3 - t*0.07) * 0.4;
        col *= 0.93 + n * 0.14;
        // rolling wave crests travelling toward the shore
        float wv = fract(depth / 7.5 - t * 0.11 + noise(vW.xz*0.05)*0.6);
        float crest = smoothstep(0.93, 0.985, wv) * smoothstep(1.0, 0.985, wv);
        crest *= smoothstep(1.0, 5.0, depth) * smoothstep(40.0, 10.0, depth);
        col = mix(col, uFoam, crest * 0.55 * (0.6 + 0.4*n));
        // swash foam at the waterline
        float foam = smoothstep(1.2, 0.0, depth) * (0.65 + 0.35*noise(vW.xz*1.7 + t*0.3));
        col = mix(col, uFoam, foam);
        // sun glitter: sparkle toward the sun direction on the water
        vec3 V = normalize(cameraPosition - vW);
        vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
        float g = pow(max(dot(R, uSunDir), 0.0), 60.0);
        float sp = step(0.72, noise(vW.xz*3.0 + vec2(t*0.4, -t*0.3)));
        col += uGlint * (g * 1.4 + g * sp * 2.0);
        float a = mix(0.72, 0.97, smoothstep(0.0, 4.0, depth));
        a = max(a, foam);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(1200, 700, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, shoreZ + 6 - 350);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = waterY;
  mesh.renderOrder = 1;
  mesh.name = 'sea';
  mesh.receiveShadow = false;
  return mesh;
}
