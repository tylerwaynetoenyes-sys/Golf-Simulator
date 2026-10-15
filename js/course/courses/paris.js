// Paris: the Champ de Mars and the Trocadéro. Nine holes laid out down the
// old parade ground from the École Militaire to the foot of the Eiffel
// Tower, across the Seine by the Pont d'Iéna, up the Trocadéro gardens to
// the Palais de Chaillot and back over the river to finish under the tower.
// A fantasy routing on real ground (EU-DEM / SRTM via the Terrarium tiles)
// with the real buildings round it (OpenStreetMap footprints and heights,
// assets/courses/paris/buildings.json). Hole points are DEM-frame metres
// (+x east, +z south, origin 48.8556°N 2.2986°E). The previous Bois de
// Boulogne routing is in git history.
export default {
  id: 'paris',
  name: 'Paris',
  place: 'Champ de Mars · Trocadéro',
  theme: 'paris',
  dem: true,
  life: 'park', // js/course/courseLife.js
  enrich: true, // design pass: bunkering, greenside sand, shaping (js/course/design.js)
  blurb: 'Down the Champ de Mars to the foot of the Eiffel Tower, over the Seine and up the Trocadéro, with the Haussmann avenues either side.',
  credit: 'Elevation: Mapzen terrain tiles (EU-DEM, produced using Copernicus data; SRTM, USGS); buildings and landmark positions © OpenStreetMap contributors (ODbL); ground colour: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0',
  // the Seine at the Pont d'Iéna (the tiles read the river at ~28.5 m)
  waterLevel: 29.3,
  quays: true, // walled banks: no beach strip at the waterline
  // the Seine as mapped (OSM, assets/landmarks/paris/seine.json): its bed carved so the water meets the quay walls
  riverbed: [[[-2507,2389],[-2571,2490],[-2669,2636],[-2718,2711],[-2715,2717],[-2755,2777],[-2782,2850],[-2790,2881],[-2790,2891],[-2805,2972],[-2809,3023],[-2822,3103],[-2836,3160],[-2845,3172],[-2856,3194],[-2871,3210],[-2894,3241],[-2950,3308],[-2975,3333],[-3008,3371],[-3023,3384],[-3086,3441],[-3128,3475],[-3129,3480],[-3150,3498],[-3194,3530],[-3202,3538],[-3317,3609],[-3478,3711],[-3575,3757],[-3576,3761],[-3644,3790],[-3789,3855],[-3791,3854],[-3937,3904],[-4022,3927],[-4019,3925],[-4019,3921],[-4020,3918],[-4023,3916],[-4027,3915],[-4084,3922],[-4088,3918],[-4207,3927],[-4240,3929],[-4256,3928],[-4278,3925],[-4375,3902],[-4403,3893],[-4430,3885],[-4432,3891],[-4446,3885],[-4444,3880],[-4712,3774],[-4714,3776],[-4792,3734],[-4842,3695],[-4947,3606],[-5021,3532],[-5081,3463],[-5149,3363],[-5206,3285],[-5213,3244],[-5262,3155],[-5289,3114],[-5342,3003],[-5387,2740],[-5395,2681],[-5394,2674],[-5400,2672],[-5397,2651],[-5404,2601],[-5413,2568],[-5473,2431],[-5561,2259],[-5457,2276],[-5478,2238],[-5507,2171],[-5523,2130],[-5538,2076],[-5548,2021],[-5551,1976],[-5552,1932],[-5548,1875],[-5474,1873],[-5477,1923],[-5477,1965],[-5472,2054],[-5465,2113],[-5462,2126],[-5451,2154],[-5418,2216],[-5388,2264],[-5391,2266],[-5379,2282],[-5269,2499],[-5229,2672],[-5222,2671],[-5190,2847],[-5184,2872],[-5167,2928],[-5154,2958],[-5127,3015],[-5104,3052],[-5077,3087],[-5064,3100],[-5066,3103],[-5048,3119],[-5047,3118],[-4997,3160],[-4829,3296],[-4784,3336],[-4711,3390],[-4568,3490],[-4462,3553],[-4465,3558],[-4383,3601],[-4379,3591],[-4357,3601],[-4261,3613],[-4187,3608],[-4102,3598],[-3980,3561],[-3847,3502],[-3685,3427],[-3602,3383],[-3561,3357],[-3501,3310],[-3345,3136],[-3340,3140],[-3310,3107],[-3315,3103],[-3284,3069],[-3272,3078],[-3237,3037],[-3165,2959],[-3171,2939],[-3097,2871],[-3021,2814],[-2973,2773],[-2944,2743],[-2868,2658],[-2839,2620],[-2801,2565],[-2770,2515],[-2765,2519],[-2758,2505],[-2761,2502],[-2707,2398],[-2679,2403],[-2550,2202],[-2374,1947],[-2379,1918],[-2367,1908],[-2348,1886],[-2267,1758],[-2220,1686],[-2189,1643],[-2163,1601],[-2135,1550],[-2083,1467],[-2081,1468],[-1967,1286],[-1938,1248],[-1905,1196],[-1890,1171],[-1878,1148],[-1841,1089],[-1840,1089],[-1835,1080],[-1836,1080],[-1794,1015],[-1768,982],[-1739,937],[-1726,912],[-1717,893],[-1622,745],[-1611,730],[-1439,542],[-1436,541],[-1323,418],[-1253,337],[-1249,338],[-1239,326],[-1241,325],[-777,-197],[-780,-204],[-648,-368],[-646,-366],[-596,-428],[-588,-440],[-591,-443],[-542,-505],[-466,-593],[-462,-591],[-452,-597],[-445,-605],[-440,-604],[-395,-656],[-396,-662],[-402,-667],[-354,-725],[-316,-757],[-247,-797],[-243,-790],[-241,-788],[-238,-788],[-133,-838],[-131,-841],[-131,-845],[-85,-864],[24,-901],[26,-903],[25,-908],[191,-941],[202,-941],[202,-938],[205,-938],[307,-941],[307,-938],[311,-935],[344,-936],[345,-935],[764,-949],[942,-953],[943,-949],[945,-947],[950,-947],[1075,-952],[1238,-958],[1241,-959],[1242,-962],[1242,-972],[1355,-975],[1355,-970],[1393,-971],[1407,-975],[1408,-978],[1448,-980],[1456,-979],[1472,-976],[1599,-913],[1726,-853],[1728,-849],[1902,-762],[1904,-764],[1928,-751],[1929,-750],[2296,-570],[2309,-563],[2311,-557],[2326,-550],[2332,-552],[2354,-541],[2354,-538],[2355,-536],[2357,-536],[2360,-538],[2406,-516],[2412,-516],[2438,-507],[2440,-503],[2442,-502],[2447,-505],[2478,-497],[2507,-488],[2506,-486],[2516,-483],[2515,-481],[2518,-479],[2550,-468],[2553,-467],[2554,-468],[2563,-465],[2564,-467],[2684,-426],[2741,-408],[2808,-394],[2872,-387],[2920,-370],[2978,-359],[3057,-341],[3075,-334],[3187,-303],[3215,-293],[3424,-204],[3487,-182],[3688,-95],[3756,-55],[3833,-18],[3864,8],[3924,46],[3923,52],[3927,59],[4070,146],[4075,145],[4133,181],[4179,205],[4179,208],[4327,288],[4502,385],[4502,387],[4532,404],[4536,407],[4563,453],[4566,559],[4567,562],[4570,589],[4575,617],[4595,686],[4506,731],[4452,761],[4413,722],[4255,643],[4162,600],[4109,571],[4109,567],[4107,564],[3974,501],[3883,472],[3769,419],[3632,339],[3633,338],[3550,275],[3527,264],[3384,206],[3363,196],[3342,183],[3302,155],[3216,90],[3092,-71],[3069,-92],[3037,-118],[3035,-117],[3028,-122],[3029,-124],[2907,-221],[2891,-231],[2881,-236],[2707,-294],[2705,-286],[2673,-293],[2519,-345],[2520,-347],[2511,-351],[2511,-353],[2477,-365],[2473,-366],[2473,-365],[2463,-368],[2463,-367],[2384,-396],[2358,-407],[2303,-435],[2298,-437],[2293,-432],[2282,-437],[2277,-451],[2262,-458],[2248,-453],[2220,-466],[2222,-468],[2169,-497],[2101,-544],[2053,-567],[2055,-572],[2053,-576],[1721,-728],[1718,-728],[1715,-726],[1711,-718],[1675,-734],[1673,-731],[1558,-784],[1439,-841],[1424,-847],[1408,-850],[1392,-852],[1372,-851],[1372,-853],[960,-839],[950,-838],[947,-834],[875,-832],[853,-831],[852,-832],[804,-830],[803,-835],[801,-837],[350,-823],[350,-824],[255,-823],[213,-821],[131,-814],[99,-809],[51,-796],[50,-801],[19,-791],[20,-787],[-46,-763],[-107,-734],[-166,-700],[-219,-664],[-250,-639],[-289,-602],[-414,-473],[-415,-464],[-419,-451],[-424,-441],[-449,-415],[-467,-405],[-479,-402],[-500,-380],[-501,-375],[-620,-241],[-645,-200],[-664,-160],[-702,-16],[-717,19],[-743,65],[-760,85],[-957,298],[-1337,706],[-1340,704],[-1363,728],[-1595,984],[-1637,1041],[-1681,1078],[-1808,1280],[-1851,1350],[-1924,1462],[-1925,1466],[-2045,1683],[-2143,1844],[-2156,1868],[-2283,2055],[-2389,2210],[-2398,2204],[-2455,2291],[-2447,2295],[-2507,2389]]],
  waterTint: 0x3a5058,
  buildings: 'paris',
  far: [
    { type: 'eiffel', ll: [48.85826, 2.2945], maxD: Infinity, rot: 0.72 },
    { type: 'arcdetriomphe', ll: [48.87378, 2.29504], maxD: Infinity, rot: 0.35 },
    { type: 'ladefense', ll: [48.89255, 2.23611], maxD: Infinity, rot: 0.42 },
    // the Seine: quays, bridges, the Île aux Cygnes and its Liberty, boats and Parisians (map axes)
    { type: 'seine', ll: [48.8556, 2.2986], maxD: Infinity },
  ],
  holes: [
    {
      n: 1, name: "Champ de Mars", par: 4,
      note: "The Champ de Mars was the parade ground of the École Militaire, behind the tee. It held the Fête de la Fédération in 1790 and five World's Fairs. The tower is dead on line.",
      pts: [[221, 390], [48, 223], [-2, 120]], fw: 30, fwStart: 140,
      green: { r: 14, slope: [0.009, -0.006] }, pin: [2, -3],
      bunkers: [{ t: 0.62, off: -20, rx: 9, rz: 6 }, { t: 0.66, off: 22, rx: 8, rz: 5 }, { t: 1.04, off: -14, rx: 7, rz: 5 }, { t: 0.97, off: 15, rx: 6, rz: 4 }],
      water: [],
      mounds: [{ t: 0.45, off: -34, r: 16, h: 1.6 }, { t: 0.5, off: 36, r: 18, h: 1.4 }],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 2, name: "Les Pelouses", par: 3,
      note: "Short and open, over the lawns. The green slopes away to the back left.",
      pts: [[23, 58], [19, -84]], fw: 0,
      green: { r: 13, slope: [-0.012, 0.008] }, pin: [-3, 2],
      bunkers: [{ t: 0.9, off: -14, rx: 7, rz: 5 }, { t: 1.08, off: 10, rx: 8, rz: 5 }, { t: 0.85, off: 12, rx: 5, rz: 4 }],
      water: [],
      mounds: [{ t: 1.15, off: -14, r: 8, h: 1.2 }],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 3, name: "Avenue de Suffren", par: 5,
      note: "The Haussmann fronts of the Avenue de Suffren run the length of the left side. Out of bounds is the street.",
      pts: [[30, -147], [229, 65], [317, 227]], fw: 32, fwStart: 120,
      green: { r: 15, slope: [0.008, 0.01] }, pin: [-2, -4],
      bunkers: [{ t: 0.38, off: 26, rx: 10, rz: 6 }, { t: 0.58, off: -24, rx: 12, rz: 7 }, { t: 0.8, off: 18, rx: 9, rz: 6 }, { t: 1.05, off: -13, rx: 8, rz: 5 }],
      water: [],
      mounds: [{ t: 0.3, off: -30, r: 20, h: 1.8 }, { t: 0.7, off: 32, r: 16, h: 1.5 }],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 4, name: "Le Bassin", par: 3,
      note: "A carry over the basin to a shallow green with the Mur pour la Paix (2000) behind the tee.",
      pts: [[277, 302], [141, 314]], fw: 0,
      green: { r: 13, slope: [0.006, -0.012] }, pin: [2, -1],
      bunkers: [{ t: 1.1, off: -9, rx: 8, rz: 5 }, { t: 1.06, off: 13, rx: 6, rz: 4 }],
      water: [{ t: 0.52, off: -2, rx: 14, rz: 22 }],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 5, name: "La Bourdonnais", par: 4,
      note: "Along the Avenue de La Bourdonnais, straight at the second floor of the tower. The plane trees pinch the landing area.",
      pts: [[48, 329], [-110, 149], [-139, 55]], fw: 28, fwStart: 130,
      green: { r: 13, slope: [-0.01, -0.008] }, pin: [3, 1],
      bunkers: [{ t: 0.55, off: 20, rx: 9, rz: 5 }, { t: 0.98, off: -13, rx: 8, rz: 5 }, { t: 1.06, off: 11, rx: 6, rz: 4 }],
      water: [],
      mounds: [{ t: 0.4, off: -28, r: 14, h: 1.5 }],
      trees: [{ t: 0.62, off: -30, r: 10, n: 7 }],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 6, name: "Pont d'Iéna", par: 3, carryWater: true,
      note: "Over the Seine beside the Pont d'Iéna (1814), named for Napoleon's victory at Jena in 1806. Anything short is in the river.",
      pts: [[-387, -425], [-523, -565]], fw: 0,
      green: { r: 14, slope: [0.004, -0.012] }, pin: [0, -2],
      bunkers: [{ t: 1.08, off: -12, rx: 8, rz: 5 }, { t: 1.03, off: 14, rx: 7, rz: 4 }],
      water: [],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 7, name: "Jardins du Trocadéro", par: 4,
      note: "Uphill through the Trocadéro gardens, laid out for the 1937 World's Fair, to a green under the Palais de Chaillot. Plays a club longer than the card.",
      pts: [[-507, -593], [-622, -679], [-724, -749]], fw: 30, fwStart: 110,
      green: { r: 14, slope: [0.012, 0.006] }, pin: [-2, -3],
      bunkers: [{ t: 0.6, off: -22, rx: 9, rz: 6 }, { t: 1.06, off: 12, rx: 7, rz: 5 }],
      water: [],
      mounds: [{ t: 0.5, off: 26, r: 14, h: 1.4 }],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 8, name: "Fontaine de Varsovie", par: 3,
      note: "From the Chaillot terrace, the finest view in Paris, down over the Warsaw Fountains to a green across the basin. Plays a club shorter.",
      pts: [[-825, -728], [-699, -585]], fw: 0,
      green: { r: 15, slope: [-0.01, 0.006] }, pin: [2, 2],
      bunkers: [{ t: 1.08, off: -12, rx: 8, rz: 5 }, { t: 0.94, off: 14, rx: 7, rz: 4 }],
      water: [{ t: 0.62, off: 0, rx: 13, rz: 30 }],
      lm: { type: 'none', at: [0, 0] },
    },
    {
      n: 9, name: "Quai Branly", par: 4, carryWater: true,
      note: "Down from the Trocadéro and back across the Seine to finish beneath the tower: 18,038 iron pieces and 2.5 million rivets, built for the 1889 World's Fair.",
      pts: [[-517, -718], [-277, -436]], fw: 30, fwStart: 270,
      green: { r: 15, slope: [0.008, 0.008] }, pin: [-3, -2],
      bunkers: [{ t: 0.9, off: -20, rx: 9, rz: 6 }, { t: 1.05, off: 15, rx: 8, rz: 5 }, { t: 0.86, off: 18, rx: 6, rz: 4 }],
      water: [],
      lm: { type: 'none', at: [0, 0] },
    },
  ],
};
