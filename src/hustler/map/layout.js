// Hustler Mode city map — static geometry (world units, 1600 x 1000 canvas).
// Pure data + deterministic generators for decoration. No game rules here.
//
// Geography (Vice City parody), ocean to the EAST and SOUTH:
//   nh4 Crown Hills   — gated mansions on the northern ridge (contour lines, polo field, helipad)
//   downtown          — skyline district in the NE, cut off by the river + canal (bridge from nh4)
//   nh3 Neon Mile     — inland west: the neon drag-strip boulevard, clubs, casinos
//   nh2 Rustwater     — east coast port: warehouses, container terminal island, cranes, docked ships
//   nh1 Sunset Strand — south beach: sand, palms, umbrellas, Pelican Pier with a ferris wheel (start)
// Adjacency drawn: nh1–nh2, nh1–nh3, nh2–nh3, nh2–nh4, nh3–nh4, nh4–downtown  (HUSTLER_SPEC §1).

export const WORLD = { w: 1600, h: 1000 };

/** The area "fit to city" frames (world units). */
export const FIT_BOX = { x: 30, y: 16, w: 1360, h: 950 };

/** Mainland (everything west/north of the coastline). */
export const LAND_PATH =
  'M-400,-400 L1228,-400 L1226,20 C1232,100 1264,150 1252,214 C1244,262 1228,300 1236,336 ' +
  'C1246,420 1224,500 1232,580 C1238,662 1212,732 1152,792 C1092,842 1002,862 902,874 ' +
  'L822,880 C700,890 600,905 480,915 L-400,925 Z';

/** Container-terminal island off the east coast. */
export const ISLAND_PATH =
  'M1287,236 C1304,232 1320,300 1318,400 C1316,520 1326,640 1304,744 C1296,776 1276,772 1278,726 ' +
  'C1286,604 1280,484 1282,384 C1283,300 1272,242 1287,236 Z';

/** Inland water drawn over land (stroked paths). */
export const RIVER_PATH = 'M1262,346 C1152,362 1080,318 1000,334 C930,348 884,330 842,324';
export const CANAL_PATH = 'M846,334 C856,250 832,164 848,84 C858,20 852,-40 852,-400';

/** Territories — polygons are clipped to land ∪ island at render time, so they may overshoot the coast. */
export const TERRITORIES = {
  nh1: {
    // south coast
    poly: [[360, 660], [640, 560], [1000, 700], [1700, 700], [1700, 1300], [300, 1300]],
    label: [600, 700],
  },
  nh2: {
    // east coast + port island
    poly: [[560, 300], [842, 324], [1700, 346], [1700, 700], [1000, 700], [640, 560]],
    label: [1000, 392],
  },
  nh3: {
    // inland west
    poly: [[-400, -400], [260, -400], [260, 180], [560, 300], [640, 560], [360, 660], [300, 1300], [-400, 1300]],
    label: [150, 440],
  },
  nh4: {
    // northern ridge
    poly: [[260, -400], [846, -400], [846, 324], [560, 300], [260, 180]],
    label: [590, 40],
  },
  downtown: {
    poly: [[846, -400], [1700, -400], [1700, 346], [846, 324]],
    label: [1040, 296],
  },
};

/** Node positions (world units). */
export const NODES = {
  // nh1 Sunset Strand (south beach)
  nh1_s1: [470, 780], // Coquina Plaza Lot
  nh1_s2: [650, 846], // Boardwalk Row
  nh1_s3: [990, 822], // Pelican Pier
  nh1_boss: [790, 740],

  // nh2 Rustwater Docks (east port)
  nh2_s1: [1110, 450], // Container Row
  nh2_s2: [1300, 560], // Customs Wharf (terminal island)
  nh2_s3: [760, 430], // Scrapyard Lane
  nh2_boss: [940, 580],

  // nh3 Neon Mile (inland west)
  nh3_s1: [150, 250], // Flamingo Boulevard
  nh3_s2: [420, 400], // Ocean Mile Drag
  nh3_s3: [200, 730], // Mirage Row
  nh3_boss: [290, 540],

  // nh4 Crown Hills (north ridge)
  nh4_s1: [640, 250], // Gatehouse Road — the only way in
  nh4_s2: [370, 90], // Polo Grounds Lane
  nh4_s3: [720, 100], // Sermon Hill Drive
  nh4_boss: [540, 150],

  city_boss: [1040, 170],
};

