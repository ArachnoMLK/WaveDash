// Discord (serveurs) : suit des serveurs Discord via l'API officielle.
// - Bot seul : tous les serveurs où le bot est présent (totaux, une ligne et un détail par serveur).
// - Bot + ID de serveur : un seul serveur, avec une ligne par salon.
// - Invitation seule (sans bot) : membres, membres en ligne et boosts d'un serveur.
// Les messages sont comptés au fil de l'eau (les 7 derniers jours au premier passage, jamais l'historique plus ancien) ;
// leur contenu n'est ni lu ni gardé, et les messages des bots ne comptent pas.
var API = 'https://discord.com/api/v10'
var EPOCH = 1420070400000                       // époque des identifiants Discord (snowflakes)
var MAX_REQ = 26                                // le bac à sable autorise 30 requêtes par exécution
var KEEP_DAYS = 35, AUTHOR_DAYS = 8, MAX_AUTHORS = 200, MAX_GUILDS = 45

function inviteCode(raw) {
  var s = String(raw || '').trim()
  var m = /(?:discord(?:app)?\.(?:gg|com)\/(?:invite\/)?)([A-Za-z0-9-]{2,40})/i.exec(s)
  return m ? m[1] : (/^[A-Za-z0-9-]{2,40}$/.test(s) ? s : '')
}
function tsOf(id) { return Math.floor(Number(id) / 4194304) + EPOCH }     // précision de quelques ms, suffisante pour dater
function newer(a, b) { return a.length !== b.length ? a.length > b.length : a > b }   // compare deux snowflakes (chaînes)
function pad(n) { return (n < 10 ? '0' : '') + n }
function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
function dayStart(key) { var p = key.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getTime() }
function sumSince(map, fromKey) { var s = 0; for (var k in map) if (k >= fromKey) s += map[k]; return s }
function load(k, d) { try { var v = host.storage.get(k); return v ? JSON.parse(v) : d } catch (e) { return d } }
function save(k, v) { var s = JSON.stringify(v); if (s.length <= 64000) host.storage.set(k, s); else host.log('Stockage plein pour ' + k + ' : données réduites au prochain passage') }
function fmtDate(ts) { var d = new Date(ts); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) }

var budget = 0
async function call(path, token) {
  if (budget >= MAX_REQ) return { skip: true }
  budget++
  var r = await host.http(API + path, { headers: token ? { authorization: 'Bot ' + token } : {} })
  if (r.status === 429) { budget = MAX_REQ; return { limited: true } }       // limite de débit : on reprendra plus tard
  if (!r.ok) return { status: r.status }
  return { data: r.json() }
}

async function readInvite(code, F) {
  var r = await call('/invites/' + code + '?with_counts=true&with_expiration=true')
  if (r.status === 404) throw new Error(F ? 'Invitation introuvable ou expirée : utilise un lien permanent.' : 'Invite not found or expired: use a permanent link.')
  if (!r.data || !r.data.guild) throw new Error(F ? 'Discord n\'a pas répondu correctement.' : 'Discord did not answer correctly.')
  return r.data
}
function botError(status, F) {
  if (status === 401) return new Error(F ? 'Jeton du bot refusé par Discord : regénère-le (Developer Portal › Bot › Reset Token) et colle le nouveau dans les clés du plugin.' : 'Bot token rejected by Discord: reset it (Developer Portal › Bot › Reset Token) and paste the new one in the plugin keys.')
  if (status === 403 || status === 404) return new Error(F ? 'Le bot n\'a pas accès à ce serveur.' : 'The bot cannot access this server.')
  return new Error((F ? 'Discord a répondu ' : 'Discord answered ') + status)
}

