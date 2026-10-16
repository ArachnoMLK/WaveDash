// Discord (serveur) : suit un serveur via l'API officielle de Discord.
// - Sans clé : l'invitation publique donne le nombre de membres, de membres en ligne et de boosts.
// - Avec un bot (jeton facultatif) : salons, messages comptés au fil de l'eau (jamais l'historique ancien),
//   par jour et par salon, et membres les plus actifs. Le contenu des messages n'est ni lu ni gardé.
var API = 'https://discord.com/api/v10'
var EPOCH = 1420070400000                       // époque des identifiants Discord (snowflakes)
var MAX_REQ = 26                                // le bac à sable autorise 30 requêtes par exécution
var KEEP_DAYS = 35

function fr(ctx) { return ctx.lang === 'fr' }
function inviteCode(raw) {
  var s = String(raw || '').trim()
  var m = /(?:discord(?:app)?\.(?:gg|com)\/(?:invite\/)?)([A-Za-z0-9-]{2,40})/i.exec(s)
  return m ? m[1] : (/^[A-Za-z0-9-]{2,40}$/.test(s) ? s : '')
}
function tsOf(id) { return Math.floor(Number(id) / 4194304) + EPOCH }     // précision à quelques ms près, suffisante pour dater
function newer(a, b) { return a.length !== b.length ? a.length > b.length : a > b }   // compare deux snowflakes (chaînes)
function pad(n) { return (n < 10 ? '0' : '') + n }
function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
function dayStart(key) { var p = key.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getTime() }
function load(k, d) { try { var v = host.storage.get(k); return v ? JSON.parse(v) : d } catch (e) { return d } }
function save(k, v) { host.storage.set(k, JSON.stringify(v)) }

var budget = { n: 0 }
async function call(path, token) {
  if (budget.n >= MAX_REQ) return { skip: true }
  budget.n++
  var headers = token ? { authorization: 'Bot ' + token } : {}
  var r = await host.http(API + path, { headers: headers })
  if (r.status === 429) { budget.n = MAX_REQ; return { limited: true } }        // limite de débit : on reprendra plus tard
  if (!r.ok) return { status: r.status }
  return { data: r.json() }
}

async function readInvite(ctx) {
  var code = inviteCode(ctx.inputs.invite)
  if (!code) throw new Error(fr(ctx) ? 'Lien d\'invitation invalide.' : 'Invalid invite link.')
  var r = await call('/invites/' + code + '?with_counts=true&with_expiration=true')
  if (r.status === 404) throw new Error(fr(ctx) ? 'Invitation introuvable ou expirée : utilise un lien permanent.' : 'Invite not found or expired: use a permanent link.')
  if (!r.data || !r.data.guild) throw new Error(fr(ctx) ? 'Discord n\'a pas répondu correctement.' : 'Discord did not answer correctly.')
  return r.data
}

/** Compte les nouveaux messages des salons (bot), quelques salons par exécution. Renvoie le nombre de salons en retard. */
async function countMessages(ctx, token, guildId, chans, days, authors) {
  var list = await call('/guilds/' + guildId + '/channels', token)
  if (list.status === 401) throw new Error(fr(ctx) ? 'Jeton du bot refusé.' : 'Bot token rejected.')
  if (list.status === 403 || list.status === 404) throw new Error(fr(ctx) ? 'Le bot n\'a pas accès à ce serveur (ID ou invitation du bot).' : 'The bot cannot access this server (ID or bot invite).')
  if (list.data) {
    var seen = {}
    list.data.forEach(function (c) {
      if (c.type !== 0 && c.type !== 5) return                          // salons textuels et d'annonces
      seen[c.id] = 1
      var x = chans[c.id] || (chans[c.id] = { n: c.name, last: '', total: 0, d: {} })
      x.n = c.name
    })
    for (var id in chans) if (!seen[id]) delete chans[id]
  }
  // Les salons en retard (page pleine la dernière fois) passent d'abord, puis les autres à tour de rôle.
  var ids = Object.keys(chans).sort(function (a, b) { return (chans[b].more ? 1 : 0) - (chans[a].more ? 1 : 0) || (chans[a].at || 0) - (chans[b].at || 0) })
  var behind = 0
  for (var i = 0; i < ids.length; i++) {
    var ch = chans[ids[i]]
    if (ch.denied) continue
    var r = await call('/channels/' + ids[i] + '/messages?limit=100' + (ch.last ? '&after=' + ch.last : ''), token)
    if (r.skip || r.limited) { if (ch.more || !ch.last) behind++; continue }
    ch.at = Date.now()
    if (r.status === 403) { ch.denied = 1; continue }
    if (!r.data) continue
    var firstLook = !ch.last, cutoff = Date.now() - 7 * 86400000
    r.data.forEach(function (m) {
      if (!ch.last || newer(m.id, ch.last)) ch.newLast = !ch.newLast || newer(m.id, ch.newLast) ? m.id : ch.newLast
      var t = tsOf(m.id)
      if (firstLook && t < cutoff) return                                // premier passage : seulement les 7 derniers jours
      if (m.author && m.author.bot) return
      var k = dayKey(t)
      days[k] = (days[k] || 0) + 1
      ch.d[k] = (ch.d[k] || 0) + 1
      ch.total++
      if (m.author) {
        var a = authors[m.author.id] || (authors[m.author.id] = { n: m.author.global_name || m.author.username, c: 0, d: {} })
        a.n = m.author.global_name || m.author.username; a.c++; a.d[k] = (a.d[k] || 0) + 1
      }
    })
    if (ch.newLast) { ch.last = ch.newLast; delete ch.newLast }
    if (r.data.length && !ch.last) ch.last = r.data[0].id
    ch.lastTs = ch.last ? tsOf(ch.last) : 0
    ch.more = !firstLook && r.data.length === 100
    if (ch.more) behind++
  }
  return behind
}

