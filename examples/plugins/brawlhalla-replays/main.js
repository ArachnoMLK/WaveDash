// Brawlhalla Replays — lit des fichiers .replay (versions 261 à 271, patchs 10.02 à 11.00).
// Format : zlib → XOR avec une clé de 64 octets → flux de bits (MSB en premier).
// Crédit : structure du format d'après BrawlhallaReplayLibrary (allhailcheese, MIT) et brawlhalla-replay-reader (itselectroz, MIT).
// Aucun accès réseau : tout se passe dans le bac à sable de WaveDash, sur le dossier que tu as choisi.

var KEY = [107,16,222,60,68,75,209,70,160,16,82,193,178,49,211,106,251,172,17,222,6,104,8,120,140,213,179,249,106,64,214,19,12,174,157,197,212,107,84,114,252,87,93,26,6,115,194,81,75,176,201,140,120,4,17,122,239,116,62,70,57,160,199,166]
var MAX_NEW = 150          // nouveaux replays lus par actualisation au plus (~25 ms chacun) ; WaveDash relance tant qu'il en reste
var BUDGET_MS = 2000       // au-delà, on s'arrête : le reste suit à la relance (le bac à sable coupe à 8 s ; une lecture courte gêne moins l'interface)
var MAX_POINTS = 5000      // points d'historique renvoyés au plus (limite de WaveDash)
var BUCKETS = 96             // clés de stockage du cache (WaveDash en autorise 100, 64 Ko chacune)
var CACHE_V = 5            // version du contenu du cache : une entrée plus ancienne est relue

// Légendes : identifiant du replay = legend_id de l'API officielle = HeroID du jeu (table HeroTypes du patch 11.00).
// Une légende plus récente que cette table s'affiche « #id ».
var LEGENDS = { 3: 'Bödvar', 4: 'Cassidy', 5: 'Orion', 6: 'Lord Vraxx', 7: 'Gnash', 8: 'Queen Nai', 9: 'Lucien', 10: 'Hattori', 11: 'Sir Roland', 12: 'Scarlet', 13: 'Thatch', 14: 'Ada', 15: 'Sentinel', 16: 'Teros', 17: 'Red Raptor', 18: 'Ember', 19: 'Brynn', 20: 'Asuri', 21: 'Barraza', 22: 'Ulgrim', 23: 'Azoth', 24: 'Koji', 25: 'Diana', 26: 'Jhala', 27: 'Loki', 28: 'Kor', 29: 'Wu Shang', 30: 'Val', 31: 'Ragnir', 32: 'Cross', 33: 'Mirage', 34: 'Nix', 35: 'Mordex', 36: 'Yumiko', 37: 'Artemis', 38: 'Caspian', 39: 'Sidra', 40: 'Xull', 41: 'Isaiah', 42: 'Kaya', 43: 'Jiro', 44: 'Lin Fei', 45: 'Zariel', 46: 'Rayman', 47: 'Dusk', 48: 'Fait', 49: 'Thor', 50: 'Petra', 51: 'Vector', 52: 'Volkov', 53: 'Onyx', 54: 'Jaeyun', 55: 'Mako', 56: 'Magyar', 57: 'Reno', 58: 'Munin', 59: 'Arcadia', 60: 'Ezio', 61: 'Seven', 62: 'Thea', 63: 'Tezca', 64: 'Vivi', 65: 'Imugi', 66: 'King Zuva', 67: 'Priya', 68: 'Ransom', 69: 'Lady Vera', 70: 'Rupture', 71: 'Aurus', 72: 'Qinghua & Baobao' }
function legendName(id) { return LEGENDS[id] || '#' + id }
// Armes de chaque légende (BaseWeapon1/2) et noms des cartes (LevelTypes), relevés dans les données du jeu, patch 11.00.
var WEAPONS = { 3: 'Hammer/Sword', 4: 'Pistol/Hammer', 5: 'RocketLance/Spear', 6: 'RocketLance/Pistol', 7: 'Hammer/Spear', 8: 'Spear/Katar', 9: 'Katar/Pistol', 10: 'Sword/Spear', 11: 'RocketLance/Sword', 12: 'Hammer/RocketLance', 13: 'Sword/Pistol', 14: 'Pistol/Spear', 15: 'Hammer/Katar', 16: 'Axe/Hammer', 17: 'Boots/Orb', 18: 'Bow/Katar', 19: 'Axe/Spear', 20: 'Katar/Sword', 21: 'Axe/Pistol', 22: 'Axe/RocketLance', 23: 'Bow/Axe', 24: 'Bow/Sword', 25: 'Bow/Pistol', 26: 'Axe/Sword', 27: 'Katar/Scythe', 28: 'Fists/Hammer', 29: 'Fists/Spear', 30: 'Fists/Sword', 31: 'Katar/Axe', 32: 'Pistol/Fists', 33: 'Scythe/Spear', 34: 'Scythe/Pistol', 35: 'Scythe/Fists', 36: 'Bow/Hammer', 37: 'RocketLance/Scythe', 38: 'Fists/Katar', 39: 'Cannon/Sword', 40: 'Cannon/Axe', 41: 'Cannon/Pistol', 42: 'Spear/Bow', 43: 'Sword/Scythe', 44: 'Katar/Cannon', 45: 'Fists/Bow', 46: 'Fists/Axe', 47: 'Spear/Orb', 48: 'Scythe/Orb', 49: 'Hammer/Orb', 50: 'Fists/Orb', 51: 'RocketLance/Bow', 52: 'Axe/Scythe', 53: 'Fists/Cannon', 54: 'Sword/Greatsword', 55: 'Katar/Greatsword', 56: 'Hammer/Greatsword', 57: 'Pistol/Orb', 58: 'Bow/Scythe', 59: 'Spear/Greatsword', 60: 'Sword/Orb', 61: 'Spear/Cannon', 62: 'Boots/RocketLance', 63: 'Boots/Fists', 64: 'Boots/Pistol', 65: 'Axe/Greatsword', 66: 'Hammer/Boots', 67: 'Chakram/Sword', 68: 'Chakram/Bow', 69: 'Chakram/Scythe', 70: 'Katar/RocketLance', 71: 'Chakram/Spear', 72: 'Orb/Cannon' }
var WEAPON_NAMES = { Hammer: ['Marteau', 'Hammer'], Sword: ['Épée', 'Sword'], Pistol: ['Blasters', 'Blasters'], RocketLance: ['Lance-roquettes', 'Rocket Lance'],
  Spear: ['Lance', 'Spear'], Katar: ['Katars', 'Katars'], Axe: ['Hache', 'Axe'], Bow: ['Arc', 'Bow'], Fists: ['Gantelets', 'Gauntlets'], Scythe: ['Faux', 'Scythe'],
  Cannon: ['Canon', 'Cannon'], Orb: ['Orbe', 'Orb'], Greatsword: ['Grande épée', 'Greatsword'], Boots: ['Bottes', 'Battle Boots'], Chakram: ['Chakram', 'Chakram'] }