/* ───────── état d'un serveur (stockage : « c.<id> » salons et jours, « a.<id> » membres actifs) ───────── */
// « c.<id> » garde aussi la date de la dernière synchronisation (t) et les infos du serveur (boosts, niveau) : 2 clés par serveur.
function loadGuild(id) { var c = load('c.' + id, { chans: {}, days: {} }); return { id: id, chans: c.chans, days: c.days, t: c.t || 0, info: c.info || null, authors: load('a.' + id, {}) } }
function saveGuild(g) {
  var keep = dayKey(Date.now() - KEEP_DAYS * 86400000), keepA = dayKey(Date.now() - AUTHOR_DAYS * 86400000)
  var old = function (o, k) { for (var x in o) if (x < k) delete o[x] }
  old(g.days, keep)
  for (var c in g.chans) old(g.chans[c].d, keep)
  var ids = Object.keys(g.authors)
  ids.forEach(function (a) { old(g.authors[a].d, keepA) })
  if (ids.length > MAX_AUTHORS) ids.sort(function (a, b) { return g.authors[a].c - g.authors[b].c }).slice(0, ids.length - MAX_AUTHORS).forEach(function (a) { delete g.authors[a] })
  save('c.' + g.id, { chans: g.chans, days: g.days, t: g.t, info: g.info }); save('a.' + g.id, g.authors)
}

/** Toutes les 6 h : liste des salons et infos du serveur (boosts, niveau de boost, que la liste des serveurs ne donne pas). */
async function syncGuild(g, token, F) {
  if (Object.keys(g.chans).length && g.t > Date.now() - 6 * 3600000) return
  var r = await call('/guilds/' + g.id + '?with_counts=true', token)
  if (r.data) g.info = { b: r.data.premium_subscription_count || 0, tier: r.data.premium_tier || 0, members: r.data.approximate_member_count, online: r.data.approximate_presence_count }
  if (await syncChannels(g, token, F)) g.t = Date.now()
}

/** Met à jour la liste des salons textuels d'un serveur. */
async function syncChannels(g, token, F) {
  var r = await call('/guilds/' + g.id + '/channels', token)
  if (r.status) throw botError(r.status, F)
  if (!r.data) return false
  var seen = {}
  r.data.forEach(function (c) {
    if (c.type !== 0 && c.type !== 5) return                            // salons textuels et d'annonces
    seen[c.id] = 1
    var x = g.chans[c.id] || (g.chans[c.id] = { n: c.name, last: '', total: 0, d: {} })
    x.n = c.name
  })
  for (var id in g.chans) if (!seen[id]) delete g.chans[id]
  g.synced = true
  return true
}

/** Lit les nouveaux messages d'un salon (une page de 100 au plus). Renvoie true si le salon reste en retard. */
async function readChannel(g, cid, token) {
  var ch = g.chans[cid]
  if (ch.denied) return false
  var r = await call('/channels/' + cid + '/messages?limit=100' + (ch.last ? '&after=' + ch.last : ''), token)
  if (r.skip || r.limited) return !!(ch.more || !ch.last)
  ch.at = Date.now()
  if (r.status === 403) { ch.denied = 1; return false }
  if (!r.data) return false
  var firstLook = !ch.last, cutoff = Date.now() - 7 * 86400000, top = ch.last
  r.data.forEach(function (m) {
    if (!top || newer(m.id, top)) top = m.id
    var t = tsOf(m.id)
    if (firstLook && t < cutoff) return                                  // premier passage : seulement les 7 derniers jours
    if (!m.author || m.author.bot) return
    var k = dayKey(t)
    g.days[k] = (g.days[k] || 0) + 1
    ch.d[k] = (ch.d[k] || 0) + 1
    ch.total++
    var a = g.authors[m.author.id] || (g.authors[m.author.id] = { n: '', c: 0, d: {} })
    a.n = (m.author.global_name || m.author.username || '').slice(0, 32); a.c++; a.d[k] = (a.d[k] || 0) + 1
  })
  if (top) { ch.last = top; ch.lastTs = tsOf(top) }
  ch.more = !firstLook && r.data.length === 100
  return ch.more
}

