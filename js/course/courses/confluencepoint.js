// Confluence Point, Hartford, Illinois: nine holes on the farmland of the
// American Bottom beside the Lewis & Clark Confluence Tower, across the
// Mississippi from the mouth of the Missouri (USGS 3DEP elevation). The holes
// are routed over open fields on the OpenStreetMap land cover; the tower,
// Camp River Dubois, the interpretive centre and the overlook at the
// confluence are js/course/lm/confluencepoint.js, at their mapped places.
// Points are DEM-frame metres (+x east, +z south, origin 38.81359°N 90.0912°W).
// Data © OpenStreetMap contributors (ODbL 1.0)
export default {
  id: 'confluencepoint',
  name: 'Confluence Point',
  place: 'Hartford, Illinois',
  theme: 'parkland',
  dem: true,
  enrich: true,
  blurb: 'Nine holes on the American Bottom beside the Lewis & Clark Confluence Tower, where the Missouri meets the Mississippi.',
  credit: 'Elevation: USGS 3DEP via AWS Terrain Tiles; map data © OpenStreetMap contributors; ground colour: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0',
  // the Mississippi below Mel Price Locks and Dam reads 122.9 m on the DEM
  waterLevel: 123.2,
  waterTint: 0x56553f,
  far: [
    // the Lewis & Clark sites, in map axes from their own origin
    { type: 'confluencepoint', ll: [38.810, -90.135], maxD: Infinity },
  ],
  holes: [
  {
    n: 1,
    name: "Meeting of the Rivers",
    par: 4,
    note: "The Missouri joins the Mississippi a mile and a half west of here; the Missouri's silt keeps the two apart in a seam of colour for miles downstream.",
    pts: [
      [
        520,
        -660
      ],
      [
        520,
        -300
      ]
    ],
    fw: 32,
    fwStart: 110,
    green: {
      r: 15,
      slope: [
        0.006,
        -0.008
      ]
    },
    pin: [
      2,
      -3
    ],
    bunkers: [],
    water: [],
    lm: {
      type: "none",
      at: [
        0,
        0
      ]
    }
  },
  {
    n: 2,
    name: "Wood River",
    par: 3,
    note: "The Corps of Discovery named Camp River Dubois for the Wood River, the Dubois, at whose mouth they wintered.",
    pts: [
      [
        670,
        -340
      ],
      [
        670,
        -500
      ]
    ],
    fw: 0,
    green: {
      r: 15,
      slope: [
        0.006,
        -0.008
      ]
    },
    pin: [
      2,
      -3
    ],
    bunkers: [],
    water: [],
    lm: {
      type: "none",
      at: [
        0,
        0
      ]
    }
  },
  {
    n: 3,
    name: "The Long Winter",
    par: 5,
    note: "Lewis and Clark spent the winter of 1803-04 here drilling the men, building boats and gathering stores. A long par 5 north.",
    pts: [
      [
        820,
        -660
      ],
      [
        820,
        -180
      ]
    ],
    fw: 32,
    fwStart: 110,
    green: {
      r: 15,
      slope: [
        0.006,
        -0.008
      ]
    },
    pin: [
      2,
      -3
    ],
    bunkers: [],
    water: [],
    lm: {
      type: "none",
      at: [
        0,
        0
      ]
    }
  },
  {
    n: 4,
    name: "Corps of Discovery",
    par: 4,
    note: "Some forty men set off from Camp River Dubois on May 14, 1804.",
    pts: [
      [
        670,
        -200
      ],
      [
        670,
        160
      ]
    ],
    fw: 32,
    fwStart: 110,
    green: {
      r: 15,
      slope: [
        0.006,
        -0.008
      ]
    },
    pin: [
      2,
      -3
    ],
    bunkers: [],
    water: [],
    lm: {
      type: "none",
      at: [
        0,
        0
      ]
    }
  },
  {
    n: 5,
    name: "The Keelboat",
    par: 3,
    note: "A short hole for the 55-foot keelboat that carried the expedition up the Missouri.",
    pts: [
      [
        520,
        100
      ],
      [
        520,
        -60
      ]
    ],
    fw: 0,
    green: {
      r: 15,
      slope: [
        0.006,
        -0.008
      ]
    },
    pin: [
      2,
      -3
    ],
    bunkers: [],
    water: [],
    lm: {
      type: "none",
      at: [
        0,
        0
      ]
    }
  },
  {
    n: 6,
    name: "American Bottom",
    par: 4,
    note: "The flat floodplain east of the Mississippi from Alton to Chester is the American Bottom, among the richest farmland in the country.",
    pts: [
      [
        820,
        -80
      ],
      [
        820,
        280
      ]
    ],
    fw: 32,
    fwStart: 110,
    green: {
      r: 15,
      slope: [
        0.006,
        -0.008
      ]
    },
    pin: [
      2,
      -3
    ],
    bunkers: [],
    water: [],
    lm: {
      type: "none",
      at: [
        0,
        0
      ]
    }
  },
  {
    n: 7,
    name: "May 14, 1804",
    par: 4,
    note: "The day the expedition left; the Confluence Tower opened on the same date in 2010.",
    pts: [
      [
        520,
        220
      ],
      [
        520,
        580
      ]
    ],
    fw: 32,
    fwStart: 110,
    green: {
      r: 15,
      slope: [
        0.006,
        -0.008
      ]
    },
    pin: [
      2,
      -3
    ],
    bunkers: [],
    water: [],
    lm: {
      type: "none",
      at: [
        0,
        0
      ]
    }
  },
  {
    n: 8,
    name: "Confluence Tower",
    par: 3,
    note: "A short hole with the Confluence Tower over your right shoulder: two shafts for Lewis and Clark and lookouts at 50, 100 and 150 feet.",
    pts: [
      [
        670,
        460
      ],
      [
        670,
        620
      ]
    ],
    fw: 0,
    green: {
      r: 15,
      slope: [
        0.006,
        -0.008
      ]
    },
    pin: [
      2,
      -3
    ],
    bunkers: [],
    water: [],
    lm: {
      type: "none",
      at: [
        0,
        0
      ]
    }
  },
  {
    n: 9,
    name: "Camp River Dubois",
    par: 5,
    note: "Home along the field edge toward the tower and the replica of the expedition's winter camp.",
    pts: [
      [
        800,
        720
      ],
      [
        340,
        600
      ]
    ],
    fw: 32,
    fwStart: 110,
    green: {
      r: 15,
      slope: [
        0.006,
        -0.008
      ]
    },
    pin: [
      2,
      -3
    ],
    bunkers: [],
    water: [],
    lm: {
      type: "none",
      at: [
        0,
        0
      ]
    }
  }
],
};
