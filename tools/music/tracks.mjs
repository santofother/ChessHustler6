// Soundtrack plan for Grand Theft Chess. Each entry becomes one Lyria 3.5 generation (tools/music/generate.mjs).
//   id       file name in public/music/<id>.mp3
//   station  in-game radio station name (shown in the "now playing" toast)
//   tags     where the game may play it: title | match | hub | puzzle | boss | city_boss | nh1..nh4
//   images   reference images sent with the prompt (paths from the project root)
//
// All tracks are instrumental so they sit under chess thinking time. Every prompt spells out a changing
// arrangement (sections, breakdowns, key changes) so songs don't feel like a 4-bar loop; generate.mjs appends
// the shared "instrumental, background mix, keep evolving" instructions to every prompt.

const REF_RACE = 'docs/1.webp';
const REF_NIGHT = 'docs/2.png';

export const TRACKS = [
  // ---------------------------------------------------------------- Leonida Nights FM (synthwave)
  {
    id: 'vice_city_gambit',
    title: 'Vice City Gambit',
    station: 'Leonida Nights FM',
    tags: ['title', 'match'],
    images: [REF_NIGHT, REF_RACE],
    prompt:
      'Main theme for a stylish crime-comedy chess game set in a sunny neon Florida city. 2-minute track. ' +
      'Retro 80s synthwave meets modern trap drums, 102 BPM, A minor. ' +
      '[0:00 - 0:15] Intro: warm analog pads and a sunset arpeggio. ' +
      '[0:15 - 0:45] Theme: a bold, catchy lead synth melody over punchy drums and a gated snare. ' +
      '[0:45 - 1:10] Second theme: electric guitar answers the synth, bass gets funkier. ' +
      '[1:10 - 1:30] Breakdown: just pads, a ticking clock sound and plucked synths — tense like a chess move. ' +
      '[1:30 - 2:00] Finale: key change up a tone, full band, confident and triumphant, clean ending.',
  },
  {
    id: 'ocean_drive_opening',
    title: 'Ocean Drive Opening',
    station: 'Leonida Nights FM',
    tags: ['match', 'nh1'],
    images: [REF_RACE],
    prompt:
      'Driving outrun synthwave for a street race along a palm-lined beach at golden hour, 2 minutes, 118 BPM. ' +
      'Pulsing octave bass, shimmering arpeggios, a soaring saxophone lead in the second half, ' +
      'a half-time breakdown with filtered drums, then a big final chorus with layered synths.',
  },
  {
    id: 'midnight_endgame',
    title: 'Midnight Endgame',
    station: 'Leonida Nights FM',
    tags: ['match', 'boss'],
    images: [REF_NIGHT],
    prompt:
      'Moody dark synthwave for a late-night high-stakes game, 2 minutes, 95 BPM, D minor. ' +
      'Deep sub bass, gated reverb toms, a haunting lead that grows more urgent, a quiet middle section ' +
      'with just piano and rain-like texture, then a powerful last minute with driving sixteenth-note bass.',
  },

  // ---------------------------------------------------------------- Pier 64 Radio (funk / disco)
  {
    id: 'boardwalk_hustle',
    title: 'Boardwalk Hustle',
    station: 'Pier 64 Radio',
    tags: ['match', 'nh1', 'hub'],
    prompt:
      'Playful retro funk and boogie for a sunny beach boardwalk full of small-time hustlers, 2 minutes, 110 BPM. ' +
      'Slap bass, wah guitar, brass stabs, clavinet and a cheeky whistle-like synth hook. ' +
      'A bass solo break in the middle, a horn section call-and-response, and a fun big-band style ending. ' +
      'Comedic, groovy, sunny.',
  },
  {
    id: 'two_pawn_shuffle',
    title: 'Two-Pawn Shuffle',
    station: 'Pier 64 Radio',
    tags: ['match', 'nh1'],
    prompt:
      'Upbeat disco-funk with a sneaky comedic feel, like a caper movie, 2 minutes, 116 BPM. ' +
      'Four-on-the-floor kick, strings swells, rhythm guitar, bouncy bassline, vibraphone melody. ' +
      'Includes a sudden stop-and-start gag moment, a key change for the last chorus, and a tight outro.',
  },

  // ---------------------------------------------------------------- Rustwater Rumble (hip-hop)
  {
    id: 'container_row',
    title: 'Container Row',
    station: 'Rustwater Rumble',
    tags: ['match', 'nh2'],
    prompt:
      'Gritty boom-bap hip-hop instrumental for an industrial port at dusk, 2 minutes, 90 BPM. ' +
      'Dusty drum breaks, deep upright-style bass, chopped soul horn samples, metallic percussion like cranes and chains. ' +
      'Beat switch halfway into a harder trap-influenced section with 808s, then back to the soulful groove.',
  },
  {
    id: 'forklift_freestyle',
    title: 'Forklift Freestyle',
    station: 'Rustwater Rumble',
    tags: ['match', 'nh2'],
    prompt:
      'Confident West Coast G-funk instrumental, 2 minutes, 94 BPM. Rolling synth bass, high whiny lead synth, ' +
      'talkbox-like instrument melody (no words), crisp claps. A breakdown with only bass and finger snaps, ' +
      'then a new counter-melody on electric piano for the final section.',
  },

  // ---------------------------------------------------------------- Neon Mile 103 (latin / club)
  {
    id: 'neon_mile_heat',
    title: 'Neon Mile Heat',
    station: 'Neon Mile 103',
    tags: ['match', 'nh3'],
    images: [REF_NIGHT],
    prompt:
      'High-energy Latin house and reggaeton fusion for a neon nightlife strip, 2 minutes, 100 BPM dembow groove ' +
      'switching to 124 BPM house in the second half. Congas, timbales, bright piano montuno, brass hits, deep bass. ' +
      'Build-ups with risers, a percussion-only break, and a euphoric final drop. Instrumental.',
  },
  {
    id: 'velvet_rope',
    title: 'Velvet Rope',
    station: 'Neon Mile 103',
    tags: ['match', 'nh3', 'boss'],
    prompt:
      'Sleek, seductive nu-disco with a dangerous edge, like a casino heist, 2 minutes, 112 BPM. ' +
      'Filtered French-house chords, rubbery bass, guitar licks, a spy-movie surf guitar melody in the middle, ' +
      'strings rising for the last minute.',
  },

  // ---------------------------------------------------------------- Crown Hills Lounge (jazz / classy)
  {
    id: 'gated_community_bossa',
    title: 'Gated Community Bossa',
    station: 'Crown Hills Lounge',
    tags: ['match', 'nh4', 'puzzle', 'hub'],
    prompt:
      'Smooth, witty lounge jazz and bossa nova for a rich gated neighborhood, 2 minutes, 128 BPM bossa. ' +
      'Nylon guitar, brushed drums, upright bass, flute and vibraphone trading melodies, Rhodes chords. ' +
      'A piano solo section, a modulation for the last theme, and an elegant ending. Relaxed but clever.',
  },
  {
    id: 'hoa_meeting',
    title: 'HOA Meeting',
    station: 'Crown Hills Lounge',
    tags: ['match', 'nh4', 'puzzle'],
    prompt:
      'Playful chamber-orchestra piece with a hip-hop beat underneath, like a comedic villain planning, 2 minutes, 88 BPM. ' +
      'Pizzicato strings, harpsichord, bassoon melody, then French horns and a boom-bap beat join. ' +
      'A pompous waltz-like interlude, then the full piece returns bigger.',
  },

  // ---------------------------------------------------------------- Burner Phone Beats (lofi hub/puzzles)
  {
    id: 'burner_phone',
    title: 'Burner Phone',
    station: 'Burner Phone Beats',
    tags: ['hub', 'puzzle'],
    images: [REF_NIGHT],
    prompt:
      'Chill lofi hip-hop with Miami sunset vibes for studying chess puzzles and planning moves on a city map, ' +
      '2 minutes, 80 BPM. Warm tape-saturated Rhodes chords, mellow bass, soft vinyl crackle, a gentle guitar melody ' +
      'that changes every section, occasional ocean wave texture, a subtle chord change halfway through.',
  },
  {
    id: 'street_smarts',
    title: 'Street Smarts',
    station: 'Burner Phone Beats',
    tags: ['hub', 'puzzle'],
    prompt:
      'Laid-back jazzy chillhop for thinking, 2 minutes, 86 BPM. Muted trumpet melody, piano chords, soft kick and snare, ' +
      'walking bass in the middle section, glockenspiel accents, a calm and satisfying resolution at the end.',
  },

  // ---------------------------------------------------------------- Nocturno Tower (bosses)
  {
    id: 'the_long_game',
    title: 'The Long Game',
    station: 'Nocturno Tower',
    tags: ['city_boss', 'boss'],
    images: [REF_NIGHT],
    prompt:
      'Epic final-boss theme for a showdown with a crime lord at the top of a glass skyscraper, 2 and a half minutes, ' +
      '140 BPM halftime trap. Dark orchestral strings and choir-like pads (no words), heavy 808s, a menacing ' +
      'harpsichord motif like a chess clock, a quiet eerie middle section with a lone piano, then a massive ' +
      'final build with brass and a victorious major-key turn in the last 20 seconds.',
  },
  {
    id: 'hq_raid',
    title: 'HQ Raid',
    station: 'Nocturno Tower',
    tags: ['boss'],
    prompt:
      'Tense action heist music for storming a gang headquarters, 2 minutes, 128 BPM. Driving synth bass, ' +
      'taiko drums, staccato strings, distorted guitar riffs, siren-like synth swells kept soft. ' +
      'A stealthy low section, then escalation to a big climax and abrupt clean stop.',
  },
];