function prune(days, chans, authors) {
  var keep = dayKey(Date.now() - KEEP_DAYS * 86400000)
  var old = function (o) { for (var k in o) if (k < keep) delete o[k] }
  old(days)
  for (var id in chans) old(chans[id].d)
  var ids = Object.keys(authors)
  ids.forEach(function (id) { old(authors[id].d) })
  if (ids.length > 400) ids.sort(function (a, b) { return authors[a].c - authors[b].c }).slice(0, ids.length - 400).forEach(function (id) { delete authors[id] })
}
function sumSince(map, fromKey) { var s = 0; for (var k in map) if (k >= fromKey) s += map[k]; return s }

var plugin = {
  resolve: async function (ctx) {
    var inv = await readInvite(ctx)
    return { externalId: inv.guild.id, displayName: inv.guild.name }
  },

  refresh: async function (ctx) {
    budget.n = 0
    var F = fr(ctx), inv = await readInvite(ctx), g = inv.guild
    var metrics = { members: inv.approximate_member_count, online: inv.approximate_presence_count, boosts: g.premium_subscription_count || 0 }
    if (metrics.members) metrics.online_pct = metrics.online * 100 / metrics.members
    var token = (ctx.secrets.botToken || '').trim(), guildId = (ctx.inputs.guildId || '').trim() || g.id
    var out = { metrics: metrics }
    var today = dayKey(Date.now()), weekKey = dayKey(Date.now() - 6 * 86400000)
    var chips = [g.name, (F ? 'Code ' : 'Code ') + inviteCode(ctx.inputs.invite)]
    if (g.vanity_url_code) chips.push('discord.gg/' + g.vanity_url_code)
    if (inv.expires_at) chips.push(F ? 'Invitation qui expire !' : 'Invite expires!')
    var stats = [
      { label: F ? 'Membres' : 'Members', value: metrics.members },
      { label: F ? 'En ligne' : 'Online', value: metrics.online },
      { label: F ? 'Boosts' : 'Boosts', value: metrics.boosts }
    ]

    if (token) {
      if (!/^\d{15,22}$/.test(guildId)) throw new Error(F ? 'ID du serveur invalide.' : 'Invalid server ID.')
      var chans = load('chans', {}), days = load('days', {}), authors = load('authors', {})
      var behind = await countMessages(ctx, token, guildId, chans, days, authors)
      prune(days, chans, authors)
      save('chans', chans); save('days', days); save('authors', authors)
      var ids = Object.keys(chans)
      metrics.channels = ids.length
      metrics.messages_today = days[today] || 0
      metrics.messages_7d = sumSince(days, weekKey)
      var active = Object.keys(authors).filter(function (id) { return sumSince(authors[id].d, weekKey) > 0 })
      metrics.authors_7d = active.length
      out.backlog = behind
      if (behind) host.log((F ? 'Salons encore en retard : ' : 'Channels still behind: ') + behind)

      out.items = ids.map(function (id) {
        var c = chans[id]
        return { id: id, title: '#' + c.n, ts: c.lastTs || undefined,
          fields: { today: c.d[today] || 0, week: sumSince(c.d, weekKey), total: c.total, last: c.denied ? (F ? 'pas d’accès' : 'no access') : c.lastTs ? new Date(c.lastTs).toLocaleString() : '—' } }
      }).sort(function (a, b) { return b.fields.week - a.fields.week })

      // Courbe : messages par jour (les jours passés font foi ; aujourd'hui est en cours).
      out.history = Object.keys(days).sort().map(function (k) { return { ts: k === today ? Date.now() : dayStart(k) + 86399000, metrics: { messages_today: days[k] } } })

      stats.push({ label: F ? 'Messages aujourd\'hui' : 'Messages today', value: metrics.messages_today },
        { label: F ? 'Messages 7 jours' : 'Messages 7 days', value: metrics.messages_7d },
        { label: F ? 'Membres actifs 7 j' : 'Active members 7 d', value: metrics.authors_7d })
      var top = Object.keys(authors).map(function (id) { var a = authors[id]; return [a.n, sumSince(a.d, weekKey), a.c] })
        .filter(function (x) { return x[2] > 0 }).sort(function (a, b) { return b[1] - a[1] || b[2] - a[2] }).slice(0, 30)
      out.summary = {
        chips: chips, stats: stats,
        tables: [
          { title: F ? 'Membres les plus actifs' : 'Most active members', columns: F ? ['Membre', '7 jours', 'Depuis le suivi'] : ['Member', '7 days', 'Since tracking'], rows: top },
          { title: F ? 'Messages par jour' : 'Messages per day', columns: F ? ['Jour', 'Messages'] : ['Day', 'Messages'],
            rows: Object.keys(days).sort().reverse().slice(0, 14).map(function (k) { return [k, days[k]] }) }
        ]
      }
    } else {
      out.summary = { chips: chips, stats: stats }
    }
    return out
  }
}