/** Ordre de lecture : salons en retard d'abord, puis ceux lus le moins récemment. */
function queueOf(g) {
  return Object.keys(g.chans).filter(function (id) { return !g.chans[id].denied })
    .sort(function (a, b) { var A = g.chans[a], B = g.chans[b]; return (B.more ? 1 : 0) - (A.more ? 1 : 0) || (A.at || 0) - (B.at || 0) })
}

/* ───────── affichage ───────── */
function guildFigures(g) {
  var today = dayKey(Date.now()), week = dayKey(Date.now() - 6 * 86400000)
  return { today: g.days[today] || 0, week: sumSince(g.days, week), total: Object.keys(g.chans).reduce(function (s, c) { return s + g.chans[c].total }, 0),
    authors: Object.keys(g.authors).filter(function (a) { return sumSince(g.authors[a].d, week) > 0 }).length, channels: Object.keys(g.chans).length }
}
function lastOf(g) { var t = 0; for (var c in g.chans) t = Math.max(t, g.chans[c].lastTs || 0); return t }
function guildTables(g, F) {
  var today = dayKey(Date.now()), week = dayKey(Date.now() - 6 * 86400000)
  var chans = Object.keys(g.chans).map(function (id) { var c = g.chans[id]; return ['#' + c.n, c.d[today] || 0, sumSince(c.d, week), c.total, c.denied ? (F ? 'pas d’accès' : 'no access') : c.lastTs ? fmtDate(c.lastTs) : '—'] })
    .sort(function (a, b) { return b[2] - a[2] || b[3] - a[3] })
  var top = Object.keys(g.authors).map(function (id) { var a = g.authors[id]; return [a.n, sumSince(a.d, week), a.c] })
    .filter(function (x) { return x[2] > 0 }).sort(function (a, b) { return b[1] - a[1] || b[2] - a[2] }).slice(0, 30)
  return [
    { title: F ? 'Salons' : 'Channels', columns: F ? ['Salon', 'Aujourd’hui', '7 jours', 'Depuis le suivi', 'Dernier message'] : ['Channel', 'Today', '7 days', 'Since tracking', 'Last message'], rows: chans.slice(0, 80) },
    { title: F ? 'Membres les plus actifs' : 'Most active members', columns: F ? ['Membre', '7 jours', 'Depuis le suivi'] : ['Member', '7 days', 'Since tracking'], rows: top },
    { title: F ? 'Messages par jour' : 'Messages per day', columns: F ? ['Jour', 'Messages'] : ['Day', 'Messages'],
      rows: Object.keys(g.days).sort().reverse().slice(0, 14).map(function (k) { return [k, g.days[k]] }) }
  ].filter(function (t) { return t.rows.length })
}
function dailyHistory(days) {
  var today = dayKey(Date.now())
  return Object.keys(days).sort().map(function (k) { return { ts: k === today ? Date.now() : dayStart(k) + 86399000, metrics: { messages_today: days[k] } } })
}

