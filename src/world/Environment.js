// Environment: sunset sky dome + fog, lights (sun w/ soft shadows), street, race barriers, chain-link
// fences with sponsor banners, palms, street lights, procedural skyline with emissive windows, neon signs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture, speckle, rng } from './util.js';
import { STREET_Y } from './Board.js';

// Sun sits low behind black's side (−Z) so the default white camera looks into the sunset.
const SUN_DIR = new THREE.Vector3(-0.35, 0.16, -1).normalize();

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.name = 'environment';
    this.fronds = [];         // for sway
    this.blinkers = [];       // antenna lights
    this.flicker = [];        // neon signs that flicker
    this.streetLights = [];
    this.sun = null;
    this.sunDir = SUN_DIR.clone();
  }

  build(models = {}) {
    const scene = this.scene;
    scene.add(this.group);
    this._sky();
    this._lights();
    this._ground();
    this._barriers(models.barrier);
    this._fences(models.fence);
    this._palms(models.palm);
    this._streetLights(models.streetlight);
    this._skyline();
    this._neonSigns();
    this._envMap();
    return this.group;
  }

  // ------------------------------------------------------------------ sky + fog
  _sky() {
    const uniforms = {
      sunDir: { value: SUN_DIR },
      cHorizon: { value: new THREE.Color('#ffb24a') },
      cLow: { value: new THREE.Color('#ff6f7d') },
      cMid: { value: new THREE.Color('#b03a86') },
      cHigh: { value: new THREE.Color('#3a1c5c') },
      cZenith: { value: new THREE.Color('#140c2c') },
      cNight: { value: new THREE.Color('#241447') },
      cGround: { value: new THREE.Color('#2a1530') },
      time: { value: 0 },
    };
    this.skyUniforms = uniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 sunDir, cHorizon, cLow, cMid, cHigh, cZenith, cNight, cGround;
        uniform float time;
        varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          float sunAmt = max(dot(d, sunDir), 0.0);
          // how much this direction faces the sunset (0 = opposite side, which is already night)
          float side = smoothstep(-0.6, 0.9, dot(normalize(vec2(d.x,d.z)), normalize(vec2(sunDir.x,sunDir.z))));
          vec3 warm;
          warm = mix(cHorizon, cLow, smoothstep(0.0, 0.07, h));
          warm = mix(warm, cMid, smoothstep(0.06, 0.2, h));
          warm = mix(warm, cHigh, smoothstep(0.18, 0.42, h));
          warm = mix(warm, cZenith, smoothstep(0.4, 0.95, h));
          vec3 cool = mix(mix(cMid*0.55, cNight, smoothstep(0.0, 0.18, h)), cZenith, smoothstep(0.3, 0.9, h));
          vec3 col = mix(cool, warm, side);
          // sun glow
          col += vec3(1.0,0.55,0.25) * pow(sunAmt, 6.0) * 0.55;
          col += vec3(1.0,0.72,0.4) * pow(sunAmt, 60.0) * 1.6;
          col += vec3(1.0,0.9,0.7) * smoothstep(0.9993, 0.9997, sunAmt) * 12.0;
          // streaky sunset clouds
          if (h > -0.02) {
            vec2 uv = d.xz / (h + 0.12);
            float n = fbm(uv * vec2(0.9, 3.2) + vec2(time*0.004, 0.0));
            float band = smoothstep(0.55, 0.8, n) * smoothstep(0.35, 0.03, h) * smoothstep(-0.02, 0.03, h);
            vec3 cloudLit = mix(vec3(0.55,0.2,0.4), vec3(1.2,0.55,0.35), pow(sunAmt, 3.0) * side);
            col = mix(col, cloudLit, band * 0.8);
          }
          // stars on the night side
          if (h > 0.15) {
            vec2 sp = floor(d.xz / (h + 0.3) * 260.0);
            float st = step(0.9975, hash(sp)) * (1.0 - side) * smoothstep(0.15, 0.5, h);
            col += vec3(st) * (0.6 + 0.4*sin(time*2.0 + hash(sp)*30.0));
          }
          // below horizon: city haze
          col = mix(col, cGround, smoothstep(0.0, -0.08, h));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat);
    sky.name = 'sky';
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.sky = sky;
    this.group.add(sky);
    this.scene.fog = new THREE.Fog(new THREE.Color('#a8466a'), 26, 130);
  }

  _envMap() {
    // Build a small scene (sky + a few neon cards) and prefilter it for reflections on paint & wet asphalt.
    const envScene = new THREE.Scene();
    const skyClone = new THREE.Mesh(this.sky.geometry, this.sky.material);
    skyClone.scale.setScalar(0.1);
    envScene.add(skyClone);
    const card = (color, pos, scale) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4), side: THREE.DoubleSide }));
      m.position.copy(pos); m.scale.set(scale[0], scale[1], 1); m.lookAt(0, 0, 0);
      envScene.add(m);
    };
    card('#29e3d6', new THREE.Vector3(30, 6, 10), [14, 1.2]);
    card('#ff5fa2', new THREE.Vector3(-30, 8, 5), [16, 1.4]);
    card('#ffb24a', new THREE.Vector3(0, 10, 32), [10, 1]);
    const pm = new THREE.PMREMGenerator(this.renderer);
    const rt = pm.fromScene(envScene, 0.02, 1, 100);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.75;
    pm.dispose();
  }

  // ------------------------------------------------------------------ lights
  _lights() {
    const hemi = new THREE.HemisphereLight(0x9a6cc8, 0x3a1a26, 0.9);
    this.group.add(hemi);

    const sun = new THREE.DirectionalLight(0xffa25e, 3.2);
    sun.position.copy(SUN_DIR).multiplyScalar(20);
    sun.position.y = 9.5; // raise a bit so shadows stay readable on the board
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -7; c.right = 7; c.top = 7; c.bottom = -7; c.near = 1; c.far = 50;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    this.sun = sun;
    this.group.add(sun, sun.target);

    // cool neon rim from the night side
    const rim = new THREE.DirectionalLight(0x4fd8ff, 1.1);
    rim.position.set(6, 6, 12);
    this.group.add(rim);
    // magenta kicker from the left
    const kick = new THREE.DirectionalLight(0xff4fa0, 0.6);
    kick.position.set(-12, 4, 4);
    this.group.add(kick);
  }

  // ------------------------------------------------------------------ street
  _ground() {
    const r = rng(77);
    const tex = canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#2a2530'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 16000, (rr) => `rgba(${70 + rr * 60},${60 + rr * 60},${80 + rr * 50},${0.2 + rr * 0.3})`, r, [1, 2]);
      speckle(g, w, h, 5000, (rr) => `rgba(5,4,10,${0.3 + rr * 0.3})`, r, [1, 3]);
    }, { repeat: [40, 40] });
    const rough = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = 'rgb(0,200,0)'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) {
        const x = r() * w, y = r() * h, rad = 10 + r() * 40;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, 'rgba(0,30,0,1)'); grd.addColorStop(1, 'rgba(0,200,0,0)');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
      }
    }, { srgb: false, repeat: [18, 18] });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ map: tex, roughnessMap: rough, roughness: 1, metalness: 0.05, envMapIntensity: 1.2 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = STREET_Y;
    ground.receiveShadow = true;
    this.group.add(ground);

    // lane paint: dashed white lines along Z and a double yellow on the far ends
    const paint = new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.6 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xffc34d, roughness: 0.6, emissive: 0x5a3a00, emissiveIntensity: 0.3 });
    const dashGeo = new THREE.PlaneGeometry(0.12, 1.4); dashGeo.rotateX(-Math.PI / 2);
    const dashes = [];
    for (const x of [-5.6, 5.6]) for (let z = -80; z < 80; z += 3.2) {
      if (Math.abs(z) < 5.4) continue;
      dashes.push(dashGeo.clone().translate(x, STREET_Y + 0.005, z));
    }
    for (const x of [-0.12, 0.12]) {
      for (const [z0, z1] of [[-80, -5.5], [5.5, 80]]) {
        const gg = new THREE.PlaneGeometry(0.1, z1 - z0); gg.rotateX(-Math.PI / 2);
        gg.translate(x, STREET_Y + 0.005, (z0 + z1) / 2);
        dashes.push(gg);
      }
    }
    const lanes = new THREE.Mesh(mergeGeometries(dashes.slice(0, -4)), paint);
    const dy = new THREE.Mesh(mergeGeometries(dashes.slice(-4)), yellow);
    lanes.receiveShadow = dy.receiveShadow = true;
    this.group.add(lanes, dy);

    // stop-line crosswalks in front of each player's side (zebra)
    const zebra = [];
    for (const zc of [6.2, -6.2]) for (let x = -4.4; x <= 4.4; x += 0.8) {
      const gg = new THREE.PlaneGeometry(0.42, 1.1); gg.rotateX(-Math.PI / 2); gg.translate(x, STREET_Y + 0.006, zc);
      zebra.push(gg);
    }
    const z = new THREE.Mesh(mergeGeometries(zebra), paint);
    z.receiveShadow = true;
    this.group.add(z);

    // raised sidewalks on both sides beyond the fences
    const walkTex = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#8d7f86'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 3000, (rr) => `rgba(${60 + rr * 90},${50 + rr * 80},${60 + rr * 80},0.25)`, r);
      g.strokeStyle = 'rgba(40,30,40,0.6)'; g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); }
    }, { repeat: [3, 60] });
    const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.85 });
    for (const sx of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(6, 0.18, 160), walkMat);
      walk.position.set(sx * 10.6, STREET_Y + 0.09, 0);
      walk.receiveShadow = true;
      this.group.add(walk);
    }
  }

  // ------------------------------------------------------------------ race barriers
  _barriers(glb) {
    const group = new THREE.Group(); group.name = 'barriers';
    const along = []; // [x, z, yaw] — yaw makes the barrier's front (-Z) face the board
    const L = 2.0;
    for (const sx of [-1, 1]) for (let z = -15; z <= 15; z += L) along.push([sx * 6.9, z, sx * Math.PI / 2]);
    // short end caps across the corners behind each side, leaving the middle open for the camera
    for (const sz of [-1, 1]) for (const x of [-5.8, 5.8]) along.push([x, sz * 7.1, sz > 0 ? 0 : Math.PI]);

    if (glb) {
      const tmpl = normalizeProp(glb, { height: 0.6 });
      const len = propLength(tmpl);
      for (const [x, z, yaw] of along) {
        const n = Math.max(1, Math.round(L / len));
        const sideways = Math.abs(Math.sin(yaw)) > 0.5; // runs along Z
        for (let i = 0; i < n; i++) {
          const b = tmpl.clone();
          const off = (i - (n - 1) / 2) * len;
          b.position.set(x + (sideways ? 0 : off), STREET_Y, z + (sideways ? off : 0));
          b.rotation.y = yaw + (tmpl.userData.alongZ ? Math.PI / 2 : 0);
          group.add(b);
        }
      }
    } else {
      // jersey barrier profile extruded
      const s = new THREE.Shape();
      s.moveTo(-0.3, 0); s.lineTo(0.3, 0); s.lineTo(0.24, 0.1); s.lineTo(0.12, 0.25); s.lineTo(0.1, 0.62);
      s.lineTo(-0.1, 0.62); s.lineTo(-0.12, 0.25); s.lineTo(-0.24, 0.1); s.lineTo(-0.3, 0);
      const geo = new THREE.ExtrudeGeometry(s, { depth: L - 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
      geo.translate(0, 0, -(L - 0.04) / 2);
      geo.rotateY(Math.PI / 2); // length along X
      geo.computeVertexNormals();
      const white = new THREE.MeshStandardMaterial({ color: 0xece6de, roughness: 0.7, map: barrierTex('#ece6de') });
      const red = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, map: barrierTex('#d42330') });
      let i = 0;
      for (const [x, z, yaw] of along) {
        const b = new THREE.Mesh(geo, i++ % 2 ? red : white);
        b.position.set(x, STREET_Y, z);
        b.rotation.y = yaw;
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
      }
    }
    this.group.add(group);
  }

  // ------------------------------------------------------------------ chain-link fences + banners
  _fences(glb) {
    const group = new THREE.Group(); group.name = 'fences';
    const H = 2.6, X = 7.7, Z0 = -16, Z1 = 16;
    if (glb) {
      const tmpl = normalizeProp(glb, { height: H });
      tmpl.traverse((o) => {
        if (!o.isMesh) return;
        const fix = (m) => {
          if (m && /CHAIN|LINK|MESH_?FENCE/i.test(m.name || '')) {
            m = m.clone();
            m.transparent = false; m.alphaTest = 0.5; m.side = THREE.DoubleSide; m.depthWrite = true;
            if (!m.map && !m.alphaMap) { m.opacity = 1; } // no alpha texture: keep it solid rather than invisible
          }
          return m;
        };
        o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
      });
      const len = propLength(tmpl);
      for (const sx of [-1, 1]) for (let z = Z0 + len / 2; z <= Z1; z += len) {
        const f = tmpl.clone();
        f.position.set(sx * X, STREET_Y, z);
        f.rotation.y = sx * Math.PI / 2 + (tmpl.userData.alongZ ? Math.PI / 2 : 0);
        group.add(f);
      }
    } else {
      const linkTex = canvasTexture(128, 128, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.strokeStyle = '#c9ccd4'; g.lineWidth = 5;
        g.beginPath();
        g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath();
        g.moveTo(-w / 2, 0); g.lineTo(0, -h / 2);
        g.stroke();
        // corners to tile seamlessly
        g.beginPath(); g.moveTo(0, h / 2); g.lineTo(0, h / 2); g.stroke();
      }, { repeat: [(Z1 - Z0) / 0.32, H / 0.32] });
      linkTex.anisotropy = 8;
      const linkMat = new THREE.MeshStandardMaterial({
        map: linkTex, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.45, color: 0xd0d4dc,
      });
      const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.8, roughness: 0.35 });
      const postGeo = new THREE.CylinderGeometry(0.045, 0.05, H + 0.6, 8); postGeo.translate(0, (H + 0.6) / 2, 0);
      const armGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6); armGeo.translate(0, 0.45, 0);
      const railGeo = new THREE.CylinderGeometry(0.03, 0.03, Z1 - Z0, 6); railGeo.rotateX(Math.PI / 2);
      for (const sx of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(Z1 - Z0, H), linkMat);
        panel.position.set(sx * X, STREET_Y + H / 2 + 0.05, (Z0 + Z1) / 2);
        panel.rotation.y = Math.PI / 2;
        panel.castShadow = true;
        group.add(panel);
        // catch-fence overhang panel angled toward the track
        const over = new THREE.Mesh(new THREE.PlaneGeometry(Z1 - Z0, 0.8), linkMat);
        over.position.set(sx * (X - 0.28), STREET_Y + H + 0.38, (Z0 + Z1) / 2);
        over.rotation.set(0, Math.PI / 2, 0);
        over.rotateX(sx * -0.75);
        group.add(over);
        const posts = [], arms = [];
        for (let z = Z0; z <= Z1 + 0.01; z += 2.5) {
          posts.push(postGeo.clone().translate(sx * X, STREET_Y, z));
          const a = armGeo.clone();
          a.rotateZ(sx * 0.7);
          a.translate(sx * X, STREET_Y + H + 0.1, z);
          arms.push(a);
        }
        const pm = new THREE.Mesh(mergeGeometries([...posts, ...arms]), postMat);
        pm.castShadow = true;
        group.add(pm);
        for (const y of [0.1, H]) {
          const rail = new THREE.Mesh(railGeo, postMat);
          rail.position.set(sx * X, STREET_Y + y, (Z0 + Z1) / 2);
          group.add(rail);
        }
      }
    }
    // sponsor banners on the fences (bottom strip), GTA-parody sponsors
    const sponsors = [
      ['VICE CITY GP', '#ff5fa2', '#1b1036'], ['LEONIDA', '#29e3d6', '#101018'], ['eCola', '#ffffff', '#d4202c'],
      ['SPRUNK', '#9dff3c', '#0d2a12'], ['MAIBATSU', '#ffffff', '#2a2a2a'], ['PISSWASSER', '#ffc34d', '#3a1a0a'],
      ['VINEWOOD', '#1b1036', '#ffd36b'], ['CARTEL NOCTURNO', '#ffc34d', '#0b0b0e'],
    ];
    const r = rng(5);
    const bannerMats = sponsors.map(([t, fg, bg]) => new THREE.MeshStandardMaterial({
      map: bannerTex(t, fg, bg), roughness: 0.6, side: THREE.DoubleSide,
    }));
    const bGeo = new THREE.PlaneGeometry(3.6, 0.7);
    for (const sx of [-1, 1]) for (let z = -14; z <= 14; z += 4.1) {
      const b = new THREE.Mesh(bGeo, bannerMats[Math.floor(r() * bannerMats.length)]);
      b.position.set(sx * (X - 0.03), STREET_Y + 0.75, z);
      b.rotation.y = -sx * Math.PI / 2;
      b.receiveShadow = true;
      group.add(b);
    }
    this.group.add(group);
  }

  // ------------------------------------------------------------------ palms
  _palms(glb) {
    const group = new THREE.Group(); group.name = 'palms';
    const r = rng(42);
    const spots = [];
    for (const sx of [-1, 1]) for (let z = -30; z <= 18; z += 5.2) spots.push([sx * (9.3 + r() * 1.8), z + r() * 1.5]);
    // a few in the far distance for depth
    for (let i = 0; i < 8; i++) spots.push([(r() - 0.5) * 50, -26 - r() * 20]);
    for (let i = 0; i < 4; i++) spots.push([(r() < 0.5 ? -1 : 1) * (14 + r() * 8), 10 + r() * 10]);

    let make;
    if (glb) {
      const tmpl = normalizeProp(glb, { height: 6 });
      make = () => tmpl.clone();
    } else {
      const variants = [0, 1, 2].map((i) => buildPalm(rng(100 + i)));
      make = (i) => {
        const v = variants[i % variants.length];
        const p = v.clone();
        p.traverse((o) => { if (o.userData.frond) this.fronds.push({ o, base: o.rotation.clone(), ph: r() * 6.28 }); });
        return p;
      };
    }
    spots.forEach(([x, z], i) => {
      const p = make(i);
      const s = 0.85 + r() * 0.5;
      p.scale.setScalar(s * (glb ? 1 : 1));
      p.position.set(x, STREET_Y + (Math.abs(x) > 8.5 && Math.abs(x) < 13.5 ? 0.18 : 0), z);
      p.rotation.y = r() * Math.PI * 2;
      group.add(p);
    });
    this.group.add(group);
  }

  // ------------------------------------------------------------------ street lights
  _streetLights(glb) {
    const group = new THREE.Group(); group.name = 'streetlights';
    const spots = [[-7.3, -3.8], [7.3, 3.8], [-7.3, 3.8], [7.3, -3.8], [-7.3, -13], [7.3, -13], [-7.3, 13], [7.3, 13]];
    const H = 4.6;
    let lampTmpl, lampOff = null;
    if (glb) {
      lampTmpl = normalizeProp(glb, { height: H });
      // find the lamp head (emissive material) to know which way the arm points
      const bb = new THREE.Box3();
      lampTmpl.updateMatrixWorld(true);
      lampTmpl.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (mats.some((m) => /LAMP|EMISSIVE|BULB|LIGHT/i.test(m.name || ''))) bb.expandByObject(o);
      });
      if (!bb.isEmpty()) { const c = bb.getCenter(new THREE.Vector3()); lampOff = { x: c.x, y: c.y, z: c.z }; }
    }
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2a33, metalness: 0.7, roughness: 0.4 });
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb866).multiplyScalar(5) });
    spots.forEach(([x, z], i) => {
      let lamp;
      const inward = Math.sign(-x); // arm points toward the board (along X)
      let lightPos = new THREE.Vector3(x + inward * 1.2, STREET_Y + H - 0.3, z);
      if (lampTmpl) {
        lamp = lampTmpl.clone();
        if (lampOff && Math.hypot(lampOff.x, lampOff.z) > 0.1) {
          // rotate so the arm points toward +/-X (inward)
          const armYaw = Math.atan2(lampOff.x, lampOff.z); // direction of arm in local space
          const wantYaw = Math.atan2(inward, 0);
          lamp.rotation.y = wantYaw - armYaw;
          const d = Math.hypot(lampOff.x, lampOff.z);
          lightPos = new THREE.Vector3(x + inward * d, STREET_Y + lampOff.y - 0.15, z);
        } else {
          lamp.rotation.y = inward > 0 ? -Math.PI / 2 : Math.PI / 2;
        }
      } else {
        lamp = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, H, 10), poleMat);
        pole.position.y = H / 2; pole.castShadow = true;
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), poleMat);
        arm.rotation.z = Math.PI / 2; arm.position.set(inward * 0.62, H - 0.05, 0);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.24), poleMat);
        head.position.set(inward * 1.2, H - 0.08, 0);
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.03, 0.17), lampMat);
        bulb.position.set(inward * 1.2, H - 0.14, 0);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.4, 10), poleMat);
        base.position.y = 0.2;
        lamp.add(pole, arm, head, bulb, base);
      }
      lamp.position.set(x, STREET_Y, z);
      group.add(lamp);
      // ≤4 real point lights (closest to the board); the rest are emissive only
      if (i < 4) {
        const pl = new THREE.PointLight(0xffa04a, 14, 11, 1.6);
        pl.position.copy(lightPos);
        group.add(pl);
        this.streetLights.push(pl);
      }
      // light cone glow sprite
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex(), color: new THREE.Color(0xffa04a).multiplyScalar(1.4), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7,
      }));
      glow.position.copy(lightPos).y += 0.1;
      glow.scale.setScalar(1.6);
      group.add(glow);
    });
    this.group.add(group);
  }

  // ------------------------------------------------------------------ skyline
  _skyline() {
    const r = rng(2024);
    const winTex = [
      windowTexture(r, ['#ffcf7a', '#ffe2a8', '#ffb35c'], 0.38),
      windowTexture(r, ['#7ff5ff', '#29e3d6', '#c9ffff'], 0.3),
      windowTexture(r, ['#ff8ac0', '#ff5fa2', '#ffd0e6'], 0.3),
      windowTexture(r, ['#ffe9c7', '#fff2da'], 0.22),
    ];
    const facades = ['#221a2e', '#2c2038', '#1c1826', '#33253a'];
    const mats = winTex.map((t, i) => new THREE.MeshStandardMaterial({
      color: facades[i], map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 1.6,
      roughness: 0.55, metalness: 0.3, envMapIntensity: 0.6,
    }));
    const geos = mats.map(() => []);
    const neonTops = { teal: [], pink: [], gold: [] };
    const antennas = [];
    const place = (x, z, w, d, h) => {
      const g = new THREE.BoxGeometry(w, h, d);
      // scale UVs so windows keep a constant size
      const uv = g.attributes.uv, nrm = g.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
        const across = nx > 0.5 ? d : w;
        if (ny > 0.5) { uv.setXY(i, 0, 0); continue; } // roofs: dark
        uv.setXY(i, uv.getX(i) * across / 3, uv.getY(i) * h / 3);
      }
      g.translate(x, STREET_Y + h / 2, z);
      const mi = Math.floor(r() * mats.length);
      geos[mi].push(g);
      if (r() < 0.55) {
        const key = ['teal', 'pink', 'gold'][Math.floor(r() * 3)];
        const t = 0.18;
        for (const [ox, oz, lw, ld] of [[0, d / 2, w, t], [0, -d / 2, w, t], [w / 2, 0, t, d], [-w / 2, 0, t, d]]) {
          const e = new THREE.BoxGeometry(lw + 0.05, t, ld + 0.05);
          e.translate(x + ox, STREET_Y + h - 0.2, z + oz);
          neonTops[key].push(e);
        }
      }
      if (h > 28 && r() < 0.7) antennas.push([x, STREET_Y + h, z, 3 + r() * 5]);
    };
    // dense downtown cluster behind black (toward the sunset) + ring around
    for (let i = 0; i < 55; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.25;
      const dist = 48 + r() * 70;
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      const w = 4 + r() * 8, d = 4 + r() * 8;
      const hgt = 8 + Math.pow(r(), 1.6) * 55 * (dist > 60 ? 1.2 : 0.8);
      place(x, z, w, d, hgt);
    }
    for (let i = 0; i < 45; i++) {
      const a = r() * Math.PI * 2;
      const dist = 50 + r() * 70;
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (z > -10 && Math.abs(x) < 26) continue; // keep views across the board open
      place(x, z, 4 + r() * 9, 4 + r() * 9, 6 + Math.pow(r(), 2) * 30);
    }
    // closer low-rise art-deco blocks lining the street sides
    for (const sx of [-1, 1]) for (let z = -40; z <= 30; z += 7 + r() * 3) {
      place(sx * (17 + r() * 4), z, 5 + r() * 3, 5 + r() * 2, 3 + r() * 6);
    }
    mats.forEach((m, i) => {
      if (!geos[i].length) return;
      const mesh = new THREE.Mesh(mergeGeometries(geos[i]), m);
      mesh.name = 'skyline_' + i;
      mesh.receiveShadow = false;
      this.group.add(mesh);
    });
    const neonCol = { teal: 0x29e3d6, pink: 0xff5fa2, gold: 0xffc34d };
    for (const k in neonTops) {
      if (!neonTops[k].length) continue;
      const m = new THREE.Mesh(mergeGeometries(neonTops[k]), new THREE.MeshBasicMaterial({ color: new THREE.Color(neonCol[k]).multiplyScalar(3.5), fog: true }));
      this.group.add(m);
    }
    // antennas with blinking red lights
    const antMat = new THREE.MeshStandardMaterial({ color: 0x222228, metalness: 0.6, roughness: 0.5 });
    for (const [x, y, z, h] of antennas) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, h, 6), antMat);
      a.position.set(x, y + h / 2, z);
      this.group.add(a);
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(6) }));
      light.position.set(x, y + h + 0.2, z);
      this.group.add(light);
      this.blinkers.push({ m: light, ph: r() * 6 });
    }
  }

  // ------------------------------------------------------------------ neon signs
  _neonSigns() {
    const mk = (tex, w, h, pos, yaw, mult = 2.6, flicker = false) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, color: new THREE.Color(1, 1, 1).multiplyScalar(mult), side: THREE.DoubleSide,
      }));
      m.position.copy(pos); m.rotation.y = yaw;
      this.group.add(m);
      if (flicker) this.flicker.push({ m, base: mult, ph: Math.random() * 10 });
      return m;
    };
    // big "VI" logo sign on the skyline behind black
    mk(viTexture(), 16, 16, new THREE.Vector3(-24, 18, -58), 0.25, 2.2);
    // "VICE CITY" neon script to the right
    mk(textNeonTex('VICE CITY', '#29e3d6'), 18, 4.5, new THREE.Vector3(26, 14, -52), -0.35, 2.4, true);
    // storefront signs along the street sides (visible from both cameras)
    mk(textNeonTex('GRAND THEFT CHESS', '#ff5fa2'), 9, 1.6, new THREE.Vector3(-13.3, STREET_Y + 5.5, -8), Math.PI / 2, 2.4, true);
    mk(textNeonTex('OPEN 24/7', '#9dff3c'), 5, 1.3, new THREE.Vector3(13.3, STREET_Y + 4.2, -3), -Math.PI / 2, 2.2, true);
    mk(textNeonTex('MOTEL', '#ffc34d'), 5, 1.4, new THREE.Vector3(13.3, STREET_Y + 5.5, 9), -Math.PI / 2, 2.4);
    mk(textNeonTex('LEONIDA', '#29e3d6'), 6, 1.4, new THREE.Vector3(-13.3, STREET_Y + 4.6, 10), Math.PI / 2, 2.4);
    // behind white, visible from the black camera
    mk(viTexture(), 10, 10, new THREE.Vector3(18, 12, 48), Math.PI + 0.3, 2.0);
    mk(textNeonTex('MALIBU CLUB', '#ff5fa2'), 14, 3, new THREE.Vector3(-20, 10, 45), Math.PI - 0.3, 2.4, true);
  }

  update(dt, t) {
    if (this.skyUniforms) this.skyUniforms.time.value = t;
    for (const f of this.fronds) {
      f.o.rotation.x = f.base.x + Math.sin(t * 1.3 + f.ph) * 0.035;
      f.o.rotation.z = f.base.z + Math.sin(t * 0.9 + f.ph * 1.7) * 0.025;
    }
    for (const b of this.blinkers) b.m.visible = Math.sin(t * 2.2 + b.ph) > 0.3;
    for (const f of this.flicker) {
      const n = Math.sin(t * 37 + f.ph) * Math.sin(t * 3.1 + f.ph * 2);
      const off = n > 0.93 ? 0.15 : 1;
      f.m.material.color.setScalar(f.base * off);
    }
  }
}

