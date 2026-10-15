// Equipment: the full club catalogue, head designs and golf balls, with the
// numbers that make each one play as it does.
//
// Sources for the figures (October 2026):
//  - launch, spin and speed by club: TrackMan tour averages (DR 167 mph /
//    10.9° / 2686 rpm ... PW 102 / 24.2 / 9304), scaled to the game's
//    single-digit amateur baseline (js/data/clubs.js)
//  - smash factor by loft: USGA Golfer Performance Measurement (driver 1.43,
//    7-iron 1.37, PW 1.21 for amateurs; tour driver ~1.49)
//  - ball covers: MyGolfSpy 2026 ball test. Urethane outspins ionomer by
//    ~3,200 rpm on a full dry wedge (10,339 vs 7,079) and ~1,900 rpm on a
//    35-yard pitch (5,415 vs 3,506); wet, urethane keeps ~90% of its spin,
//    ionomer ~55%. Off the driver the cover barely matters; compression
//    matched to swing speed does.
//  - range balls: US 7,909,711. A low-resilience core (~60% of the loss)
//    and an inefficient dimple pattern (~40%)
//  - off-centre strikes: MyGolfSpy impact-location study (high-face driver
//    hits lose 6+ mph); gear effect strong in woods, weak in irons (Titleist)

// ── the catalogue: every club a bag can hold ──
// ballMph/launch/spin are a pure strike at full swing with the stock head;
// carry is the stock carry in yards (club suggestions, the club rail).
export const CATALOGUE = [
  { id: 'DR9', kind: 'driver', name: 'Driver 9°', short: 'D9', loft: 9, ballMph: 163, launch: 10.6, spin: 2450, clubMph: 110, smash: 1.48, dispersion: 1.05, carry: 258 },
  { id: 'DR', kind: 'driver', name: 'Driver 10.5°', short: 'DR', loft: 10.5, ballMph: 162, launch: 11.8, spin: 2650, clubMph: 110, smash: 1.47, dispersion: 1.0, carry: 255 },
  { id: 'DR12', kind: 'driver', name: 'Driver 12°', short: 'D12', loft: 12, ballMph: 160, launch: 13.2, spin: 2900, clubMph: 109, smash: 1.46, dispersion: 0.95, carry: 250 },
  { id: '3W', kind: 'wood', name: '3 Wood', short: '3W', loft: 15, ballMph: 152, launch: 11.2, spin: 3500, clubMph: 104, smash: 1.46, dispersion: 0.9, carry: 235 },
  { id: '5W', kind: 'wood', name: '5 Wood', short: '5W', loft: 18, ballMph: 147, launch: 11.9, spin: 4300, clubMph: 101, smash: 1.45, dispersion: 0.86, carry: 222 },
  { id: '7W', kind: 'wood', name: '7 Wood', short: '7W', loft: 21, ballMph: 141, launch: 13.4, spin: 4900, clubMph: 98, smash: 1.44, dispersion: 0.82, carry: 210 },
  { id: '3H', kind: 'hybrid', name: '3 Hybrid', short: '3H', loft: 19, ballMph: 142, launch: 11.6, spin: 4500, clubMph: 98, smash: 1.44, dispersion: 0.84, carry: 212 },
  { id: '4H', kind: 'hybrid', name: '4 Hybrid', short: '4H', loft: 22, ballMph: 137, launch: 12.4, spin: 4900, clubMph: 95, smash: 1.43, dispersion: 0.8, carry: 202 },
  { id: '3I', kind: 'iron', name: '3 Iron', short: '3i', loft: 20, ballMph: 138, launch: 10.8, spin: 4600, clubMph: 96, smash: 1.42, dispersion: 0.9, carry: 205 },
  { id: '4I', kind: 'iron', name: '4 Iron', short: '4i', loft: 22, ballMph: 135, launch: 11.6, spin: 4900, clubMph: 93, smash: 1.4, dispersion: 0.85, carry: 200 },
  { id: '5I', kind: 'iron', name: '5 Iron', short: '5i', loft: 24, ballMph: 132, launch: 12.6, spin: 5200, clubMph: 90, smash: 1.38, dispersion: 0.8, carry: 195 },
  { id: '6I', kind: 'iron', name: '6 Iron', short: '6i', loft: 27, ballMph: 126, launch: 14.4, spin: 6100, clubMph: 88, smash: 1.37, dispersion: 0.75, carry: 182 },
  { id: '7I', kind: 'iron', name: '7 Iron', short: '7i', loft: 31, ballMph: 120, launch: 16.4, spin: 6900, clubMph: 86, smash: 1.36, dispersion: 0.7, carry: 168 },
  { id: '8I', kind: 'iron', name: '8 Iron', short: '8i', loft: 35, ballMph: 113, launch: 18.4, spin: 7700, clubMph: 83, smash: 1.33, dispersion: 0.65, carry: 157 },
  { id: '9I', kind: 'iron', name: '9 Iron', short: '9i', loft: 39, ballMph: 107, launch: 20.6, spin: 8400, clubMph: 81, smash: 1.3, dispersion: 0.6, carry: 145 },
  { id: 'PW', kind: 'wedge', name: 'Pitching Wedge', short: 'PW', loft: 45, ballMph: 99, launch: 24.5, spin: 9200, clubMph: 78, smash: 1.25, dispersion: 0.55, carry: 128 },
  { id: 'GW', kind: 'wedge', name: 'Gap Wedge 50°', short: 'GW', loft: 50, ballMph: 91, launch: 27.5, spin: 9500, clubMph: 75, smash: 1.2, dispersion: 0.52, carry: 113 },
  { id: 'SW', kind: 'wedge', name: 'Sand Wedge 56°', short: 'SW', loft: 56, ballMph: 78, launch: 31, spin: 9800, clubMph: 70, smash: 1.12, dispersion: 0.5, carry: 95 },
  { id: 'LW', kind: 'wedge', name: 'Lob Wedge 60°', short: 'LW', loft: 60, ballMph: 70, launch: 34, spin: 10000, clubMph: 67, smash: 1.05, dispersion: 0.5, carry: 80 },
];

