// Brawlhalla Replays — lit des fichiers .replay (versions 261 à 271, patchs 10.02 à 11.00).
// Format : zlib → XOR avec une clé de 64 octets → flux de bits (MSB en premier).
// Crédit : structure du format d'après BrawlhallaReplayLibrary (allhailcheese, MIT) et brawlhalla-replay-reader (itselectroz, MIT).
// Aucun accès réseau : tout se passe dans le bac à sable de WaveDash, sur le dossier que tu as choisi.

var KEY = [107,16,222,60,68,75,209,70,160,16,82,193,178,49,211,106,251,172,17,222,6,104,8,120,140,213,179,249,106,64,214,19,12,174,157,197,212,107,84,114,252,87,93,26,6,115,194,81,75,176,201,140,120,4,17,122,239,116,62,70,57,160,199,166]
var MAX_FILES = 400        // fichiers les plus récents pris en compte
var MAX_NEW = 60           // nouveaux replays lus par actualisation (~65 ms chacun ; le reste suit à la suivante)
var BUDGET_MS = 4000       // au-delà, on s'arrête et on garde le reste pour la suivante (le bac à sable coupe à 8 s)
var BUCKETS = 64
var CACHE_V = 2             // version du contenu du cache : une entrée plus ancienne est relue (même clé, donc jamais comptée deux fois)

// Légendes : identifiant du replay = legend_id de l'API officielle = HeroID du jeu (table HeroTypes du patch 11.00).
// Une légende plus récente que cette table s'affiche « #id ».
var LEGENDS = { 3: 'Bödvar', 4: 'Cassidy', 5: 'Orion', 6: 'Lord Vraxx', 7: 'Gnash', 8: 'Queen Nai', 9: 'Lucien', 10: 'Hattori', 11: 'Sir Roland', 12: 'Scarlet', 13: 'Thatch', 14: 'Ada', 15: 'Sentinel', 16: 'Teros', 17: 'Red Raptor', 18: 'Ember', 19: 'Brynn', 20: 'Asuri', 21: 'Barraza', 22: 'Ulgrim', 23: 'Azoth', 24: 'Koji', 25: 'Diana', 26: 'Jhala', 27: 'Loki', 28: 'Kor', 29: 'Wu Shang', 30: 'Val', 31: 'Ragnir', 32: 'Cross', 33: 'Mirage', 34: 'Nix', 35: 'Mordex', 36: 'Yumiko', 37: 'Artemis', 38: 'Caspian', 39: 'Sidra', 40: 'Xull', 41: 'Isaiah', 42: 'Kaya', 43: 'Jiro', 44: 'Lin Fei', 45: 'Zariel', 46: 'Rayman', 47: 'Dusk', 48: 'Fait', 49: 'Thor', 50: 'Petra', 51: 'Vector', 52: 'Volkov', 53: 'Onyx', 54: 'Jaeyun', 55: 'Mako', 56: 'Magyar', 57: 'Reno', 58: 'Munin', 59: 'Arcadia', 60: 'Ezio', 61: 'Seven', 62: 'Thea', 63: 'Tezca', 64: 'Vivi', 65: 'Imugi', 66: 'King Zuva', 67: 'Priya', 68: 'Ransom', 69: 'Lady Vera', 70: 'Rupture', 71: 'Aurus', 72: 'Qinghua & Baobao' }
function legendName(id) { return LEGENDS[id] || '#' + id }

/* ───────── inflate (zlib), sortie plafonnée à `limit` octets ───────── */
var LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258]
var LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0]
var DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577]
var DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13]
var CLORD = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]

function huff(lengths, n) {
  var count = new Array(16).fill(0), symbol = new Array(n), offs = new Array(16), i
  for (i = 0; i < n; i++) count[lengths[i]]++
  offs[1] = 0
  for (i = 1; i < 15; i++) offs[i + 1] = offs[i] + count[i]
  for (i = 0; i < n; i++) if (lengths[i]) symbol[offs[lengths[i]]++] = i
  return { count: count, symbol: symbol }
}