/** Roads between nodes: [a, b, bend] (bend = perpendicular offset of the curve, world units). */
export const ROADS = [
  // inside neighborhoods: the boss is the hub
  ['nh1_boss', 'nh1_s1', 30], ['nh1_boss', 'nh1_s2', -24], ['nh1_boss', 'nh1_s3', -20],
  ['nh2_boss', 'nh2_s1', 24], ['nh2_boss', 'nh2_s2', 36], ['nh2_boss', 'nh2_s3', -20],
  ['nh3_boss', 'nh3_s1', -40], ['nh3_boss', 'nh3_s2', 20], ['nh3_boss', 'nh3_s3', -24],
  ['nh4_boss', 'nh4_s1', -18], ['nh4_boss', 'nh4_s2', 16], ['nh4_boss', 'nh4_s3', -26],
  // between neighborhoods (per adjacency)
  ['nh1_s1', 'nh3_s3', -30], // nh1–nh3
  ['nh1_boss', 'nh2_s3', 30], // nh1–nh2
  ['nh3_s2', 'nh2_s3', -24], // nh3–nh2
  ['nh3_s2', 'nh4_s1', 30], // nh3–nh4
  ['nh2_s3', 'nh4_s1', -18], // nh2–nh4
  ['nh4_s3', 'city_boss', -34], // nh4–downtown (bridge over the canal)
];

/** Decorative highways (traffic dots run along these). */
export const HIGHWAYS = [
  { id: 'hw_ns', d: 'M250,-80 C300,120 470,250 470,420 C470,600 560,700 548,910', lanes: 2 },
  { id: 'hw_ew', d: 'M-80,610 C250,590 420,520 640,500 C860,480 1050,504 1230,480 L1284,476', lanes: 2 },
  {
    id: 'hw_coast',
    d: 'M1190,-60 C1196,80 1222,160 1212,230 C1202,300 1198,380 1196,460 C1194,560 1202,660 1150,746 C1100,820 1000,836 880,848 C760,860 600,872 380,884',
    lanes: 1,
  },
];

/* ---------------- deterministic decoration ---------------- */

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r1 = (v) => +v.toFixed(1);
const near = (x, y, pts, r) => pts.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < r * r);
const NODE_PTS = Object.values(NODES);

/** Approximate south-coast y for a given x (for placing beach props). */
const SOUTH_COAST = [[300, 919], [480, 915], [600, 905], [700, 890], [822, 880], [902, 874], [1002, 862], [1092, 842], [1152, 792]];
function coastY(x) {
  for (let i = 1; i < SOUTH_COAST.length; i++) {
    const [x0, y0] = SOUTH_COAST[i - 1];
    const [x1, y1] = SOUTH_COAST[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return SOUTH_COAST[SOUTH_COAST.length - 1][1];
}

/** Downtown skyline blocks: { x, y, w, h, z } — z = height used for the fake extrusion/shadow. */
export const BUILDINGS = (() => {
  const r = rng(7);
  const out = [];
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 9; gx++) {
      const x = 872 + gx * 36 + (gy % 2) * 6;
      const y = 8 + gy * 36;
      if (x > 1196 - (gy > 5 ? 16 : 0)) continue;
      if (y > 292) continue;
      if (near(x + 14, y + 14, [NODES.city_boss], 62)) continue;
      if (r() < 0.12) continue; // plazas
      const w = 18 + r() * 12;
      const h = 18 + r() * 12;
      const dc = Math.hypot(x - NODES.city_boss[0], y - NODES.city_boss[1]);
      const z = 3 + r() * 6 + Math.max(0, 180 - dc) / 18;
      out.push({ x: r1(x), y: r1(y), w: r1(w), h: r1(h), z: r1(z) });
    }
  }
  return out;
})();

/** Low-rise city blocks: { x, y, w, h, tone } — tone: 'neon' | 'warehouse' | 'condo'. */
export const BLOCKS = (() => {
  const r = rng(21);
  const out = [];
  const areas = [
    // [x, y, w, h, tone, density, minSize, sizeVar]
    [20, 60, 360, 820, 'neon', 5200, 8, 12],
    [380, 610, 760, 220, 'condo', 4200, 8, 10],
    [880, 370, 300, 320, 'warehouse', 3600, 14, 16],
    [600, 360, 280, 180, 'warehouse', 4600, 10, 12],
  ];
  for (const [ax, ay, aw, ah, tone, dens, mn, vr] of areas) {
    const n = Math.round((aw * ah) / dens);
    for (let i = 0; i < n; i++) {
      const x = ax + r() * aw;
      const y = ay + r() * ah;
      if (near(x, y, NODE_PTS, 46)) continue;
      if (x > 1180) continue;
      if (y > coastY(x) - 40) continue;
      if (Math.abs(y - (344 - (x - 842) * 0.01)) < 26 && x > 830) continue; // river
      if (tone === 'neon' && Math.abs(x - (120 + ((y - 100) * 140) / 800)) < 22) continue; // the strip itself
      out.push({ x: r1(x), y: r1(y), w: r1(mn + r() * vr), h: r1(mn * 0.9 + r() * vr * 0.8), tone });
    }
  }
  return out;
})();

/* --- nh1 Sunset Strand: beach props --- */
export const PALMS = (() => {
  const out = [];
  for (let x = 380; x < 1120; x += 28) out.push([r1(x), r1(coastY(x) - 22 + Math.sin(x / 37) * 3)]);
  return out;
})();
export const UMBRELLAS = (() => {
  const r = rng(11);
  const cols = ['#ff5fa2', '#ffd36b', '#29e3d6', '#ff9a3c', '#ffffff'];
  const out = [];
  for (let x = 420; x < 1100; x += 22 + r() * 18) out.push([r1(x), r1(coastY(x) - 9 + r() * 4), cols[Math.floor(r() * cols.length)]]);
  return out;
})();
/** Pelican Pier: [x, y, w, h] + a ferris wheel at its end. */
export const PIER = [982, 858, 16, 82];
export const FERRIS = [990, 952, 17];