var LEVELS = {"1": "Twilight Grove", "2": "Brawlhaven", "3": "Grumpy Temple", "4": "Small Twilight Grove", "6": "Random", "7": "The Great Hall", "8": "World's End Kung Foot", "10": "Enchanted Forest Arena", "11": "Kings Pass", "12": "Small Kings Pass", "13": "Small Kings Pass Test", "14": "Small Kings Pass Test2", "15": "Brawlball Arena", "16": "Bombsketball Arena", "17": "Dodgebomb Arena", "18": "Jikoku", "19": "Enchanted Forest", "20": "Beachbrawl Arena", "22": "Titan's End", "24": "Thundergard Stadium", "25": "Shipwreck Falls", "26": "Elysium Arena", "27": "Brawlball2", "28": "Shadowscar Landing", "29": "Small Wasteland", "31": "Shrek's Muddy Swamp", "33": "The Wasteland", "35": "Shrek's Swamp", "39": "Big Brawlball Arena", "40": "The Enigma", "42": "Small Fortress of Wolves", "43": "Blackguard Keep", "45": "Dev Grid", "46": "Eternity's End", "47": "Mammoth Fortress", "49": "Short Side", "50": "Pillars", "51": "Pit", "53": "Brawlball_4_30", "54": "Wally", "55": "Big Titan's End", "56": "Big Thundergard Stadium", "57": "Big Twilight Grove", "58": "Big Great Hall", "59": "Big Lost Labyrinth", "62": "Small Thundergard Stadium", "63": "Small Mammoth Fortress", "64": "Small Blackguard Keep", "65": "Small Great Hall", "66": "Plain", "67": "Small Titan's End", "68": "Danger Zone", "70": "The Fangwild", "71": "Wheel", "72": "Chute", "73": "Lost Labyrinth", "74": "Big Dodgebomb Arena", "75": "Catch Bombs", "76": "Miami Dome", "81": "Small Grumpy Temple", "84": "Color Platforms", "89": "Tutorial 1", "90": "Tutorial 2", "91": "Tutorial 3", "93": "Sanctuary", "94": "Small Brawlhaven", "95": "Small Enigma", "96": "Big Enigma", "97": "Big Shipwreck Falls", "98": "Big Brawlhaven", "99": "Elysium", "100": "Small Fangwild", "101": "Competitive Grumpy", "102": "Small Lost Labyrinth", "103": "Spike", "104": "Small Cave 2", "105": "Temple Climb", "106": "Paintbrawl", "110": "Flag Battle", "112": "Demon Island CTF", "115": "Plains of Passage", "116": "Crazy Shipwreck Falls", "117": "Crazy Fangwild", "118": "Crazy Titan's End", "119": "Floor is not Lava", "120": "Crazy Thundergard Stadium", "121": "Xull's Murder Box", "123": "Kung Foot Arena", "124": "Apocalypse", "125": "Big Crazy Fangwild", "126": "Fangwild Dodgebomb", "127": "Small Galvan Prime", "128": "Big Miami Dome", "129": "Horde", "130": "Under the Canopy", "131": "Tree Fort", "132": "Ring", "135": "Demon Island", "136": "Big Crystal Temple", "137": "Crystal Temple", "138": "Temple Ruins", "139": "Galvan Prime", "140": "Synthwave Kung Foot", "141": "Sun Drive City", "143": "Spirit Realm Showdown", "144": "Lich's Tomb", "146": "Walker Attack!", "147": "Hiding Plats 2 Electric Boo", "148": "Small Sun Drive City", "150": "FeudingFlats", "151": "Spirit Realm", "152": "World's End Arena", "153": "Big World's End Arena", "154": "Divine Spirit Showdown", "174": "World's End", "175": "The Turtles' Lair", "176": "Small Plain", "177": "Small Turtles' Lair", "178": "Fortress of the Lions", "180": "Siege of Lions", "184": "Suzaku Castle Walls", "185": "Suzaku Castle", "186": "Void Minor", "187": "Void Major", "188": "Cannonball Mania", "190": "The Wasteland Showdown", "191": "Bustling Side Street", "210": "Fabled City", "211": "Small Fabled City", "212": "Western Air Temple", "214": "Little Boat", "215": "Frozen Plains", "216": "Florence Rooftop", "217": "Florence Terrace", "220": "Shorwind Fishing Port", "221": "Thundergard Sands", "222": "Western Air Temple Brawl", "223": "Mishima Dojo", "226": "Nightmare Horde", "227": "TEKKEN Brawl", "229": "Small Terminus", "231": "Terminus", "232": "Bikini Bottom", "233": "Small World's End", "234": "Starlight Falls", "235": "Crumbling Chasm", "236": "Apocalyptic Chasm", "237": "Mustafar", "238": "Crumbled Chasm", "242": "Theed Power Generator", "246": "Small Theed Generator", "249": "Mos Eisley Spaceport", "250": "Flipped90BP6GiantSword", "251": "TutorialBP6GiantSword", "252": "NTLost Labyrinth", "253": "Tutorial Fortress of the Lions", "254": "NTLostLab2", "255": "Mustafar", "258": "Old Ivaldi Mine", "263": "Dragon Port", "266": "Castle Batavia", "269": "Shiganshina District", "271": "Shiganshina District Brawl"}
// Version du format → patch (vérifié sur les noms de fichiers des replays).
var PATCHES = { 261: '10.02', 262: '10.03', 263: '10.04', 264: '10.05', 265: '10.06', 266: '10.07', 267: '10.08', 268: '10.09', 269: '10.10', 270: '10.11', 271: '11.00' }
function weaponsOf(id, fr) { var w = WEAPONS[id]; return w ? w.split('/').map(function (x) { return (WEAPON_NAMES[x] || [x, x])[fr ? 0 : 1] }).join(' / ') : '—' }