function inflate(src, limit) {
  var pos = 2, bitBuf = 0, bitCnt = 0, out = new Uint8Array(Math.min(limit, 65536) + 600), o = 0
  function bits(n) {
    while (bitCnt < n) { if (pos >= src.length) throw new Error('fin des données'); bitBuf |= src[pos++] << bitCnt; bitCnt += 8 }
    var v = bitBuf & ((1 << n) - 1); bitBuf >>>= n; bitCnt -= n; return v
  }
  function decode(h) {
    var code = 0, first = 0, index = 0
    for (var len = 1; len <= 15; len++) {
      code |= bits(1)
      var c = h.count[len]
      if (code - c < first) return h.symbol[index + (code - first)]
      index += c; first += c; first <<= 1; code <<= 1
    }
    throw new Error('code invalide')
  }
  function grow(need) {
    if (o + need <= out.length) return
    var bigger = new Uint8Array(out.length * 2 + need); bigger.set(out); out = bigger
  }
  var fixedL = null, fixedD = null, last
  do {
    last = bits(1)
    var type = bits(2), lt, dt
    if (type === 0) {
      bitBuf = 0; bitCnt = 0
      var len = src[pos] | (src[pos + 1] << 8); pos += 4
      grow(len)
      for (var k = 0; k < len; k++) out[o++] = src[pos++]
      if (o >= limit) break
      continue
    }
    if (type === 1) {
      if (!fixedL) {
        var fl = []; for (var a = 0; a < 288; a++) fl.push(a < 144 ? 8 : a < 256 ? 9 : a < 280 ? 7 : 8)
        fixedL = huff(fl, 288); fixedD = huff(new Array(30).fill(5), 30)
      }
      lt = fixedL; dt = fixedD
    } else if (type === 2) {
      var nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4, lengths = new Array(320).fill(0), idx
      for (idx = 0; idx < ncode; idx++) lengths[CLORD[idx]] = bits(3)
      var ch = huff(lengths, 19)
      idx = 0
      var all = new Array(nlen + ndist).fill(0)
      while (idx < nlen + ndist) {
        var sym = decode(ch)
        if (sym < 16) all[idx++] = sym
        else {
          var prev = 0, rep
          if (sym === 16) { prev = all[idx - 1]; rep = 3 + bits(2) } else if (sym === 17) rep = 3 + bits(3); else rep = 11 + bits(7)
          while (rep--) all[idx++] = prev
        }
      }
      lt = huff(all.slice(0, nlen), nlen); dt = huff(all.slice(nlen), ndist)
    } else throw new Error('bloc invalide')
    for (;;) {
      var s = decode(lt)
      if (s < 256) { grow(1); out[o++] = s }
      else if (s === 256) break
      else {
        s -= 257
        var l = LBASE[s] + bits(LEXT[s]), d = decode(dt), dist = DBASE[d] + bits(DEXT[d])
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
      rep.lives = st[4]; rep.maxPlayers = st[1]; rep.levelId = r.u32()
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
          e.heroes.push(h)
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
    } else if (t === 1) {                                              // inputs : état des touches à chaque changement
      // On compte les appuis (passage de relâché à appuyé) ; l'horodatage de chaque changement est sauté.
      while (r.bit()) {
        var who = r.bits(5), cnt = r.i32()
        if (cnt < 0 || cnt > 2000000) throw new Error('inputs invalides')
        var acc = rep.inputs[who] || (rep.inputs[who] = [0, 0, 0, 0, 0, 0]), prev = 0
        for (var q = 0; q < cnt; q++) {
          r.skip(32)
          var flags = r.bit() ? r.bits(14) : 0, down = flags & ~prev
          if (down) {
            if (down & 128) acc[0]++                                    // attaque légère
            if (down & 64) acc[1]++                                     // attaque lourde
            if (down & 256) acc[2]++                                    // esquive / dash
            if (down & 16) acc[3]++                                     // saut
            if (down & 512) acc[4]++                                    // ramasser / lancer
            if (down & 15360) acc[5]++                                  // provocation
          }
          prev = flags
        }
      }
    } else if (t === 2) break
    else throw new Error('type d\'objet inconnu ' + t)
  }
  if (!haveGame || !rep.ents.length) throw new Error('replay incomplet')
  return rep
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
    if (next.length > 60000) continue                                   // sécurité : trop gros, on ne le garde pas
    if ((host.storage.get(key) || '') !== next) host.storage.set(key, next)
  }
}
function compact(rep) {
  return { n: rep.ents.map(function (e) { return [e.name, e.team, e.heroes[0], e.bot ? 1 : 0, e.id] }), s: rep.scores, k: rep.kos, l: rep.length, m: rep.levelId, p: rep.playlist, pid: rep.playlistId, o: rep.online ? 1 : 0, lv: rep.lives, i: rep.inputs, v: CACHE_V }
}

