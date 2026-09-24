// NPC asset loading for NpcCrowd. Tries the rigged Blender characters (public/models/npc/, see
// docs/arenas/NPC_ASSETS.md) and falls back to the procedural people (procRig.js) when they are missing.
// Loaded once per session; the result is shared by every crowd (flagged userData.shared, never disposed).
//
// Both backends are normalised to the same shape:
//   { kind: 'glb'|'procedural', bases: [{ name, body, looks, hair, template, geometry, roles, fixed }],
//     clips: Map<canonicalName, AnimationClip>, props: { phone, drink, bottle, flag } (Object3D templates),
//     material (shared vertex-colour material), facing (-1 = model faces −Z) }
// A base's `geometry` is ONE merged skinned geometry; per-vertex `roles` (Uint8Array, ROLE.*) or `fixed`
// linear colours (Float32Array rgb, used where role = 255) are turned into a per-NPC colour attribute.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLTF } from '../Arena.js';
import { proceduralAssets, ROLE } from './procRig.js';
import { GLB_VARIANTS } from './looks.js';

/** Spec animation name → candidate clip names in the GLB (matched case/underscore-insensitively). */
export const CLIP_ALIASES = {
  idle: ['Idle'],
  talk: ['Talk', 'Talking'],
  phone: ['Phone', 'PhoneCall', 'Texting'],
  cheer: ['Cheer', 'Cheering'],
  clap: ['Clap', 'Clapping'],
  dance: ['Dance', 'Dance1', 'Dance2'],
  dance2: ['Dance2', 'Dance'],
  lean: ['Lean', 'LeanBack'],
  sit: ['Sit', 'Sitting', 'SitChair'],
  sit_ground: ['Sit_Ground', 'SitGround', 'Sit'],
  walk: ['Walk', 'Walking'],
  wave_flag: ['WaveFlag', 'Wave_Flag', 'Wave'],
  drink: ['Drink', 'Drinking', 'Sip'],
  point: ['Point', 'Pointing'],
  crossed: ['Crossed', 'ArmsCrossed', 'Idle'],
};

const norm = (s) => String(s).toLowerCase().replace(/^.*\|/, '').replace(/[^a-z0-9]/g, '');

let promise = null;
/** Resolves the shared NPC assets (never rejects). ?npc=procedural forces the fallback. */
export function loadNpcAssets() {
  if (!promise) {
    promise = (async () => {
      let force = null;
      try { force = new URLSearchParams(location.search).get('npc'); } catch (_) { /* ignore */ }
      if (force !== 'procedural') {
        try {
          const glb = await loadGlbAssets();
          if (glb) return glb;
        } catch (e) { console.warn('[npc] GLB characters unusable, using procedural people', e); }
      }
      const proc = proceduralAssets();
      const walk = proc.clips.get('walk');
      if (walk && !walk.userData.calibrated) {
        walk.userData.speed = calibrateWalk(proc.bases[0].template, walk);
        walk.userData.calibrated = true;
      }
      return proc;
    })();
  }
  return promise;
}