/* ───────── inflate (zlib), sortie plafonnée à `limit` octets ───────── */
var LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258]
var LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0]
var DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577]
var DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13]
var CLORD = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]

/** Table de décodage d'un code de Huffman canonique : indexée par les `max` prochains bits du flux (ordre deflate),
 *  chaque case donne (symbole << 4) | longueur du code. Un seul accès par symbole au lieu d'une boucle bit par bit. */
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
  function need(k) {                                                    // au-delà de la fin : des zéros, contrôlés plus bas
    while (bitCnt < k) { bitBuf |= (pos < n ? src[pos] : 0) << bitCnt; pos++; bitCnt += 8 }
    if (pos > n + 4) throw new Error('fin des données')
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
      var drop = bitCnt & 7; bitBuf >>>= drop; bitCnt -= drop             // retour à la frontière d'octet
      pos -= bitCnt >> 3; bitBuf = 0; bitCnt = 0
      var len = src[pos] | (src[pos + 1] << 8); pos += 4
      if (pos + len > n) throw new Error('fin des données')
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

/* ───────── lecture du flux de bits ───────── */
function Reader(buf) {                                               // le XOR est appliqué une fois pour toutes, puis on lit octet par octet
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

/* ───────── checksum des données de partie (d'après BrawlhallaReplayLibrary, ReplayGameData.CalculateChecksum) ───────── */
function add() { var s = 0; for (var i = 0; i < arguments.length; i++) s = (s + arguments[i] % 4294967296) % 4294967296; return s }
function popcount(v) { var n = 0; while (v) { n += v & 1; v >>>= 1 } return n }
function roundEven(x) { var f = Math.floor(x), d = x - f; return d > 0.5 || (d === 0.5 && f % 2) ? f + 1 : f }   // arrondi de Math.Round en C#
function FormatError(version) { this.message = 'format non reconnu (version ' + version + ')'; this.unknownFormat = true }

/* ───────── analyse d'un replay (s'arrête avant les « inputs ») ───────── */
function parseBuffer(buf) {
  var r = new Reader(buf), rep = { version: r.u32(), online: false, playlist: '', levelId: 0, lives: 0, ents: [], scores: {}, length: 0, kos: [], inputs: {} }
  var haveGame = false
  for (;;) {
    var t = r.bits(4)
    if (t === 3) {                                                    // en-tête
      r.u32(); var pid = r.u32(); rep.playlistId = pid
      if (pid) rep.playlist = r.str()
      rep.online = !!r.bit()
    } else if (t === 4) {                                             // données de partie
      var st = []; for (var i = 0; i < 15; i++) st.push(r.u32())
      rep.lives = st[4]; rep.maxPlayers = st[1]; rep.settings = st; rep.levelId = r.u32()
      var hc = r.bits(16)
      if (hc < 1 || hc > 5) throw new Error('nombre de légendes invalide')
      var sum = 0                                                       // checksum des joueurs (voir checksumOf)
      while (r.bit()) {
        var e = { id: r.i32() }
        if (rep.version >= 268) r.i32()                                // identifiant de joueur (ajouté en v268, patch 10.09)
        e.name = r.str()
        var cs = 0, cos = []
        for (i = 0; i < 6; i++) cos.push(r.u32())                      // couleurs, robot d'apparition, compagnon, émetteur, traînée, thème
        cs = add(cs, cos[0] * 5, cos[1] * 93, cos[3] * 97, cos[5] * 53)
        for (i = 0; i < 8; i++) cs = add(cs, r.u32() * (13 + i))       // provocations équipées
        cs = add(cs, r.bits(16) * 37, r.bits(16) * 41)                 // provocations de victoire / défaite
        for (i = 0; r.bit(); i++) cs = add(cs, popcount(r.u32()) * (11 + i))   // provocations possédées (champ de bits)
        r.bits(16); e.team = r.i32(); r.i32()
        cs = add(cs, (e.team >>> 0) * 43)
        e.heroes = []
        for (i = 0; i < hc; i++) {
          var h = r.u32(), costume = r.u32(), stance = r.u32()
          var top = r.bit(), skin2 = r.bits(15), morph = r.bit(), skin1 = r.bits(15)
          // Le bit de tête compte comme bit 31 de la valeur combinée (vérifié sur les replays à plusieurs légendes).
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
      // Le jeu écrit un checksum des données de partie : s'il ne correspond pas, le format a changé et on ne lit rien de faux.
      if (r.u32() !== add(sum, rep.levelId * 47) % 173) throw new FormatError(rep.version)
      haveGame = true
    } else if (t === 6) {                                             // résultats
      var len = r.u32(), sc = {}
      if (r.bit()) while (r.bit()) { var id = r.bits(5), s = r.bits(16); sc[id] = s > 32767 ? s - 65536 : s }
      r.u32()
      rep.length = len
      if (Object.keys(sc).length) rep.scores = sc
    } else if (t === 5 || t === 7) {                                  // KOs (5) et autres visages (7)
      var list = []
      while (r.bit()) { var ent = r.bits(5), ts = r.i32(); list.push([ent, ts]) }
      if (t === 5) rep.kos = list
    } else if (t === 1) {                                              // inputs : état des 14 touches à chaque changement
      while (r.bit()) {
        var who = r.bits(5), cnt = r.i32()
        if (cnt < 0 || cnt > 2000000) throw new Error('inputs invalides')
        var acc = rep.inputs[who] || (rep.inputs[who] = newInputs())
        // Boucle la plus chaude du plugin : lecture des bits en ligne (sans appel de méthode), bien plus rapide dans QuickJS.
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

/* ───────── inputs : appuis, directions, déplacement, activité ───────── */
// Indicateurs (d'après BrawlhallaReplayLibrary) : 1 haut, 2 bas, 4 gauche, 8 droite, 16 saut, 32 priorité neutre,
// 64 attaque lourde, 128 attaque légère, 256 esquive/dash, 512 ramasser/lancer, 1024 à 8192 provocations.
var BUCKET_MS = 15000
function newInputs() { return { l: [0, 0, 0], h: [0, 0, 0], g: [0, 0, 0, 0, 0, 0, 0, 0, 0], d: 0, j: 0, t: 0, tt: 0, mv: 0, act: [], prev: 0, last: 0 } }
function dirOf(f) { return f & 2 && !(f & 12) ? 2 : f & 12 ? 1 : 0 }            // 0 neutre, 1 côté, 2 bas (direction tenue)
function trackInput(a, ts, f) {
  if (a.prev & 12 && ts > a.last) a.mv += ts - a.last                    // temps passé à tenir gauche ou droite
  var down = f & ~a.prev
  if (down & 976) {                                                      // une action : attaque, esquive, saut, lancer
    var b = Math.floor(ts / BUCKET_MS); while (a.act.length <= b && a.act.length < 600) a.act.push(0); if (b < 600) a.act[b]++
    if (down & 128) a.l[dirOf(f)]++
    if (down & 64) a.h[dirOf(f)]++
    if (down & 256) { a.d++; a.g[(f & 1 ? 0 : f & 2 ? 6 : 3) + (f & 4 && !(f & 8) ? 0 : f & 8 && !(f & 4) ? 2 : 1)]++ }
    if (down & 16) a.j++
    if (down & 512) a.t++
  }
  if (down & 15360) a.tt++
  a.prev = f; a.last = ts
}

function parseReplay(bytes) {
  return parseBuffer(inflate(bytes, 12 * 1024 * 1024))                  // un replay décompressé fait quelques dizaines de Ko
}

/* ───────── cache (évite de relire les replays déjà analysés) ───────── */
function bucketOf(name) { var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 100003; return 'c' + (h % BUCKETS) }
function loadCache() {
  var cache = {}
  for (var i = 0; i < BUCKETS; i++) {
    var raw = host.storage.get('c' + i)
    if (!raw) continue
    try { var o = JSON.parse(raw); for (var k in o) cache[k] = o[k] } catch (e) { /* cache corrompu : ignoré */ }
  }
  return cache
}
function saveCache(entries) {
  var buckets = {}
  for (var k in entries) { var b = bucketOf(k.split('|')[0]); (buckets[b] = buckets[b] || {})[k] = entries[k] }
  for (var i = 0; i < BUCKETS; i++) {
    var key = 'c' + i, next = buckets[key] ? JSON.stringify(buckets[key]) : ''
    if (next.length > 60000) { host.log('Cache plein (' + key + ') : certains replays seront relus.'); continue }
    if ((host.storage.get(key) || '') !== next) host.storage.set(key, next)
  }
}
function compact(rep) {
  var ins = {}
  for (var k in rep.inputs) { var a = rep.inputs[k]; ins[k] = { l: a.l, h: a.h, g: a.g, d: a.d, j: a.j, t: a.t, tt: a.tt, mv: a.mv, act: a.act } }
  return { n: rep.ents.map(function (e) { return [e.name, e.team, e.heroes[0], e.bot ? 1 : 0, e.id, e.costume, e.stance] }), s: rep.scores, k: rep.kos, l: rep.length,
    m: rep.levelId, p: rep.playlist, pid: rep.playlistId, o: rep.online ? 1 : 0, lv: rep.lives, st: rep.settings || [], i: ins, ver: rep.version }
}

/* ───────── calculs ───────── */
function tr(fr, a, b) { return fr ? a : b }
function modeLabel(c, lang) {
  if (c.p) {
    var m = /^PlaylistType_(.*?)(?:_DisplayName)?$/.exec(c.p)
    if (m) return m[1].replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
    return c.p
  }
  return c.o ? (lang === 'fr' ? 'Salon en ligne' : 'Online room') : (lang === 'fr' ? 'Hors ligne' : 'Offline')
}
/** Le jeu nomme ses fichiers « [11.00] SmallBrawlhaven (42).replay » : la carte est dans le nom ; sinon, la table du jeu. */
function mapFromFile(name) {
  var m = /^\[[^\]]*\]\s*(.+?)(?:\s*\(\d+\))?\.replay$/i.exec(name)
  return m ? m[1].replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').replace(/_/g, ' ').trim() : ''
}
// La table du jeu d'abord : le jeu tronque certains noms de fichiers (« SmallFortressof »).
function mapName(file, c, fr) { return LEVELS[c.m] || mapFromFile(file.name) || tr(fr, 'Carte #', 'Map #') + c.m }
function patchOf(file, c) { var m = /^\[(\d+\.\d+)\]/.exec(file.name); return m ? m[1] : PATCHES[c.ver] || ('v' + c.ver) }
function fmtDur(sec) { sec = Math.round(sec); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s }
function pad(n) { return (n < 10 ? '0' : '') + n }
function fmtDate(ts) { var d = new Date(ts); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) }
function pct(a, b) { return b ? Math.round(a * 1000 / b) / 10 : 0 }
/** Pseudos recherchés : plusieurs possibles, séparés par des virgules (ex. après un changement de pseudo). */
function wantedList(raw) { return (raw || '').split(/[,;]/).map(function (w) { return w.toLowerCase().trim() }).filter(Boolean) }
function matches(name, wanted) {
  var a = name.toLowerCase()
  var tagless = a.indexOf('|') >= 0 ? a.slice(a.indexOf('|') + 1).trim() : a
  return wanted.some(function (w) { return a === w || tagless === w || a.indexOf(w) >= 0 })
}

function analyse(c, wanted) {
  var ents = c.n.map(function (n) { return { name: n[0], team: n[1], hero: n[2], bot: n[3], id: n[4], costume: n[5], stance: n[6] } })
  var me = null
  for (var i = 0; i < ents.length; i++) if (matches(ents[i].name, wanted)) { me = ents[i]; break }
  var deaths = {}; ents.forEach(function (e) { deaths[e.id] = [] })
  c.k.slice().sort(function (a, b) { return a[1] - b[1] }).forEach(function (k) { if (deaths[k[0]]) deaths[k[0]].push(k[1]) })
  // Score = place (1 = vainqueur). Certains modes (Kung Foot…) ajoutent une entité qui n'est pas un joueur, avec 0 : ignorée.
  var scoreVals = ents.map(function (e) { return c.s[e.id] }).filter(function (v) { return v > 0 })
  var best = scoreVals.length ? Math.min.apply(null, scoreVals) : null
  var won = null
  if (me && c.s[me.id] > 0 && best !== null) won = c.s[me.id] === best && scoreVals.some(function (v) { return v !== best })
  var sameTeam = function (a, b) { return a.id === b.id || (a.team === b.team && a.team !== 0) }
  // KOs infligés : seulement en 1 contre 1, où l'auteur est forcément l'adversaire (le fichier ne le dit pas sinon).
  var duel = ents.length === 2 && !sameTeam(ents[0], ents[1])
  var kills = {}; ents.forEach(function (e) { kills[e.id] = duel ? deaths[ents[0].id === e.id ? ents[1].id : ents[0].id].length : null })
  var taken = 0, lost = 0
  if (me) ents.forEach(function (e) { if (e.id === me.id) lost += deaths[e.id].length; else if (!sameTeam(e, me)) taken += deaths[e.id].length })
  return { ents: ents, me: me, deaths: deaths, kills: kills, won: won, taken: taken, lost: lost, dur: c.l / 1000, sameTeam: sameTeam,
    apm: me ? apmOf(c, me.id) : null }
}

/** Appuis par minute (attaques, esquives, sauts, lancers ; sans les provocations), d'après les inputs du replay. */
function presses(c, id) { return (c.i && c.i[id]) || null }
function apmOf(c, id) {
  var p = presses(c, id), min = c.l / 60000
  return p && min > 0 ? (p.l[0] + p.l[1] + p.l[2] + p.h[0] + p.h[1] + p.h[2] + p.d + p.j + p.t) / min : null
}

function teamsTitle(ents) {
  var groups = {}, order = []
  ents.forEach(function (e) { if (!groups[e.team]) { groups[e.team] = []; order.push(e.team) } groups[e.team].push(e.name) })
  if (order.length > 1) return order.map(function (t) { return groups[t].join(' & ') }).join(' vs ')
  return ents.map(function (e) { return e.name }).join(' · ')
}

var GRID_ROWS = ['↑', '·', '↓'], GRID_COLS = ['←', '·', '→']
function grid3(g) { return [g.slice(0, 3), g.slice(3, 6), g.slice(6, 9)] }

function buildItem(file, c, a, lang) {
  var fr = lang === 'fr', st = c.st || []
  var chips = [mapName(file, c, fr), modeLabel(c, lang), 'Patch ' + patchOf(file, c), fmtDate(file.mtime), fmtDur(a.dur),
    c.lv ? c.lv + ' ' + tr(fr, 'vies', 'stocks') : tr(fr, 'Vies illimitées', 'No stock limit'), c.o ? tr(fr, 'En ligne', 'Online') : tr(fr, 'Hors ligne', 'Offline')]
  if (st[8] && st[8] !== 100) chips.push(tr(fr, 'Dégâts ', 'Damage ') + st[8] + ' %')
  if (st[7] && st[7] !== 100) chips.push(tr(fr, 'Vitesse ', 'Speed ') + st[7] + ' %')
  var place = function (e) { var p = c.s[e.id]; return p > 0 ? p : '—' }
  var players = a.ents.map(function (e) {
    return [e.name, e.team, legendName(e.hero), weaponsOf(e.hero, fr), tr(fr, 'Posture ', 'Stance ') + e.stance, place(e), a.deaths[e.id].length,
      a.kills[e.id] === null ? '—' : a.kills[e.id]]
  })
  var actions = a.ents.map(function (e) {
    var p = presses(c, e.id), apm = apmOf(c, e.id)
    if (!p) return [e.name, '—', '—', '—', '—', '—', '—', '—', '—']
    return [e.name, p.l.join(' / '), p.h.join(' / '), p.d, p.j, p.t, p.tt, pct(p.mv, c.l) + ' %', apm === null ? '—' : Math.round(apm)]
  })
  var grids = [], lines = []
  a.ents.forEach(function (e) {
    var p = presses(c, e.id); if (!p) return
    if (grids.length < 8) grids.push({ title: tr(fr, 'Esquives · ', 'Dodges · ') + e.name, rows: GRID_ROWS, cols: GRID_COLS, values: grid3(p.g) })
    lines.push({ name: e.name, values: p.act })
  })
  var detail = {
    chips: chips,
    tables: [
      { title: tr(fr, 'Joueurs', 'Players'),
        columns: fr ? ['Joueur', 'Équipe', 'Légende', 'Armes', 'Posture', 'Place', 'KOs subis', 'KOs infligés (1v1)'] : ['Player', 'Team', 'Legend', 'Weapons', 'Stance', 'Place', 'Stocks lost', 'KOs dealt (1v1)'],
        rows: players },
      { title: tr(fr, 'Actions (attaques : neutre / côté / bas)', 'Actions (attacks: neutral / side / down)'),
        columns: fr ? ['Joueur', 'Légères', 'Lourdes', 'Esquives', 'Sauts', 'Lancers', 'Provocations', 'Déplacement', 'Appuis/min'] : ['Player', 'Light', 'Heavy', 'Dodges', 'Jumps', 'Throws', 'Taunts', 'Moving', 'Presses/min'],
        rows: actions }
    ],
    grids: grids,
    series: lines.length ? [{ title: tr(fr, 'Actions toutes les 15 s', 'Actions every 15 s'), step: BUCKET_MS / 1000, lines: lines }] : undefined,
    timeline: {
      duration: a.dur,
      lanes: a.ents.map(function (e) { return e.name }),
      events: c.k.map(function (k) {
        var lane = -1; for (var i = 0; i < a.ents.length; i++) if (a.ents[i].id === k[0]) lane = i
        return { t: k[1] / 1000, lane: lane, label: 'KO' }
      }).filter(function (ev) { return ev.lane >= 0 })
    }
  }
  return {
    id: file.name,
    title: teamsTitle(a.ents),
    ts: file.mtime,
    fields: {
      mode: modeLabel(c, lang),
      result: a.won === null ? '—' : a.won ? tr(fr, 'Victoire', 'Win') : tr(fr, 'Défaite', 'Loss'),
      duration: pad(Math.floor(Math.round(a.dur) / 60)) + fmtDur(a.dur).slice(fmtDur(a.dur).indexOf(':')),   // « 03:04 » : se trie correctement
      kos: c.k.length,
      apm: a.apm === null ? '—' : Math.round(a.apm),
      map: chips[0]
    },
    detail: detail
  }
}

/** Résumé d'une de tes parties, gardé en cache pour les totaux, la courbe et le bilan (quelques centaines d'octets). */
function summaryOf(file, c, a, lang) {
  var me = a.me, p = presses(c, me.id), cut = function (n) { return n.slice(0, 24) }
  return { w: a.won === null ? -1 : a.won ? 1 : 0, d: a.lost, tk: a.taken, du: Math.round(a.dur * 1000), a: a.apm === null ? -1 : Math.round(a.apm * 10),
    L: me.hero, m: mapName(file, c, lang === 'fr'), p: modeLabel(c, lang), k: a.kills[me.id] === null ? -1 : a.kills[me.id],
    tm: a.ents.filter(function (e) { return e.id !== me.id && a.sameTeam(e, me) }).map(function (e) { return cut(e.name) }),
    op: a.ents.filter(function (e) { return !a.sameTeam(e, me) }).map(function (e) { return cut(e.name) }),
    g: p ? p.g : null, at: p ? p.l.concat(p.h) : null, j: p ? p.j : 0, dg: p ? p.d : 0, th: p ? p.t : 0 }
}

/** Bilan de toutes tes parties : par légende, carte, mode, coéquipier, adversaire, jour et heure ; esquives et attaques. */
function buildSummary(games, lang) {
  var fr = lang === 'fr', n = games.length
  if (!n) return undefined
  var tot = { w: 0, l: 0, d: 0, tk: 0, du: 0, a: 0, aN: 0, dg: 0, j: 0 }, g9 = [0, 0, 0, 0, 0, 0, 0, 0, 0], at = [0, 0, 0, 0, 0, 0]
  var by = { L: {}, m: {}, p: {}, tm: {}, op: {}, day: {}, hour: {} }
  var bump = function (map, key, s) {
    var o = map[key] || (map[key] = { n: 0, w: 0, l: 0, d: 0, a: 0, aN: 0 })
    o.n++; if (s.w === 1) o.w++; else if (s.w === 0) o.l++
    o.d += s.d; if (s.a >= 0) { o.a += s.a / 10; o.aN++ }
  }
  games.forEach(function (g) {
    var s = g.s, dt = new Date(g.t), i
    if (s.w === 1) tot.w++; else if (s.w === 0) tot.l++
    tot.d += s.d; tot.tk += s.tk; tot.du += s.du; tot.dg += s.dg; tot.j += s.j
    if (s.a >= 0) { tot.a += s.a / 10; tot.aN++ }
    if (s.g) for (i = 0; i < 9; i++) g9[i] += s.g[i]
    if (s.at) for (i = 0; i < 6; i++) at[i] += s.at[i]
    bump(by.L, legendName(s.L), s); bump(by.m, s.m, s); bump(by.p, s.p, s)
    s.tm.forEach(function (x) { bump(by.tm, x, s) }); s.op.forEach(function (x) { bump(by.op, x, s) })
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
  return {
    stats: [
      { label: tr(fr, 'Parties', 'Games'), value: n }, { label: tr(fr, 'Victoires', 'Wins'), value: tot.w }, { label: tr(fr, 'Défaites', 'Losses'), value: tot.l },
      { label: tr(fr, 'Taux de victoire', 'Win rate'), value: pct(tot.w, tot.w + tot.l) + ' %' }, { label: tr(fr, 'Durée moyenne', 'Average length'), value: fmtDur(tot.du / n / 1000) },
      { label: tr(fr, 'KOs subis / partie', 'Stocks lost / game'), value: Math.round(tot.d * 10 / n) / 10 },
      { label: tr(fr, 'Stocks pris / partie', 'Stocks taken / game'), value: Math.round(tot.tk * 10 / n) / 10 },
      { label: tr(fr, 'Appuis / min', 'Presses / min'), value: tot.aN ? Math.round(tot.a / tot.aN) : '—' },
      { label: tr(fr, 'Esquives / partie', 'Dodges / game'), value: Math.round(tot.dg / n) }, { label: tr(fr, 'Sauts / partie', 'Jumps / game'), value: Math.round(tot.j / n) },
      { label: tr(fr, 'Légende favorite', 'Favourite legend'), value: favourite || '—' }, { label: tr(fr, 'Depuis le', 'Since'), value: fmtDate(games[0].t).slice(0, 10) }
    ],
    tables: [
      { title: tr(fr, 'Par légende', 'By legend'), columns: [tr(fr, 'Légende', 'Legend')].concat(wl, [tr(fr, 'KOs subis / partie', 'Stocks lost / game'), tr(fr, 'Appuis/min', 'Presses/min')]),
        rows: rowsOf(by.L, 1, 80, function (k, o) { return basic(k, o).concat([Math.round(o.d * 10 / o.n) / 10, o.aN ? Math.round(o.a / o.aN) : '—']) }) },
      { title: tr(fr, 'Par carte', 'By map'), columns: [tr(fr, 'Carte', 'Map')].concat(wl), rows: rowsOf(by.m, 1, 40, basic) },
      { title: tr(fr, 'Par mode', 'By mode'), columns: ['Mode'].concat(wl), rows: rowsOf(by.p, 1, 40, basic) },
      { title: tr(fr, 'Coéquipiers (3 parties ou plus)', 'Teammates (3+ games)'), columns: [tr(fr, 'Joueur', 'Player')].concat(wl), rows: rowsOf(by.tm, 3, 40, basic) },
      { title: tr(fr, 'Adversaires (3 parties ou plus ; V = tes victoires)', 'Opponents (3+ games; W = your wins)'), columns: [tr(fr, 'Joueur', 'Player')].concat(wl), rows: rowsOf(by.op, 3, 40, basic) },
      { title: tr(fr, 'Par jour', 'By day'), columns: [tr(fr, 'Jour', 'Day')].concat(wl),
        rows: [0, 1, 2, 3, 4, 5, 6].filter(function (d) { return by.day[d] }).map(function (d) { return basic(days[d], by.day[d]) }) },
      { title: tr(fr, 'Par heure', 'By hour'), columns: [tr(fr, 'Heures', 'Hours')].concat(wl),
        rows: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(function (h) { return by.hour[h] }).map(function (h) { return basic(pad(h * 2) + 'h–' + pad(h * 2 + 2) + 'h', by.hour[h]) }) }
    ],
    grids: [
      { title: tr(fr, 'Direction de tes esquives', 'Your dodge directions'), rows: GRID_ROWS, cols: GRID_COLS, values: grid3(g9) },
      { title: tr(fr, 'Tes attaques', 'Your attacks'), rows: [tr(fr, 'Légère', 'Light'), tr(fr, 'Lourde', 'Heavy')],
        cols: [tr(fr, 'Neutre', 'Neutral'), tr(fr, 'Côté', 'Side'), tr(fr, 'Bas', 'Down')], values: [at.slice(0, 3), at.slice(3, 6)] }
    ]
  }
}

var plugin = {
  resolve: async function (ctx) {
    var parts = ctx.inputs.folder.split(/[\\/]/).filter(Boolean)
    var name = wantedList(ctx.inputs.playerName).length ? ctx.inputs.playerName.trim() : ''
    if (!name) throw new Error(ctx.lang === 'fr' ? 'Indique ton pseudo en jeu.' : 'Enter your in-game name.')
    return { externalId: ctx.inputs.folder, displayName: 'Replays · ' + name + (parts.length ? ' (' + parts[parts.length - 1] + ')' : '') }
  },

  refresh: async function (ctx) {
    var lang = ctx.lang, wanted = wantedList(ctx.inputs.playerName)
    var files = host.files.list()                                       // tout le dossier, du plus récent au plus ancien
    var cache = loadCache(), next = {}, fresh = 0, failed = 0, backlog = 0, items = [], unknown = {}
    var started = Date.now()                                            // le budget ne compte que la lecture des replays
    for (var i = 0; i < files.length; i++) {
      var f = files[i], key = f.name + '|' + f.size + '|' + f.mtime
      var c = cache[key]
      if (c && c.v === CACHE_V) { next[key] = c; continue }
      if (fresh >= MAX_NEW || Date.now() - started > BUDGET_MS) { backlog++; continue }
      fresh++
      try {
        var full = compact(parseReplay(host.files.readBytes(f.name))), a = analyse(full, wanted)
        full.n.forEach(function (n) { if (!LEGENDS[n[2]]) unknown[n[2]] = true })
        // Le cache ne garde qu'un résumé par partie ; le détail part tout de suite dans WaveDash, qui le conserve.
        next[key] = { v: CACHE_V, t: f.mtime, s: a.me ? summaryOf(f, full, a, lang) : 0 }
        if (a.me) items.push(buildItem(f, full, a, lang))
      } catch (e) {
        failed++; host.log('Illisible : ' + f.name + ' — ' + (e && e.message ? e.message : e)); next[key] = { v: CACHE_V, bad: 1 }
      }
    }
    saveCache(next)
    if (host.storage.get('base')) host.storage.set('base', '')            // base cumulée des versions 1.0.x : plus utile
    host.log(files.length + ' fichiers, ' + fresh + ' lus, ' + failed + ' illisibles' + (backlog ? ', ' + backlog + ' encore à lire' : ''))
    var unknownIds = Object.keys(unknown)
    if (unknownIds.length) host.log('Légende inconnue (' + unknownIds.map(function (k) { return '#' + k }).join(', ') + ') : nouvelle légende ? Mets à jour le plugin.')

    // Totaux et courbe : toutes les parties lues, dans l'ordre chronologique (date du fichier).
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
      if (idx % step && idx !== games.length - 1) return                 // au-delà de 5000 parties, un point sur `step`
      var decided = T.wins + T.losses
      history.push({ ts: g.t, metrics: { games: T.games, wins: T.wins, losses: T.losses, winrate: decided ? T.wins * 100 / decided : 0,
        stocks_taken: T.taken, stocks_lost: T.lost, avg_duration: T.dur / T.games } })
    })
    if (unnamed) host.log(unnamed + ' parties sans ton pseudo (« ' + wanted.join(', ') + ' ») ignorées')
    var decided = T.wins + T.losses
    var metrics = { games: T.games, wins: T.wins, losses: T.losses, stocks_taken: T.taken, stocks_lost: T.lost }
    if (decided) metrics.winrate = T.wins * 100 / decided
    if (T.games) metrics.avg_duration = T.dur / T.games
    if (T.apmN) metrics.apm = T.apm / T.apmN
    return { metrics: metrics, items: items.slice(0, 200), history: history, summary: buildSummary(games, lang), backlog: backlog }
  }
}