// ====================================================================== helpers
export function normalizeProp(root, { height }) {
  const holder = new THREE.Group();
  const inner = root.clone(true);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  // GLBs are authored in meters: keep native scale unless it is wildly off
  let s = size.y > 1e-4 ? height / size.y : 1;
  if (s > 0.5 && s < 2) s = 1;
  inner.scale.multiplyScalar(s);
  inner.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(inner);
  const c = b2.getCenter(new THREE.Vector3());
  inner.position.x -= c.x; inner.position.z -= c.z; inner.position.y -= b2.min.y;
  inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  holder.add(inner);
  holder.userData.size = b2.getSize(new THREE.Vector3());
  holder.userData.alongZ = holder.userData.size.z > holder.userData.size.x;
  return holder;
}
function propLength(tmpl) {
  const s = tmpl.userData.size;
  return Math.max(0.2, Math.max(s.x, s.z));
}

function buildPalm(r) {
  const palm = new THREE.Group();
  const H = 5.2 + r() * 1.8;
  const lean = new THREE.Vector3((r() - 0.5) * 1.6, 0, (r() - 0.5) * 1.6);
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const k = i / 6;
    pts.push(new THREE.Vector3(lean.x * k * k, k * H, lean.z * k * k));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const TS = 24, RS = 8;
  const geo = new THREE.TubeGeometry(curve, TS, 0.16, RS, false);
  const pos = geo.attributes.position;
  const p = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= TS; i++) {
    const k = i / TS;
    curve.getPointAt(k, p);
    const taper = 1.25 - 0.55 * k + (k < 0.05 ? 0.4 * (1 - k / 0.05) : 0);
    for (let j = 0; j <= RS; j++) {
      const idx = i * (RS + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(p).multiplyScalar(taper).add(p);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  const trunk = new THREE.Mesh(geo, trunkMat());
  trunk.castShadow = true;
  palm.add(trunk);

  const top = curve.getPointAt(1);
  const crown = new THREE.Group();
  crown.position.copy(top);
  palm.add(crown);
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: 0x4a3a1c, roughness: 0.8 }));
  nuts.scale.set(1.2, 0.8, 1.2); nuts.position.y = -0.15;
  crown.add(nuts);
  const frondGeo = frondGeometry();
  const fm = frondMat();
  const n = 9 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / n) * Math.PI * 2 + r() * 0.3;
    const f = new THREE.Mesh(frondGeo, fm);
    f.rotation.x = -0.25 - r() * 0.5 + (i % 3 === 0 ? -0.35 : 0); // upward tilt for some
    f.scale.setScalar(0.9 + r() * 0.35);
    f.castShadow = true;
    f.userData.frond = true;
    pivot.add(f);
    crown.add(pivot);
  }
  return palm;
}

