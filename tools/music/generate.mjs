// Generate the soundtrack with Google Gemini (Lyria 3.5) and write public/music/<id>.mp3 + manifest.json.
//
//   set GEMINI_API_KEY in your environment first (Google AI Studio key) — this script never prints it.
//   node tools/music/generate.mjs                 generate every track that doesn't exist yet
//   node tools/music/generate.mjs --only id1,id2  just those tracks
//   node tools/music/generate.mjs --force         regenerate even if the file exists
//   node tools/music/generate.mjs --dry-run       show what would be sent, no API calls
//   node tools/music/generate.mjs --manifest      only rebuild manifest.json from the files on disk
//   node tools/music/generate.mjs --prompts       write docs/music/PROMPTS.md (for making songs in the Gemini app)
//   --model lyria-3-clip-preview                   cheaper 30s clips instead of full songs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACKS } from './tracks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'public', 'music');
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const MODEL = opt('--model') || 'lyria-3.5';
const only = opt('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
const force = flag('--force');
const dryRun = flag('--dry-run');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const COMMON =
  'Instrumental only, no vocals, no spoken words. Original composition. Mixed for background game music: ' +
  'clear but not overpowering, no harsh or sudden loud hits. The arrangement must keep evolving — ' +
  'new melodic ideas, instrument swaps, a breakdown and a final lift — no section repeats unchanged.';

/** docs/music/PROMPTS.md: the same prompts for pasting into the Gemini app by hand. */
function writePromptsDoc() {
  const lines = [
    '# Soundtrack prompts (Gemini app)',
    '',
    'Paste each prompt into the Gemini app (gemini.google.com → create music). Attach the listed reference images',
    'if the app lets you. Download the song and save it as the file name shown, in `public/music/`',
    '(`.mp3` preferred; `.wav`, `.m4a` and `.ogg` also work). Then run:',
    '',
    '```',
    'node tools/music/generate.mjs --manifest',
    '```',
    '',
    'and the game picks the songs up on the next reload. You can do them in any order and skip any; the radio',
    'uses whatever exists.',
    '',
  ];
  TRACKS.forEach((t, i) => {
    lines.push(`## ${i + 1}. ${t.title} — ${t.station}`, '');
    lines.push(`- Save as: \`public/music/${t.id}.mp3\``);
    lines.push(`- Plays during: ${t.tags.join(', ')}`);
    if (t.images?.length) lines.push(`- Reference images: ${t.images.map((p) => '`' + p + '`').join(', ')}`);
    lines.push('', '```', `${t.prompt}\n\n${COMMON}`, '```', '');
  });
  const file = path.join(ROOT, 'docs', 'music', 'PROMPTS.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n'));
  console.log('wrote ' + path.relative(ROOT, file));
}

function buildInput(track) {
  const text = `${track.prompt}\n\n${COMMON}`;
  const images = (track.images || [])
    .map((rel) => path.join(ROOT, rel))
    .filter((p) => fs.existsSync(p) && MIME[path.extname(p).toLowerCase()]);
  if (!images.length) return text;
  return [
    { type: 'text', text: `${text}\n\nUse the attached images only for mood, setting and color — no visual text or logos.` },
    ...images.map((p) => ({ type: 'image', mime_type: MIME[path.extname(p).toLowerCase()], data: fs.readFileSync(p).toString('base64') })),
  ];
}

/** Walk the response for the first audio block (the docs nest it under steps[].content[]). */
function findBlocks(node, type, out = []) {
  if (Array.isArray(node)) for (const x of node) findBlocks(x, type, out);
  else if (node && typeof node === 'object') {
    if (node.type === type) out.push(node);
    for (const v of Object.values(node)) if (v && typeof v === 'object') findBlocks(v, type, out);
  }
  return out;
}

async function generate(track, key) {
  const body = { model: MODEL, input: buildInput(track), response_format: { type: 'audio' } };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 600)}`);
  const json = JSON.parse(raw);
  const audio = findBlocks(json, 'audio').find((b) => typeof b.data === 'string' && b.data.length > 1000);
  if (!audio) throw new Error(`no audio in response: ${raw.slice(0, 600)}`);
  const text = findBlocks(json, 'text').map((b) => b.text).filter(Boolean).join('\n');
  const mime = audio.mime_type || audio.mimeType || 'audio/mpeg';
  const ext = /wav/.test(mime) ? '.wav' : '.mp3';
  const file = path.join(OUT, track.id + ext);
  fs.writeFileSync(file, Buffer.from(audio.data, 'base64'));
  return { file, bytes: fs.statSync(file).size, text };
}

function existingFile(id) {
  for (const ext of ['.mp3', '.wav', '.m4a', '.ogg']) {
    const f = path.join(OUT, id + ext);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

/** Hand-made songs with other file names: tools/music/assignments.json maps file name -> track id. */
function assignedFile(id) {
  const file = path.join(ROOT, 'tools', 'music', 'assignments.json');
  if (!fs.existsSync(file)) return null;
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));
  const name = Object.keys(map).find((f) => map[f] === id && fs.existsSync(path.join(OUT, f)));
  return name ? path.join(OUT, name) : null;
}

function writeManifest() {
  const tracks = TRACKS.map((t) => {
    const f = existingFile(t.id) || assignedFile(t.id);
    return f ? { id: t.id, file: 'music/' + encodeURIComponent(path.basename(f)), title: t.title, station: t.station, tags: t.tags } : null;
  }).filter(Boolean);
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ generatedBy: MODEL, tracks }, null, 2) + '\n');
  console.log(`manifest.json: ${tracks.length}/${TRACKS.length} tracks`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (flag('--manifest')) return writeManifest();
  if (flag('--prompts')) return writePromptsDoc();
  const todo = TRACKS.filter((t) => (!only || only.includes(t.id)) && (force || !existingFile(t.id)));
  if (!todo.length) {
    console.log('Nothing to generate (use --force to regenerate).');
    return writeManifest();
  }
  if (dryRun) {
    for (const t of todo) {
      const input = buildInput(t);
      const imgs = Array.isArray(input) ? input.length - 1 : 0;
      console.log(`- ${t.id} [${t.station}] ${imgs} image(s)\n  ${(Array.isArray(input) ? input[0].text : input).slice(0, 160)}...`);
    }
    return;
  }
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    console.error('GEMINI_API_KEY is not set. Create a key at https://aistudio.google.com/apikey and set it as an environment variable.');
    process.exit(1);
  }
  let failed = 0;
  for (const t of todo) {
    process.stdout.write(`Generating ${t.id} (${MODEL})... `);
    const t0 = Date.now();
    try {
      const r = await generate(t, key);
      console.log(`ok ${(r.bytes / 1024 / 1024).toFixed(1)} MB in ${Math.round((Date.now() - t0) / 1000)}s`);
      if (r.text) console.log('   notes: ' + r.text.replace(/\s+/g, ' ').slice(0, 200));
    } catch (err) {
      failed++;
      console.log('FAILED\n   ' + String(err.message || err).replace(key, '[key]'));
    }
    writeManifest(); // keep the manifest current so partial runs are usable
  }
  if (failed) process.exitCode = 1;
}

main();
