// Cassis, Provence. Nine holes through the vineyards of the Cassis
// appellation and down toward the port (elevation from the Terrarium tiles:
// EU-DEM / SRTM), between the Calanques to the west and the red cliffs of Cap
// Canaille to the east. Hole points are DEM-frame metres (+x east, +z south,
// origin 43.219°N 5.540°E); landmark positions from OpenStreetMap.
export default {
  id: 'cassis',
  name: 'Cassis',
  place: 'Calanques · Cassis, Provence',
  theme: 'coastal',
  dem: true,
  enrich: true, // design pass: bunkering, greenside sand, shaping (js/course/design.js)
  blurb: 'Nine holes across the vineyard plateau and down to the old town, with Cap Canaille, the Calanques and the Mediterranean below.',
  credit: 'Elevation: Mapzen terrain tiles (EU-DEM, produced using Copernicus data; SRTM, USGS); landmark positions © OpenStreetMap contributors; ground colour: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0',
  waterLevel: 0.3,
  waterTint: 0x1d5b6e,
  // the cliffs of Cap Canaille are a red-ochre conglomerate and sandstone;
  // the Calanques to the west are white Urgonian limestone
  rockZones: [{ ll: [43.2005, 5.5600], r: 1700, color: 0xa65a3c }],
  far: [
    // the appellation's vines over the plateau, parcel by parcel round each hole (map axes)
    { type: 'vignoble', ll: [43.219, 5.540], maxD: Infinity },
    // and three domaines with their bastides (DEM metres)
    { type: 'vineyard', dem: [330, -1120], maxD: Infinity, rot: 0.3 },
    { type: 'vineyard', dem: [-330, -300], maxD: Infinity, rot: -0.4 },
    { type: 'vineyard', dem: [230, 10], maxD: Infinity, rot: 0.9 },
    { type: 'cassisport', ll: [43.2135, 5.5380], maxD: Infinity },
    { type: 'phare', ll: [43.2103, 5.5357], maxD: Infinity, rot: 0.3 },
    { type: 'chateau', ll: [43.2122, 5.5402], maxD: Infinity, rot: 0.5 },
  ],
  holes: [
    {
      n: 1, name: 'Les Vignes', par: 4,
      note: 'Cassis was among the first French appellations, in 1936. Its vineyards, mostly white grapes such as Marsanne and Clairette, climb the slopes between the Calanques and Cap Canaille.',
      pts: [[150, -470], [60, -220], [0, -140]], fw: 33, fwStart: 110,
      green: { r: 15, slope: [0.008, -0.01] }, pin: [3, -3],
      bunkers: [{ t: 0.55, off: 22, rx: 11, rz: 7 }, { t: 1.05, off: -14, rx: 8, rz: 5 }],
      water: [],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 2, name: 'Pointu', par: 3,
      note: 'The pointu, a small double-ended wooden fishing boat, is still painted in bright colours and moored in the port below.',
      pts: [[-60, -80], [-220, -40]], fw: 0,
      green: { r: 14, slope: [-0.01, 0.006] }, pin: [-3, 2],
      bunkers: [{ t: 0.92, off: -15, rx: 9, rz: 6 }, { t: 1.08, off: 12, rx: 7, rz: 5 }],
      water: [],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 3, name: 'Cap Canaille', par: 5,
      note: 'Cap Canaille rises 394 m straight out of the sea, among the highest sea cliffs in Europe. The Route des Crêtes runs along its top to La Ciotat.',
      pts: [[-170, -150], [-100, -450], [-20, -600]], fw: 36, fwStart: 130,
      green: { r: 16, slope: [0.008, -0.01] }, pin: [-4, -3],
      bunkers: [{ t: 0.48, off: -24, rx: 14, rz: 8 }, { t: 0.82, off: 22, rx: 10, rz: 8 }, { t: 1.0, off: 16, rx: 7, rz: 6 }],
      water: [],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 4, name: 'Restanques', par: 4,
      note: 'Restanques are the dry-stone walls that terrace the Provençal hillsides, holding back the soil for vines and olives.',
      pts: [[100, -680], [320, -800], [340, -900]], fw: 33, fwStart: 110,
      green: { r: 14, slope: [-0.012, 0] }, pin: [2, 3],
      bunkers: [{ t: 0.6, off: -22, rx: 10, rz: 6 }, { t: 1.0, off: -16, rx: 7, rz: 7 }],
      water: [],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 5, name: 'Pin Parasol', par: 3,
      note: 'The stone pine, the pin parasol, and the Aleppo pine are the trees of the Provençal coast; the garrigue beneath them smells of rosemary, thyme and kermes oak.',
      pts: [[260, -980], [100, -1060]], fw: 0,
      green: { r: 14, slope: [0.01, 0.006] }, pin: [-3, -2],
      bunkers: [{ t: 0.92, off: 16, rx: 8, rz: 7 }, { t: 0.97, off: -17, rx: 8, rz: 8 }],
      water: [],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 6, name: 'Les Calanques', par: 4,
      note: 'The Calanques, narrow limestone inlets between Marseille and Cassis, became France\'s first peri-urban national park in 2012.',
      pts: [[0, -1120], [-60, -870], [-20, -780]], fw: 33, fwStart: 110,
      green: { r: 15, slope: [0, -0.012] }, pin: [2, -4],
      bunkers: [{ t: 0.52, off: 21, rx: 11, rz: 6 }, { t: 0.98, off: -15, rx: 8, rz: 6 }],
      water: [],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 7, name: 'Le Mistral', par: 4,
      note: 'The mistral blows cold and dry down the Rhône valley to the sea, sometimes for days, and clears the sky to a hard blue.',
      pts: [[60, -720], [200, -500], [230, -430]], fw: 32, fwStart: 110,
      green: { r: 15, slope: [0.006, 0.01] }, pin: [-2, 3],
      bunkers: [{ t: 0.5, off: 22, rx: 10, rz: 7 }, { t: 1.02, off: 15, rx: 7, rz: 6 }],
      water: [],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 8, name: 'Le Château', par: 5,
      note: 'The Château de Cassis has watched over the port from its rock since the Middle Ages; it is now a hotel.',
      pts: [[300, -380], [150, -150], [100, 80]], fw: 36, fwStart: 130,
      green: { r: 16, slope: [-0.008, 0.01] }, pin: [3, 2],
      bunkers: [{ t: 0.45, off: -24, rx: 12, rz: 8 }, { t: 0.8, off: 22, rx: 10, rz: 7 }, { t: 1.04, off: -12, rx: 8, rz: 5 }],
      water: [],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 9, name: 'La Plage', par: 4,
      note: '"Qu\'a vist Paris e noun Cassis, pòu dire: n\'ai rèn vist" goes the Provençal saying: he who has seen Paris but not Cassis has seen nothing. Home hole down to the sea, with Cap Canaille ahead.',
      pts: [[270, 520], [300, 780], [320, 860]], fw: 32, fwStart: 100,
      green: { r: 15, slope: [0.008, 0.01] }, pin: [-3, -3],
      bunkers: [{ t: 0.52, off: -20, rx: 11, rz: 7 }, { t: 0.96, off: 17, rx: 8, rz: 6 }, { t: 1.1, off: -4, rx: 10, rz: 4 }],
      water: [],
      lm: { type: 'none', at: [0, 0] },
    },
  ],
};
