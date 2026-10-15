// Cahokia Mounds, Collinsville, Illinois: nine holes on the open grounds of
// Cahokia Mounds State Historic Site, the city the Mississippian people built
// here around 1050 CE. The elevation is 1 m USGS LiDAR (tools/fetch-lidar.py),
// so Monks Mound and the other mounds stand at their surveyed shapes. Every
// hole keeps at least 60 m off every mound (OpenStreetMap), and the Grand
// Plaza is left unplayed; each hole's note teaches a little about the city.
// Woodhenge, the Monks Mound stair, the stockade and the Interpretive Center
// are js/course/lm/cahokiasite.js. Points are DEM-frame metres (+x east,
// +z south, origin 38.65711°N 90.06698°W). Data © OpenStreetMap contributors (ODbL 1.0)
export default {
  id: 'cahokia',
  name: 'Cahokia Mounds',
  place: 'Cahokia Mounds State Historic Site · Collinsville, Illinois',
  theme: 'parkland',
  dem: true,
  enrich: true,
  blurb: 'Nine holes round the city of the Mississippians: Monks Mound, Woodhenge and the stockade, on the surveyed ground of a World Heritage Site.',
  credit: 'Elevation: USGS 3DEP 1 m LiDAR (public domain); map data © OpenStreetMap contributors; ground colour: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0',
  far: [
    { type: 'cahokiasite', ll: [38.6603, -90.0618], maxD: Infinity },
  ],
  holes: [
  {
    n: 1,
    name: "Monks Mound",
    par: 4,
    note: "Monks Mound is the largest prehistoric earthwork in the Americas: about 100 feet high, raised between about 900 and 1200 CE from some 22 million cubic feet of earth, carried in baskets. A leader's building stood on its summit.",
    pts: [
      [
        970,
        -895
      ],
      [
        630,
        -835
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
    name: "The City",
    par: 3,
    note: "Around 1050 to 1150 CE Cahokia was the largest city north of Mexico, home to perhaps 10,000 to 20,000 people, with more beyond in the farmsteads and towns around it.",
    pts: [
      [
        590,
        -755
      ],
      [
        760,
        -685
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
    name: "The Stockade",
    par: 4,
    note: "A two-mile palisade of upright logs with bastions every 70 feet or so walled the central precinct. It was rebuilt at least four times; a section stands reconstructed east of the plaza.",
    pts: [
      [
        970,
        -655
      ],
      [
        680,
        -585
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
    name: "Woodhenge",
    par: 5,
    note: "Circles of red cedar posts served as a sun calendar: from the centre post, the equinox sun rises over Monks Mound. The circle here is a reconstruction on the original post pits.",
    pts: [
      [
        -310,
        75
      ],
      [
        -550,
        45
      ],
      [
        -810,
        15
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
    name: "Chunkey",
    par: 3,
    note: "Cahokians played chunkey in the plazas: a player rolled a stone disc and others threw poles at where it would come to rest. Crowds bet on the outcome.",
    pts: [
      [
        -890,
        -55
      ],
      [
        -910,
        -205
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
    name: "Maize",
    par: 4,
    note: "Maize, along with squash and native seed crops, fed the city; the rich bottomland of the American Bottom made Cahokia possible.",
    pts: [
      [
        -880,
        185
      ],
      [
        -870,
        545
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
    name: "Mississippians",
    par: 4,
    note: "The people who built Cahokia belonged to the Mississippian culture (about 800 to 1600 CE), whose towns of mounds and plazas spread across the Southeast and Midwest.",
    pts: [
      [
        -740,
        565
      ],
      [
        -700,
        215
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
    name: "World Heritage",
    par: 3,
    note: "Cahokia Mounds became a UNESCO World Heritage Site in 1982, one of the first in the United States. Some 70 of about 120 mounds are protected here.",
    pts: [
      [
        -590,
        245
      ],
      [
        -550,
        405
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
    name: "Grand Plaza",
    par: 4,
    note: "South of Monks Mound lies the Grand Plaza, some 50 acres levelled by hand for ceremonies, markets and games; this course leaves it unplayed. Play toward the great mound.",
    pts: [
      [
        -970,
        895
      ],
      [
        -950,
        565
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