/** The bag: up to 14 clubs (the Rules' limit). The stock bag, longest first. */
export const STOCK_BAG = ['DR', '3W', '5W', '4H', '5I', '6I', '7I', '8I', '9I', 'PW', 'GW', 'SW', 'LW'];
export const BAG_LIMIT = 14;

// ── head designs ──
// smash: added to smash factor (ball speed per club speed); launch: degrees;
// spin: multiplier; forgive: how much of a mis-hit's speed and line it saves
// (1 = stock; higher = higher MOI); work: how much face/path turns the ball.
export const HEADS = {
  driver: [
    { id: 'max', name: 'Max forgiveness', note: 'High MOI, back-weighted: higher launch and spin, mis-hits keep their speed', smash: -0.005, launch: 0.6, spin: 1.08, forgive: 1.3, work: 0.85 },
    { id: 'std', name: 'Standard', note: 'Neutral weighting', smash: 0, launch: 0, spin: 1, forgive: 1, work: 1 },
    { id: 'tour', name: 'Tour low-spin', note: 'Forward CG: lower spin and a flatter flight, less forgiving', smash: 0.008, launch: -0.5, spin: 0.86, forgive: 0.75, work: 1.15 },
  ],
  iron: [
    { id: 'gi', name: 'Game improvement', note: 'Thin hot face, wide sole, low CG: faster off the face, higher, very forgiving', smash: 0.02, launch: 1.2, spin: 0.92, forgive: 1.35, work: 0.8 },
    { id: 'players', name: "Players' cavity", note: 'The middle ground', smash: 0, launch: 0, spin: 1, forgive: 1, work: 1 },
    { id: 'blade', name: 'Forged blade', note: 'Compact muscle back: precise and workable, punishing off-centre', smash: -0.01, launch: -0.5, spin: 1.03, forgive: 0.6, work: 1.2 },
  ],
};