/* ───────── calculs ───────── */
function modeLabel(c, lang) {
  if (c.p) {
    var m = /^PlaylistType_(.*?)(?:_DisplayName)?$/.exec(c.p)
    if (m) return m[1].replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
    return c.p
  }
  return c.o ? (lang === 'fr' ? 'Salon en ligne' : 'Online room') : (lang === 'fr' ? 'Hors ligne' : 'Offline')
}
/** Le jeu nomme ses fichiers « [11.00] SmallBrawlhaven (42).replay » : la carte est dans le nom, sans table à tenir. */
function mapFromFile(name) {
  var m = /^(?:\[[^\]]*\]\s*)?(.+?)(?:\s*\(\d+\))?\.replay$/i.exec(name)
  return m ? m[1].replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').replace(/_/g, ' ').trim() : ''
}
function fmtDur(sec) { sec = Math.round(sec); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s }
/** Pseudos recherchés : plusieurs possibles, séparés par des virgules (ex. après un changement de pseudo). */
function wantedList(raw) { return (raw || '').split(/[,;]/).map(function (w) { return w.toLowerCase().trim() }).filter(Boolean) }
function matches(name, wanted) {
  var a = name.toLowerCase()
  var tagless = a.indexOf('|') >= 0 ? a.slice(a.indexOf('|') + 1).trim() : a
  return wanted.some(function (w) { return a === w || tagless === w || a.indexOf(w) >= 0 })
}

function analyse(c, wanted, lang) {
  var ents = c.n.map(function (n) { return { name: n[0], team: n[1], hero: n[2], bot: n[3], id: n[4] } })
  var me = null
  for (var i = 0; i < ents.length; i++) if (matches(ents[i].name, wanted)) { me = ents[i]; break }
  var deaths = {}; ents.forEach(function (e) { deaths[e.id] = [] })
  c.k.slice().sort(function (a, b) { return a[1] - b[1] }).forEach(function (k) { if (deaths[k[0]]) deaths[k[0]].push(k[1]) })
  var scoreVals = Object.keys(c.s).map(function (k) { return c.s[k] })
  var best = scoreVals.length ? Math.min.apply(null, scoreVals) : null
  var won = null
  if (me && c.s[me.id] !== undefined && best !== null) won = c.s[me.id] === best && scoreVals.some(function (v) { return v !== best })
  var taken = 0, lost = 0
  if (me) ents.forEach(function (e) { if (e.id === me.id) lost += deaths[e.id].length; else if (e.team !== me.team || me.team === 0) taken += deaths[e.id].length })
  return { ents: ents, me: me, deaths: deaths, won: won, taken: taken, lost: lost, dur: c.l / 1000, apm: me ? apmOf(c, me.id) : null }
}

/** Appuis par minute (attaques, esquives, sauts, lancers ; sans les provocations), d'après les inputs du replay. */
function presses(c, id) { return (c.i && c.i[id]) || null }
function apmOf(c, id) {
  var p = presses(c, id), min = c.l / 60000
  return p && min > 0 ? (p[0] + p[1] + p[2] + p[3] + p[4]) / min : null
}

function teamsTitle(ents) {
  var groups = {}, order = []
  ents.forEach(function (e) { if (!groups[e.team]) { groups[e.team] = []; order.push(e.team) } groups[e.team].push(e.name) })
  if (order.length > 1) return order.map(function (t) { return groups[t].join(' & ') }).join(' vs ')
  return ents.map(function (e) { return e.name }).join(' · ')
}

