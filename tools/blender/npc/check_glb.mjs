// Validate the NPC GLBs the way the game consumes them (three.js GLTFLoader + SkeletonUtils + AnimationMixer).
//   node tools/blender/npc/check_glb.mjs            (from the repo root)
// Checks: every variant has ONE skinned mesh with the 17 expected bones and the 6 TINT_* materials,
// PROP_PHONE hangs off hand_R, npc_anims.glb has every clip with non-empty tracks that all bind to
// variant bones, loops are seamless (first == last key), a mixer actually moves the hand, and
// npc_props.glb has Phone / Cup / Bottle / Flag nodes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'public/models/npc');
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'upperarm_L', 'lowerarm_L', 'hand_L', 'upperarm_R',
  'lowerarm_R', 'hand_R', 'upperleg_L', 'lowerleg_L', 'foot_L', 'upperleg_R', 'lowerleg_R', 'foot_R'];
const TINTS = ['TINT_Top', 'TINT_Bottom', 'TINT_Skin', 'TINT_Hair', 'TINT_Shoes', 'TINT_Accent'];
const CLIPS = ['Idle', 'Idle_Shift', 'Talk', 'Phone', 'Cheer', 'Cheer_Once', 'Clap', 'Dance', 'Dance2', 'Lean',
  'Crossed', 'Sit', 'Sit_Ground', 'Walk', 'Wave', 'WaveFlag', 'Drink', 'Point'];
const ONESHOT = new Set(['Cheer_Once']);

const loader = new GLTFLoader();
const load = (file) => new Promise((res, rej) => {
  const buf = fs.readFileSync(file);
  loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej);
});

let failures = 0;
const fail = (m) => { failures++; console.log('  FAIL ' + m); };
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

const anims = await load(path.join(DIR, 'npc_anims.glb'));
console.log(`npc_anims.glb  ${(fs.statSync(path.join(DIR, 'npc_anims.glb')).size / 1024).toFixed(1)} KB, ${anims.animations.length} clips`);
const byName = new Map(anims.animations.map((c) => [c.name, c]));
for (const n of CLIPS) {
  const c = byName.get(n);
  if (!c) { fail('missing clip ' + n); continue; }
  const empty = c.tracks.filter((t) => t.times.length < 2);
  if (!c.tracks.length) fail(n + ' has no tracks');
  // seamless loop: first and last keys equal (quaternion sign-insensitive)
  let worst = 0;
  if (!ONESHOT.has(n)) {
    for (const t of c.tracks) {
      const k = t.getValueSize(), v = t.values, L = v.length;
      let d = 0, dneg = 0;
      for (let i = 0; i < k; i++) { d += Math.abs(v[i] - v[L - k + i]); dneg += Math.abs(v[i] + v[L - k + i]); }
      worst = Math.max(worst, t.name.endsWith('quaternion') ? Math.min(d, dneg) : d);
    }
    if (worst > 1e-3) fail(`${n} loop seam ${worst.toFixed(4)}`);
  }
  console.log(`  clip ${n.padEnd(11)} ${c.duration.toFixed(2)}s  tracks=${c.tracks.length}${empty.length ? ' (' + empty.length + ' static)' : ''}  seam=${worst.toExponential(1)}`);
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.glb') && !/^npc_(anims|props)/.test(f));
for (const f of files) {
  const g = await load(path.join(DIR, f));
  const scene = SkeletonUtils.clone(g.scene);
  const skinned = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  const size = fs.statSync(path.join(DIR, f)).size;
  if (!skinned.length) { fail(f + ': no skinned mesh'); continue; }
  const sk = skinned[0].skeleton;
  const names = sk.bones.map((b) => b.name);
  const missing = BONES.filter((b) => !names.includes(b));
  if (missing.length) fail(`${f}: missing bones ${missing}`);
  if (new Set(skinned.map((m) => m.skeleton)).size !== 1 && new Set(skinned.map((m) => m.parent)).size !== 1) fail(f + ': multiple skins');
  const mats = new Set();
  let t = 0;
  for (const m of skinned) { (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x.name)); t += tris(m.geometry); }
  const miss = TINTS.filter((x) => !mats.has(x));
  if (miss.length) fail(`${f}: missing materials ${miss}`);
  const phone = scene.getObjectByName('PROP_PHONE');
  if (!phone || phone.parent?.name !== 'hand_R') fail(f + ': PROP_PHONE not parented to hand_R');
  // bind every clip; check tracks resolve and the rig actually moves
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const mixer = new THREE.AnimationMixer(scene);
  const hand = scene.getObjectByName('hand_R');
  const rest = hand.getWorldPosition(new THREE.Vector3());
  let unbound = 0, moved = 0;
  for (const n of CLIPS) {
    const c = byName.get(n);
    if (!c) continue;
    for (const tr of c.tracks) {
      const node = THREE.PropertyBinding.parseTrackName(tr.name).nodeName;
      if (!scene.getObjectByName(node)) unbound++;
    }
    const a = mixer.clipAction(c);
    a.reset().play();
    mixer.setTime(c.duration * 0.37);
    scene.updateMatrixWorld(true);
    if (hand.getWorldPosition(new THREE.Vector3()).distanceTo(rest) > 0.02) moved++;
    a.stop();
  }
  if (unbound) fail(`${f}: ${unbound} clip tracks target unknown nodes`);
  if (moved < CLIPS.length - 2) fail(`${f}: only ${moved} clips move hand_R`);
  const h = box.max.y - box.min.y;
  console.log(`${f.padEnd(16)} ${(size / 1024).toFixed(1).padStart(6)} KB  tris=${t}  bones=${names.length}  mats=${mats.size}  height=${h.toFixed(3)} m  clips moving hand=${moved}/${CLIPS.length}`);
}

const propsFile = path.join(DIR, 'npc_props.glb');
if (fs.existsSync(propsFile)) {
  const p = await load(propsFile);
  const found = ['Phone', 'Cup', 'Bottle', 'Flag'].map((n) => [n, p.scene.getObjectByName(n)]);
  for (const [n, o] of found) if (!o) fail('npc_props.glb missing ' + n);
  let t = 0;
  p.scene.traverse((o) => { if (o.isMesh) t += tris(o.geometry); });
  console.log(`npc_props.glb ${(fs.statSync(propsFile).size / 1024).toFixed(1)} KB tris=${t} nodes=${found.filter((x) => x[1]).map((x) => x[0])}`);
} else fail('npc_props.glb missing');

// hand_R rest frame (props are authored in it)
{
  const g = await load(path.join(DIR, files[0]));
  g.scene.updateMatrixWorld(true);
  const hand = g.scene.getObjectByName('hand_R');
  const q = hand.getWorldQuaternion(new THREE.Quaternion());
  const ax = (v) => v.applyQuaternion(q).toArray().map((x) => x.toFixed(2)).join(',');
  console.log(`hand_R rest: pos=${hand.getWorldPosition(new THREE.Vector3()).toArray().map((x) => x.toFixed(3))} X=(${ax(new THREE.Vector3(1, 0, 0))}) Y=(${ax(new THREE.Vector3(0, 1, 0))}) Z=(${ax(new THREE.Vector3(0, 0, 1))})`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL NPC CHECKS PASSED');
process.exit(failures ? 1 : 0);
