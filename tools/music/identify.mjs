// Match hand-made songs (any file names in public/music/) to the soundtrack slots in tracks.mjs by having
// Gemini listen to each file. Writes tools/music/assignments.json { "<file name>": "<track id>" }, which
// generate.mjs --manifest uses for files that aren't named <id>.mp3.
//
//   node tools/music/identify.mjs            identify files that have no assignment yet
//   node tools/music/identify.mjs --all      re-identify everything
// Edit assignments.json by hand if a match is wrong, then re-run `node tools/music/generate.mjs --manifest`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACKS } from './tracks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'public', 'music');
const ASSIGN = path.join(ROOT, 'tools', 'music', 'assignments.json');
const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
const AUDIO = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg' };

const ids = new Set(TRACKS.map((t) => t.id));
const catalog = TRACKS.map((t, i) => `${i + 1}. id=${t.id} — "${t.title}": ${t.prompt}`).join('\n');

async function ask(file, key) {
  const data = fs.readFileSync(file).toString('base64');
  const prompt =
    'Listen to this instrumental track. It was generated from ONE of the prompts below. Rank the 3 prompts it ' +
    'most likely came from, judging genre, tempo, instruments, mood and structure.\n\n' + catalog;
  const schema = {
    type: 'OBJECT',
    properties: {
      heard: { type: 'STRING' },
      ranking: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, score: { type: 'NUMBER' } }, required: ['id', 'score'] } },
    },
    required: ['heard', 'ranking'],
  };
  let last;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ inline_data: { mime_type: AUDIO[path.extname(file).toLowerCase()], data } }, { text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema },
        }),
        signal: AbortSignal.timeout(180000),
      });
      const raw = await res.text();
      if (res.ok) {
        const txt = JSON.parse(raw).candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '{}';
        return { model, ...JSON.parse(txt) };
      }
      last = new Error(`${model} HTTP ${res.status}: ${raw.slice(0, 200)}`);
      if (res.status === 429 || res.status >= 500) await new Promise((r) => setTimeout(r, 10000 * (attempt + 1)));
      else break;
    }
  }
  throw last;
}

async function main() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return console.error('GEMINI_API_KEY is not set.'), process.exit(1);
  const assign = fs.existsSync(ASSIGN) ? JSON.parse(fs.readFileSync(ASSIGN, 'utf8')) : {};
  const files = fs.readdirSync(DIR).filter((f) => AUDIO[path.extname(f).toLowerCase()] && !ids.has(path.parse(f).name));
  const todo = files.filter((f) => process.argv.includes('--all') || !assign[f]);
  const rankings = {};
  for (const f of todo) {
    process.stdout.write(`listening to ${f}... `);
    try {
      const r = await ask(path.join(DIR, f), key);
      rankings[f] = (r.ranking || []).filter((x) => ids.has(x.id));
      console.log(`${rankings[f].map((x) => `${x.id} ${Math.round(x.score * 100) / 100}`).join(', ')}  (${r.heard?.slice(0, 80)})`);
    } catch (err) {
      console.log('FAILED ' + String(err.message).replace(key, '[key]'));
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  // one song per slot: take the most confident (file, slot) pairs first
  const taken = new Set(Object.entries(assign).filter(([f]) => !todo.includes(f)).map(([, id]) => id));
  const pairs = Object.entries(rankings).flatMap(([f, rk]) => rk.map((x, i) => ({ f, id: x.id, s: x.score - i * 0.01 })));
  pairs.sort((a, b) => b.s - a.s);
  const done = new Set();
  for (const p of pairs) {
    if (done.has(p.f) || taken.has(p.id)) continue;
    assign[p.f] = p.id;
    done.add(p.f);
    taken.add(p.id);
  }
  // anything left over: first free slot of its ranking, else any free slot
  for (const f of Object.keys(rankings)) {
    if (done.has(f)) continue;
    const free = TRACKS.map((t) => t.id).filter((id) => !taken.has(id));
    const pick = rankings[f].map((x) => x.id).find((id) => !taken.has(id)) || free[0];
    if (pick) (assign[f] = pick), taken.add(pick);
  }
  fs.writeFileSync(ASSIGN, JSON.stringify(assign, null, 2) + '\n');
  console.log('\nassignments:');
  for (const [f, id] of Object.entries(assign)) console.log(`  ${f.padEnd(34)} -> ${id}`);
}

main();