/* ───────── modes ───────── */
async function allServers(ctx, token, F) {
  var guilds = []
  for (var page = 0, after = ''; page < 3; page++) {
    var r = await call('/users/@me/guilds?with_counts=true&limit=200' + (after ? '&after=' + after : ''), token)
    if (r.status) throw botError(r.status, F)
    if (!r.data) break
    guilds = guilds.concat(r.data)
    if (r.data.length < 200) break
    after = r.data[r.data.length - 1].id
  }
  if (!guilds.length) throw new Error(F ? 'Le bot n\'est sur aucun serveur : invite-le d\'abord.' : 'The bot is in no server: invite it first.')
  if (guilds.length > MAX_GUILDS) host.log((F ? 'Seuls les ' : 'Only the first ') + MAX_GUILDS + (F ? ' premiers serveurs sont suivis en détail.' : ' servers are tracked in detail.'))
  var tracked = guilds.slice(0, MAX_GUILDS), states = {}, behind = 0
  tracked.forEach(function (gd) { states[gd.id] = loadGuild(gd.id) })
  // Lecture répartie : chaque serveur à tour de rôle, un salon à la fois, tant qu'il reste des requêtes.
  var order = tracked.map(function (gd) { return gd.id }).sort(function (a, b) { return states[a].t - states[b].t })
  for (var i = 0; i < order.length; i++) {
    var g = states[order[i]]
    try { await syncGuild(g, token, F) } catch (e) { host.log(gdName(tracked, g.id) + ' : ' + e.message) }
  }
  // Chaque salon est lu au plus une fois par exécution, sauf s'il lui reste une page de messages.
  var done = {}, progressed = true
  while (budget < MAX_REQ && progressed) {
    progressed = false
    for (i = 0; i < order.length && budget < MAX_REQ; i++) {
      g = states[order[i]]
      var q = queueOf(g).filter(function (cid) { return !done[cid] || g.chans[cid].more })
      if (!q.length) continue
      done[q[0]] = 1
      await readChannel(g, q[0], token); progressed = true
    }
  }
  var totals = { servers: guilds.length, members: 0, online: 0, boosts: 0, channels: 0, messages_today: 0, messages_7d: 0, authors_7d: 0 }
  var items = guilds.map(function (gd) {
    totals.members += gd.approximate_member_count || 0; totals.online += gd.approximate_presence_count || 0
    var g = states[gd.id]
    var it = { id: gd.id, title: gd.name, fields: { members: gd.approximate_member_count || 0, online: gd.approximate_presence_count || 0 } }
    if (g && g.info) { it.fields.boosts = g.info.b; totals.boosts += g.info.b }
    if (g) {
      saveGuild(g)
      q = queueOf(g); q.forEach(function (cid) { if (g.chans[cid].more || !g.chans[cid].last) behind++ })
      var f = guildFigures(g), last = lastOf(g)
      totals.channels += f.channels; totals.messages_today += f.today; totals.messages_7d += f.week; totals.authors_7d += f.authors
      it.fields.today = f.today; it.fields.week = f.week; it.fields.total = f.total; it.fields.last = last ? fmtDate(last) : '—'
      if (last) it.ts = last
      it.detail = { stats: [{ label: F ? 'Membres' : 'Members', value: it.fields.members }, { label: F ? 'En ligne' : 'Online', value: it.fields.online },
        { label: 'Boosts', value: g.info ? g.info.b : '—' }, { label: F ? 'Niveau de boost' : 'Boost level', value: g.info ? g.info.tier : '—' },
        { label: F ? 'Salons' : 'Channels', value: f.channels }, { label: F ? 'Messages 7 jours' : 'Messages 7 days', value: f.week },
        { label: F ? 'Membres actifs 7 j' : 'Active members 7 d', value: f.authors }], tables: guildTables(g, F) }
    }
    return it
  }).sort(function (a, b) { return (b.fields.week || 0) - (a.fields.week || 0) || b.fields.members - a.fields.members })
  var allDays = {}
  tracked.forEach(function (gd) { var d = states[gd.id].days; for (var k in d) allDays[k] = (allDays[k] || 0) + d[k] })
  if (totals.members) totals.online_pct = totals.online * 100 / totals.members
  return {
    metrics: totals, items: items, history: dailyHistory(allDays), backlog: behind,
    summary: { stats: [{ label: F ? 'Serveurs' : 'Servers', value: totals.servers }, { label: F ? 'Membres (total)' : 'Members (total)', value: totals.members },
      { label: F ? 'En ligne' : 'Online', value: totals.online }, { label: 'Boosts', value: totals.boosts }, { label: F ? 'Messages aujourd’hui' : 'Messages today', value: totals.messages_today },
      { label: F ? 'Messages 7 jours' : 'Messages 7 days', value: totals.messages_7d }, { label: F ? 'Membres actifs 7 j' : 'Active members 7 d', value: totals.authors_7d }],
      tables: [{ title: F ? 'Serveurs' : 'Servers', columns: F ? ['Serveur', 'Membres', 'En ligne', 'Boosts', 'Messages 7 j'] : ['Server', 'Members', 'Online', 'Boosts', 'Messages 7 d'],
        rows: items.map(function (it) { return [it.title, it.fields.members, it.fields.online, it.fields.boosts === undefined ? '—' : it.fields.boosts, it.fields.week === undefined ? '—' : it.fields.week] }) }] }
  }
}
function gdName(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name; return id }

