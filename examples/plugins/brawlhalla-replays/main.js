// Brawlhalla Replays — reads .replay files (versions 261 to 271, patches 10.02 to 11.00).
// Format: zlib → XOR with a 64-byte key → bit stream (MSB first).
// Credit: format structure from BrawlhallaReplayLibrary (allhailcheese, MIT) and brawlhalla-replay-reader (itselectroz, MIT).
// No network access: everything happens in the WaveDash sandbox, on the folder you picked.

var KEY = [107,16,222,60,68,75,209,70,160,16,82,193,178,49,211,106,251,172,17,222,6,104,8,120,140,213,179,249,106,64,214,19,12,174,157,197,212,107,84,114,252,87,93,26,6,115,194,81,75,176,201,140,120,4,17,122,239,116,62,70,57,160,199,166]
var MAX_NEW = 150          // maximum new replays read per refresh (~25 ms each); WaveDash runs again while some remain
var BUDGET_MS = 2000       // past that, stop: the rest follows on the next run (the sandbox stops at 8 s; a short read disturbs the interface less)
var MAX_POINTS = 5000      // maximum history points returned (WaveDash limit)
var BUCKETS = 76             // storage keys of the game cache (c0 to c75; WaveDash allows 100 keys of 64 KB)
var PLAYER_BUCKETS = 20      // other players' profiles: keys c76 to c95 (same keys as before, nothing more)
var CACHE_V = 13           // cache content version: an older entry is read again

// Legends: replay identifier = legend_id of the official API = in-game HeroID (HeroTypes table of patch 11.00).
// A legend newer than this table is shown as "#id".
var LEGENDS = { 3: 'Bödvar', 4: 'Cassidy', 5: 'Orion', 6: 'Lord Vraxx', 7: 'Gnash', 8: 'Queen Nai', 9: 'Lucien', 10: 'Hattori', 11: 'Sir Roland', 12: 'Scarlet', 13: 'Thatch', 14: 'Ada', 15: 'Sentinel', 16: 'Teros', 17: 'Red Raptor', 18: 'Ember', 19: 'Brynn', 20: 'Asuri', 21: 'Barraza', 22: 'Ulgrim', 23: 'Azoth', 24: 'Koji', 25: 'Diana', 26: 'Jhala', 27: 'Loki', 28: 'Kor', 29: 'Wu Shang', 30: 'Val', 31: 'Ragnir', 32: 'Cross', 33: 'Mirage', 34: 'Nix', 35: 'Mordex', 36: 'Yumiko', 37: 'Artemis', 38: 'Caspian', 39: 'Sidra', 40: 'Xull', 41: 'Isaiah', 42: 'Kaya', 43: 'Jiro', 44: 'Lin Fei', 45: 'Zariel', 46: 'Rayman', 47: 'Dusk', 48: 'Fait', 49: 'Thor', 50: 'Petra', 51: 'Vector', 52: 'Volkov', 53: 'Onyx', 54: 'Jaeyun', 55: 'Mako', 56: 'Magyar', 57: 'Reno', 58: 'Munin', 59: 'Arcadia', 60: 'Ezio', 61: 'Seven', 62: 'Thea', 63: 'Tezca', 64: 'Vivi', 65: 'Imugi', 66: 'King Zuva', 67: 'Priya', 68: 'Ransom', 69: 'Lady Vera', 70: 'Rupture', 71: 'Aurus', 72: 'Qinghua & Baobao' }
function legendName(id) { return LEGENDS[id] || '#' + id }
// Weapons of each legend (BaseWeapon1/2) and map names (LevelTypes), taken from the game data, patch 11.00.
var WEAPONS = { 3: 'Hammer/Sword', 4: 'Pistol/Hammer', 5: 'RocketLance/Spear', 6: 'RocketLance/Pistol', 7: 'Hammer/Spear', 8: 'Spear/Katar', 9: 'Katar/Pistol', 10: 'Sword/Spear', 11: 'RocketLance/Sword', 12: 'Hammer/RocketLance', 13: 'Sword/Pistol', 14: 'Pistol/Spear', 15: 'Hammer/Katar', 16: 'Axe/Hammer', 17: 'Boots/Orb', 18: 'Bow/Katar', 19: 'Axe/Spear', 20: 'Katar/Sword', 21: 'Axe/Pistol', 22: 'Axe/RocketLance', 23: 'Bow/Axe', 24: 'Bow/Sword', 25: 'Bow/Pistol', 26: 'Axe/Sword', 27: 'Katar/Scythe', 28: 'Fists/Hammer', 29: 'Fists/Spear', 30: 'Fists/Sword', 31: 'Katar/Axe', 32: 'Pistol/Fists', 33: 'Scythe/Spear', 34: 'Scythe/Pistol', 35: 'Scythe/Fists', 36: 'Bow/Hammer', 37: 'RocketLance/Scythe', 38: 'Fists/Katar', 39: 'Cannon/Sword', 40: 'Cannon/Axe', 41: 'Cannon/Pistol', 42: 'Spear/Bow', 43: 'Sword/Scythe', 44: 'Katar/Cannon', 45: 'Fists/Bow', 46: 'Fists/Axe', 47: 'Spear/Orb', 48: 'Scythe/Orb', 49: 'Hammer/Orb', 50: 'Fists/Orb', 51: 'RocketLance/Bow', 52: 'Axe/Scythe', 53: 'Fists/Cannon', 54: 'Sword/Greatsword', 55: 'Katar/Greatsword', 56: 'Hammer/Greatsword', 57: 'Pistol/Orb', 58: 'Bow/Scythe', 59: 'Spear/Greatsword', 60: 'Sword/Orb', 61: 'Spear/Cannon', 62: 'Boots/RocketLance', 63: 'Boots/Fists', 64: 'Boots/Pistol', 65: 'Axe/Greatsword', 66: 'Hammer/Boots', 67: 'Chakram/Sword', 68: 'Chakram/Bow', 69: 'Chakram/Scythe', 70: 'Katar/RocketLance', 71: 'Chakram/Spear', 72: 'Orb/Cannon' }
var WEAPON_NAMES = { Hammer: ['Hammer', 'Marteau'], Sword: ['Sword', 'Épée'], Pistol: ['Blasters', 'Blasters'], RocketLance: ['Rocket Lance', 'Lance-roquettes'],
  Spear: ['Spear', 'Lance'], Katar: ['Katars', 'Katars'], Axe: ['Axe', 'Hache'], Bow: ['Bow', 'Arc'], Fists: ['Gauntlets', 'Gantelets'], Scythe: ['Scythe', 'Faux'],
  Cannon: ['Cannon', 'Canon'], Orb: ['Orb', 'Orbe'], Greatsword: ['Greatsword', 'Grande épée'], Boots: ['Battle Boots', 'Bottes'], Chakram: ['Chakram', 'Chakram'] }
// Thumbnail of each map (file in the game's images\thumbnails folder), from LevelTypes of patch 11.00.
// WaveDash shows it from the player's install ("images" permission); no image ships with the plugin.
var THUMBS = {"1": "a_LevelThumbNailBitmap03.jpg", "2": "a_LevelThumbNailBitmap01.jpg", "3": "grumpytemple.jpg", "4": "testmap.jpg", "6": "random.jpg", "7": "greathall.jpg", "8": "nordickungfoot.jpg", "10": "gladekungfoot.jpg", "11": "kingspass.jpg", "12": "smallkingspass.jpg", "13": "testmap.jpg", "14": "testmap.jpg", "15": "brawlball_360.jpg", "16": "bombsketball_360.jpg", "17": "Dodgebomb.jpg", "18": "bp12.jpg", "19": "gladeffa.jpg", "20": "Beachbrawl.jpg", "22": "GolemGulch.jpg", "24": "unnamed.jpg", "25": "Lagoon.jpg", "26": "elysiumarena.jpg", "27": "testmap.jpg", "28": "bp13.jpg", "29": "smallwasteland.jpg", "31": "shrekmuddy.jpg", "33": "wasteland.jpg", "35": "shrekswamp.jpg", "39": "brawlball_360.jpg", "40": "enigma_360.jpg", "42": "smallfortressofwolves.jpg", "43": "Cathedral.jpg", "45": "a_LevelThumbNailBitmap03.jpg", "46": "bp14.jpg", "47": "Mammoth.jpg", "49": "testmap.jpg", "50": "testmap.jpg", "51": "testmap.jpg", "53": "brawlball_360.jpg", "54": "wally.jpg", "55": "bigtitansend.jpg", "56": "bigthundergard.jpg", "57": "biggrove.jpg", "58": "biggreathall.jpg", "59": "LabyrinthBig.jpg", "62": "smallthunder.jpg", "63": "MammothSmall.jpg", "64": "SmallBlackguard.jpg", "65": "smallgreathall.jpg", "66": "Lagoon.jpg", "67": "testmap.jpg", "68": "testmap.jpg", "70": "Fangwild.jpg", "71": "testmap.jpg", "72": "testmap.jpg", "73": "Labyrinth.jpg", "74": "Dodgebomb.jpg", "76": "MiamiDome.jpg", "81": "smallgrumpytemple.jpg", "84": "testmap.jpg", "89": "testmap.jpg", "90": "testmap.jpg", "91": "testmap.jpg", "93": "testmap.jpg", "94": "BrawlhavenSmall.jpg", "95": "SteamSmall.jpg", "96": "testmap.jpg", "97": "testmap.jpg", "98": "testmap.jpg", "99": "elysium.jpg", "100": "SmallFangwild.jpg", "101": "testmap.jpg", "102": "testmap.jpg", "103": "testmap.jpg", "104": "testmap.jpg", "105": "climb.jpg", "106": "Lagoon.jpg", "110": "testmap.jpg", "112": "capturetheflag.jpg", "115": "battlehill.jpg", "116": "testmap.jpg", "117": "testmap.jpg", "118": "testmap.jpg", "119": "testmap.jpg", "120": "testmap.jpg", "121": "testmap.jpg", "123": "soccer.jpg", "124": "warshuttle.jpg", "125": "testmap.jpg", "126": "testmap.jpg", "127": "smallgalvanprime.jpg", "128": "bigmiamidome.jpg", "129": "horde.jpg", "130": "buddy.jpg", "131": "treefort.jpg", "132": "ring.jpg", "135": "demonisland.jpg", "136": "bigcrystal.jpg", "137": "crystaltemple.jpg", "138": "climbffa.jpg", "139": "galvanprime.jpg", "140": "synthwavesoccer.jpg", "141": "synthwaveffa.jpg", "143": "spiritrealmshowdown.jpg", "144": "bp11.jpg", "146": "zombie.jpg", "147": "testmap.jpg", "148": "synthwaveffa.jpg", "150": "zombie.jpg", "151": "spiritrealm.jpg", "152": "norsebrawlball.jpg", "153": "norsebrawlball.jpg", "154": "spiritrealmnotraps.jpg", "174": "norsewinterffa.jpg", "175": "sewersffa.jpg", "176": "Lagoon.jpg", "177": "smallsewers.jpg", "178": "fortressoflions.jpg", "180": "climblions.jpg", "184": "suzakucastlewalls.jpg", "185": "suzakucastle.jpg", "186": "smallspace.jpg", "187": "spaceffa.jpg", "188": "climblions.jpg", "190": "wastelandshowdown.jpg", "191": "bustlingsidestreet.jpg", "210": "giantswordffa.jpg", "211": "giantsword.jpg", "212": "westernairtemple.jpg", "214": "SteamSmall.jpg", "215": "battlehill.jpg", "216": "smallrooftop.jpg", "217": "rooftopffa.jpg", "220": "tabletop.jpg", "221": "volleybattle.jpg", "222": "bigwesternairtemple.jpg", "223": "mishimadojo.jpg", "226": "nightmarehorde.jpg", "227": "mishimavolley.jpg", "229": "bp8small.jpg", "231": "bp8ffa.jpg", "232": "bikinibottom.jpg", "233": "nordic1v1.jpg", "234": "starlightfalls.jpg", "235": "bp9small.jpg", "236": "bp9big.jpg", "237": "mustafar.jpg", "238": "bp9tiny.jpg", "242": "powergenerator.jpg", "246": "smallpowergenerator.jpg", "249": "moseisley.jpg", "250": "Labyrinth.jpg", "251": "Labyrinth.jpg", "252": "Labyrinth.jpg", "253": "fortressoflions.jpg", "254": "Labyrinth.jpg", "255": "mustafar.jpg", "258": "lavabrawl_ivaldi.jpg", "263": "bigcrystal.jpg", "266": "batavia.jpg", "269": "shiganshina2v2.jpg", "271": "shiganshina3v3.jpg"}
var LEVELS = {"1": "Twilight Grove", "2": "Brawlhaven", "3": "Grumpy Temple", "4": "Small Twilight Grove", "6": "Random", "7": "The Great Hall", "8": "World's End Kung Foot", "10": "Enchanted Forest Arena", "11": "Kings Pass", "12": "Small Kings Pass", "13": "Small Kings Pass Test", "14": "Small Kings Pass Test2", "15": "Brawlball Arena", "16": "Bombsketball Arena", "17": "Dodgebomb Arena", "18": "Jikoku", "19": "Enchanted Forest", "20": "Beachbrawl Arena", "22": "Titan's End", "24": "Thundergard Stadium", "25": "Shipwreck Falls", "26": "Elysium Arena", "27": "Brawlball2", "28": "Shadowscar Landing", "29": "Small Wasteland", "31": "Shrek's Muddy Swamp", "33": "The Wasteland", "35": "Shrek's Swamp", "39": "Big Brawlball Arena", "40": "The Enigma", "42": "Small Fortress of Wolves", "43": "Blackguard Keep", "45": "Dev Grid", "46": "Eternity's End", "47": "Mammoth Fortress", "49": "Short Side", "50": "Pillars", "51": "Pit", "53": "Brawlball_4_30", "54": "Wally", "55": "Big Titan's End", "56": "Big Thundergard Stadium", "57": "Big Twilight Grove", "58": "Big Great Hall", "59": "Big Lost Labyrinth", "62": "Small Thundergard Stadium", "63": "Small Mammoth Fortress", "64": "Small Blackguard Keep", "65": "Small Great Hall", "66": "Plain", "67": "Small Titan's End", "68": "Danger Zone", "70": "The Fangwild", "71": "Wheel", "72": "Chute", "73": "Lost Labyrinth", "74": "Big Dodgebomb Arena", "75": "Catch Bombs", "76": "Miami Dome", "81": "Small Grumpy Temple", "84": "Color Platforms", "89": "Tutorial 1", "90": "Tutorial 2", "91": "Tutorial 3", "93": "Sanctuary", "94": "Small Brawlhaven", "95": "Small Enigma", "96": "Big Enigma", "97": "Big Shipwreck Falls", "98": "Big Brawlhaven", "99": "Elysium", "100": "Small Fangwild", "101": "Competitive Grumpy", "102": "Small Lost Labyrinth", "103": "Spike", "104": "Small Cave 2", "105": "Temple Climb", "106": "Paintbrawl", "110": "Flag Battle", "112": "Demon Island CTF", "115": "Plains of Passage", "116": "Crazy Shipwreck Falls", "117": "Crazy Fangwild", "118": "Crazy Titan's End", "119": "Floor is not Lava", "120": "Crazy Thundergard Stadium", "121": "Xull's Murder Box", "123": "Kung Foot Arena", "124": "Apocalypse", "125": "Big Crazy Fangwild", "126": "Fangwild Dodgebomb", "127": "Small Galvan Prime", "128": "Big Miami Dome", "129": "Horde", "130": "Under the Canopy", "131": "Tree Fort", "132": "Ring", "135": "Demon Island", "136": "Big Crystal Temple", "137": "Crystal Temple", "138": "Temple Ruins", "139": "Galvan Prime", "140": "Synthwave Kung Foot", "141": "Sun Drive City", "143": "Spirit Realm Showdown", "144": "Lich's Tomb", "146": "Walker Attack!", "147": "Hiding Plats 2 Electric Boo", "148": "Small Sun Drive City", "150": "FeudingFlats", "151": "Spirit Realm", "152": "World's End Arena", "153": "Big World's End Arena", "154": "Divine Spirit Showdown", "174": "World's End", "175": "The Turtles' Lair", "176": "Small Plain", "177": "Small Turtles' Lair", "178": "Fortress of the Lions", "180": "Siege of Lions", "184": "Suzaku Castle Walls", "185": "Suzaku Castle", "186": "Void Minor", "187": "Void Major", "188": "Cannonball Mania", "190": "The Wasteland Showdown", "191": "Bustling Side Street", "210": "Fabled City", "211": "Small Fabled City", "212": "Western Air Temple", "214": "Little Boat", "215": "Frozen Plains", "216": "Florence Rooftop", "217": "Florence Terrace", "220": "Shorwind Fishing Port", "221": "Thundergard Sands", "222": "Western Air Temple Brawl", "223": "Mishima Dojo", "226": "Nightmare Horde", "227": "TEKKEN Brawl", "229": "Small Terminus", "231": "Terminus", "232": "Bikini Bottom", "233": "Small World's End", "234": "Starlight Falls", "235": "Crumbling Chasm", "236": "Apocalyptic Chasm", "237": "Mustafar", "238": "Crumbled Chasm", "242": "Theed Power Generator", "246": "Small Theed Generator", "249": "Mos Eisley Spaceport", "250": "Flipped90BP6GiantSword", "251": "TutorialBP6GiantSword", "252": "NTLost Labyrinth", "253": "Tutorial Fortress of the Lions", "254": "NTLostLab2", "255": "Mustafar", "258": "Old Ivaldi Mine", "263": "Dragon Port", "266": "Castle Batavia", "269": "Shiganshina District", "271": "Shiganshina District Brawl"}
// Format version → patch (checked against replay file names).
var PATCHES = { 261: '10.02', 262: '10.03', 263: '10.04', 264: '10.05', 265: '10.06', 266: '10.07', 267: '10.08', 268: '10.09', 269: '10.10', 270: '10.11', 271: '11.00' }
function weaponsOf(id, fr) { var w = WEAPONS[id]; return w ? w.split('/').map(function (x) { return (WEAPON_NAMES[x] || [x, x])[fr ? 1 : 0] }).join(' / ') : '—' }