// ── golf balls ──
// comp: compression; speed(clubMph): ball-speed factor from compression vs
// swing speed; spinK: spin multiplier by loft (driver → wedge, interpolated);
// cd/cl: aerodynamic drag and lift scale; grip: how much the cover's
// friction lets backspin bite on landing; wetKeep: spin kept when wet.
export const BALLS = [
  {
    id: 'tour', name: 'Tour urethane', sub: '4-piece · urethane cover · compression 90', comp: 90,
    spinK: [1, 1, 1], cd: 1, cl: 1, grip: 1, wetKeep: 0.9, speedLoss: 0,
  },
  {
    id: 'tourx', name: 'Tour X', sub: '4-piece · firm urethane · compression 100 · for fast swings', comp: 100,
    spinK: [1.05, 1.04, 1.03], cd: 0.99, cl: 0.97, grip: 1.02, wetKeep: 0.9, speedLoss: 0,
  },
  {
    id: 'softur', name: 'Soft urethane', sub: '3-piece · soft urethane · compression 70', comp: 70,
    spinK: [0.97, 0.97, 0.97], cd: 1, cl: 1.02, grip: 0.97, wetKeep: 0.88, speedLoss: 0,
  },
  {
    id: 'distance', name: 'Ionomer distance', sub: '2-piece · Surlyn cover · compression 85 · low spin, long', comp: 85,
    spinK: [0.94, 0.85, 0.68], cd: 1.0, cl: 0.98, grip: 0.7, wetKeep: 0.55, speedLoss: 0,
  },
  {
    id: 'soft', name: 'Low-compression soft', sub: '2-piece · ionomer · compression 40 · for slower swings', comp: 40,
    spinK: [0.92, 0.85, 0.75], cd: 1.0, cl: 1.0, grip: 0.75, wetKeep: 0.55, speedLoss: 0,
  },
  {
    id: 'range', name: 'Range ball', sub: 'Durable 2-piece · low-resilience core, thick cover · about 8–12% shorter', comp: 80,
    spinK: [0.9, 0.85, 0.75], cd: 1.05, cl: 0.96, grip: 0.65, wetKeep: 0.5, speedLoss: 0.035,
  },
  {
    id: 'limited', name: 'Limited flight', sub: 'Range ball for short ranges · low-resilience core, inefficient dimples · about 25% shorter', comp: 70,
    spinK: [0.9, 0.85, 0.75], cd: 1.22, cl: 0.88, grip: 0.6, wetKeep: 0.5, speedLoss: 0.08,
  },
];

