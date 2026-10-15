// Alton, Illinois: nine holes on the real ground of both banks of the
// Mississippi at the Clark Bridge (USGS 3DEP elevation). Six on the Alton
// side, from below the grain elevators past the Argosy, the Riverfront Park
// amphitheater and the marina, then along Russell Commons beyond the bridge;
// three over the bridge in Missouri at Lincoln Shields, finishing at the
// observation tower on the point with downtown Alton across the water.
// Hole points are DEM-frame metres (+x east, +z south, origin 38.8844°N
// 90.1777°W), routed over open ground on the OpenStreetMap land cover. The
// riverfront itself (bridge, casino, elevators, marina, amphitheater, the
// town's buildings and streets, Lincoln Shields) is js/course/lm/riverfront.js,
// placed at the amphitheater and turned square to the shore.
export default {
  id: 'alton',
  name: 'Alton Riverfront',
  place: 'Alton, Illinois · West Alton, Missouri',
  theme: 'parkland',
  dem: true,
  enrich: true, // design pass: bunkering, greenside sand, shaping (js/course/design.js)
  blurb: 'Nine holes along the Mississippi at the Clark Bridge: the Argosy, the grain elevators and the marina, then across to Lincoln Shields.',
  credit: 'Elevation: USGS 3DEP via AWS Terrain Tiles; map data © OpenStreetMap contributors; ground colour: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0',
  // the pool above Melvin Price Locks and Dam reads 126.9 m on the DEM
  waterLevel: 127.3,
  waterTint: 0x4f5240,
  far: [
    // the whole riverfront, laid out from the amphitheater in its own frame
    // (+x inland to the north-east, +z downstream): a turn of 0.907 rad
    { type: 'riverfront', ll: [38.8877, -90.1814], maxD: Infinity, rot: 0.907 },
  ],
  holes: [
    {
      n: 1, name: 'The Argosy', par: 4,
      note: 'The Alton Belle, the Argosy\'s first boat, opened in 1991 as the first riverboat casino in Illinois. Tee off beneath the grain elevators with the Clark Bridge far down the river.',
      pts: [[-820, -721], [-690, -561], [-588, -456]], fw: 33, fwStart: 110,
      green: { r: 15, slope: [0.008, -0.01] }, pin: [3, -3],
      bunkers: [{ t: 0.55, off: -22, rx: 11, rz: 7 }, { t: 1.04, off: 15, rx: 8, rz: 6 }],
      water: [], lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 2, name: 'Riverfront Park', par: 3,
      note: 'Over the lawn of Riverfront Park, past the amphitheater\'s white tensile canopy, with the river just to the right.',
      pts: [[-538, -398], [-430, -300]], fw: 0,
      green: { r: 14, slope: [-0.01, 0.006] }, pin: [-3, 2],
      bunkers: [{ t: 0.9, off: -14, rx: 8, rz: 6 }, { t: 1.08, off: 12, rx: 7, rz: 5 }],
      water: [], lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 3, name: 'The Marina', par: 4,
      note: 'Inland of the Alton Marina\'s covered slips, toward the Clark Bridge where it comes ashore.',
      pts: [[-189, -341], [7, -250], [134, -169]], fw: 33, fwStart: 110,
      green: { r: 15, slope: [0.006, 0.01] }, pin: [-2, 3],
      bunkers: [{ t: 0.52, off: 21, rx: 11, rz: 6 }, { t: 0.98, off: -15, rx: 8, rz: 6 }],
      water: [], lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 4, name: 'Clark Bridge', par: 4,
      note: 'The Clark Bridge (1994), named for William Clark, carries its deck on cables draped over saddles atop two single pylons; PBS NOVA filmed its building in "Super Bridge". Play straight at it along Russell Commons, a pond waiting short.',
      pts: [[640, 170], [500, 115], [300, 60]], fw: 33, fwStart: 110,
      green: { r: 15, slope: [0, -0.012] }, pin: [2, -4],
      bunkers: [{ t: 0.6, off: -22, rx: 10, rz: 6 }, { t: 1.0, off: -16, rx: 7, rz: 7 }],
      water: [], lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 5, name: 'Mel Price Lock', par: 3,
      note: 'Melvin Price Locks and Dam (1990) replaced the old Lock and Dam 26 at Alton; its gates hold the pool you have been playing beside.',
      pts: [[777, 163], [935, 236]], fw: 0,
      green: { r: 14, slope: [0.01, 0.006] }, pin: [-3, -2],
      bunkers: [{ t: 0.9, off: 15, rx: 8, rz: 6 }, { t: 1.08, off: -12, rx: 7, rz: 5 }],
      water: [], lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 6, name: 'Camp River Dubois', par: 5,
      note: 'Lewis and Clark wintered at Camp River Dubois, a few miles downriver, in 1803-04 before setting off up the Missouri. Head downstream after them, the bridge at your back.',
      pts: [[778, -2], [994, 129], [1095, 259]], fw: 35, fwStart: 130,
      green: { r: 16, slope: [-0.008, 0.01] }, pin: [3, 2],
      bunkers: [{ t: 0.45, off: -24, rx: 12, rz: 8 }, { t: 0.8, off: 22, rx: 10, rz: 7 }, { t: 1.04, off: -12, rx: 8, rz: 5 }],
      water: [], lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 7, name: 'West Alton', par: 4,
      note: 'Over the bridge in Missouri: West Alton sits on the low peninsula between the Mississippi and the Missouri, just above their confluence.',
      pts: [[-895, 761], [-829, 635], [-725, 526]], fw: 30, fwStart: 100,
      green: { r: 15, slope: [0.01, -0.008] }, pin: [-3, -4],
      bunkers: [{ t: 0.55, off: -20, rx: 10, rz: 7 }, { t: 0.97, off: 16, rx: 8, rz: 6 }],
      water: [], lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 8, name: 'Smallpox Island', par: 3,
      note: 'Confederate prisoners who died of smallpox at the Alton military prison in 1863-64 were buried on an island here; the memorial at Lincoln Shields (2002) lists their names. Carry the slough.',
      pts: [[-803, 528], [-896, 404]], fw: 0,
      green: { r: 14, slope: [-0.01, 0.006] }, pin: [2, 3],
      bunkers: [{ t: 0.92, off: -14, rx: 8, rz: 6 }, { t: 1.07, off: 12, rx: 7, rz: 5 }],
      water: [], lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 9, name: 'The Moon Tower', par: 4,
      note: 'In 1842 Abraham Lincoln and James Shields met for a duel on the sandbar here; it was called off before a blow was struck. Finish at the observation tower on the point, downtown Alton across the river.',
      pts: [[-1042, 493], [-940, 395], [-926, 246]], fw: 30, fwStart: 100,
      green: { r: 15, slope: [0.01, -0.008] }, pin: [-3, -4],
      bunkers: [{ t: 0.55, off: 20, rx: 10, rz: 7 }, { t: 1.05, off: -14, rx: 8, rz: 6 }],
      water: [], lm: { type: 'none', at: [0, 0] },
    },
  ],
};