async function oneServer(ctx, token, guildId, F) {
  var info = await call('/guilds/' + guildId + '?with_counts=true', token)
  if (info.status) throw botError(info.status, F)
  var g = loadGuild(guildId), behind = 0
  if (!Object.keys(g.chans).length || g.t < Date.now() - 6 * 3600000) { if (await syncChannels(g, token, F)) g.t = Date.now() }
  var q = queueOf(g)
  for (var i = 0; i < q.length && budget < MAX_REQ; i++) await readChannel(g, q[i], token)
  saveGuild(g)
  queueOf(g).forEach(function (cid) { if (g.chans[cid].more || !g.chans[cid].last) behind++ })
  var d = info.data || {}, f = guildFigures(g), today = dayKey(Date.now()), week = dayKey(Date.now() - 6 * 86400000)
  var metrics = { members: d.approximate_member_count, online: d.approximate_presence_count, boosts: d.premium_subscription_count || 0,
    channels: f.channels, messages_today: f.today, messages_7d: f.week, authors_7d: f.authors }
  if (metrics.members) metrics.online_pct = metrics.online * 100 / metrics.members
  return {
    metrics: metrics, history: dailyHistory(g.days), backlog: behind,
    items: Object.keys(g.chans).map(function (id) { var c = g.chans[id]; return { id: id, title: '#' + c.n, ts: c.lastTs || undefined,
      fields: { today: c.d[today] || 0, week: sumSince(c.d, week), total: c.total, last: c.denied ? (F ? 'pas d’accès' : 'no access') : c.lastTs ? fmtDate(c.lastTs) : '—' } } })
      .sort(function (a, b) { return b.fields.week - a.fields.week }),
    summary: { chips: [d.name || guildId], stats: [{ label: F ? 'Membres' : 'Members', value: metrics.members }, { label: F ? 'En ligne' : 'Online', value: metrics.online },
      { label: F ? 'Boosts' : 'Boosts', value: metrics.boosts }, { label: F ? 'Messages 7 jours' : 'Messages 7 days', value: f.week },
      { label: F ? 'Membres actifs 7 j' : 'Active members 7 d', value: f.authors }], tables: guildTables(g, F).slice(1) }
  }
}

async function inviteOnly(code, F) {
  var inv = await readInvite(code, F), g = inv.guild
  var metrics = { members: inv.approximate_member_count, online: inv.approximate_presence_count, boosts: g.premium_subscription_count || 0 }
  if (metrics.members) metrics.online_pct = metrics.online * 100 / metrics.members
  var chips = [g.name, 'discord.gg/' + code]
  if (inv.expires_at) chips.push(F ? 'Invitation qui expire !' : 'Invite expires!')
  return { metrics: metrics, summary: { chips: chips, stats: [{ label: F ? 'Membres' : 'Members', value: metrics.members },
    { label: F ? 'En ligne' : 'Online', value: metrics.online }, { label: 'Boosts', value: metrics.boosts }] } }
}

/** Jeton du bot nettoyé (espaces, guillemets, préfixe « Bot ») et vérifié : un jeton de bot a trois parties séparées par des points.
 *  Les confusions courantes (Client Secret, Public Key, ID d'application) reçoivent un message précis. */