/* ───────── inflate (zlib), output capped at `limit` bytes ───────── */
var LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258]
var LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0]
var DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577]
var DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13]
var CLORD = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]

/** Decoding table of a canonical Huffman code: indexed by the next `max` bits of the stream (deflate order),
 *  each slot holds (symbol << 4) | code length. One lookup per symbol instead of a bit-by-bit loop. */
function huffTable(lengths, n) {
  var max = 0, count = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], next = [], i, l
  for (i = 0; i < n; i++) { if (lengths[i] > max) max = lengths[i]; count[lengths[i]]++ }
  count[0] = 0
  for (var code = 0, b = 1; b <= 15; b++) { code = (code + count[b - 1]) << 1; next[b] = code }
  var size = 1 << max, tab = new Int32Array(size)
  for (i = 0; i < n; i++) {
    l = lengths[i]
    if (!l) continue
    var c = next[l]++, rev = 0
    for (var k = 0; k < l; k++) { rev = (rev << 1) | (c & 1); c >>= 1 }
    for (var j = rev; j < size; j += 1 << l) tab[j] = (i << 4) | l
  }
  return { tab: tab, mask: size - 1, max: max }
}

function inflate(src, limit) {
  var pos = 2, n = src.length, bitBuf = 0, bitCnt = 0, out = new Uint8Array(Math.min(limit, 65536) + 600), o = 0
  function need(k) {                                                    // past the end: zeros, checked below
    while (bitCnt < k) { bitBuf |= (pos < n ? src[pos] : 0) << bitCnt; pos++; bitCnt += 8 }
    if (pos > n + 4) throw new Error('end of data')
  }
  function bits(k) { if (!k) return 0; need(k); var v = bitBuf & ((1 << k) - 1); bitBuf >>>= k; bitCnt -= k; return v }
  function decode(t) {
    need(t.max)
    var v = t.tab[bitBuf & t.mask], l = v & 15
    if (!l) throw new Error('code invalide')
    bitBuf >>>= l; bitCnt -= l; return v >> 4
  }
  function grow(need2) {
    if (o + need2 <= out.length) return
    var bigger = new Uint8Array(out.length * 2 + need2); bigger.set(out); out = bigger
  }
  var fixedL = null, fixedD = null, last
  do {
    last = bits(1)
    var type = bits(2), lt, dt
    if (type === 0) {
      var drop = bitCnt & 7; bitBuf >>>= drop; bitCnt -= drop             // back to the byte boundary
      pos -= bitCnt >> 3; bitBuf = 0; bitCnt = 0
      var len = src[pos] | (src[pos + 1] << 8); pos += 4
      if (pos + len > n) throw new Error('end of data')
      grow(len)
      for (var k = 0; k < len; k++) out[o++] = src[pos++]
      if (o >= limit) break
      continue
    }
    if (type === 1) {
      if (!fixedL) {
        var fl = []; for (var a = 0; a < 288; a++) fl.push(a < 144 ? 8 : a < 256 ? 9 : a < 280 ? 7 : 8)
        var fd = []; for (a = 0; a < 30; a++) fd.push(5)
        fixedL = huffTable(fl, 288); fixedD = huffTable(fd, 30)
      }
      lt = fixedL; dt = fixedD
    } else if (type === 2) {
      var nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4, lengths = [], idx
      for (idx = 0; idx < 19; idx++) lengths.push(0)
      for (idx = 0; idx < ncode; idx++) lengths[CLORD[idx]] = bits(3)
      var ch = huffTable(lengths, 19), all = []
      while (all.length < nlen + ndist) {
        var sym = decode(ch)
        if (sym < 16) all.push(sym)
        else {
          var prev = 0, rep
          if (sym === 16) { if (!all.length) throw new Error('code invalide'); prev = all[all.length - 1]; rep = 3 + bits(2) } else if (sym === 17) rep = 3 + bits(3); else rep = 11 + bits(7)
          while (rep--) all.push(prev)
        }
      }
      lt = huffTable(all.slice(0, nlen), nlen); dt = huffTable(all.slice(nlen, nlen + ndist), ndist)
    } else throw new Error('bloc invalide')
    for (;;) {
      var s = decode(lt)
      if (s < 256) { if (o >= out.length) grow(1); out[o++] = s }
      else if (s === 256) break
      else {
        s -= 257
        if (s >= 29) throw new Error('code invalide')
        var l = LBASE[s] + bits(LEXT[s]), d = decode(dt)
        if (d >= 30) throw new Error('code invalide')
        var dist = DBASE[d] + bits(DEXT[d])
        if (dist > o) throw new Error('distance invalide')
        grow(l)
        for (var m = 0; m < l; m++) { out[o] = out[o - dist]; o++ }
      }
      if (o >= limit) return out.subarray(0, o)
    }
  } while (!last)
  return out.subarray(0, o)
}

/* ───────── bit stream reading ───────── */
function Reader(buf) {                                               // the XOR is applied once, then bytes are read one by one
  for (var i = 0; i < buf.length; i++) buf[i] ^= KEY[i & 63]
  this.b = buf; this.p = 0; this.end = buf.length * 8
}
Reader.prototype.bit = function () {
  if (this.p >= this.end) throw new Error('EOF')
  var v = (this.b[this.p >> 3] >> (7 - (this.p & 7))) & 1
  this.p++; return v
}
Reader.prototype.skip = function (n) { this.p += n }
Reader.prototype.bits = function (n) {
  if (this.p + n > this.end) throw new Error('EOF')
  var r = 0
  while (n > 0) {
    var off = this.p & 7, avail = 8 - off, take = avail < n ? avail : n
    r = r * (1 << take) + ((this.b[this.p >> 3] >> (avail - take)) & ((1 << take) - 1))
    this.p += take; n -= take
  }
  return r
}
Reader.prototype.u32 = function () { return this.bits(32) }
Reader.prototype.i32 = function () { return this.bits(32) | 0 }
Reader.prototype.str = function () {
  var n = this.bits(16), bytes = []
  for (var i = 0; i < n; i++) bytes.push(this.bits(8))
  return utf8(bytes)
}
function utf8(b) {
  var s = '', i = 0
  while (i < b.length) {
    var c = b[i++]
    if (c < 0x80) s += String.fromCharCode(c)
    else if (c >= 0xc0 && c < 0xe0 && i < b.length + 0) s += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63))
    else if (c >= 0xe0 && c < 0xf0) { s += String.fromCharCode(((c & 15) << 12) | ((b[i] & 63) << 6) | (b[i + 1] & 63)); i += 2 }
    else if (c >= 0xf0) { var cp = ((c & 7) << 18) | ((b[i] & 63) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63); i += 3; cp -= 0x10000; s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023)) }
  }
  return s
}