/* --- nh2 Rustwater Docks: port --- */
export const CONTAINERS = (() => {
  const r = rng(3);
  const cols = ['#d8573c', '#2d8fb8', '#e2a93b', '#6f5ab8', '#3fa37a', '#c9486c'];
  const out = [];
  // terminal island: vertical stacks in two columns
  for (let y = 270; y < 720; y += 13) {
    for (const x of [1288, 1298]) {
      if (near(x, y, [NODES.nh2_s2], 30) || r() < 0.18) continue;
      out.push({ x, y: r1(y), w: 7, h: 11, c: cols[Math.floor(r() * cols.length)] });
    }
  }
  // mainland yard (Container Row)
  for (let i = 0; i < 30; i++) {
    const x = 1130 + (i % 5) * 12;
    const y = 520 + Math.floor(i / 5) * 24;
    if (near(x, y, NODE_PTS, 30) || r() < 0.2) continue;
    out.push({ x, y, w: 8, h: 20, c: cols[Math.floor(r() * cols.length)] });
  }
  return out;
})();
/** Gantry cranes on the island's sea edge: [x, y] (boom points east over the water). */
export const CRANES = [[1318, 330], [1318, 440], [1322, 640], [1316, 700]];
/** Docked cargo ships: [x, y, len] (vertical, east of the island). */
export const SHIPS = [[1346, 300, 110], [1352, 600, 120]];

/* --- nh3 Neon Mile: the strip --- */
export const NEON_STRIP = 'M120,100 L260,900';
export const NEON_SIGNS = (() => {
  const cols = ['#ff5fa2', '#a259ff', '#f9f871', '#29e3d6'];
  const out = [];
  for (let i = 0; i < 26; i++) {
    const t = (i + 0.5) / 26;
    const x = 120 + 140 * t;
    const y = 100 + 800 * t;
    const side = i % 2 ? 1 : -1;
    if (near(x, y, NODE_PTS, 34)) continue;
    out.push([r1(x + side * 12), r1(y), cols[i % cols.length]]);
  }
  return out;
})();

/* --- nh4 Crown Hills: ridge contours, mansions, polo field, helipad --- */
export const CONTOURS = [
  'M300,120 C330,40 470,10 600,26 C720,40 800,90 780,170 C760,240 640,250 520,236 C400,222 280,200 300,120Z',
  'M360,128 C380,72 480,52 590,62 C690,72 740,110 724,164 C706,214 610,214 520,204 C430,194 344,178 360,128Z',
  'M430,136 C444,100 510,90 580,98 C650,106 672,130 660,160 C646,188 590,188 530,182 C470,176 420,166 430,136Z',
];
export const MANSIONS = (() => {
  const r = rng(5);
  const out = [];
  for (let i = 0; i < 40 && out.length < 16; i++) {
    const x = 290 + r() * 520;
    const y = 20 + r() * 220;
    // stay within the nh4 wedge (above the E–F border)
    if (y > 180 + ((x - 260) * 120) / 300 - 26) continue;
    if (x > 820) continue;
    if (near(x, y, NODE_PTS, 44) || near(x, y, out.map((m) => [m.x, m.y]), 40)) continue;
    if (x > 250 && x < 400 && y < 70) continue; // polo field
    out.push({ x: r1(x), y: r1(y), w: r1(14 + r() * 8), h: r1(10 + r() * 6), pool: r() < 0.7 });
  }
  return out;
})();
export const POLO = [270, 22, 86, 44];
export const HELIPAD = [780, 176, 11];

/** Parks / lawns (ellipses): [cx, cy, rx, ry, rot]. */
export const PARKS = [
  [70, 560, 50, 90, -12],
  [60, 110, 36, 50, 20],
  [980, 252, 26, 18, 0],
  [560, 60, 60, 26, 6],
  [690, 190, 36, 20, -8],
  [320, 850, 60, 26, 4],
];

/** Boats in the ocean: [x, y, rot]. */
export const BOATS = [
  [1420, 420, -80], [1450, 700, 200], [1360, 880, 160], [1120, 930, 190], [1470, 190, -60], [800, 970, 170], [1060, 960, 120],
];

/** Everything combined, for convenience. */
export const LAYOUT = {
  WORLD, FIT_BOX, LAND_PATH, ISLAND_PATH, RIVER_PATH, CANAL_PATH, TERRITORIES, NODES, ROADS, HIGHWAYS,
  BUILDINGS, BLOCKS, PALMS, UMBRELLAS, PIER, FERRIS, CONTAINERS, CRANES, SHIPS, NEON_STRIP, NEON_SIGNS,
  CONTOURS, MANSIONS, POLO, HELIPAD, PARKS, BOATS,
};
export default LAYOUT;
