// Radio presets. Edit freely: each station needs an id, a name, a genre
// group and one or more stream URLs (mirrors are tried in order if one
// fails). `np` names a now-playing feed the radio can poll (only feeds that
// allow cross-origin reads work in the browser: SomaFM and KEXP do; Radio
// Paradise's doesn't, so its stations show the station name only).
//
// Every URL below was checked on 2026-10-14 and returned live MP3/AAC audio.
// All of these are listener-supported, commercial-free stations: SomaFM
// (somafm.com/support) and Radio Paradise (radioparadise.com) ask listeners
// who enjoy them to chip in, and KEXP is a public radio station.

const soma = (ch) => [`https://ice2.somafm.com/${ch}-128-mp3`, `https://ice5.somafm.com/${ch}-128-mp3`, `https://ice6.somafm.com/${ch}-128-mp3`];

export const STATIONS = [
  // indie, garage and post-punk
  { id: 'kexp', name: 'KEXP 90.3 Seattle', group: 'Indie & garage', blurb: 'Where the music matters: indie, garage, punk and live sessions', urls: ['https://kexp-mp3-128.streamguys1.com/kexp128.mp3', 'https://kexp.streamguys1.com/kexp160.aac'], np: { kind: 'kexp' }, by: 'KEXP' },
  { id: 'indiepop', name: 'Indie Pop Rocks!', group: 'Indie & garage', blurb: 'New and classic indie pop', urls: soma('indiepop'), np: { kind: 'soma', ch: 'indiepop' }, by: 'SomaFM' },
  { id: 'u80s', name: 'Underground 80s', group: 'Post-punk & new wave', blurb: 'Early 80s UK synthpop, new wave and post-punk', urls: soma('u80s'), np: { kind: 'soma', ch: 'u80s' }, by: 'SomaFM' },
  { id: 'rp-rock', name: 'Radio Paradise Rock Mix', group: 'Rock', blurb: 'Eclectic rock, hand-picked', urls: ['https://stream.radioparadise.com/rock-192'], by: 'Radio Paradise' },
  { id: 'seventies', name: 'Left Coast 70s', group: 'Rock', blurb: 'Mellow album rock from the seventies', urls: soma('seventies'), np: { kind: 'soma', ch: 'seventies' }, by: 'SomaFM' },
  // soul and funk
  { id: '7soul', name: 'Seven Inch Soul', group: 'Soul & funk', blurb: 'Vintage soul from the original 45s', urls: soma('7soul'), np: { kind: 'soma', ch: '7soul' }, by: 'SomaFM' },
  // jazz, world and eclectic
  { id: 'sonicuniverse', name: 'Sonic Universe', group: 'Jazz & world', blurb: 'Transcending jazz: an eclectic avant-garde take', urls: soma('sonicuniverse'), np: { kind: 'soma', ch: 'sonicuniverse' }, by: 'SomaFM' },
  { id: 'rp-main', name: 'Radio Paradise Main Mix', group: 'Jazz & world', blurb: 'Eclectic, commercial-free, listener-supported', urls: ['https://stream.radioparadise.com/mp3-192'], by: 'Radio Paradise' },
  { id: 'rp-global', name: 'Radio Paradise Global Mix', group: 'Jazz & world', blurb: 'Music from around the world', urls: ['https://stream.radioparadise.com/global-192'], by: 'Radio Paradise' },
  // easy and americana (the plains)
  { id: 'bootliquor', name: 'Boot Liquor', group: 'Americana', blurb: 'Americana roots music for cowhands and cowpokes', urls: soma('bootliquor'), np: { kind: 'soma', ch: 'bootliquor' }, by: 'SomaFM' },
  { id: 'folkfwd', name: 'Folk Forward', group: 'Americana', blurb: 'Indie folk, alt-folk and the occasional folk classic', urls: soma('folkfwd'), np: { kind: 'soma', ch: 'folkfwd' }, by: 'SomaFM' },
  { id: 'rp-mellow', name: 'Radio Paradise Mellow Mix', group: 'Easy', blurb: 'The mellower side of the main mix', urls: ['https://stream.radioparadise.com/mellow-192'], by: 'Radio Paradise' },
  { id: 'groovesalad', name: 'Groove Salad', group: 'Easy', blurb: 'Ambient and downtempo beats', urls: soma('groovesalad'), np: { kind: 'soma', ch: 'groovesalad' }, by: 'SomaFM' },
];

export const stationById = (id) => STATIONS.find((s) => s.id === id) || null;