/* ───────── game data checksum (from BrawlhallaReplayLibrary, ReplayGameData.CalculateChecksum) ───────── */
function add() { var s = 0; for (var i = 0; i < arguments.length; i++) s = (s + arguments[i] % 4294967296) % 4294967296; return s }
function popcount(v) { var n = 0; while (v) { n += v & 1; v >>>= 1 } return n }
function roundEven(x) { var f = Math.floor(x), d = x - f; return d > 0.5 || (d === 0.5 && f % 2) ? f + 1 : f }   // rounding of C#'s Math.Round
function FormatError(version) { this.message = 'unrecognized format (version ' + version + ')'; this.unknownFormat = true }

/* ───────── replay parsing (stops before the "inputs") ───────── */
function parseBuffer(buf) {
  var r = new Reader(buf), rep = { version: r.u32(), online: false, playlist: '', levelId: 0, lives: 0, ents: [], scores: {}, length: 0, kos: [], inputs: {} }
  var haveGame = false
  for (;;) {
    var t = r.bits(4)
    if (t === 3) {                                                    // header
      r.u32(); var pid = r.u32(); rep.playlistId = pid
      if (pid) rep.playlist = r.str()
      rep.online = !!r.bit()
    } else if (t === 4) {                                             // game data
      var st = []; for (var i = 0; i < 15; i++) st.push(r.u32())
      rep.lives = st[4]; rep.maxPlayers = st[1]; rep.settings = st; rep.levelId = r.u32()
      var hc = r.bits(16)
      if (hc < 1 || hc > 5) throw new Error('invalid number of legends')
      var sum = 0                                                       // player checksum (see checksumOf)
      while (r.bit()) {
        var e = { id: r.i32() }
        if (rep.version >= 268) e.pid = r.u32()                        // account identifier (added in v268, patch 10.09; 0 for bots)
        e.name = r.str()
        var cs = 0, cos = []
        for (i = 0; i < 6; i++) cos.push(r.u32())                      // colours, spawn bot, companion, emitter, trail, theme
        cs = add(cs, cos[0] * 5, cos[1] * 93, cos[3] * 97, cos[5] * 53)
        for (i = 0; i < 8; i++) cs = add(cs, r.u32() * (13 + i))       // equipped taunts
        cs = add(cs, r.bits(16) * 37, r.bits(16) * 41)                 // win / loss taunts
        for (i = 0; r.bit(); i++) cs = add(cs, popcount(r.u32()) * (11 + i))   // owned taunts (bit field)
        r.bits(16); e.team = r.i32(); r.i32()
        cs = add(cs, (e.team >>> 0) * 43)
        e.heroes = []
        for (i = 0; i < hc; i++) {
          var h = r.u32(), costume = r.u32(), stance = r.u32()
          var top = r.bit(), skin2 = r.bits(15), morph = r.bit(), skin1 = r.bits(15)
          // The leading bit counts as bit 31 of the combined value (checked on replays with several legends).
          cs = add(cs, h * (17 + i), costume * (7 + i), stance * (3 + i), ((top * 32768 + skin2) * 65536 + skin1 + morph * 32768) % 4294967296 * (2 + i))
          e.heroes.push(h); if (!i) { e.costume = costume; e.stance = stance }
        }
        e.bot = !!r.bit()
        if (r.bit()) cs = add(cs, r.u32() * 31, roundEven(r.u32() / 10) * 3, roundEven(r.u32() / 10) * 23)   // handicaps
        else cs = add(cs, 29)
        sum = add(sum, cs)
        rep.ents.push(e)
        if (rep.ents.length > 16) throw new Error('trop de joueurs')
      }
      // The game writes a checksum of the game data: if it does not match, the format changed and nothing wrong is read.
      if (r.u32() !== add(sum, rep.levelId * 47) % 173) throw new FormatError(rep.version)
      haveGame = true
    } else if (t === 6) {                                             // results
      var len = r.u32(), sc = {}
      if (r.bit()) while (r.bit()) { var id = r.bits(5), s = r.bits(16); sc[id] = s > 32767 ? s - 65536 : s }
      r.u32()
      rep.length = len
      if (Object.keys(sc).length) rep.scores = sc
    } else if (t === 5 || t === 7) {                                  // KOs (5) and other faces (7)
      var list = []
      while (r.bit()) { var ent = r.bits(5), ts = r.i32(); list.push([ent, ts]) }
      if (t === 5) rep.kos = list
    } else if (t === 1) {                                              // inputs: state of the 14 keys at every change
      while (r.bit()) {
        var who = r.bits(5), cnt = r.i32()
        if (cnt < 0 || cnt > 2000000) throw new Error('inputs invalides')
        var acc = rep.inputs[who] || (rep.inputs[who] = newInputs())
        // Hottest loop of the plugin: inline bit reading (no method call), much faster in QuickJS.
        var B = r.b, p = r.p, end = r.end, len = B.length
        for (var q = 0; q < cnt; q++) {
          if (p + 33 > end) throw new Error('EOF')
          var i3 = p >> 3, o3 = p & 7
          var hi = (((B[i3] << 16) | ((i3 + 1 < len ? B[i3 + 1] : 0) << 8) | (i3 + 2 < len ? B[i3 + 2] : 0)) >> (8 - o3)) & 65535
          i3 = (p + 16) >> 3
          var lo = (((B[i3] << 16) | ((i3 + 1 < len ? B[i3 + 1] : 0) << 8) | (i3 + 2 < len ? B[i3 + 2] : 0)) >> (8 - o3)) & 65535
          var ts = hi * 65536 + lo                                      // horodatage en ms
          p += 32
          var flags = 0
          if ((B[p >> 3] >> (7 - (p & 7))) & 1) {
            p++
            if (p + 14 > end) throw new Error('EOF')
            i3 = p >> 3
            flags = ((((B[i3] << 16) | ((i3 + 1 < len ? B[i3 + 1] : 0) << 8) | (i3 + 2 < len ? B[i3 + 2] : 0))) >> (10 - (p & 7))) & 16383
            p += 14
          } else p++
          trackInput(acc, ts, flags)
        }
        r.p = p
      }
    } else if (t === 2) break
    else throw new Error('type d\'objet inconnu ' + t)
  }
  if (!haveGame || !rep.ents.length) throw new Error('replay incomplet')
  return rep
}

/* ───────── inputs: presses, directions, movement, activity ───────── */
// Flags (from BrawlhallaReplayLibrary): 1 up, 2 down, 4 left, 8 right, 16 jump, 32 neutral priority,
// 64 heavy attack, 128 light attack, 256 dodge/dash, 512 pick up/throw, 1024 to 8192 taunts.
var BUCKET_MS = 15000
// ev: times (ms) of throws (0) and taunts (1), at most 60 per player, for the game timeline.
// The dodge key is also used for dash, gravity cancel and chase dodge: each press is classified (see trackInput).
// d and g: dodges only; x: [gravity cancels, probable chase dodges, probable dashes].
function newInputs() { return { l: [0, 0, 0], h: [0, 0, 0], g: [0, 0, 0, 0, 0, 0, 0, 0, 0], d: 0, x: [0, 0, 0], j: 0, t: 0, tt: 0, mv: 0, act: [], ev: [], prev: 0, last: 0, atk: -1e9, jump: -1e9, pend: null } }
// Game rules (brawlhalla.wiki.gg, Movement page; 60 frames/s, 1 frame ≈ 16.7 ms) and measurements on 300 real replays:
// - gravity cancel: spot dodge in the air then an attack within 18 frames (300 ms), or a directional dodge then an attack
//   in the same direction within 3 frames (50 ms, +1 frame of margin);
// - chase dodge: only after an attack that hit, within 12 frames after it ends. The replay does not say whether the attack
//   hit, nor which attack (weapon held, ground or air): window of 200 to 850 ms after the press, union of "end of attack
//   + 12 frames" (measured peak, then a sharp drop after 850 ms). Estimate;
// - dash: on the ground, dodge + left/right is always a dash. The replay does not say whether the player is grounded: sideways with no jump
//   in the previous 700 ms = probable dash. Estimate.
var GC_SPOT_MS = 300, GC_DIR_MS = 67, CHASE_MIN = 200, CHASE_MAX = 850, AIR_MS = 700
function dirOf(f) { return f & 2 && !(f & 12) ? 2 : f & 12 ? 1 : 0 }            // 0 neutral, 1 side, 2 down (direction held)
function trackInput(a, ts, f) {
  if (a.prev & 12 && ts > a.last) a.mv += ts - a.last                    // time spent holding left or right
  var down = f & ~a.prev
  if (down & 976) {                                                      // one action: attack, dodge, jump, throw
    var b = Math.floor(ts / BUCKET_MS); while (a.act.length <= b && a.act.length < 600) a.act.push(0); if (b < 600) a.act[b]++
    if (down & 128) a.l[dirOf(f)]++
    if (down & 64) a.h[dirOf(f)]++
    if (down & 256) {
      var side = !!(f & 4) !== !!(f & 8), cell = (f & 1 ? 0 : f & 2 ? 6 : 3) + (f & 4 && !(f & 8) ? 0 : f & 8 && !(f & 4) ? 2 : 1), since = ts - a.atk
      var cat = since >= CHASE_MIN && since <= CHASE_MAX ? 1 : side && ts - a.jump > AIR_MS ? 2 : -1
      if (cat < 0) { a.d++; a.g[cell]++ } else a.x[cat]++
      // Direction of the press (0 spot, 1 side, 2 down, 3 up): a chase dodge followed by an attack stays a chase dodge.
      a.pend = cat === 1 ? null : { ts: ts, cat: cat, cell: cell, dir: side ? 1 : f & 2 ? 2 : f & 1 ? 3 : 0 }
    }
    if (down & 192) {
      // Attack right after the press: it was a gravity cancel. Spot: 300 ms; directional: 50 ms, attack in the same direction
      // (side → side attack, down → down attack, up → neutral attack).
      var pd = a.pend, gap = pd ? ts - pd.ts : 1e9, adir = (f & 4) !== 0 !== ((f & 8) !== 0) ? 1 : f & 2 ? 2 : 3
      if (pd && (pd.dir === 0 ? gap <= GC_SPOT_MS : gap <= GC_DIR_MS && adir === pd.dir)) { if (pd.cat < 0) { a.d--; a.g[pd.cell]-- } else a.x[pd.cat]--; a.x[0]++ }
      a.pend = null; a.atk = ts
    }
    if (down & 16) { a.j++; a.jump = ts }
    if (down & 512) { a.t++; if (a.ev.length < 60) a.ev.push([ts, 0]) }
  }
  if (down & 15360) { a.tt++; if (a.ev.length < 60) a.ev.push([ts, 1]) }
  a.prev = f; a.last = ts
}

function parseReplay(bytes) {
  return parseBuffer(inflate(bytes, 12 * 1024 * 1024))                  // a decompressed replay is a few tens of KB
}

