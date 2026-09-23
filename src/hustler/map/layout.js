// Hustler Mode city map — static geometry (world units, 1600 x 1000 canvas).
// Pure data + a few deterministic generators for decoration. No game rules here.
//
// Geography (Vice City parody):   ocean to the EAST and SOUTH-EAST
//   nh4 midtown (north-west of downtown)   downtown  = island-ish skyline district, NE (river + canal)
//   nh2 inland west (glades / suburbs)      nh3       = beach strip + barrier island, east coast
//   nh1 the docks (south coast, start)
// Neighborhood adjacency drawn: nh1–nh2, nh1–nh3, nh2–nh3, nh2–nh4, nh3–nh4, nh4–downtown.

export const WORLD = { w: 1600, h: 1000 };

/** The area "fit to city" frames (world units). */
export const FIT_BOX = { x: 40, y: 20, w: 1330, h: 920 };

/** Mainland (everything west of the coastline). */
export const LAND_PATH =
  'M-400,-400 L1228,-400 L1226,20 C1232,100 1264,150 1252,214 C1244,262 1228,300 1236,336 ' +
  'C1246,420 1224,500 1232,580 C1238,662 1212,732 1152,792 C1092,842 1002,862 902,874 ' +
  'L822,880 C700,890 600,905 480,915 L-400,925 Z';

/** Barrier island (the beach strip) off the east coast. */
export const ISLAND_PATH =
  'M1287,236 C1304,232 1320,300 1318,400 C1316,520 1326,640 1304,744 C1296,776 1276,772 1278,726 ' +
  'C1286,604 1280,484 1282,384 C1283,300 1272,242 1287,236 Z';

/** Inland water drawn over land (stroked paths). */
export const RIVER_PATH = 'M1262,346 C1152,362 1080,318 1000,334 C930,348 884,330 842,324';
export const CANAL_PATH = 'M846,334 C856,250 832,164 848,84 C858,20 852,-40 852,-400';

/** Territories — polygons are clipped to land ∪ island at render time, so they may overshoot the coast. */
export const TERRITORIES = {
  nh1: {
    poly: [[360, 660], [640, 560], [1000, 700], [1700, 700], [1700, 1300], [300, 1300]],
    label: [640, 760],
    lock: [640, 800],
  },
  nh2: {
    poly: [[-400, -400], [260, -400], [260, 180], [560, 300], [640, 560], [360, 660], [300, 1300], [-400, 1300]],
    label: [150, 420],
    lock: [220, 470],
  },
  nh3: {
    poly: [[560, 300], [842, 324], [1700, 346], [1700, 700], [1000, 700], [640, 560]],
    label: [1110, 610],
    lock: [960, 500],
  },
  nh4: {
    poly: [[260, -400], [846, -400], [846, 324], [560, 300], [260, 180]],
    label: [470, 40],
    lock: [540, 160],
  },
  downtown: {
    poly: [[846, -400], [1700, -400], [1700, 346], [846, 324]],
    label: [1040, 300],
    lock: [1040, 170],
  },
};

/** Node positions (world units). */
export const NODES = {
  nh1_s1: [470, 790],
  nh1_s2: [700, 670],
  nh1_s3: [1050, 770],
  nh1_boss: [800, 810],

  nh2_s1: [150, 250],
  nh2_s2: [420, 400],
  nh2_s3: [200, 730],
  nh2_boss: [300, 540],

  nh3_s1: [760, 430],
  nh3_s2: [1100, 440],
  nh3_s3: [1300, 560],
  nh3_boss: [930, 570],

  nh4_s1: [370, 90],
  nh4_s2: [720, 100],
  nh4_s3: [640, 250],
  nh4_boss: [540, 150],

  city_boss: [1040, 170],
};

/** Roads between nodes: [a, b, bend] (bend = perpendicular offset of the curve, world units). */
export const ROADS = [
  // inside neighborhoods: boss is the hub
  ['nh1_boss', 'nh1_s1', 30], ['nh1_boss', 'nh1_s2', -20], ['nh1_boss', 'nh1_s3', 24],
  ['nh2_boss', 'nh2_s1', -40], ['nh2_boss', 'nh2_s2', 20], ['nh2_boss', 'nh2_s3', -24],
  ['nh3_boss', 'nh3_s1', 20], ['nh3_boss', 'nh3_s2', -30], ['nh3_boss', 'nh3_s3', 36],
  ['nh4_boss', 'nh4_s1', 16], ['nh4_boss', 'nh4_s2', -26], ['nh4_boss', 'nh4_s3', 18],
  // between neighborhoods (per adjacency)
  ['nh1_s1', 'nh2_s3', -30],
  ['nh1_s2', 'nh3_s1', 26],
  ['nh2_s2', 'nh3_s1', -24],
  ['nh2_s2', 'nh4_s3', 30],
  ['nh3_s1', 'nh4_s3', -18],
  ['nh4_s2', 'city_boss', -34],
];

