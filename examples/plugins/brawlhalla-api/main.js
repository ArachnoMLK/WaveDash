// Brawlhalla (official API): a player's profile, ELO and legends, using the personal key from Blue Mammoth Games.
// Endpoints: /search (Steam ID → Brawlhalla ID), /player/{id}/stats, /player/{id}/ranked. Only api.brawlhalla.com is reachable.
var BASE = 'https://api.brawlhalla.com'

function t(lang, en, fr) { return lang === 'fr' ? fr : en }
/** The API sometimes returns numbers as strings. */
function num(v) { var n = Number(v); return isFinite(n) ? n : 0 }
function round1(v) { return Math.round(v * 10) / 10 }
/** "bodvar" → "Bodvar", "jhala" → "Jhala". */
function legendName(l) { var k = String(l.legend_name_key || l.legend_id); return k.charAt(0).toUpperCase() + k.slice(1) }
/** Player names sometimes arrive double-encoded (UTF-8 read as Latin-1). */
function fixName(s) { try { return decodeURIComponent(escape(String(s))) } catch (e) { return String(s) } }

function key(ctx) {
  var k = String(ctx.secrets.apiKey || '').trim()
  if (!k) throw new Error(t(ctx.lang, 'API key missing: add it in Plugins › Brawlhalla (official API).', 'Clé API manquante : ajoute-la dans Plugins › Brawlhalla (official API).'))
  return k
}

async function get(ctx, path) {
  var r = await host.http(BASE + path + (path.indexOf('?') < 0 ? '?' : '&') + 'api_key=' + encodeURIComponent(key(ctx)), { headers: { accept: 'application/json' } })
  if (r.status === 404) throw new Error(t(ctx.lang, 'Player not found.', 'Joueur introuvable.'))
  if (r.status === 429) throw new Error(t(ctx.lang, 'Too many requests to the Brawlhalla API, will retry later.', 'Trop de requêtes vers l’API Brawlhalla, nouvel essai plus tard.'))
  if (r.status === 401 || r.status === 403) throw new Error(t(ctx.lang, 'API key rejected by Brawlhalla.', 'Clé API refusée par Brawlhalla.'))
  if (!r.ok) throw new Error(t(ctx.lang, 'Brawlhalla API unavailable (HTTP ', 'API Brawlhalla indisponible (HTTP ') + r.status + ')')
  return r.json()
}

/** Accepts: Brawlhalla ID (digits), Steam ID64 (7656…) or a steamcommunity.com/profiles/<id> link. */
async function playerId(ctx) {
  var s = String(ctx.inputs.player || '').trim()
  var m = /steamcommunity\.com\/profiles\/(\d{17})/.exec(s)
  var digits = m ? m[1] : (/^\d+$/.test(s) ? s : null)
  if (!digits) throw new Error(t(ctx.lang, 'Enter a Brawlhalla ID, a Steam ID64 or a steamcommunity.com/profiles/… link (custom links are not supported).', 'Saisis un ID Brawlhalla, un Steam ID64 ou un lien steamcommunity.com/profiles/… (les liens personnalisés ne sont pas reconnus).'))
  if (digits.length === 17 && digits.indexOf('7656') === 0) {
    var r = await get(ctx, '/search?steamid=' + digits)
    if (!r || !r.brawlhalla_id) throw new Error(t(ctx.lang, 'No Brawlhalla account linked to this Steam account.', 'Aucun compte Brawlhalla lié à ce compte Steam.'))
    return String(r.brawlhalla_id)
  }
  return digits
}

/** 1v1 rank change (Gold 5 → Platinum 0…): one notification, in the direction the ELO moved.
 *  The previous rank is kept in the account storage; the very first reading notifies nothing. */
function tierNotice(ctx, ranked, metrics) {
  if (!ranked || Array.isArray(ranked) || !ranked.tier) return []
  var tier = String(ranked.tier), prev = host.storage.get('tier'), prevElo = Number(host.storage.get('elo')) || 0
  host.storage.set('tier', tier); host.storage.set('elo', String(metrics.elo_1v1 || 0))
  if (!prev || prev === tier) return []
  var up = (metrics.elo_1v1 || 0) >= prevElo
  return [{ id: 'tier:' + Date.now(), title: tier, direction: up ? 'up' : 'down',
    text: up ? t(ctx.lang, 'New rank: ' + tier + ' (was: ' + prev + ').', 'Nouveau rang : ' + tier + ' (avant : ' + prev + ').')
             : t(ctx.lang, 'Rank lost: ' + tier + ' (was: ' + prev + ').', 'Rang perdu : ' + tier + ' (avant : ' + prev + ').') }]
}

var plugin = {
  resolve: async function (ctx) {
    var id = await playerId(ctx), stats = await get(ctx, '/player/' + id + '/stats')
    if (!stats || !stats.name) throw new Error(t(ctx.lang, 'Player not found.', 'Joueur introuvable.'))
    return { externalId: id, displayName: fixName(stats.name) }
  },

  refresh: async function (ctx) {
    var lang = ctx.lang, id = (ctx.account && ctx.account.externalId) || await playerId(ctx)
    var stats = await get(ctx, '/player/' + id + '/stats'), ranked = await get(ctx, '/player/' + id + '/ranked')
    var games = num(stats.games), wins = num(stats.wins)
    var metrics = { games: games, wins: wins, winrate: games ? wins * 100 / games : 0, level: num(stats.level) }
    var chips = []
    // A player who was never ranked returns an empty array instead of the object.
    if (ranked && !Array.isArray(ranked)) {
      metrics.elo_1v1 = num(ranked.rating); metrics.peak_1v1 = num(ranked.peak_rating)
      if (num(ranked.global_rank)) metrics.global_rank = num(ranked.global_rank)
      if (num(ranked.region_rank)) metrics.region_rank = num(ranked.region_rank)
      var teams = ranked['2v2'] || []
      if (teams.length) metrics.elo_2v2 = Math.max.apply(null, teams.map(function (x) { return num(x.rating) }))
      if (ranked.tier) chips.push(String(ranked.tier))
      if (ranked.region) chips.push(String(ranked.region))
    }
    if (stats.clan && stats.clan.clan_name) chips.push(t(lang, 'Clan: ', 'Clan : ') + fixName(stats.clan.clan_name))

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
        { label: t(lang, 'Legends played', 'Légendes jouées'), value: legends.length },
        { label: 'KOs', value: legends.reduce(function (s, l) { return s + l.kos }, 0) },
        { label: t(lang, 'Play time (h)', 'Temps de jeu (h)'), value: round1(legends.reduce(function (s, l) { return s + l.time }, 0)) }
      ],
      bars: top.length ? [{ title: t(lang, 'Games and wins per legend', 'Parties et victoires par légende'), categories: top.map(function (l) { return l.name }),
        series: [{ name: t(lang, 'Games', 'Parties'), values: top.map(function (l) { return l.games }) }, { name: t(lang, 'Wins', 'Victoires'), values: top.map(function (l) { return l.wins }) }] }] : undefined,
      tables: teams && teams.length ? [{ title: t(lang, '2v2 teams', 'Équipes 2v2'), columns: [t(lang, 'Team', 'Équipe'), 'ELO', t(lang, 'Peak', 'Max'), t(lang, 'Games', 'Parties'), t(lang, 'Wins', 'Victoires')],
        rows: teams.slice(0, 20).map(function (x) { return [fixName(x.teamname), num(x.rating), num(x.peak_rating), num(x.games), num(x.wins)] }) }] : undefined
    }
    return { metrics: metrics, items: items, summary: summary, notices: tierNotice(ctx, ranked, metrics) }
  }
}