function buildItem(file, c, a, lang) {
  var fr = lang === 'fr'
  var rows = a.ents.map(function (e) {
    var place = c.s[e.id]
    var p = presses(c, e.id), apm = apmOf(c, e.id)
    return [e.name, e.team, legendName(e.hero), place === undefined ? '—' : (place === 1 ? '1' : String(place)), a.deaths[e.id].length,
      p ? p[0] + ' / ' + p[1] : '—', p ? p[2] : '—', apm === null ? '—' : Math.round(apm)]
  })
  var kos = c.k.length
  return {
    id: file.name,
    title: teamsTitle(a.ents),
    ts: file.mtime,
    fields: {
      mode: modeLabel(c, lang),
      result: a.won === null ? '—' : a.won ? (fr ? 'Victoire' : 'Win') : (fr ? 'Défaite' : 'Loss'),
      duration: fmtDur(a.dur),
      kos: kos,
      apm: a.apm === null ? '—' : Math.round(a.apm),
      map: mapFromFile(file.name) || (fr ? 'Carte #' : 'Map #') + c.m
    },
    detail: {
      table: {
        columns: fr ? ['Joueur', 'Équipe', 'Légende', 'Place', 'Stocks perdus', 'Attaques légères / lourdes', 'Esquives', 'Appuis/min'] : ['Player', 'Team', 'Legend', 'Place', 'Stocks lost', 'Light / heavy attacks', 'Dodges', 'Presses/min'],
        rows: rows
      },
      timeline: {
        duration: a.dur,
        lanes: a.ents.map(function (e) { return e.name }),
        events: c.k.map(function (k) {
          var lane = -1; for (var i = 0; i < a.ents.length; i++) if (a.ents[i].id === k[0]) lane = i
          return { t: k[1] / 1000, lane: lane, label: 'KO' }
        }).filter(function (ev) { return ev.lane >= 0 })
      }
    }
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
    var lang = ctx.lang, wanted = wantedList(ctx.inputs.playerName), started = Date.now()
    var files = host.files.list().slice(0, MAX_FILES)               // du plus récent au plus ancien
    var cache = loadCache(), next = {}, fresh = 0, skipped = 0, failed = 0
    var parsed = []
    for (var i = 0; i < files.length; i++) {
      var f = files[i], key = f.name + '|' + f.size + '|' + f.mtime
      var c = cache[key]
      if (!c || c.v !== CACHE_V) {
        if (fresh >= MAX_NEW || Date.now() - started > BUDGET_MS) {
          skipped++
          if (c) { next[key] = c; if (!c.bad) parsed.push({ file: f, c: c }) }   // ancienne entrée gardée telle quelle en attendant
          continue
        }
        fresh++
        try { c = compact(parseReplay(host.files.readBytes(f.name))) } catch (e) { failed++; host.log('Illisible : ' + f.name + ' — ' + (e && e.message ? e.message : e)); next[key] = { bad: 1, v: CACHE_V }; continue }
      }
      next[key] = c
      if (!c.bad) parsed.push({ file: f, c: c })
    }
    parsed = parsed.filter(function (x) { return !x.c.bad })
    // Parties sorties de la fenêtre des MAX_FILES derniers fichiers : leur bilan rejoint une base cumulée,
    // pour que les totaux et la courbe continuent de monter au lieu de chuter.
    var base = { games: 0, wins: 0, losses: 0, taken: 0, lost: 0, dur: 0 }
    try { var b = JSON.parse(host.storage.get('base') || 'null'); if (b && typeof b.games === 'number') base = b } catch (e) { /* base illisible : repart de zéro */ }
    var baseChanged = false
    for (var old in cache) {
      if (next[old] || cache[old].bad) continue
      var gone = analyse(cache[old], wanted, lang)
      if (!gone.me) continue
      base.games++; base.dur += gone.dur; base.taken += gone.taken; base.lost += gone.lost
      if (gone.won === true) base.wins++; else if (gone.won === false) base.losses++
      baseChanged = true
    }
    saveCache(next)                                                     // le cache d'abord : une coupure ici ne compte jamais deux fois
    if (baseChanged) host.storage.set('base', JSON.stringify(base))
    host.log(files.length + ' fichiers, ' + fresh + ' lus, ' + failed + ' illisibles' + (skipped ? ', ' + skipped + ' reportés à la prochaine actualisation' : ''))

    var totals = { games: base.games, wins: base.wins, losses: base.losses, taken: base.taken, lost: base.lost, dur: base.dur }, items = [], history = []
    var chrono = parsed.slice().sort(function (a, b) { return a.file.mtime - b.file.mtime })
    var unnamed = 0, apmSum = 0, apmN = 0, unknown = {}
    chrono.forEach(function (x) {
      x.c.n.forEach(function (n) { if (!LEGENDS[n[2]]) unknown[n[2]] = true })
      var a = analyse(x.c, wanted, lang)
      if (!a.me) { unnamed++; return }                                 // partie où tu n'apparais pas : ignorée
      totals.games++; totals.dur += a.dur; totals.taken += a.taken; totals.lost += a.lost
      if (a.won === true) totals.wins++; else if (a.won === false) totals.losses++
      if (a.apm !== null) { apmSum += a.apm; apmN++ }
      var decided = totals.wins + totals.losses
      history.push({ ts: x.file.mtime, metrics: {
        games: totals.games, wins: totals.wins, losses: totals.losses, winrate: decided ? totals.wins * 100 / decided : 0,
        stocks_taken: totals.taken, stocks_lost: totals.lost, avg_duration: totals.dur / totals.games } })
    })
    var unknownIds = Object.keys(unknown)
    if (unknownIds.length) host.log('Légende inconnue (' + unknownIds.map(function (k) { return '#' + k }).join(', ') + ') : nouvelle légende ? Mets à jour le plugin.')
    if (unnamed) host.log(unnamed + ' parties sans ton pseudo (« ' + wanted.join(', ') + ' ») ignorées')
    parsed.forEach(function (x) {                                       // du plus récent au plus ancien
      if (items.length >= 200) return
      var a = analyse(x.c, wanted, lang)
      if (a.me) items.push(buildItem(x.file, x.c, a, lang))
    })
    var decided = totals.wins + totals.losses
    var metrics = { games: totals.games, wins: totals.wins, losses: totals.losses, stocks_taken: totals.taken, stocks_lost: totals.lost }
    if (decided) metrics.winrate = totals.wins * 100 / decided
    if (totals.games) metrics.avg_duration = totals.dur / totals.games
    if (apmN) metrics.apm = apmSum / apmN                                // moyenne sur les parties lues (la base cumulée n'a pas d'inputs)
    return { metrics: metrics, items: items, history: history.slice(-5000) }
  }
}