/* ───────── cache (avoids reading already parsed replays again) ───────── */
function bucketOf(name) { var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 100003; return 'c' + (h % BUCKETS) }
function loadCache() {
  var cache = {}
  for (var i = 0; i < BUCKETS; i++) {
    var raw = host.storage.get('c' + i)
    if (!raw) continue
    try { var o = JSON.parse(raw); for (var k in o) cache[k] = o[k] } catch (e) { /* corrupted cache: ignored */ }
  }
  return cache
}
function saveCache(entries) {
  var buckets = {}
  for (var k in entries) { var b = bucketOf(k.split('|')[0]); (buckets[b] = buckets[b] || {})[k] = entries[k] }
  for (var i = 0; i < BUCKETS; i++) {
    var key = 'c' + i, next = buckets[key] ? JSON.stringify(buckets[key]) : ''
    if (next.length > 60000) { host.log('Cache full (' + key + '): some replays will be read again.'); continue }
    if ((host.storage.get(key) || '') !== next) host.storage.set(key, next)
  }
}
/* ───────── other players' profiles (accumulated game after game) ───────── */
// Key: account identifier if any, otherwise name without tag. Fields: n latest name, p identifier, t date of the name,
// c games, L legends played, w/l wins/losses of their side, d KOs taken, g dodges (3×3), at attacks (light/heavy × neutral/side/down),
// j jumps, dg dodges, th throws, a/aN presses per minute, tm/op games with you / against you.
function playerKeyOf(e) { return e.pid ? 'p' + e.pid : 'n' + bareName(e.name) }
function playerBucket(k) { var h = 0; for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) % 100003; return 'c' + (BUCKETS + h % PLAYER_BUCKETS) }
function loadPlayers() {
  if (host.storage.get('base') !== 'players' + CACHE_V) return {}       // different version: everything is read again, profiles start from zero
  var out = {}
  for (var i = 0; i < PLAYER_BUCKETS; i++) { try { var o = JSON.parse(host.storage.get('c' + (BUCKETS + i)) || '{}'); for (var k in o) out[k] = o[k] } catch (e) { /* ignored */ } }
  return out
}
function savePlayers(pl) {
  var buckets = {}
  for (var k in pl) { var b = playerBucket(k); (buckets[b] = buckets[b] || {})[k] = pl[k] }
  for (var i = 0; i < PLAYER_BUCKETS; i++) {
    var key = 'c' + (BUCKETS + i), o = buckets[key] || {}, txt = JSON.stringify(o)
    if (txt.length > 60000) {                                             // too big: forget the players met least often first
      var ks = Object.keys(o).sort(function (a, b) { return o[a].c - o[b].c })
      while (txt.length > 60000 && ks.length) { delete o[ks.shift()]; txt = JSON.stringify(o) }
    }
    if ((host.storage.get(key) || '') !== txt) host.storage.set(key, txt)
  }
  host.storage.set('base', 'players' + CACHE_V)
}
function addPlayers(pl, full, a, t) {
  var places = a.ents.map(function (e) { return full.s[e.id] }).filter(function (v) { return v > 0 })
  var best = places.length ? Math.min.apply(null, places) : 0, decided = places.some(function (v) { return v !== best })
  a.ents.forEach(function (e) {
    if (e.bot || (a.me && e.id === a.me.id)) return
    var k = playerKeyOf(e), x = pl[k] || (pl[k] = { n: '', p: e.pid || 0, t: 0, c: 0, L: {}, w: 0, l: 0, d: 0, g: [0, 0, 0, 0, 0, 0, 0, 0, 0], x: [0, 0, 0], at: [0, 0, 0, 0, 0, 0], j: 0, dg: 0, th: 0, a: 0, aN: 0, tm: 0, op: 0 })
    if (t >= x.t) { x.n = e.name.slice(0, 32); x.t = t }
    x.c++; x.L[e.hero] = (x.L[e.hero] || 0) + 1; x.d += a.deaths[e.id].length
    var place = full.s[e.id]
    if (place > 0 && decided) { if (place === best) x.w++; else x.l++ }
    if (a.me) { if (a.sameTeam(e, a.me)) x.tm++; else x.op++ }
    var q = presses(full, e.id)
    if (q) {
      for (var i = 0; i < 9; i++) x.g[i] += q.g[i]
      for (i = 0; i < 3; i++) { x.at[i] += q.l[i]; x.at[3 + i] += q.h[i] }
      x.j += q.j; x.dg += q.d; x.th += q.t
      if (q.x) for (i = 0; i < 3; i++) x.x[i] += q.x[i]
      var apm = apmOf(full, e.id); if (apm !== null) { x.a += apm; x.aN++ }
    }
  })
}

function compact(rep) {
  var ins = {}
  for (var k in rep.inputs) { var a = rep.inputs[k]; ins[k] = { l: a.l, h: a.h, g: a.g, d: a.d, x: a.x, j: a.j, t: a.t, tt: a.tt, mv: a.mv, act: a.act, ev: a.ev } }
  return { n: rep.ents.map(function (e) { return [e.name, e.team, e.heroes[0], e.bot ? 1 : 0, e.id, e.costume, e.stance, e.pid || 0] }), s: rep.scores, k: rep.kos, l: rep.length,
    m: rep.levelId, p: rep.playlist, pid: rep.playlistId, o: rep.online ? 1 : 0, lv: rep.lives, st: rep.settings || [], i: ins, ver: rep.version }
}

/* ───────── computations ───────── */
function tr(isFr, en, fr) { return isFr ? fr : en }
function modeLabel(c, lang) {
  if (c.p) {
    var m = /^PlaylistType_(.*?)(?:_DisplayName)?$/.exec(c.p)
    if (m) return m[1].replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
    return c.p
  }
  return c.o ? (lang === 'fr' ? 'Salon en ligne' : 'Online room') : (lang === 'fr' ? 'Hors ligne' : 'Offline')
}
/** The game names its files "[11.00] SmallBrawlhaven (42).replay": the map is in the name; otherwise, the game table. */
function mapFromFile(name) {
  var m = /^\[[^\]]*\]\s*(.+?)(?:\s*\(\d+\))?\.replay$/i.exec(name)
  return m ? m[1].replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').replace(/_/g, ' ').trim() : ''
}
// The game table first: the game truncates some file names ("SmallFortressof").
function mapName(file, c, fr) { return LEVELS[c.m] || mapFromFile(file.name) || tr(fr, 'Map #', 'Carte #') + c.m }
function patchOf(file, c) { var m = /^\[(\d+\.\d+)\]/.exec(file.name); return m ? m[1] : PATCHES[c.ver] || ('v' + c.ver) }
function fmtDur(sec) { sec = Math.round(sec); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s }
function pad(n) { return (n < 10 ? '0' : '') + n }
function fmtDate(ts) { var d = new Date(ts); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) }
function pct(a, b) { return b ? Math.round(a * 1000 / b) / 10 : 0 }
/** Names searched for: several allowed, comma-separated (e.g. after a name change). */
function wantedList(raw) { return (raw || '').split(/[,;]/).map(function (w) { return w.toLowerCase().trim() }).filter(Boolean) }
/** Identical name (with or without clan tag): the only case where your identifier is learned, so a partial namesake's is never taken. */
function exactly(name, wanted) {
  var a = name.toLowerCase(), tagless = a.indexOf('|') >= 0 ? a.slice(a.indexOf('|') + 1).trim() : a
  return wanted.some(function (w) { return a === w || tagless === w })
}
function matches(name, wanted) {
  var a = name.toLowerCase()
  var tagless = a.indexOf('|') >= 0 ? a.slice(a.indexOf('|') + 1).trim() : a
  return wanted.some(function (w) { return a === w || tagless === w || a.indexOf(w) >= 0 })
}

/** You in the game: first your account identifier (learned from your name, it survives name changes),
 *  otherwise your name. The second local player ("name•2") shares your identifier: it never comes before you. */
function analyse(c, wanted, myPids) {
  var ents = c.n.map(function (n) { return { name: n[0], team: n[1], hero: n[2], bot: n[3], id: n[4], costume: n[5], stance: n[6], pid: n[7] || 0 } })
  var me = null, guest = function (e) { return /•\d+$/.test(e.name) }
  var byPid = myPids ? ents.filter(function (e) { return e.pid && myPids[e.pid] }) : []
  var byName = ents.filter(function (e) { return matches(e.name, wanted) })
  var pool = byPid.length ? byPid : byName
  for (var i = 0; i < pool.length; i++) if (!guest(pool[i])) { me = pool[i]; break }
  if (!me && pool.length) me = pool[0]
  var deaths = {}; ents.forEach(function (e) { deaths[e.id] = [] })
  c.k.slice().sort(function (a, b) { return a[1] - b[1] }).forEach(function (k) { if (deaths[k[0]]) deaths[k[0]].push(k[1]) })
  // Score = placement (1 = winner). Some modes (Kung Foot…) add an entity that is not a player, with 0: ignored.
  var scoreVals = ents.map(function (e) { return c.s[e.id] }).filter(function (v) { return v > 0 })
  var best = scoreVals.length ? Math.min.apply(null, scoreVals) : null
  var won = null
  if (me && c.s[me.id] > 0 && best !== null) won = c.s[me.id] === best && scoreVals.some(function (v) { return v !== best })
  var sameTeam = function (a, b) { return a.id === b.id || (a.team === b.team && a.team !== 0) }
  // KOs dealt: only in 1v1, where the author must be the opponent (the file does not say otherwise).
  var duel = ents.length === 2 && !sameTeam(ents[0], ents[1])
  var kills = {}; ents.forEach(function (e) { kills[e.id] = duel ? deaths[ents[0].id === e.id ? ents[1].id : ents[0].id].length : null })
  var taken = 0, lost = 0
  if (me) ents.forEach(function (e) { if (e.id === me.id) lost += deaths[e.id].length; else if (!sameTeam(e, me)) taken += deaths[e.id].length })
  return { ents: ents, me: me, deaths: deaths, kills: kills, won: won, taken: taken, lost: lost, dur: c.l / 1000, sameTeam: sameTeam,
    apm: me ? apmOf(c, me.id) : null }
}

/** Presses per minute (attacks, dodges, jumps, throws; taunts excluded), from the replay inputs. */
function presses(c, id) { return (c.i && c.i[id]) || null }
function apmOf(c, id) {
  var p = presses(c, id), min = c.l / 60000
  var x = p && p.x ? p.x[0] + p.x[1] + p.x[2] : 0                       // the dodge key counts in full (dashes, gravity cancels…)
  return p && min > 0 ? (p.l[0] + p.l[1] + p.l[2] + p.h[0] + p.h[1] + p.h[2] + p.d + x + p.j + p.t) / min : null
}

function teamsTitle(ents) {
  var groups = {}, order = []
  ents.forEach(function (e) { if (!groups[e.team]) { groups[e.team] = []; order.push(e.team) } groups[e.team].push(e.name) })
  if (order.length > 1) return order.map(function (t) { return groups[t].join(' & ') }).join(' vs ')
  return ents.map(function (e) { return e.name }).join(' · ')
}

var GRID_ROWS = ['↑', '·', '↓'], GRID_COLS = ['←', '·', '→']
function grid3(g) { return [g.slice(0, 3), g.slice(3, 6), g.slice(6, 9)] }

/** Game timeline: KOs (diamonds; in 1v1 the author must be the opponent), weapon throws and taunts. */
function timelineOf(c, a, fr) {
  var laneOf = {}; a.ents.forEach(function (e, i) { laneOf[e.id] = i })
  var duel = a.ents.length === 2 && !a.sameTeam(a.ents[0], a.ents[1]), events = []
  c.k.forEach(function (k) {
    var lane = laneOf[k[0]]; if (lane === undefined) return
    var by = duel ? a.ents[1 - lane].name : ''
    events.push({ t: k[1] / 1000, lane: lane, kind: 'ko', label: by ? tr(fr, 'KO by ', 'KO par ') + by : 'KO' })
  })
  a.ents.forEach(function (e, lane) {
    var p = presses(c, e.id)
    ;((p && p.ev) || []).forEach(function (x) { events.push({ t: x[0] / 1000, lane: lane, kind: x[1] ? 'mark' : 'action', label: x[1] ? tr(fr, 'Taunt', 'Provocation') : tr(fr, 'Throw', 'Lancer') }) })
  })
  // KOs first: they stay if the timeline exceeds its limit (400 events).
  events.sort(function (x, y) { return (x.kind === 'ko' ? 0 : 1) - (y.kind === 'ko' ? 0 : 1) || x.t - y.t })
  return { duration: a.dur, lanes: a.ents.map(function (e) { return e.name }), events: events.slice(0, 400) }
}