// ── branded sets: how players actually buy clubs ──
// Tongue-in-cheek brands (a wink at the real makers, not them), each modelled on
// a real kind of bag and its published specs
// (lofts, lengths, head designs). The names live here alone, so licensed names
// could replace them. iron/finish/wood are the look (js/scene/club.js);
// ironLofts: degrees stronger than traditional (game-improvement irons are
// jacked: a 28° 7-iron); woods: 'persimmon' plays as the old wooden heads did.
export const SETS = [
  {
    id: 'tour', brand: 'Titlewest', model: 'Pro V-Neck MB', blurb: 'A tour player\'s bag: forged chrome muscle-backs, a low-spin 9° titanium driver, three wedges.',
    spec: 'DR 9° tour · 3W · 3H · 4–PW forged blades · 50/56/60', driverHead: 'tour', ironHead: 'blade', ironLofts: 0,
    bag: ['DR9', '3W', '3H', '4I', '5I', '6I', '7I', '8I', '9I', 'PW', 'GW', 'SW', 'LW'],
    iron: 'blade', finish: 'chrome', wood: 'titanium',
  },
  {
    id: 'cavity', brand: 'Pong', model: 'i-Ish CB', blurb: 'The good amateur\'s bag: satin players\' cavity-backs, a neutral driver, a 4-hybrid for the long irons.',
    spec: 'DR 10.5° · 3W · 5W · 4H · 5–PW cavity backs · 50/56/60', driverHead: 'std', ironHead: 'players', ironLofts: 0,
    bag: ['DR', '3W', '5W', '4H', '5I', '6I', '7I', '8I', '9I', 'PW', 'GW', 'SW', 'LW'],
    iron: 'cavity', finish: 'satin', wood: 'titanium',
  },
  {
    id: 'gi', brand: 'Callaweigh', model: 'Big Birdie OS', blurb: 'Built to be easy: a 12° max-forgiveness driver, high-launching woods and hybrids, wide-soled irons with strong lofts.',
    spec: 'DR 12° max · 5W · 7W · 3H · 4H · 6–PW game improvement (7i 28°) · 50/56', driverHead: 'max', ironHead: 'gi', ironLofts: 3,
    bag: ['DR12', '5W', '7W', '3H', '4H', '6I', '7I', '8I', '9I', 'PW', 'GW', 'SW'],
    iron: 'cavity', finish: 'satin', wood: 'titanium',
  },
  {
    id: 'black', brand: 'TaylerMaid', model: 'Stealthy Black', blurb: 'The same tour bag in black PVD with stealth shafts.',
    spec: 'DR 10.5° tour · 3W · 5W · 4–PW forged blades · 50/56/60', driverHead: 'tour', ironHead: 'blade', ironLofts: 0,
    bag: ['DR', '3W', '5W', '4I', '5I', '6I', '7I', '8I', '9I', 'PW', 'GW', 'SW', 'LW'],
    iron: 'blade', finish: 'black', wood: 'carbon',
  },
  {
    id: 'persimmon', brand: 'MacGreggor', model: 'Tourney 1975', blurb: 'Persimmon woods with brass sole plates, chrome blades and leather grips. The woods are small and slow off the face, as they were.',
    spec: 'DR 11° persimmon · 3W · 4W · 2–9 blades · PW · SW', driverHead: 'std', ironHead: 'blade', ironLofts: -2, woods: 'persimmon',
    bag: ['DR', '3W', '5W', '3I', '4I', '5I', '6I', '7I', '8I', '9I', 'PW', 'SW'],
    iron: 'blade', finish: 'chrome', wood: 'persimmon',
  },
  {
    id: 'hockey', brand: 'Happy Gilmour', model: 'Hockey Stick', blurb: 'One taped wooden hockey stick for every shot. Plays like the stock bag; looks like nothing else.',
    spec: 'Stock numbers, a hockey stick to look at', driverHead: 'std', ironHead: 'players', ironLofts: 0,
    bag: ['DR', '3W', '5W', '4H', '5I', '6I', '7I', '8I', '9I', 'PW', 'GW', 'SW', 'LW'], hockey: true,
  },
];
export const setById = (id) => SETS.find((x) => x.id === id) || SETS[1];

export const ballById = (id) => BALLS.find((b) => b.id === id) || BALLS[0];
export const headById = (kind, id) => (HEADS[kind] || []).find((h) => h.id === id) || (HEADS[kind] || [])[1] || null;

/**
 * Ball speed from compression against swing speed: a ball is fastest when the
 * swing compresses it fully. A firm ball loses a little at slow speeds, a soft
 * one at fast speeds (about a percent either way, as robot tests show).
 */
export function ballSpeedFactor(ball, clubMph) {
  const ideal = 60 + (ball.comp - 40) * 0.95; // club mph that suits this compression (40 → 60 mph, 100 → 117 mph)
  const off = (clubMph - ideal) / 40;
  return (1 - ball.speedLoss) * (1 - 0.012 * off * off);
}

/** Spin multiplier for a loft: low lofts use spinK[0], mid irons [1], wedges [2]. */
export function ballSpinFactor(ball, loft) {
  const [a, b, c] = ball.spinK;
  if (loft <= 15) return a;
  if (loft <= 33) return a + (b - a) * (loft - 15) / 18;
  return b + (c - b) * Math.min(1, (loft - 33) / 23);
}
