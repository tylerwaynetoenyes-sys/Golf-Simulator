// Cahokia Mounds, Collinsville, Illinois: nine holes on the open grounds of
// Cahokia Mounds State Historic Site, the city the Mississippian people built
// here around 1050 CE. The elevation is 1 m USGS LiDAR (tools/fetch-lidar.py),
// so Monks Mound and the other mounds stand at their surveyed shapes. The
// holes are routed through the heart of the city, across the Grand Plaza and
// past Monks Mound, the Twin Mounds, Woodhenge and the stockade, with no
// fairway or green on any mound (checked against the LiDAR relief); each
// hole's note teaches a little about the city.
// Woodhenge, the Monks Mound stair, the stockade and the Interpretive Center
// are js/course/lm/cahokiasite.js. Points are DEM-frame metres (+x east,
// +z south, origin 38.65711°N 90.06698°W). Data © OpenStreetMap contributors (ODbL 1.0)
export default {
  id: 'cahokia',
  name: 'Cahokia Mounds',
  place: 'Cahokia Mounds State Historic Site · Collinsville, Illinois',
  theme: 'parkland',
  dem: true,
  sky: { day: 'prairie', night: 'milkyway' }, // a dark site's night (js/scene/sky.js)
  life: 'none', // js/course/courseLife.js
  enrich: true,
  blurb: 'Nine holes through the heart of the Mississippian city: across the Grand Plaza, under Monks Mound, past the Twin Mounds, Woodhenge and the stockade, on the surveyed ground of a World Heritage Site.',
  credit: 'Elevation: USGS 3DEP 1 m LiDAR (public domain); map data © OpenStreetMap contributors; ground colour: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0',
  far: [
    { type: 'cahokiasite', ll: [38.6603, -90.0618], maxD: Infinity },
  ],
  holes: [
    {
      n: 1,
      name: "Monks Mound",
      par: 4,
      note: "Monks Mound is the largest prehistoric earthwork in the Americas: about 100 feet high, raised between about 900 and 1200 CE from some 22 million cubic feet of earth, carried in baskets. A leader's building stood on its summit. Play straight at it.",
      pts: [
        [
          560,
          180
        ],
        [
          480,
          -140
        ]
      ],
      fw: 30,
      fwStart: 90,
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
      bunkers: [
        {
          t: 0.6,
          off: -18,
          rx: 9,
          rz: 6
        },
        {
          t: 1.03,
          off: 14,
          rx: 7,
          rz: 5
        }
      ],
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
      name: "Grand Plaza",
      par: 3,
      note: "South of Monks Mound lies the Grand Plaza, some 50 acres levelled and filled by hand for ceremonies, markets and games. A short hole across it.",
      pts: [
        [
          430,
          -110
        ],
        [
          450,
          60
        ]
      ],
      fw: 0,
      green: {
        r: 15,
        slope: [
          -0.007,
          0.005
        ]
      },
      pin: [
        -3,
        2
      ],
      bunkers: [
        {
          t: 1.04,
          off: 13,
          rx: 7,
          rz: 5
        }
      ],
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
      name: "Chunkey",
      par: 4,
      note: "Cahokians played chunkey on the plaza: a player rolled a stone disc and others threw poles at where it would come to rest. Crowds bet on the outcome. Play south down the plaza toward the Twin Mounds.",
      pts: [
        [
          480,
          120
        ],
        [
          460,
          410
        ]
      ],
      fw: 30,
      fwStart: 90,
      green: {
        r: 15,
        slope: [
          0.004,
          0.008
        ]
      },
      pin: [
        1,
        3
      ],
      bunkers: [
        {
          t: 0.6,
          off: -18,
          rx: 9,
          rz: 6
        },
        {
          t: 1.03,
          off: 14,
          rx: 7,
          rz: 5
        }
      ],
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
      name: "Twin Mounds",
      par: 4,
      note: "Fox and Roundtop, the Twin Mounds, close the south end of the Grand Plaza: one platform mound, one conical, set side by side. Play west past them.",
      pts: [
        [
          400,
          450
        ],
        [
          90,
          440
        ]
      ],
      fw: 30,
      fwStart: 90,
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
      bunkers: [
        {
          t: 0.6,
          off: -18,
          rx: 9,
          rz: 6
        },
        {
          t: 1.03,
          off: 14,
          rx: 7,
          rz: 5
        }
      ],
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
      name: "The City",
      par: 3,
      note: "Around 1050 to 1150 CE Cahokia was the largest city north of Mexico, home to perhaps 10,000 to 20,000 people, with more beyond in the farmsteads and towns around it.",
      pts: [
        [
          40,
          380
        ],
        [
          20,
          200
        ]
      ],
      fw: 0,
      green: {
        r: 15,
        slope: [
          -0.007,
          0.005
        ]
      },
      pin: [
        -3,
        2
      ],
      bunkers: [
        {
          t: 1.04,
          off: 13,
          rx: 7,
          rz: 5
        }
      ],
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
      note: "Maize, along with squash and native seed crops, fed the city; the rich bottomland of the American Bottom made Cahokia possible. West toward the sun circles.",
      pts: [
        [
          -60,
          -10
        ],
        [
          -330,
          -230
        ]
      ],
      fw: 30,
      fwStart: 90,
      green: {
        r: 15,
        slope: [
          0.004,
          0.008
        ]
      },
      pin: [
        1,
        3
      ],
      bunkers: [
        {
          t: 0.6,
          off: -18,
          rx: 9,
          rz: 6
        },
        {
          t: 1.03,
          off: 14,
          rx: 7,
          rz: 5
        }
      ],
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
      name: "Woodhenge",
      par: 3,
      note: "Circles of red cedar posts served as a sun calendar: from the centre post, the equinox sun rises over Monks Mound. The circle just beyond the green is a reconstruction on the original post pits.",
      pts: [
        [
          -440,
          -170
        ],
        [
          -605,
          -240
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
      bunkers: [
        {
          t: 1.04,
          off: 13,
          rx: 7,
          rz: 5
        }
      ],
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
      name: "Mississippians",
      par: 5,
      note: "The people who built Cahokia belonged to the Mississippian culture (about 800 to 1600 CE), whose towns of mounds and plazas spread across the Southeast and Midwest. A long hole back east.",
      pts: [
        [
          -560,
          -500
        ],
        [
          -80,
          -540
        ]
      ],
      fw: 30,
      fwStart: 90,
      green: {
        r: 15,
        slope: [
          -0.007,
          0.005
        ]
      },
      pin: [
        -3,
        2
      ],
      bunkers: [
        {
          t: 0.6,
          off: -18,
          rx: 9,
          rz: 6
        },
        {
          t: 1.03,
          off: 14,
          rx: 7,
          rz: 5
        }
      ],
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
      name: "The Stockade",
      par: 5,
      note: "A two-mile palisade of upright logs with bastions every 70 feet or so walled the central precinct. It was rebuilt at least four times; a section stands reconstructed east of Monks Mound. Home along the great mound's north face.",
      pts: [
        [
          120,
          -570
        ],
        [
          360,
          -590
        ],
        [
          590,
          -610
        ]
      ],
      fw: 30,
      fwStart: 90,
      green: {
        r: 15,
        slope: [
          0.004,
          0.008
        ]
      },
      pin: [
        1,
        3
      ],
      bunkers: [
        {
          t: 0.6,
          off: -18,
          rx: 9,
          rz: 6
        },
        {
          t: 1.03,
          off: 14,
          rx: 7,
          rz: 5
        }
      ],
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