let _trunkMat = null;
function trunkMat() {
  if (_trunkMat) return _trunkMat;
  const tex = canvasTexture(64, 256, (g, w, h) => {
    g.fillStyle = '#6b5440'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) {
      g.fillStyle = 'rgba(40,28,20,0.7)'; g.fillRect(0, y, w, 3);
      g.fillStyle = 'rgba(160,130,100,0.35)'; g.fillRect(0, y + 4, w, 2);
    }
  }, { repeat: [2, 6] });
  _trunkMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  return _trunkMat;
}
let _frondMat = null;
function frondMat() {
  if (_frondMat) return _frondMat;
  const tex = canvasTexture(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // central rib bottom→top, leaflets angled outwards
    g.strokeStyle = '#3c6a2a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 0); g.stroke();
    for (let y = 8; y < h - 4; y += 7) {
      const k = y / h;
      const len = (w / 2 - 4) * Math.sin(Math.PI * (1 - k) * 0.95 + 0.1);
      const col = `rgb(${40 + k * 40},${95 + k * 50},${35 + k * 20})`;
      g.strokeStyle = col; g.lineWidth = 4;
      g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 - len, y - 16); g.stroke();
      g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + len, y - 16); g.stroke();
    }
  });
  _frondMat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, color: 0xb8c9a0 });
  return _frondMat;
}
let _frondGeo = null;
function frondGeometry() {
  if (_frondGeo) return _frondGeo;
  const L = 2.6, W = 0.9, seg = 10;
  const g = new THREE.PlaneGeometry(W, L, 4, seg);
  // lay along -Z from the pivot, droop downward with length, cup across width
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const k = (y + L / 2) / L; // 0 at base, 1 at tip
    const z = -k * L;
    const droop = -Math.pow(k, 2) * 1.5 + k * 0.5;
    const cup = -Math.abs(x) * 0.35;
    pos.setXYZ(i, x * (1 - 0.3 * k), droop + cup, z);
  }
  g.computeVertexNormals();
  _frondGeo = g;
  return g;
}

