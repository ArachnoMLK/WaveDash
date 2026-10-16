// Brawlhalla (API officielle) : profil, ELO et légendes d'un joueur, avec la clé personnelle de Blue Mammoth Games.
// Endpoints : /search (Steam ID → ID Brawlhalla), /player/{id}/stats, /player/{id}/ranked. Seul api.brawlhalla.com est joignable.
var BASE = 'https://api.brawlhalla.com'

function t(lang, fr, en) { return lang === 'fr' ? fr : en }
/** L'API renvoie parfois des nombres sous forme de chaînes. */
function num(v) { var n = Number(v); return isFinite(n) ? n : 0 }
function round1(v) { return Math.round(v * 10) / 10 }
/** « bodvar » → « Bodvar », « jhala » → « Jhala ». */
function legendName(l) { var k = String(l.legend_name_key || l.legend_id); return k.charAt(0).toUpperCase() + k.slice(1) }
/** Les noms de joueurs arrivent parfois encodés deux fois (UTF-8 lu comme Latin-1). */
function fixName(s) { try { return decodeURIComponent(escape(String(s))) } catch (e) { return String(s) } }

function key(ctx) {
  var k = String(ctx.secrets.apiKey || '').trim()
  if (!k) throw new Error(t(ctx.lang, 'Clé API manquante : ajoute-la dans Plugins › Brawlhalla (API officielle).', 'API key missing: add it in Plugins › Brawlhalla (official API).'))
  return k
}

async function get(ctx, path) {
  var r = await host.http(BASE + path + (path.indexOf('?') < 0 ? '?' : '&') + 'api_key=' + encodeURIComponent(key(ctx)), { headers: { accept: 'application/json' } })
  if (r.status === 404) throw new Error(t(ctx.lang, 'Joueur introuvable.', 'Player not found.'))
  if (r.status === 429) throw new Error(t(ctx.lang, 'Trop de requêtes vers l’API Brawlhalla, nouvel essai plus tard.', 'Too many requests to the Brawlhalla API, will retry later.'))
  if (r.status === 401 || r.status === 403) throw new Error(t(ctx.lang, 'Clé API refusée par Brawlhalla.', 'API key rejected by Brawlhalla.'))
  if (!r.ok) throw new Error(t(ctx.lang, 'API Brawlhalla indisponible (HTTP ', 'Brawlhalla API unavailable (HTTP ') + r.status + ')')
  return r.json()
}

/** Accepte : ID Brawlhalla (chiffres), Steam ID64 (7656…) ou lien steamcommunity.com/profiles/<id>. */
async function playerId(ctx) {
  var s = String(ctx.inputs.player || '').trim()
  var m = /steamcommunity\.com\/profiles\/(\d{17})/.exec(s)
  var digits = m ? m[1] : (/^\d+$/.test(s) ? s : null)
  if (!digits) throw new Error(t(ctx.lang, 'Saisis un ID Brawlhalla, un Steam ID64 ou un lien steamcommunity.com/profiles/… (les liens personnalisés ne sont pas reconnus).',
    'Enter a Brawlhalla ID, a Steam ID64 or a steamcommunity.com/profiles/… link (custom links are not supported).'))
  if (digits.length === 17 && digits.indexOf('7656') === 0) {
    var r = await get(ctx, '/search?steamid=' + digits)
    if (!r || !r.brawlhalla_id) throw new Error(t(ctx.lang, 'Aucun compte Brawlhalla lié à ce compte Steam.', 'No Brawlhalla account linked to this Steam account.'))
    return String(r.brawlhalla_id)
  }
  return digits
}

var plugin = {
  resolve: async function (ctx) {
    var id = await playerId(ctx), stats = await get(ctx, '/player/' + id + '/stats')
    if (!stats || !stats.name) throw new Error(t(ctx.lang, 'Joueur introuvable.', 'Player not found.'))
    return { externalId: id, displayName: fixName(stats.name) }
  },

  refresh: async function (ctx) {
    var lang = ctx.lang, id = (ctx.account && ctx.account.externalId) || await playerId(ctx)
    var stats = await get(ctx, '/player/' + id + '/stats'), ranked = await get(ctx, '/player/' + id + '/ranked')
    var games = num(stats.games), wins = num(stats.wins)
    var metrics = { games: games, wins: wins, winrate: games ? wins * 100 / games : 0, level: num(stats.level) }
    var chips = []
    // Un joueur jamais classé renvoie un tableau vide à la place de l'objet.
    if (ranked && !Array.isArray(ranked)) {
      metrics.elo_1v1 = num(ranked.rating); metrics.peak_1v1 = num(ranked.peak_rating)
      if (num(ranked.global_rank)) metrics.global_rank = num(ranked.global_rank)
      if (num(ranked.region_rank)) metrics.region_rank = num(ranked.region_rank)
      var teams = ranked['2v2'] || []
      if (teams.length) metrics.elo_2v2 = Math.max.apply(null, teams.map(function (x) { return num(x.rating) }))
      if (ranked.tier) chips.push(String(ranked.tier))
      if (ranked.region) chips.push(String(ranked.region))
    }
    if (stats.clan && stats.clan.clan_name) chips.push(t(lang, 'Clan : ', 'Clan: ') + fixName(stats.clan.clan_name))

    var legends = (stats.legends || []).map(function (l) {
      var g = num(l.games), w = num(l.wins)
      return { name: legendName(l), id: num(l.legend_id), games: g, wins: w, winrate: g ? round1(w * 100 / g) : 0, kos: num(l.kos), falls: num(l.falls),
        level: num(l.level), time: round1(num(l.matchtime) / 3600), dmg: num(l.damagedealt) }
    }).filter(function (l) { return l.games > 0 }).sort(function (a, b) { return b.games - a.games })

    var items = legends.map(function (l) {
      return { id: 'legend-' + l.id, title: l.name, fields: { games: l.games, wins: l.wins, winrate: l.winrate, kos: l.kos, falls: l.falls, level: l.level, time: l.time } }
    })
    var top = legends.slice(0, 12)
    var summary = {
      chips: chips,
      stats: [
        { label: t(lang, 'Légendes jouées', 'Legends played'), value: legends.length },
        { label: 'KOs', value: legends.reduce(function (s, l) { return s + l.kos }, 0) },
        { label: t(lang, 'Temps de jeu (h)', 'Play time (h)'), value: round1(legends.reduce(function (s, l) { return s + l.time }, 0)) }
      ],
      bars: top.length ? [{ title: t(lang, 'Parties et victoires par légende', 'Games and wins per legend'), categories: top.map(function (l) { return l.name }),
        series: [{ name: t(lang, 'Parties', 'Games'), values: top.map(function (l) { return l.games }) }, { name: t(lang, 'Victoires', 'Wins'), values: top.map(function (l) { return l.wins }) }] }] : undefined,
      tables: teams && teams.length ? [{ title: t(lang, 'Équipes 2v2', '2v2 teams'), columns: [t(lang, 'Équipe', 'Team'), 'ELO', t(lang, 'Max', 'Peak'), t(lang, 'Parties', 'Games'), t(lang, 'Victoires', 'Wins')],
        rows: teams.slice(0, 20).map(function (x) { return [fixName(x.teamname), num(x.rating), num(x.peak_rating), num(x.games), num(x.wins)] }) }] : undefined
    }
    return { metrics: metrics, items: items, summary: summary }
  }
}