async function loadGlbAssets() {
  const names = Object.keys(GLB_VARIANTS);
  const [anims, props, ...variants] = await Promise.all([
    loadGLTF('models/npc/npc_anims.glb'),
    loadGLTF('models/npc/npc_props.glb'),
    ...names.map((n) => loadGLTF(`models/npc/${n}.glb`)),
  ]);
  if (!anims || !anims.animations?.length) return null;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0 });
  material.userData.shared = true;
  const bases = [];
  variants.forEach((g, i) => {
    if (!g) return;
    try {
      const b = prepareVariant(names[i], g, material);
      if (b) bases.push(b);
    } catch (e) { console.warn('[npc] variant failed', names[i], e); }
  });
  if (!bases.length) return null;
  // clips: canonical spec name → clip; missing ones fall back to Idle in NpcCrowd
  const byNorm = new Map(anims.animations.map((c) => [norm(c.name), c]));
  const clips = new Map();
  for (const [key, cands] of Object.entries(CLIP_ALIASES)) {
    for (const c of cands) {
      const hit = byNorm.get(norm(c));
      if (hit) { clips.set(key, hit); break; }
    }
  }
  // strip tracks the characters can't bind (e.g. the anim armature's own root node) to keep mixers quiet
  const boneNames = new Set();
  bases[0].template.traverse((o) => { if (o.isBone) boneNames.add(o.name); });
  // (also drop constant per-bone position/scale tracks: only rotations + hips translation drive the rig → 3× fewer bindings)
  for (const [k, c] of clips) {
    const tracks = c.tracks.filter((t) => {
      const p = THREE.PropertyBinding.parseTrackName(t.name);
      if (!boneNames.has(p.nodeName)) return false;
      if (p.propertyName === 'scale') return false;
      if (p.propertyName === 'position' && p.nodeName !== 'hips') return false;
      return true;
    });
    if (tracks.length !== c.tracks.length) {
      const cc = new THREE.AnimationClip(c.name, c.duration, tracks);
      cc.userData = c.userData || {};
      clips.set(k, cc);
    }
  }
  if (!clips.has('idle')) clips.set('idle', clips.values().next().value || anims.animations[0]);
  const walk = clips.get('walk');
  if (walk) walk.userData = { ...(walk.userData || {}), speed: calibrateWalk(bases[0].template, walk) };
  return { kind: 'glb', bases, clips, props: prepareProps(props), material, facing: -1 };
}

/**
 * Ground speed (m/s at timeScale 1) that matches an in-place walk clip: the stance foot slides backwards
 * relative to the body by the stride range during roughly 58 % of the cycle. Used to avoid ice-skating.
 */
export function calibrateWalk(template, clip) {
  try {
    const m = SkeletonUtils.clone(template);
    const foot = m.getObjectByName('foot_L');
    if (!foot) return 1.2;
    const mixer = new THREE.AnimationMixer(m);
    mixer.clipAction(clip).play();
    const v = new THREE.Vector3();
    let lo = Infinity, hi = -Infinity;
    const N = 24;
    for (let i = 0; i < N; i++) {
      mixer.setTime((i / N) * clip.duration);
      m.updateMatrixWorld(true);
      foot.getWorldPosition(v);
      lo = Math.min(lo, v.z); hi = Math.max(hi, v.z);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(m);
    const speed = (hi - lo) / (0.58 * clip.duration);
    return speed > 0.2 && speed < 4 ? speed : 1.2;
  } catch (_) { return 1.2; }
}

/** Merge a character's primitives into one skinned geometry + per-vertex colour roles. */
function prepareVariant(name, gltf, material) {
  const src = SkeletonUtils.clone(gltf.scene);
  src.updateMatrixWorld(true);
  const skinned = [];
  src.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  if (!skinned.length) return null;
  const main = skinned[0];
  // all primitives of one glTF mesh share node + skin; anything else would need its own bind → skip it
  const parts = skinned.filter((m) => m.parent === main.parent && m.skeleton.bones.length === main.skeleton.bones.length);
  const geoms = [], roleArrs = [], fixedArrs = [];
  for (const m of parts) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const g = m.geometry;
    const n = g.attributes.position.count;
    const roles = new Uint8Array(n).fill(255);
    const fixed = new Float32Array(n * 3);
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : n, materialIndex: 0 }];
    for (const gr of groups) {
      const mat = mats[gr.materialIndex] || mats[0];
      const role = roleFor(mat?.name || '');
      const col = mat?.color || new THREE.Color(1, 1, 1);
      for (let k = gr.start; k < gr.start + gr.count; k++) {
        const v = g.index ? g.index.getX(k) : k;
        roles[v] = role;
        fixed[v * 3] = col.r; fixed[v * 3 + 1] = col.g; fixed[v * 3 + 2] = col.b;
      }
    }
    geoms.push(g); roleArrs.push(roles); fixedArrs.push(fixed);
  }
  const geometry = mergeSkinned(geoms);
  const total = geometry.attributes.position.count;
  const roles = new Uint8Array(total), fixed = new Float32Array(total * 3);
  let o = 0;
  roleArrs.forEach((r, i) => { roles.set(r, o); fixed.set(fixedArrs[i], o * 3); o += r.length; });
  geometry.userData.shared = true;
  main.geometry = geometry;
  main.material = material;
  main.name = 'npc_body';
  for (const m of parts) if (m !== main) m.removeFromParent();
  // other meshes (e.g. PROP_PHONE parented to hand_R): keep, share, hide by default
  src.traverse((o) => {
    if (!o.isMesh || o === main) return;
    o.visible = false;
    o.castShadow = false;
    o.geometry.userData.shared = true;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m) m.userData.shared = true; });
  });
  src.name = 'npc_model';
  const meta = GLB_VARIANTS[name] || {};
  return { name, body: meta.body || 'm', looks: meta.looks || null, hair: meta.hair || null, template: src, geometry, roles, fixed, roleMode: false };
}