let _glow = null;
function glowTex() {
  if (_glow) return _glow;
  _glow = canvasTexture(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.3)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  return _glow;
}

function barrierTex(base) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1200, (rr) => `rgba(${40 + rr * 60},${40 + rr * 40},${40 + rr * 40},${0.08 + rr * 0.15})`, rng(3));
    g.fillStyle = 'rgba(30,20,20,0.35)'; g.fillRect(0, h - 8, w, 8); // grime at the base
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 8; i++) g.fillRect(Math.random() * w, h - 14 - Math.random() * 10, 20 + Math.random() * 40, 2); // tyre scuffs
  });
}

function bannerTex(text, fg, bg) {
  return canvasTexture(512, 100, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
    g.font = `bold 62px Anton, Impact, "Arial Black", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 3);
  });
}

function windowTexture(r, colors, litRatio) {
  const W = 128, H = 128, cols = 4, rows = 4;
  const lit = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) lit.push(r() < litRatio ? colors[Math.floor(r() * colors.length)] : null);
  const draw = (emissive) => (g) => {
    g.fillStyle = emissive ? '#000' : '#ffffff'; g.fillRect(0, 0, W, H);
    const cw = W / cols, ch = H / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const c = lit[y * cols + x];
      if (emissive) {
        if (!c) continue;
        g.fillStyle = c; g.globalAlpha = 0.55 + r() * 0.45;
        g.fillRect(x * cw + 6, y * ch + 8, cw - 12, ch - 16);
        g.globalAlpha = 1;
      } else {
        g.fillStyle = c ? '#ddd' : '#555';
        g.fillRect(x * cw + 6, y * ch + 8, cw - 12, ch - 16);
      }
    }
  };
  const map = canvasTexture(W, H, draw(false), { repeat: [1, 1] });
  const emissive = canvasTexture(W, H, draw(true), { repeat: [1, 1] });
  map.wrapS = map.wrapT = emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  map.magFilter = emissive.magFilter = THREE.NearestFilter;
  return { map, emissive };
}

function viTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = 'bold 380px Anton, Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const grd = g.createLinearGradient(0, 80, w, h - 60);
    grd.addColorStop(0, '#ff5fa2'); grd.addColorStop(0.55, '#ff7a6a'); grd.addColorStop(1, '#ffb347');
    g.shadowColor = '#ff5fa2'; g.shadowBlur = 40;
    g.fillStyle = grd; g.fillText('VI', w / 2, h / 2 + 20);
    g.shadowBlur = 0; g.lineWidth = 6; g.strokeStyle = 'rgba(255,240,250,0.9)'; g.strokeText('VI', w / 2, h / 2 + 20);
  });
}
function textNeonTex(text, color) {
  const W = 1024, H = Math.round(W * 0.25);
  return canvasTexture(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    let fs = 170;
    g.font = `bold ${fs}px Anton, Impact, "Arial Black", sans-serif`;
    while (g.measureText(text).width > W * 0.92 && fs > 20) { fs -= 6; g.font = `bold ${fs}px Anton, Impact, "Arial Black", sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 30;
    g.lineWidth = 10; g.strokeStyle = color; g.strokeText(text, W / 2, H / 2);
    g.shadowBlur = 8; g.lineWidth = 3; g.strokeStyle = '#ffffff'; g.strokeText(text, W / 2, H / 2);
  });
}