function buildItem(file, c, a, lang) {
  var fr = lang === 'fr', st = c.st || []
  var chips = [mapName(file, c, fr), modeLabel(c, lang), 'Patch ' + patchOf(file, c), fmtDate(file.mtime), fmtDur(a.dur),
    c.lv ? c.lv + ' ' + tr(fr, 'stocks', 'vies') : tr(fr, 'No stock limit', 'Vies illimitées'), c.o ? tr(fr, 'Online', 'En ligne') : tr(fr, 'Offline', 'Hors ligne')]
  if (st[8] && st[8] !== 100) chips.push(tr(fr, 'Damage ', 'Dégâts ') + st[8] + ' %')
  if (st[7] && st[7] !== 100) chips.push(tr(fr, 'Speed ', 'Vitesse ') + st[7] + ' %')
  var place = function (e) { var p = c.s[e.id]; return p > 0 ? p : '—' }
  var players = a.ents.map(function (e) {
    return [e.name, e.pid ? 'ID ' + e.pid : e.bot ? 'bot' : '—', e.team, legendName(e.hero), weaponsOf(e.hero, fr), tr(fr, 'Stance ', 'Posture ') + e.stance, place(e), a.deaths[e.id].length,
      a.kills[e.id] === null ? '—' : a.kills[e.id]]
  })
  var actions = a.ents.map(function (e) {
    var p = presses(c, e.id), apm = apmOf(c, e.id)
    if (!p) return [e.name, '—', '—', '—', '—', '—', '—', '—', '—']
    return [e.name, p.l.join(' / '), p.h.join(' / '), p.d, p.j, p.t, p.tt, pct(p.mv, c.l) + ' %', apm === null ? '—' : Math.round(apm)]
  })
  // Dodge key: each press classified (see trackInput). Separate table: a table has at most 10 columns.
  var dodgeKey = a.ents.map(function (e) {
    var p = presses(c, e.id), x = p && p.x
    return x ? [e.name, p.d, x[2], x[0], x[1], p.d + x[0] + x[1] + x[2]] : [e.name, '—', '—', '—', '—', '—']
  })
  var grids = [], lines = []
  a.ents.forEach(function (e) {
    var p = presses(c, e.id); if (!p) return
    if (grids.length < 8) grids.push({ title: tr(fr, 'Dodges · ', 'Esquives · ') + e.name, rows: GRID_ROWS, cols: GRID_COLS, values: grid3(p.g) })
    lines.push({ name: e.name, values: p.act })
  })
  var detail = {
    image: THUMBS[c.m] ? { file: THUMBS[c.m], caption: chips[0] } : undefined,
    chips: chips,
    tables: [
      { title: tr(fr, 'Players', 'Joueurs'),
        columns: fr ? ['Joueur', 'ID', 'Équipe', 'Légende', 'Armes', 'Posture', 'Place', 'KOs subis', 'KOs infligés (1v1)'] : ['Player', 'ID', 'Team', 'Legend', 'Weapons', 'Stance', 'Place', 'Stocks lost', 'KOs dealt (1v1)'],
        rows: players },
      { title: tr(fr, 'Actions (attacks: neutral / side / down)', 'Actions (attaques : neutre / côté / bas)'),
        columns: fr ? ['Joueur', 'Légères', 'Lourdes', 'Esquives', 'Sauts', 'Lancers', 'Provocations', 'Déplacement', 'Appuis/min'] : ['Player', 'Light', 'Heavy', 'Dodges', 'Jumps', 'Throws', 'Taunts', 'Moving', 'Presses/min'],
        rows: actions },
      { title: tr(fr, 'Dodge key (* estimated)', 'Touche esquive (* estimé)'),
        columns: fr ? ['Joueur', 'Esquives', 'Dashs*', 'Gravity cancels', 'Chase dodges*', 'Appuis'] : ['Player', 'Dodges', 'Dashes*', 'Gravity cancels', 'Chase dodges*', 'Presses'],
        rows: dodgeKey }
    ],
    grids: grids,
    series: lines.length ? [{ title: tr(fr, 'Actions every 15 s', 'Actions toutes les 15 s'), step: BUCKET_MS / 1000, lines: lines }] : undefined,
    timeline: timelineOf(c, a, fr)
  }
  return {
    id: file.name,
    title: teamsTitle(a.ents),
    ts: file.mtime,
    fields: {
      mode: modeLabel(c, lang),
      patch: patchOf(file, c),
      result: a.won === null ? '—' : a.won ? tr(fr, 'Win', 'Victoire') : tr(fr, 'Loss', 'Défaite'),
      duration: pad(Math.floor(Math.round(a.dur) / 60)) + fmtDur(a.dur).slice(fmtDur(a.dur).indexOf(':')),   // "03:04": sorts correctly
      kos: c.k.length,
      apm: a.apm === null ? '—' : Math.round(a.apm),
      map: chips[0]
    },
    detail: detail
  }
}

/** Summary of one of your games, cached for the totals, the curve and the overview (a few hundred bytes). */
function summaryOf(file, c, a, lang) {
  var me = a.me, p = presses(c, me.id), cut = function (n) { return n.slice(0, 24) }
  return { w: a.won === null ? -1 : a.won ? 1 : 0, d: a.lost, tk: a.taken, du: Math.round(a.dur * 1000), a: a.apm === null ? -1 : Math.round(a.apm * 10),
    L: me.hero, m: mapName(file, c, lang === 'fr'), p: modeLabel(c, lang), v: patchOf(file, c), k: a.kills[me.id] === null ? -1 : a.kills[me.id],
    // Teammates and opponents: [name, identifier, legend] (identifier 0 for bots and replays before patch 10.09).
    tm: a.ents.filter(function (e) { return e.id !== me.id && a.sameTeam(e, me) }).map(function (e) { return [cut(e.name), e.pid, e.hero] }),
    op: a.ents.filter(function (e) { return !a.sameTeam(e, me) }).map(function (e) { return [cut(e.name), e.pid, e.hero] }),
    g: p ? p.g : null, at: p ? p.l.concat(p.h) : null, j: p ? p.j : 0, dg: p ? p.d : 0, x: p && p.x ? p.x : [0, 0, 0], th: p ? p.t : 0 }
}

/** Overview of all your games: by legend, map, mode, teammate, opponent, day and hour; dodges and attacks. */
function buildSummary(games, lang) {
  var fr = lang === 'fr', n = games.length
  if (!n) return undefined
  var tot = { w: 0, l: 0, d: 0, tk: 0, du: 0, a: 0, aN: 0, dg: 0, j: 0, x: [0, 0, 0] }, g9 = [0, 0, 0, 0, 0, 0, 0, 0, 0], at = [0, 0, 0, 0, 0, 0]
  var by = { L: {}, m: {}, p: {}, tm: {}, op: {}, day: {}, hour: {} }, label = {}
  // Games before patch 10.09 (no identifier): attached to the player with the same name (without clan tag)
  // in recent games, if exactly one identifier matches.
  var pidsOf = {}
  var bare = function (n) { var a = n.toLowerCase(); return (a.indexOf('|') >= 0 ? a.slice(a.indexOf('|') + 1) : a).replace(/•\d+$/, '').trim() }
  games.forEach(function (g) { g.s.tm.concat(g.s.op).forEach(function (x) { if (x[1]) { var k = bare(x[0]); (pidsOf[k] = pidsOf[k] || {})[x[1]] = 1 } }) })
  var nameToPid = function (n) { var ids = pidsOf[bare(n)]; var keys = ids ? Object.keys(ids) : []; return keys.length === 1 ? +keys[0] : 0 }
  var bump = function (map, key, s) {
    var o = map[key] || (map[key] = { n: 0, w: 0, l: 0, d: 0, a: 0, aN: 0 })
    o.n++; if (s.w === 1) o.w++; else if (s.w === 0) o.l++
    o.d += s.d; if (s.a >= 0) { o.a += s.a / 10; o.aN++ }
  }
  games.forEach(function (g) {
    var s = g.s, dt = new Date(g.t), i
    if (s.w === 1) tot.w++; else if (s.w === 0) tot.l++
    tot.d += s.d; tot.tk += s.tk; tot.du += s.du; tot.dg += s.dg; tot.j += s.j
    if (s.x) for (i = 0; i < 3; i++) tot.x[i] += s.x[i]
    if (s.a >= 0) { tot.a += s.a / 10; tot.aN++ }
    if (s.g) for (i = 0; i < 9; i++) g9[i] += s.g[i]
    if (s.at) for (i = 0; i < 6; i++) at[i] += s.at[i]
    bump(by.L, legendName(s.L), s); bump(by.m, s.m, s); bump(by.p, s.p, s)
    // One player = one identifier when there is one (successive names grouped, namesakes separated), otherwise their name.
    var person = function (x) { var pid = x[1] || nameToPid(x[0]), k = pid ? 'p' + pid : 'n' + x[0]; if (x[1] || !label[k]) label[k] = x[0]; return k }
    s.tm.forEach(function (x) { bump(by.tm, person(x), s) }); s.op.forEach(function (x) { bump(by.op, person(x), s) })
    bump(by.day, (dt.getDay() + 6) % 7, s); bump(by.hour, Math.floor(dt.getHours() / 2), s)
  })
  var rowsOf = function (map, min, limit, cols) {
    return Object.keys(map).map(function (k) { return [k, map[k]] }).filter(function (x) { return x[1].n >= min })
      .sort(function (x, y) { return y[1].n - x[1].n }).slice(0, limit).map(function (x) { return cols(x[0], x[1]) })
  }
  var wr = function (o) { return pct(o.w, o.w + o.l) + ' %' }
  var favourite = rowsOf(by.L, 1, 1, function (k) { return k })[0]
  var days = fr ? ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  var wl = fr ? ['Parties', 'V', 'D', '% V'] : ['Games', 'W', 'L', 'Win %']
  var basic = function (k, o) { return [k, o.n, o.w, o.l, wr(o)] }
  var named = function (k, o) { return [label[k] || k.slice(1), o.n, o.w, o.l, wr(o)] }   // latest name of the player
  return {
    stats: [
      { label: tr(fr, 'Games', 'Parties'), value: n }, { label: tr(fr, 'Wins', 'Victoires'), value: tot.w }, { label: tr(fr, 'Losses', 'Défaites'), value: tot.l },
      { label: tr(fr, 'Win rate', 'Taux de victoire'), value: pct(tot.w, tot.w + tot.l) + ' %' }, { label: tr(fr, 'Average length', 'Durée moyenne'), value: fmtDur(tot.du / n / 1000) },
      { label: tr(fr, 'Stocks lost / game', 'KOs subis / partie'), value: Math.round(tot.d * 10 / n) / 10 },
      { label: tr(fr, 'Stocks taken / game', 'Stocks pris / partie'), value: Math.round(tot.tk * 10 / n) / 10 },
      { label: tr(fr, 'Presses / min', 'Appuis / min'), value: tot.aN ? Math.round(tot.a / tot.aN) : '—' },
      { label: tr(fr, 'Dodges / game', 'Esquives / partie'), value: Math.round(tot.dg / n) }, { label: tr(fr, 'Likely dashes / game', 'Dashs probables / partie'), value: Math.round(tot.x[2] / n) },
      { label: tr(fr, 'Gravity cancels / game', 'Gravity cancels / partie'), value: Math.round(tot.x[0] * 10 / n) / 10 }, { label: tr(fr, 'Likely chase dodges / game', 'Chase dodges probables / partie'), value: Math.round(tot.x[1] * 10 / n) / 10 },
      { label: tr(fr, 'Jumps / game', 'Sauts / partie'), value: Math.round(tot.j / n) },
      { label: tr(fr, 'Favourite legend', 'Légende favorite'), value: favourite || '—' }, { label: tr(fr, 'Since', 'Depuis le'), value: fmtDate(games[0].t).slice(0, 10) }
    ],
    tables: [
      { title: tr(fr, 'By legend', 'Par légende'), columns: [tr(fr, 'Legend', 'Légende')].concat(wl, [tr(fr, 'Stocks lost / game', 'KOs subis / partie'), tr(fr, 'Presses/min', 'Appuis/min')]),
        rows: rowsOf(by.L, 1, 80, function (k, o) { return basic(k, o).concat([Math.round(o.d * 10 / o.n) / 10, o.aN ? Math.round(o.a / o.aN) : '—']) }) },
      { title: tr(fr, 'By map', 'Par carte'), columns: [tr(fr, 'Map', 'Carte')].concat(wl), rows: rowsOf(by.m, 1, 40, basic) },
      { title: tr(fr, 'By mode', 'Par mode'), columns: ['Mode'].concat(wl), rows: rowsOf(by.p, 1, 40, basic) },
      { title: tr(fr, 'Teammates (3+ games)', 'Coéquipiers (3 parties ou plus)'), columns: [tr(fr, 'Player', 'Joueur')].concat(wl), rows: rowsOf(by.tm, 3, 40, named) },
      { title: tr(fr, 'Opponents (3+ games; W = your wins)', 'Adversaires (3 parties ou plus ; V = tes victoires)'), columns: [tr(fr, 'Player', 'Joueur')].concat(wl), rows: rowsOf(by.op, 3, 40, named) },
      { title: tr(fr, 'By day', 'Par jour'), columns: [tr(fr, 'Day', 'Jour')].concat(wl),
        rows: [0, 1, 2, 3, 4, 5, 6].filter(function (d) { return by.day[d] }).map(function (d) { return basic(days[d], by.day[d]) }) },
      { title: tr(fr, 'By hour', 'Par heure'), columns: [tr(fr, 'Hours', 'Heures')].concat(wl),
        rows: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(function (h) { return by.hour[h] }).map(function (h) { return basic(pad(h * 2) + 'h–' + pad(h * 2 + 2) + 'h', by.hour[h]) }) }
    ],
    grids: [
      { title: tr(fr, 'Your dodge directions', 'Direction de tes esquives'), rows: GRID_ROWS, cols: GRID_COLS, values: grid3(g9) },
      { title: tr(fr, 'Your attacks', 'Tes attaques'), rows: [tr(fr, 'Light', 'Légère'), tr(fr, 'Heavy', 'Lourde')],
        cols: [tr(fr, 'Neutral', 'Neutre'), tr(fr, 'Side', 'Côté'), tr(fr, 'Down', 'Bas')], values: [at.slice(0, 3), at.slice(3, 6)] }
    ]
  }
}