function cleanToken(raw, F) {
  var t = String(raw || '').trim().replace(/^["']|["']$/g, '').replace(/^Bot\s+/i, '').trim()
  if (!t) return ''
  if (/^[\w-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/.test(t)) return t
  var hint = /^[0-9a-f]{64}$/i.test(t) ? (F ? 'c\'est la Public Key' : 'that is the Public Key')
    : /^\d{15,22}$/.test(t) ? (F ? 'c\'est l\'ID de l\'application' : 'that is the Application ID')
    : /^[\w-]{32}$/.test(t) ? (F ? 'c\'est le Client Secret' : 'that is the Client Secret') : (F ? 'format inattendu' : 'unexpected format')
  throw new Error(F ? 'Ce n\'est pas un jeton de bot (' + hint + '). Dans le Discord Developer Portal : ton application › Bot › Reset Token, puis colle ce jeton dans les clés du plugin.'
    : 'This is not a bot token (' + hint + '). In the Discord Developer Portal: your application › Bot › Reset Token, then paste it in the plugin keys.')
}

function modeOf(ctx) {
  var F = ctx.lang === 'fr', guildId = (ctx.inputs.guildId || '').trim(), code = inviteCode(ctx.inputs.invite), token = ''
  // Le jeton est commun à tous les comptes du plugin : invalide, il ne doit pas casser un compte suivi par simple invitation.
  try { token = cleanToken(ctx.secrets.botToken, F) } catch (e) {
    if (!code || guildId) throw e
    host.log(e.message + (F ? ' Compte par invitation : jeton ignoré.' : ' Invite account: token ignored.'))
  }
  if (guildId && !/^\d{15,22}$/.test(guildId)) throw new Error(F ? 'ID du serveur invalide.' : 'Invalid server ID.')
  return { token: token, guildId: guildId, code: code, F: F }
}

var plugin = {
  resolve: async function (ctx) {
    budget = 0
    var m = modeOf(ctx)
    // Le jeton est saisi après l'ajout du compte : sans invitation ni ID, le compte suivra tous les serveurs du bot.
    if (m.code) { var inv = await readInvite(m.code, m.F); return { externalId: inv.guild.id, displayName: inv.guild.name } }
    // Avec un jeton : on le teste tout de suite, pour que l'erreur s'affiche à l'ajout du compte et pas plus tard.
    var bot = null
    if (m.token) {
      var me = await call('/users/@me', m.token)
      if (me.status) throw botError(me.status, m.F)
      bot = me.data && me.data.username
    }
    if (m.guildId) return { externalId: m.guildId, displayName: (m.F ? 'Serveur ' : 'Server ') + m.guildId + (bot ? ' · ' + bot : '') }
    if (!m.token) throw new Error(m.F ? 'Enregistre d\'abord le jeton du bot (page Plugins › Discord › Clés), ou indique un lien d\'invitation.' : 'Save the bot token first (Plugins page › Discord › Keys), or enter an invite link.')
    return { externalId: 'bot:all', displayName: 'Discord · ' + (bot || 'bot') + (m.F ? ' (tous ses serveurs)' : ' (all its servers)') }
  },

  refresh: async function (ctx) {
    budget = 0
    var m = modeOf(ctx)
    if (m.token && m.guildId) return oneServer(ctx, m.token, m.guildId, m.F)
    if (m.token && !m.code) return allServers(ctx, m.token, m.F)
    if (m.code && m.token) {                                            // invitation + bot : le serveur de l'invitation, en détail
      var inv = await readInvite(m.code, m.F)
      return oneServer(ctx, m.token, inv.guild.id, m.F)
    }
    if (m.code) return inviteOnly(m.code, m.F)
    throw new Error(m.F ? 'Ajoute le jeton du bot (Paramètres du plugin › Clés) ou un lien d\'invitation.' : 'Add the bot token (plugin settings › Keys) or an invite link.')
  }
}
