// Saint Louis Zoo, Forest Park, St. Louis: nine short holes along the zoo's
// walks, past the 1904 Flight Cage, Red Rocks, Sea Lion Sound and River's
// Edge (1 m USGS LiDAR, tools/fetch-lidar.py). The zoo's buildings and
// animals are js/course/lm/zoogrounds.js; the park round it is
// js/course/lm/forestpark.js. Each hole carries a house rule for the optional
// party mode (js/game/party.js; off unless switched on in Settings).
// Points are DEM-frame metres (+x east, +z south, origin 38.63518°N 90.29061°W).
// Data © OpenStreetMap contributors (ODbL 1.0)
export default {
  id: "stlzoo",
  name: "Saint Louis Zoo",
  place: "Forest Park · St. Louis, Missouri",
  theme: "parkland",
  dem: true,
  life: 'park', // js/course/courseLife.js
  enrich: true,
  blurb: "Nine short holes through the Saint Louis Zoo, round the 1904 Flight Cage, Sea Lion Sound and River's Edge. Party mode, if you switch it on in Settings, gives every hole a house rule.",
  credit: "Elevation: USGS 3DEP 1 m LiDAR (public domain); map data © OpenStreetMap contributors; ground colour: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0",
  buildings: "nyc",
  far: [
    {
      type: "zoogrounds",
      ll: [
        38.6385,
        -90.2875
      ],
      maxD: Infinity
    },
    {
      type: "forestpark",
      ll: [
        38.6385,
        -90.2875
      ],
      maxD: Infinity
    }
  ],
  holes: [
    {
      n: 1,
      name: "Flight Cage",
      par: 3,
      note: "The Flight Cage was built by the Smithsonian for the 1904 World's Fair; after the fair the city bought it for $3,500 and the Saint Louis Zoo grew up around it.",
      pts: [
        [
          400,
          -130
        ],
        [
          310,
          20
        ]
      ],
      fw: 0,
      green: {
        r: 13,
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
          t: 1.02,
          off: -14,
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
      },
      party: {
        title: "Flight Cage",
        on: "birdie",
        rule: "birdie here and everyone else drinks",
        call: "birdie at the Flight Cage: everyone else drinks"
      }
    },
    {
      n: 2,
      name: "Red Rocks",
      par: 3,
      note: "Red Rocks is big-cat and hoofstock country: lions, giraffes, zebras and antelope on rocky ground built to suggest the African plains.",
      pts: [
        [
          300,
          80
        ],
        [
          440,
          190
        ]
      ],
      fw: 0,
      green: {
        r: 13,
        slope: [
          -0.008,
          0.005
        ]
      },
      pin: [
        -3,
        2
      ],
      bunkers: [
        {
          t: 0.93,
          off: 13,
          rx: 8,
          rz: 5
        },
        {
          t: 1.08,
          off: -12,
          rx: 6,
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
      },
      party: {
        title: "Lion country",
        on: "sand",
        rule: "find the sand: roar, then drink",
        call: "in the rocks: roar like a lion, then take a drink"
      }
    },
    {
      n: 3,
      name: "Primate House",
      par: 3,
      note: "The Primate House opened in 1925; today the primates also range through the trees on the Primate Canopy Trail beside it.",
      pts: [
        [
          370,
          230
        ],
        [
          250,
          100
        ]
      ],
      fw: 0,
      green: {
        r: 13,
        slope: [
          0.004,
          0.009
        ]
      },
      pin: [
        1,
        3
      ],
      bunkers: [
        {
          t: 1.05,
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
      },
      party: {
        title: "Monkey see",
        on: "green",
        rule: "hit the green: pick a drinking buddy",
        call: "on in regulation: pick a buddy to drink with you"
      }
    },
    {
      n: 4,
      name: "Sea Lion Sound",
      par: 4,
      note: "Sea Lion Sound holds the zoo's California sea lions and harbor seals; the Holekamp Aqua Tunnel takes visitors underneath the water.",
      pts: [
        [
          160,
          100
        ],
        [
          70,
          -40
        ],
        [
          -10,
          -160
        ]
      ],
      fw: 24,
      fwStart: 70,
      green: {
        r: 13,
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
          t: 0.62,
          off: 18,
          rx: 9,
          rz: 6
        },
        {
          t: 1.04,
          off: -15,
          rx: 7,
          rz: 5
        }
      ],
      water: [
        {
          poly: [
            [
              58.1,
              12.5
            ],
            [
              55.3,
              11.9
            ],
            [
              52.1,
              20
            ],
            [
              52.5,
              20.8
            ],
            [
              52.7,
              21.5
            ],
            [
              52.6,
              21.9
            ],
            [
              52.5,
              22.3
            ],
            [
              52.5,
              22.8
            ],
            [
              52.6,
              23
            ],
            [
              59.1,
              24.2
            ],
            [
              59.9,
              24.3
            ],
            [
              60.3,
              24.1
            ],
            [
              60.4,
              23.6
            ],
            [
              60.4,
              23
            ],
            [
              60.7,
              22.6
            ],
            [
              62.6,
              21.2
            ],
            [
              63.1,
              21
            ],
            [
              63.6,
              21
            ],
            [
              64,
              21.3
            ],
            [
              65,
              22.3
            ],
            [
              66.1,
              23.5
            ],
            [
              66.6,
              24
            ],
            [
              67.1,
              24.3
            ],
            [
              68,
              24.2
            ],
            [
              68.7,
              24
            ],
            [
              69.3,
              24.3
            ],
            [
              69.8,
              24.8
            ],
            [
              70.3,
              25
            ],
            [
              71.1,
              24.9
            ],
            [
              75,
              23.8
            ],
            [
              78,
              22.2
            ],
            [
              80.1,
              21
            ],
            [
              81.5,
              20.4
            ],
            [
              82.9,
              19.9
            ],
            [
              84,
              19.5
            ],
            [
              84.8,
              19.4
            ],
            [
              85.7,
              19.4
            ],
            [
              86.6,
              19.3
            ],
            [
              87.1,
              19.6
            ],
            [
              87.4,
              20
            ],
            [
              87.7,
              20.5
            ],
            [
              87.5,
              21
            ],
            [
              87.3,
              21.4
            ],
            [
              87.6,
              22.1
            ],
            [
              87.8,
              22.6
            ],
            [
              87.7,
              23.2
            ],
            [
              86.9,
              24.1
            ],
            [
              86.1,
              24.9
            ],
            [
              85.7,
              25.7
            ],
            [
              85.5,
              26.1
            ],
            [
              85.6,
              27.2
            ],
            [
              86.1,
              27.8
            ],
            [
              88.4,
              29.4
            ],
            [
              89.8,
              29.9
            ],
            [
              90.7,
              30
            ],
            [
              91.7,
              29.8
            ],
            [
              92.6,
              29.6
            ],
            [
              93.3,
              29.1
            ],
            [
              94.2,
              27.7
            ],
            [
              94.8,
              26.7
            ],
            [
              95.2,
              26.2
            ],
            [
              95.6,
              25.8
            ],
            [
              95.7,
              25
            ],
            [
              96,
              24.5
            ],
            [
              96.9,
              24
            ],
            [
              96.7,
              23.3
            ],
            [
              96.8,
              22.8
            ],
            [
              97.2,
              22.4
            ],
            [
              97.7,
              22
            ],
            [
              98.4,
              21.5
            ],
            [
              98.7,
              21
            ],
            [
              98.2,
              20.1
            ],
            [
              97.9,
              19.4
            ],
            [
              97.6,
              18.8
            ],
            [
              96.1,
              16.6
            ],
            [
              95.5,
              16.4
            ],
            [
              95.1,
              15.9
            ],
            [
              95,
              15.1
            ],
            [
              94.6,
              15.4
            ],
            [
              93.4,
              15.1
            ],
            [
              93.2,
              14.7
            ],
            [
              92.8,
              14.4
            ],
            [
              91.6,
              13.9
            ],
            [
              91.3,
              14.4
            ],
            [
              90.5,
              14.4
            ],
            [
              89.9,
              14.2
            ],
            [
              89.5,
              13.9
            ],
            [
              89.2,
              13.7
            ],
            [
              87.5,
              13.4
            ],
            [
              87,
              13.5
            ],
            [
              86.8,
              13.8
            ],
            [
              86.4,
              14.7
            ],
            [
              86,
              15.4
            ],
            [
              85.6,
              15.8
            ],
            [
              85,
              15.7
            ],
            [
              84.2,
              15.2
            ],
            [
              83.8,
              14.9
            ],
            [
              83.6,
              14.4
            ],
            [
              83.6,
              13.6
            ],
            [
              83.7,
              13.2
            ],
            [
              84.3,
              12.6
            ],
            [
              84.6,
              12.3
            ],
            [
              83.8,
              11.6
            ],
            [
              82.2,
              12.9
            ],
            [
              81.6,
              13.2
            ],
            [
              80.6,
              13.1
            ],
            [
              80.1,
              13.1
            ],
            [
              79.5,
              13.5
            ],
            [
              79.1,
              13.7
            ],
            [
              78.2,
              14
            ],
            [
              77.4,
              13.9
            ],
            [
              76.7,
              13.6
            ],
            [
              76.1,
              13.1
            ],
            [
              75.9,
              12.7
            ],
            [
              75.5,
              11.3
            ],
            [
              73.4,
              11.5
            ],
            [
              70.8,
              13.3
            ],
            [
              70.1,
              13.6
            ],
            [
              68.8,
              13.9
            ],
            [
              67.1,
              14.4
            ],
            [
              66.5,
              14.4
            ],
            [
              66,
              14.1
            ],
            [
              65.5,
              13.6
            ],
            [
              65.3,
              13.2
            ],
            [
              65.1,
              12.3
            ],
            [
              64.6,
              12.8
            ],
            [
              64.2,
              12.9
            ],
            [
              63.8,
              12.8
            ],
            [
              63.3,
              12.4
            ],
            [
              61.6,
              12.3
            ],
            [
              61.3,
              12.8
            ],
            [
              60.8,
              12.9
            ],
            [
              59.9,
              12.7
            ],
            [
              59.5,
              12.6
            ],
            [
              59.2,
              12.4
            ],
            [
              58.1,
              12.5
            ]
          ],
          level: -0.4
        }
      ],
      lm: {
        type: "none",
        at: [
          0,
          0
        ]
      },
      party: {
        title: "Sea lion",
        on: "water",
        rule: "in the Sound: bark like a sea lion, then drink",
        call: "in the Sound: bark like a sea lion, then drink"
      }
    },
    {
      n: 5,
      name: "The Living World",
      par: 3,
      note: "The Living World is the zoo's education centre, by the north entrance off Government Drive.",
      pts: [
        [
          -30,
          -210
        ],
        [
          -200,
          -195
        ]
      ],
      fw: 0,
      green: {
        r: 13,
        slope: [
          -0.008,
          0.005
        ]
      },
      pin: [
        -3,
        2
      ],
      bunkers: [
        {
          t: 0.95,
          off: -13,
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
      },
      party: {
        title: "Lesson learned",
        on: "threePutt",
        rule: "three-putt: finish your drink",
        call: "three-putt: finish your drink"
      }
    },
    {
      n: 6,
      name: "River's Edge",
      par: 4,
      note: "River's Edge follows a stream past animals of four continents; the zoo's Asian elephants live in Elephant Woods along it.",
      pts: [
        [
          -270,
          -170
        ],
        [
          -350,
          -10
        ],
        [
          -310,
          150
        ]
      ],
      fw: 24,
      fwStart: 70,
      green: {
        r: 13,
        slope: [
          0.004,
          0.009
        ]
      },
      pin: [
        1,
        3
      ],
      bunkers: [
        {
          t: 0.55,
          off: -19,
          rx: 10,
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
      },
      party: {
        title: "Waterfall",
        on: "oob",
        rule: "out of bounds: waterfall, everyone drinks in turn",
        call: "out of the enclosure: waterfall, everyone drinks in turn"
      }
    },
    {
      n: 7,
      name: "Insectarium",
      par: 3,
      note: "The Insectarium has a walk-through butterfly dome, with free-flying butterflies all year.",
      pts: [
        [
          -200,
          200
        ],
        [
          -90,
          70
        ]
      ],
      fw: 0,
      green: {
        r: 13,
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
          t: 0.92,
          off: -12,
          rx: 8,
          rz: 5
        },
        {
          t: 1.07,
          off: 13,
          rx: 6,
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
      },
      party: {
        title: "Bugged",
        on: "sand",
        rule: "bunker: two sips",
        call: "bugged in the bunker: two sips"
      }
    },
    {
      n: 8,
      name: "Penguin & Puffin Coast",
      par: 3,
      note: "Penguin & Puffin Coast keeps its penguins and puffins in a chilled coast of rock and surf, kept near freezing all year.",
      pts: [
        [
          -30,
          190
        ],
        [
          100,
          220
        ]
      ],
      fw: 0,
      green: {
        r: 13,
        slope: [
          -0.008,
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
          off: 12,
          rx: 6,
          rz: 4
        }
      ],
      water: [],
      lm: {
        type: "none",
        at: [
          0,
          0
        ]
      },
      party: {
        title: "Waddle",
        on: "holed",
        rule: "hole out: waddle to the fridge and hand a drink round",
        call: "waddle to the fridge and hand out a drink"
      }
    },
    {
      n: 9,
      name: "Zooline",
      par: 4,
      note: "The Emerson Zooline Railroad runs a mile and a half round the zoo; play home along its line toward the Flight Cage.",
      pts: [
        [
          140,
          -120
        ],
        [
          270,
          -170
        ],
        [
          420,
          -220
        ]
      ],
      fw: 24,
      fwStart: 70,
      green: {
        r: 13,
        slope: [
          0.004,
          0.009
        ]
      },
      pin: [
        1,
        3
      ],
      bunkers: [
        {
          t: 1.03,
          off: -14,
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
      },
      party: {
        title: "Last stop",
        on: "birdie",
        rule: "birdie the last: the whole table drinks",
        call: "birdie on the last: the whole table drinks"
      }
    }
  ]
};