/* ───────── search (WaveDash top bar): a player, a map, a legend, a mode ───────── */
function bareName(n) { var a = String(n || '').toLowerCase(); return (a.indexOf('|') >= 0 ? a.slice(a.indexOf('|') + 1) : a).replace(/•\d+$/, '').trim() }
function wl(list) {                                                     // overview of a list of games
  var o = { n: list.length, w: 0, l: 0, d: 0, du: 0, a: 0, aN: 0 }
  list.forEach(function (g) { var s = g.s; if (s.w === 1) o.w++; else if (s.w === 0) o.l++; o.d += s.d; o.du += s.du; if (s.a >= 0) { o.a += s.a / 10; o.aN++ } })
  return o
}
function rate(o) { return pct(o.w, o.w + o.l) + ' %' }
function groupRows(list, keyOf, limit, min) {
  var by = {}
  list.forEach(function (g) { var ks = keyOf(g); (Array.isArray(ks) ? ks : [ks]).forEach(function (k) { if (k) (by[k] = by[k] || []).push(g) }) })
  return Object.keys(by).map(function (k) { return [k, wl(by[k])] }).filter(function (x) { return x[1].n >= (min || 1) })
    .sort(function (a, b) { return b[1].n - a[1].n }).slice(0, limit || 30)
}
function recentRows(list, fr, extra) {
  return list.slice(-20).reverse().map(function (g) {
    var s = g.s
    return [fmtDate(g.t), s.w === 1 ? tr(fr, 'Win', 'Victoire') : s.w === 0 ? tr(fr, 'Loss', 'Défaite') : '—'].concat(extra ? [extra(g)] : [])
      .concat([s.m, s.p, legendName(s.L), fmtDur(s.du / 1000)])
  })
}

/* ───────── top bar: modes, patches, period ───────── */
// The five main modes first (value = mode name in the games, label = in-game name), then the other modes present.
var MAIN_MODES = [['1v1 Unranked', '1v1 Unranked'], ['1v1 Ranked', '1v1 Ranked'], ['2v2 Unranked', '2v2 Friendly'], ['2v2 Ranked', '2v2 Ranked'], ['Ranked3v3', '3v3 Ranked']]
/** Games read (cache), oldest to newest, limited to the chosen filters. */
function cachedGames(f) {
  f = f || {}
  var cache = loadCache(), games = [], since = f.period ? Date.now() - Number(f.period) * 86400000 : 0
  for (var k in cache) {
    var e = cache[k]
    if (!e || e.v !== CACHE_V || !e.s) continue
    if ((f.mode && e.s.p !== f.mode) || (f.patch && e.s.v !== f.patch) || (since && e.t < since)) continue
    games.push(e)
  }
  return games.sort(function (a, b) { return a.t - b.t })
}
/** Choices offered in the top bar, with the number of games: "1v1 Ranked (2143)". */
function filtersOf(games, fr) {
  var modes = {}, patches = {}
  games.forEach(function (g) { modes[g.s.p] = (modes[g.s.p] || 0) + 1; if (g.s.v) patches[g.s.v] = (patches[g.s.v] || 0) + 1 })
  var main = MAIN_MODES.filter(function (x) { return modes[x[0]] }).map(function (x) { return { value: x[0], label: x[1] + ' (' + modes[x[0]] + ')' } })
  var other = Object.keys(modes).filter(function (k) { return !MAIN_MODES.some(function (x) { return x[0] === k }) })
    .sort(function (a, b) { return modes[b] - modes[a] }).map(function (k) { return { value: k, label: k + ' (' + modes[k] + ')' } })
  var pts = Object.keys(patches).sort(function (a, b) { return parseFloat(b) - parseFloat(a) || (b < a ? -1 : 1) }).map(function (k) { return { value: k, label: k + ' (' + patches[k] + ')' } })
  return [
    { key: 'mode', label: tr(fr, 'Mode', 'Mode'), field: 'mode', options: main.concat(other) },
    { key: 'patch', label: 'Patch', field: 'patch', options: pts },
    { key: 'period', label: tr(fr, 'Period', 'Période'), field: '$ts', options: [
      { value: '7', label: tr(fr, 'Last 7 days', '7 derniers jours') }, { value: '30', label: tr(fr, 'Last 30 days', '30 derniers jours') },
      { value: '90', label: tr(fr, 'Last 3 months', '3 derniers mois') }, { value: '365', label: tr(fr, 'Last 12 months', '12 derniers mois') }] }
  ]
}