/** Decorative highways (traffic dots run along these). */
export const HIGHWAYS = [
  { id: 'hw_ns', d: 'M250,-80 C300,120 470,250 470,420 C470,600 560,700 548,910', lanes: 2 },
  { id: 'hw_ew', d: 'M-80,610 C250,590 420,520 640,500 C860,480 1050,504 1230,480 L1284,476', lanes: 2 },
  {
    id: 'hw_coast',
    d: 'M1190,-60 C1196,80 1222,160 1212,230 C1202,300 1198,380 1196,460 C1194,560 1202,660 1150,746 C1100,820 1000,836 880,848',
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

const near = (x, y, pts, r) => pts.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < r * r);
const NODE_PTS = Object.values(NODES);

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
      out.push({ x: +x.toFixed(1), y: +y.toFixed(1), w: +w.toFixed(1), h: +h.toFixed(1), z: +z.toFixed(1) });
    }
  }
  return out;
})();

/** Lower-rise blocks scattered over the rest of the mainland (avoid nodes, water and the coast). */
export const BLOCKS = (() => {
  const r = rng(21);
  const out = [];
  const areas = [
    [290, 20, 540, 270], // midtown
    [600, 360, 1180, 300], // beach side
    [380, 600, 780, 250], // docks hinterland
    [20, 60, 380, 820], // west
  ];
  for (const [ax, ay, aw, ah] of areas) {
    const n = Math.round((aw * ah) / 5200);
    for (let i = 0; i < n; i++) {
      const x = ax + r() * aw;
      const y = ay + r() * ah;
      if (near(x, y, NODE_PTS, 46)) continue;
      if (x > 1180 || y > 850) continue;
      if (Math.abs(y - (344 - (x - 842) * 0.01)) < 26 && x > 830) continue; // river
      if (Math.abs(x - 848) < 20 && y < 340) continue; // canal
      out.push({
        x: +x.toFixed(1),
        y: +y.toFixed(1),
        w: +(8 + r() * 12).toFixed(1),
        h: +(8 + r() * 10).toFixed(1),
      });
    }
  }
  return out;
})();

/** Docks: piers sticking into the sea + container stacks + gantry cranes. */
export const PIERS = [
  [640, 896, 16, 64], [720, 888, 16, 70], [800, 878, 18, 76], [880, 872, 16, 70], [960, 862, 16, 62],
];
export const CONTAINERS = (() => {
  const r = rng(3);
  const cols = ['#d8573c', '#2d8fb8', '#e2a93b', '#6f5ab8', '#3fa37a', '#c9486c'];
  const out = [];
  for (let i = 0; i < 26; i++) {
    const x = 610 + (i % 13) * 28 + r() * 4;
    const y = 842 + Math.floor(i / 13) * 12 + (i % 13 > 8 ? -8 : 0);
    if (near(x, y, [NODES.nh1_boss], 40)) continue;
    out.push({ x: +x.toFixed(1), y: +y.toFixed(1), c: cols[Math.floor(r() * cols.length)] });
  }
  return out;
})();
export const CRANES = [[690, 866], [850, 858], [930, 852]];

/** Palms along the beach + island. */
export const PALMS = (() => {
  const out = [];
  for (let y = 280; y < 740; y += 26) out.push([1292 + Math.sin(y / 40) * 6, y]);
  for (let y = 380; y < 700; y += 34) out.push([1214 + Math.sin(y / 30) * 4, y]);
  return out.map(([x, y]) => [+x.toFixed(1), y]);
})();

/** Parks / wetlands (ellipses): [cx, cy, rx, ry, rot]. */
export const PARKS = [
  [80, 560, 70, 110, -12],
  [60, 120, 40, 60, 20],
  [280, 860, 90, 34, 4],
  [980, 250, 26, 18, 0],
  [640, 120, 30, 20, 10],
  [1050, 640, 40, 20, -10],
];

/** Boats in the ocean: [x, y, rot]. */
export const BOATS = [
  [1380, 380, -80], [1440, 640, 200], [1360, 860, 160], [1100, 930, 190], [1470, 190, -60], [760, 965, 170],
];

/** Everything combined, for convenience. */
export const LAYOUT = {
  WORLD, FIT_BOX, LAND_PATH, ISLAND_PATH, RIVER_PATH, CANAL_PATH, TERRITORIES, NODES, ROADS, HIGHWAYS,
  BUILDINGS, BLOCKS, PIERS, CONTAINERS, CRANES, PALMS, PARKS, BOATS,
};
export default LAYOUT;