function roleFor(matName) {
  const n = matName.toUpperCase();
  if (/TOP/.test(n)) return ROLE.TOP;
  if (/BOTTOM/.test(n)) return ROLE.BOTTOM;
  if (/SKIN/.test(n)) return ROLE.SKIN;
  if (/HAIR/.test(n)) return ROLE.HAIR;
  if (/SHOE/.test(n) && /TINT/.test(n)) return ROLE.SHOES;
  if (/ACCENT/.test(n)) return ROLE.ACCENT;
  return 255; // fixed colour from the material
}

/** Merge skinned primitives (same attribute set) into one indexed geometry; skinIndex → Uint16. */
function mergeSkinned(geoms) {
  const names = ['position', 'normal', 'skinIndex', 'skinWeight'];
  let vCount = 0, iCount = 0;
  for (const g of geoms) { vCount += g.attributes.position.count; iCount += g.index ? g.index.count : g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  const arrays = {
    position: new Float32Array(vCount * 3), normal: new Float32Array(vCount * 3),
    skinIndex: new Uint16Array(vCount * 4), skinWeight: new Float32Array(vCount * 4),
  };
  const index = new (vCount > 65535 ? Uint32Array : Uint16Array)(iCount);
  let vo = 0, io = 0;
  for (const g of geoms) {
    const n = g.attributes.position.count;
    for (const a of names) {
      const attr = g.attributes[a];
      const size = a === 'position' || a === 'normal' ? 3 : 4;
      const dst = arrays[a];
      if (!attr) { if (a === 'normal') continue; if (a === 'skinWeight') for (let i = 0; i < n; i++) dst[(vo + i) * 4] = 1; continue; }
      const get = [attr.getX, attr.getY, attr.getZ, attr.getW];
      for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) dst[(vo + i) * size + c] = get[c].call(attr, i);
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) index[io++] = g.index.getX(k) + vo;
    else for (let k = 0; k < n; k++) index[io++] = k + vo;
    vo += n;
  }
  out.setAttribute('position', new THREE.BufferAttribute(arrays.position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(arrays.normal, 3));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(arrays.skinIndex, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(arrays.skinWeight, 4));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  if (!geoms[0].attributes.normal) out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}

/** npc_props.glb nodes Phone / Cup / Bottle / Flag (grip at node origin); procedural props fill the gaps. */
function prepareProps(gltf) {
  const proc = proceduralAssets().props;
  if (!gltf) return { ...proc };
  const find = (re) => {
    let hit = null;
    gltf.scene.traverse((o) => { if (!hit && re.test(o.name)) hit = o; });
    if (!hit) return null;
    const c = hit.clone(true);
    c.position.set(0, 0, 0);
    c.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.geometry.userData.shared = true;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m) m.userData.shared = true; });
    });
    c.userData.glbProp = true;
    return c;
  };
  return {
    phone: find(/^phone/i) || proc.phone,
    drink: find(/^cup/i) || proc.drink,
    bottle: find(/^bottle/i) || proc.bottle,
    flag: find(/^flag/i) || proc.flag,
  };
}