function searchGames(query, lang, filters) {
  var fr = lang === 'fr', q = bareName(query)
  var games = cachedGames(filters)
  if (!games.length) return undefined

  // Candidates: players (by identifier, otherwise name), maps, your legends, modes.
  var people = {}, cands = [], pidsOf = {}
  // Games without identifier (before patch 10.09): attached to the single identifier with the same name without tag.
  games.forEach(function (g) { g.s.tm.concat(g.s.op).forEach(function (x) { if (x[1]) { var b = bareName(x[0]); (pidsOf[b] = pidsOf[b] || {})[x[1]] = 1 } }) })
  var pidOf = function (x) { if (x[1]) return x[1]; var ids = pidsOf[bareName(x[0])], ks = ids ? Object.keys(ids) : []; return ks.length === 1 ? +ks[0] : 0 }
  games.forEach(function (g) {
    ['tm', 'op'].forEach(function (side) {
      g.s[side].forEach(function (x) {
        if (bareName(x[0]).indexOf(q) < 0) return
        var pid = pidOf(x), key = pid ? 'p' + pid : 'n' + x[0], p = people[key] || (people[key] = { name: x[0], pid: pid, with: [], against: [] })
        if (x[1] || !p.named) { p.name = x[0]; p.named = !!x[1] }
        (side === 'tm' ? p.with : p.against).push(g)
      })
    })
  })
  for (var key in people) { var p = people[key]; cands.push({ type: 'player', label: p.name, n: p.with.length + p.against.length, exact: bareName(p.name) === q, data: p }) }
  var simple = function (type, valueOf) {
    var by = {}
    games.forEach(function (g) { var v = valueOf(g); if (v && v.toLowerCase().indexOf(q) >= 0) (by[v] = by[v] || []).push(g) })
    for (var v in by) cands.push({ type: type, label: v, n: by[v].length, exact: v.toLowerCase() === q, data: by[v] })
  }
  simple('map', function (g) { return g.s.m })
  simple('legend', function (g) { return legendName(g.s.L) })
  simple('mode', function (g) { return g.s.p })
  if (!cands.length) return undefined
  cands.sort(function (a, b) { return (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || b.n - a.n })
  var top = cands[0], kind = { player: tr(fr, 'Player', 'Joueur'), map: tr(fr, 'Map', 'Carte'), legend: tr(fr, 'Your legend', 'Ta légende'), mode: 'Mode' }
  var chips = [kind[top.type] + ' : ' + top.label + (top.type === 'player' && top.data.pid ? ' · ID ' + top.data.pid : '')]
  cands.slice(1, 7).forEach(function (c) { chips.push(tr(fr, 'Also: ', 'Aussi : ') + kind[c.type].toLowerCase() + ' ' + c.label + ' (' + c.n + ')') })
  var cols = fr ? ['Parties', 'V', 'D', '% V'] : ['Games', 'W', 'L', 'Win %']
  var row = function (k, o) { return [k, o.n, o.w, o.l, rate(o)] }

  if (top.type === 'player') {
    var P = top.data, W = wl(P.with), A = wl(P.against), all = P.with.concat(P.against).sort(function (a, b) { return a.t - b.t })
    // Their profile: that of their identifier, plus the games before patch 10.09 attached by name.
    var profiles = loadPlayers(), H = null
    Object.keys(profiles).forEach(function (k) {
      var x = profiles[k], mine = P.pid ? (k === 'p' + P.pid || (k.charAt(0) === 'n' && pidOf([x.n, 0]) === P.pid)) : k === 'n' + bareName(P.name)
      if (!mine) return
      if (!H) { H = JSON.parse(JSON.stringify(x)); return }
      H.c += x.c; H.w += x.w; H.l += x.l; H.d += x.d; H.j += x.j; H.dg += x.dg; H.th += x.th; H.a += x.a; H.aN += x.aN
      H.x = H.x || [0, 0, 0]; for (var m = 0; m < 3; m++) H.x[m] += (x.x || [0, 0, 0])[m]
      for (var i = 0; i < 9; i++) H.g[i] += x.g[i]
      for (i = 0; i < 6; i++) H.at[i] += x.at[i]
      for (var l in x.L) H.L[l] = (H.L[l] || 0) + x.L[l]
    })
    var side = function (g) { return P.with.indexOf(g) >= 0 ? tr(fr, 'With', 'Avec') : tr(fr, 'Against', 'Contre') }
    var both = function (label, first, keyOf) {
      var w = {}, a = {}
      groupRows(P.with, keyOf, 50).forEach(function (x) { w[x[0]] = x[1] }); groupRows(P.against, keyOf, 50).forEach(function (x) { a[x[0]] = x[1] })
      var keys = Object.keys(w).concat(Object.keys(a).filter(function (k) { return !w[k] }))
      return { title: label, columns: [first, tr(fr, 'With', 'Avec'), tr(fr, 'Win % with', '% V avec'), tr(fr, 'Against', 'Contre'), tr(fr, 'Win % against', '% V contre')],
        rows: keys.map(function (k) { return [k, w[k] ? w[k].n : 0, w[k] ? rate(w[k]) : '—', a[k] ? a[k].n : 0, a[k] ? rate(a[k]) : '—'] })
          .sort(function (x, y) { return (y[1] + y[3]) - (x[1] + x[3]) }).slice(0, 30) }
    }
    var his = []
    if (H && H.c) {
      his.push({ label: tr(fr, 'Their games (your replays)', 'Ses parties (tes replays)'), value: H.c },
        { label: tr(fr, 'Their win %', 'Son % de victoire'), value: pct(H.w, H.w + H.l) + ' %' },
        { label: tr(fr, 'Their stocks lost / game', 'Ses KOs subis / partie'), value: Math.round(H.d * 10 / H.c) / 10 },
        { label: tr(fr, 'Their presses / min', 'Ses appuis / min'), value: H.aN ? Math.round(H.a / H.aN) : '—' },
        { label: tr(fr, 'Their dodges / game', 'Ses esquives / partie'), value: Math.round(H.dg / H.c) },
        { label: tr(fr, 'Their likely dashes / game', 'Ses dashs probables / partie'), value: Math.round((H.x || [0, 0, 0])[2] / H.c) },
        { label: tr(fr, 'Their gravity cancels / game', 'Ses gravity cancels / partie'), value: Math.round((H.x || [0, 0, 0])[0] * 10 / H.c) / 10 },
        { label: tr(fr, 'Their jumps / game', 'Ses sauts / partie'), value: Math.round(H.j / H.c) },
        { label: tr(fr, 'Their throws / game', 'Ses lancers / partie'), value: Math.round(H.th * 10 / H.c) / 10 })
    }
    var hisTables = H && H.c ? [{ title: tr(fr, 'Their legends', 'Ses légendes'), columns: fr ? ['Légende', 'Parties', '% de ses parties'] : ['Legend', 'Games', '% of their games'],
      rows: Object.keys(H.L).map(function (l) { return [legendName(+l), H.L[l], pct(H.L[l], H.c) + ' %'] }).sort(function (a, b) { return b[1] - a[1] }).slice(0, 30) }] : []
    var hisGrids = H && H.c ? [
      { title: tr(fr, 'Their dodge directions', 'Direction de ses esquives'), rows: GRID_ROWS, cols: GRID_COLS, values: grid3(H.g) },
      { title: tr(fr, 'Their attacks', 'Ses attaques'), rows: [tr(fr, 'Light', 'Légère'), tr(fr, 'Heavy', 'Lourde')], cols: [tr(fr, 'Neutral', 'Neutre'), tr(fr, 'Side', 'Côté'), tr(fr, 'Down', 'Bas')], values: [H.at.slice(0, 3), H.at.slice(3, 6)] }] : []
    return {
      chips: chips,
      grids: hisGrids,
      stats: his.concat([{ label: tr(fr, 'Games together', 'Parties ensemble'), value: W.n }, { label: tr(fr, 'Win % together', '% V ensemble'), value: rate(W) },
        { label: tr(fr, 'Games against', 'Parties contre'), value: A.n }, { label: tr(fr, 'Your wins against', 'Tes victoires contre'), value: A.w + ' (' + rate(A) + ')' },
        { label: tr(fr, 'First game', 'Première partie'), value: fmtDate(all[0].t).slice(0, 10) }, { label: tr(fr, 'Last game', 'Dernière partie'), value: fmtDate(all[all.length - 1].t).slice(0, 10) }]),
      tables: hisTables.concat([both(tr(fr, 'By map', 'Par carte'), tr(fr, 'Map', 'Carte'), function (g) { return g.s.m }), both(tr(fr, 'By mode', 'Par mode'), 'Mode', function (g) { return g.s.p }),
        both(tr(fr, 'Your legends', 'Tes légendes'), tr(fr, 'Legend', 'Légende'), function (g) { return legendName(g.s.L) }),
        { title: tr(fr, 'Recent games', 'Dernières parties'), columns: fr ? ['Date', 'Résultat', 'Avec / contre', 'Carte', 'Mode', 'Ta légende', 'Durée'] : ['Date', 'Result', 'With / against', 'Map', 'Mode', 'Your legend', 'Length'],
          rows: recentRows(all, fr, side) }])
    }
  }

  var G = top.data, o = wl(G)
  var tables = []
  if (top.type !== 'legend') tables.push({ title: tr(fr, 'Your legends', 'Tes légendes'), columns: [tr(fr, 'Legend', 'Légende')].concat(cols), rows: groupRows(G, function (g) { return legendName(g.s.L) }).map(function (x) { return row(x[0], x[1]) }) })
  if (top.type !== 'map') tables.push({ title: tr(fr, 'By map', 'Par carte'), columns: [tr(fr, 'Map', 'Carte')].concat(cols), rows: groupRows(G, function (g) { return g.s.m }).map(function (x) { return row(x[0], x[1]) }) })
  if (top.type !== 'mode') tables.push({ title: tr(fr, 'By mode', 'Par mode'), columns: ['Mode'].concat(cols), rows: groupRows(G, function (g) { return g.s.p }).map(function (x) { return row(x[0], x[1]) }) })
  tables.push({ title: tr(fr, 'Teammates', 'Coéquipiers'), columns: [tr(fr, 'Player', 'Joueur')].concat(cols), rows: groupRows(G, function (g) { return g.s.tm.map(function (x) { return x[0] }) }, 20, 2).map(function (x) { return row(x[0], x[1]) }) })
  tables.push({ title: tr(fr, 'Opponents', 'Adversaires'), columns: [tr(fr, 'Player', 'Joueur')].concat(cols), rows: groupRows(G, function (g) { return g.s.op.map(function (x) { return x[0] }) }, 20, 2).map(function (x) { return row(x[0], x[1]) }) })
  tables.push({ title: tr(fr, 'Recent games', 'Dernières parties'), columns: fr ? ['Date', 'Résultat', 'Carte', 'Mode', 'Ta légende', 'Durée'] : ['Date', 'Result', 'Map', 'Mode', 'Your legend', 'Length'], rows: recentRows(G, fr) })
  return {
    chips: chips,
    stats: [{ label: tr(fr, 'Games', 'Parties'), value: o.n }, { label: tr(fr, 'Wins', 'Victoires'), value: o.w }, { label: tr(fr, 'Losses', 'Défaites'), value: o.l },
      { label: tr(fr, 'Win rate', 'Taux de victoire'), value: rate(o) }, { label: tr(fr, 'Average length', 'Durée moyenne'), value: fmtDur(o.du / o.n / 1000) },
      { label: tr(fr, 'Stocks lost / game', 'KOs subis / partie'), value: Math.round(o.d * 10 / o.n) / 10 }, { label: tr(fr, 'Presses / min', 'Appuis / min'), value: o.aN ? Math.round(o.a / o.aN) : '—' },
      { label: tr(fr, 'Last game', 'Dernière partie'), value: fmtDate(G[G.length - 1].t).slice(0, 10) }],
    tables: tables.filter(function (t) { return t.rows.length })
  }
}


/* ───────── cross your data (WaveDash "Cross" tool) ───────── */
var CROSS_DIMS = { legend: ['Legends', 'Légendes'], map: ['Maps', 'Cartes'], mode: ['Modes', 'Modes'], result: ['Result', 'Résultat'], side: ['With / against', 'Avec / contre'],
  month: ['Month', 'Mois'], weekday: ['Day', 'Jour'], hour: ['Hour', 'Heure'] }
var CROSS_MEASURES = { games: ['Games', 'Parties'], wins: ['Wins', 'Victoires'], losses: ['Losses', 'Défaites'], winrate: ['Win %', '% de victoire'] }

function crossData(ctx) {
  var fr = ctx.lang === 'fr', R = ctx.cross || {}, who = String(R.who || '').trim(), mine = wantedList(ctx.inputs.playerName)
  var games = cachedGames(ctx.filters)
  if (!games.length) return undefined
  var rows = [], label = tr(fr, 'You', 'Toi')
  var isMe = !who || exactly(who, mine) || mine.some(function (w) { return bareName(who) === w })
  if (isMe) rows = games.map(function (g) { return { g: g, L: g.s.L, w: g.s.w, side: '' } })
  else {
    // Another player: by identifier (games before patch 10.09 attached by name), among your games where they appear.
    var q = bareName(who), pidsOf = {}, count = {}
    games.forEach(function (g) { g.s.tm.concat(g.s.op).forEach(function (x) { if (x[1]) { var b = bareName(x[0]); (pidsOf[b] = pidsOf[b] || {})[x[1]] = 1 } }) })
    var keyOf = function (x) { if (x[1]) return 'p' + x[1]; var ids = pidsOf[bareName(x[0])], ks = ids ? Object.keys(ids) : []; return ks.length === 1 ? 'p' + ks[0] : 'n' + bareName(x[0]) }
    var names = {}
    games.forEach(function (g) { g.s.tm.concat(g.s.op).forEach(function (x) { if (bareName(x[0]).indexOf(q) < 0) return; var key = keyOf(x); count[key] = (count[key] || 0) + 1; names[key] = x[0] }) })
    var best = Object.keys(count).sort(function (a, b) { return (bareName(names[b]) === q ? 1 : 0) - (bareName(names[a]) === q ? 1 : 0) || count[b] - count[a] })[0]
    if (!best) return undefined
    label = names[best]
    games.forEach(function (g) {
      g.s.tm.forEach(function (x) { if (keyOf(x) === best) rows.push({ g: g, L: x[2], w: g.s.w, side: tr(fr, 'With you', 'Avec toi') }) })
      g.s.op.forEach(function (x) { if (keyOf(x) === best) rows.push({ g: g, L: x[2], w: g.s.w === 1 ? 0 : g.s.w === 0 ? 1 : -1, side: tr(fr, 'Against you', 'Contre toi') }) })
    })
  }
  if (!rows.length) return undefined
  var days = fr ? ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  var value = function (dim, r) {
    var d = new Date(r.g.t)
    if (dim === 'legend') return r.L ? legendName(r.L) : '—'
    if (dim === 'map') return r.g.s.m
    if (dim === 'mode') return r.g.s.p
    if (dim === 'result') return r.w === 1 ? tr(fr, 'Win', 'Victoire') : r.w === 0 ? tr(fr, 'Loss', 'Défaite') : '—'
    if (dim === 'side') return r.side || tr(fr, 'You', 'Toi')
    if (dim === 'month') return d.getFullYear() + '-' + pad(d.getMonth() + 1)
    if (dim === 'weekday') return days[(d.getDay() + 6) % 7]
    if (dim === 'hour') return pad(d.getHours()) + 'h'
    return '—'
  }
  var natural = { month: 1, weekday: 1, hour: 1 }
  var orderOf = function (dim, list, limit) {
    var n = {}
    list.forEach(function (r) { var v = value(dim, r); n[v] = (n[v] || 0) + 1 })
    var keys = Object.keys(n)
    if (natural[dim]) keys.sort(dim === 'weekday' ? function (a, b) { return days.indexOf(a) - days.indexOf(b) } : undefined)
    else keys.sort(function (a, b) { return n[b] - n[a] })
    return keys.slice(0, limit)
  }
  var measure = function (list) {
    var w = 0, l = 0
    list.forEach(function (r) { if (r.w === 1) w++; else if (r.w === 0) l++ })
    return R.measure === 'wins' ? w : R.measure === 'losses' ? l : R.measure === 'winrate' ? (w + l ? Math.round(w * 1000 / (w + l)) / 10 : 0) : list.length
  }
  var A = CROSS_DIMS[R.a] ? R.a : 'legend', B = R.b && R.b !== 'none' && R.b !== A && CROSS_DIMS[R.b] ? R.b : null
  var M = CROSS_MEASURES[R.measure] ? R.measure : 'games', name = function (o) { return o[fr ? 1 : 0] }
  var cats = orderOf(A, rows, 25)
  var groups = B ? orderOf(B, rows, 8) : [name(CROSS_MEASURES[M])]
  var series = groups.map(function (gv) {
    return { name: gv, values: cats.map(function (cv) { return measure(rows.filter(function (r) { return value(A, r) === cv && (!B || value(B, r) === gv) })) }) }
  })
  var title = label + ' · ' + name(CROSS_MEASURES[M]) + tr(fr, ' by ', ' par ') + name(CROSS_DIMS[A]).toLowerCase() + (B ? tr(fr, ', split by ', ', séparé par ') + name(CROSS_DIMS[B]).toLowerCase() : '')
  return {
    chips: [label, rows.length + tr(fr, ' games analysed', ' parties analysées')].concat(isMe ? [] : [tr(fr, 'Games from your replays where they appear', 'Parties de tes replays où il apparaît')]),
    bars: [{ title: title, unit: M === 'winrate' ? '%' : undefined, stacked: !!B && M !== 'winrate', categories: cats, series: series }],
    tables: [{ title: title, columns: [name(CROSS_DIMS[A])].concat(series.map(function (s) { return s.name })),
      rows: cats.map(function (c, i) { return [c].concat(series.map(function (s) { return M === 'winrate' ? s.values[i] + ' %' : s.values[i] })) }) }]
  }
}

/* ───────── player bank (WaveDash "Players" page) ───────── */
// One record per player and per game. The game identifier comes from the game content (map, length, players, KOs), so the
// same game recorded by two people gets the same identifier and is stored once. Texts are stored in English; the sheet translates.
function fnv(str, seed) { var h = seed >>> 0; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 } return ('0000000' + h.toString(16)).slice(-8) }
function gameIdOf(c) {
  var who = c.n.map(function (n) { return (n[7] || n[0]) + ':' + n[2] }).sort().join(',')
  var s = c.m + '|' + c.l + '|' + who + '|' + c.k.map(function (k) { return k.join(':') }).join(',')
  return 'g' + fnv(s, 2166136261) + fnv(s, 3141592653)
}
// Player key: account identifier when there is one; otherwise (games before patch 10.09, second local player) a hash of the name.
function bankKeyOf(e) { return e.pid && !/•\d+$/.test(e.name) ? 'p' + e.pid : 'n' + fnv(bareName(e.name), 2166136261) }
function bankRecords(file, c, a) {
  var places = a.ents.map(function (e) { return c.s[e.id] }).filter(function (v) { return v > 0 })
  var best = places.length ? Math.min.apply(null, places) : 0, decided = places.some(function (v) { return v !== best })
  var game = gameIdOf(c), mode = modeLabel(c, 'en'), map = mapName(file, c, false), patch = patchOf(file, c), out = []
  var tag = function (e) { return e.name.slice(0, 32).replace(/[;#]/g, ' ') + '#' + bankKeyOf(e) }
  a.ents.forEach(function (e) {
    if (e.bot) return
    var place = c.s[e.id], q = presses(c, e.id), apm = apmOf(c, e.id)
    var others = a.ents.filter(function (o) { return o !== e && !o.bot })
    var d = { L: e.hero, w: place > 0 && decided ? (place === best ? 1 : 0) : -1, pl: place > 0 ? place : 0, md: mode, mp: map, pt: patch,
      du: Math.round(c.l / 1000), d: a.deaths[e.id].length, k: a.kills[e.id] === null ? -1 : a.kills[e.id], st: e.stance, pid: e.pid || 0,
      mates: others.filter(function (o) { return a.sameTeam(o, e) }).map(tag).join(';'), opps: others.filter(function (o) { return !a.sameTeam(o, e) }).map(tag).join(';') }
    if (q) { d.g = q.g; d.at = q.l.concat(q.h); d.x = q.x || [0, 0, 0]; d.dg = q.d; d.j = q.j; d.th = q.t; d.tt = q.tt }
    if (apm !== null) d.a = Math.round(apm)
    out.push({ key: bankKeyOf(e), name: e.name.slice(0, 40), game: game, ts: file.mtime, data: d })
  })
  return out
}
/** A player's sheet from their records (newest first): totals, habits, legends, modes, maps, teammates, opponents, recent games. */
function playerSheet(recs, fr) {
  if (!recs.length) return undefined
  recs = recs.slice().sort(function (x, y) { return y.ts - x.ts })
  var n = recs.length, W = 0, Lo = 0, deaths = 0, kos = 0, duels = 0, apm = 0, apmN = 0, inN = 0, dg = 0, j = 0, th = 0
  var g = [0, 0, 0, 0, 0, 0, 0, 0, 0], at = [0, 0, 0, 0, 0, 0], x = [0, 0, 0], names = {}, pid = 0
  var legends = {}, modes = {}, maps = {}, mates = {}, opps = {}
  var bump = function (o, k, r) { if (!k) return; var e = o[k] || (o[k] = { n: 0, w: 0, l: 0 }); e.n++; if (r.data.w === 1) e.w++; else if (r.data.w === 0) e.l++ }
  recs.forEach(function (r) {
    var d = r.data
    if (d.w === 1) W++; else if (d.w === 0) Lo++
    deaths += d.d || 0
    if (d.k >= 0) { kos += d.k; duels++ }
    if (d.a > 0) { apm += d.a; apmN++ }
    if (d.g) {
      inN++
      for (var i = 0; i < 9; i++) g[i] += d.g[i] || 0
      for (i = 0; i < 6; i++) at[i] += (d.at || [])[i] || 0
      for (i = 0; i < 3; i++) x[i] += (d.x || [])[i] || 0
      dg += d.dg || 0; j += d.j || 0; th += d.th || 0
    }
    if (!names[r.name] || names[r.name] < r.ts) names[r.name] = r.ts
    if (d.pid && !pid) pid = d.pid
    bump(legends, legendName(d.L), r); bump(modes, d.md, r); bump(maps, d.mp, r)
    String(d.mates || '').split(';').forEach(function (t) { bump(mates, t, r) })
    String(d.opps || '').split(';').forEach(function (t) { bump(opps, t, r) })
  })
  var per = function (v, m) { return m ? Math.round(v * 10 / m) / 10 : '—' }
  var rateOf = function (e) { return pct(e.w, e.w + e.l) + ' %' }
  var cols = fr ? ['Parties', 'V', 'D', '% V'] : ['Games', 'W', 'L', 'Win %']
  var table = function (title, first, o, limit, label) {
    var rows = Object.keys(o).map(function (k) { var e = o[k]; return [label ? label(k) : k, e.n, e.w, e.l, rateOf(e)] }).sort(function (a, b) { return b[1] - a[1] }).slice(0, limit)
    return { title: title, columns: [first].concat(cols), rows: rows }
  }
  var who = function (t) { return t.slice(0, t.lastIndexOf('#')) || t }
  var latest = Object.keys(names).sort(function (a, b) { return names[b] - names[a] })
  var day = function (ts) { return fmtDate(ts).slice(0, 10) }
  var modeName = function (m) { return m === 'Online room' ? tr(fr, m, 'Salon en ligne') : m === 'Offline' ? tr(fr, m, 'Hors ligne') : m }
  var result = function (w) { return w === 1 ? tr(fr, 'Win', 'Victoire') : w === 0 ? tr(fr, 'Loss', 'Défaite') : '—' }
  return {
    chips: [latest[0]].concat(pid ? ['ID ' + pid] : []).concat(latest.length > 1 ? [tr(fr, 'Also: ', 'Aussi : ') + latest.slice(1, 6).join(', ')] : []),
    stats: [
      { label: tr(fr, 'Games recorded', 'Parties enregistrées'), value: n },
      { label: tr(fr, 'Win rate', 'Taux de victoire'), value: pct(W, W + Lo) + ' %' },
      { label: tr(fr, 'Stocks lost / game', 'KOs subis / partie'), value: per(deaths, n) },
      { label: tr(fr, 'KOs dealt / 1v1 game', 'KOs infligés / partie 1v1'), value: per(kos, duels) },
      { label: tr(fr, 'Presses / min', 'Appuis / min'), value: apmN ? Math.round(apm / apmN) : '—' },
      { label: tr(fr, 'Dodges / game', 'Esquives / partie'), value: per(dg, inN) },
      { label: tr(fr, 'Likely dashes / game', 'Dashs probables / partie'), value: per(x[2], inN) },
      { label: tr(fr, 'Likely chase dodges / game', 'Chase dodges probables / partie'), value: per(x[1], inN) },
      { label: tr(fr, 'Gravity cancels / game', 'Gravity cancels / partie'), value: per(x[0], inN) },
      { label: tr(fr, 'Jumps / game', 'Sauts / partie'), value: per(j, inN) },
      { label: tr(fr, 'Throws / game', 'Lancers / partie'), value: per(th, inN) },
      { label: tr(fr, 'First seen', 'Vu la première fois'), value: day(recs[n - 1].ts) },
      { label: tr(fr, 'Last seen', 'Vu la dernière fois'), value: day(recs[0].ts) }],
    grids: inN ? [
      { title: tr(fr, 'Dodge directions', 'Direction des esquives'), rows: GRID_ROWS, cols: GRID_COLS, values: grid3(g) },
      { title: tr(fr, 'Attacks', 'Attaques'), rows: [tr(fr, 'Light', 'Légère'), tr(fr, 'Heavy', 'Lourde')], cols: [tr(fr, 'Neutral', 'Neutre'), tr(fr, 'Side', 'Côté'), tr(fr, 'Down', 'Bas')], values: [at.slice(0, 3), at.slice(3, 6)] }] : [],
    tables: [
      table(tr(fr, 'Legends', 'Légendes'), tr(fr, 'Legend', 'Légende'), legends, 30),
      table('Modes', 'Mode', modes, 15, modeName),
      table(tr(fr, 'Maps', 'Cartes'), tr(fr, 'Map', 'Carte'), maps, 20),
      table(tr(fr, 'Teammates', 'Coéquipiers'), tr(fr, 'Player', 'Joueur'), mates, 20, who),
      table(tr(fr, 'Opponents (their result)', 'Adversaires (son résultat)'), tr(fr, 'Player', 'Joueur'), opps, 20, who),
      { title: tr(fr, 'Recent games', 'Dernières parties'), columns: fr ? ['Date', 'Résultat', 'Légende', 'Mode', 'Carte', 'Durée'] : ['Date', 'Result', 'Legend', 'Mode', 'Map', 'Length'],
        rows: recs.slice(0, 30).map(function (r) { return [fmtDate(r.ts), result(r.data.w), legendName(r.data.L), modeName(r.data.md || '—'), r.data.mp || '—', fmtDur(r.data.du || 0)] }) }
    ].filter(function (t) { return t.rows.length })
  }
}

var plugin = {
  resolve: async function (ctx) {
    var parts = ctx.inputs.folder.split(/[\\/]/).filter(Boolean)
    var name = wantedList(ctx.inputs.playerName).length ? ctx.inputs.playerName.trim() : ''
    if (!name) throw new Error(ctx.lang === 'fr' ? 'Indique ton pseudo en jeu.' : 'Enter your in-game name.')
    return { externalId: ctx.inputs.folder, displayName: 'Replays · ' + name + (parts.length ? ' (' + parts[parts.length - 1] + ')' : '') }
  },

  // Top search bar: all your stats for a player, a map, one of your legends or a mode.
  search: async function (ctx) { return searchGames(ctx.query, ctx.lang, ctx.filters) },
  // Top bar: the full overview, but only for the chosen mode, patch or period.
  view: async function (ctx) {
    var games = cachedGames(ctx.filters)
    return games.length ? buildSummary(games, ctx.lang) : { chips: [tr(ctx.lang === 'fr', 'No game for these filters', 'Aucune partie pour ces filtres')] }
  },
  // "Cross your data" tool: a player, a measure, an axis and an optional second axis.
  cross: async function (ctx) { return crossData(ctx) },
  // Player bank (WaveDash "Players" page): the sheet of one player, from their records (this PC and imported files).
  player: async function (ctx) { return playerSheet(ctx.records || [], ctx.lang === 'fr') },

  refresh: async function (ctx) {
    var lang = ctx.lang, wanted = wantedList(ctx.inputs.playerName)
    var myPids = {}; try { myPids = JSON.parse(host.storage.get('myPids') || '{}') } catch (e) { myPids = {} }
    var learned = false
    var files = host.files.list()                                       // the whole folder, newest to oldest
    var cache = loadCache(), next = {}, fresh = 0, failed = 0, backlog = 0, items = [], unknown = {}, bank = []
    var players = loadPlayers()
    var started = Date.now()                                            // the budget only counts replay reading
    for (var i = 0; i < files.length; i++) {
      var f = files[i], key = f.name + '|' + f.size + '|' + f.mtime
      var c = cache[key]
      if (c && c.v === CACHE_V) { next[key] = c; continue }
      if (fresh >= MAX_NEW || Date.now() - started > BUDGET_MS) { backlog++; continue }
      fresh++
      try {
        var full = compact(parseReplay(host.files.readBytes(f.name))), a = analyse(full, wanted, myPids)
        // Your identifier is learned the first time your name is found (excluding the second local player).
        if (a.me && a.me.pid && !myPids[a.me.pid] && exactly(a.me.name, wanted) && !/•\d+$/.test(a.me.name)) { myPids[a.me.pid] = a.me.name; learned = true }
        full.n.forEach(function (n) { if (!LEGENDS[n[2]]) unknown[n[2]] = true })
        // The cache keeps only a summary per game; the detail goes straight to WaveDash, which stores it.
        next[key] = { v: CACHE_V, t: f.mtime, s: a.me ? summaryOf(f, full, a, lang) : 0 }
        addPlayers(players, full, a, f.mtime)
        bank = bank.concat(bankRecords(f, full, a))
        if (a.me) items.push(buildItem(f, full, a, lang))
      } catch (e) {
        failed++; host.log('Unreadable: ' + f.name + ' — ' + (e && e.message ? e.message : e)); next[key] = { v: CACHE_V, bad: 1 }
      }
    }
    saveCache(next)
    if (fresh) savePlayers(players)
    if (learned) { host.storage.set('myPids', JSON.stringify(myPids)); host.log('Your player identifiers: ' + Object.keys(myPids).join(', ')) }
    host.log(files.length + ' files, ' + fresh + ' read, ' + failed + ' unreadable' + (backlog ? ', ' + backlog + ' still to read' : ''))
    var unknownIds = Object.keys(unknown)
    if (unknownIds.length) host.log('Unknown legend (' + unknownIds.map(function (k) { return '#' + k }).join(', ') + '): new legend? Update the plugin.')

    // Totals and curve: all games read, in chronological order (file date).
    var games = [], unnamed = 0
    for (var k in next) { var e = next[k]; if (e.bad) continue; if (!e.s) { unnamed++; continue } games.push(e) }
    games.sort(function (x, y) { return x.t - y.t })
    var T = { games: 0, wins: 0, losses: 0, taken: 0, lost: 0, dur: 0, apm: 0, apmN: 0 }, history = []
    var step = Math.max(1, Math.ceil(games.length / MAX_POINTS))
    games.forEach(function (g, idx) {
      var s = g.s
      T.games++; T.taken += s.tk; T.lost += s.d; T.dur += s.du / 1000
      if (s.w === 1) T.wins++; else if (s.w === 0) T.losses++
      if (s.a >= 0) { T.apm += s.a / 10; T.apmN++ }
      if (idx % step && idx !== games.length - 1) return                 // beyond 5000 games, one point every `step`
      var decided = T.wins + T.losses
      history.push({ ts: g.t, metrics: { games: T.games, wins: T.wins, losses: T.losses, winrate: decided ? T.wins * 100 / decided : 0,
        stocks_taken: T.taken, stocks_lost: T.lost, avg_duration: T.dur / T.games } })
    })
    if (unnamed) host.log(unnamed + ' games without your name ("' + wanted.join(', ') + '") ignored')
    var decided = T.wins + T.losses
    var metrics = { games: T.games, wins: T.wins, losses: T.losses, stocks_taken: T.taken, stocks_lost: T.lost }
    if (decided) metrics.winrate = T.wins * 100 / decided
    if (T.games) metrics.avg_duration = T.dur / T.games
    if (T.apmN) metrics.apm = T.apm / T.apmN
    return { metrics: metrics, items: items.slice(0, 200), history: history, summary: buildSummary(games, lang), backlog: backlog, filters: filtersOf(games, lang === 'fr'), players: bank }
  }
}
