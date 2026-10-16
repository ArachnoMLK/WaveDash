// TikTok (profil public) : lit les chiffres d'un profil depuis sa page publique, comme un navigateur.
// Ce n'est pas une API officielle : si TikTok change sa page, le plugin le signale clairement au lieu d'inventer des chiffres.
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

function clean(name) { return String(name || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, '').split(/[/?#]/)[0] }

async function fetchProfile(username, lang) {
  var fr = lang === 'fr'
  if (!/^[A-Za-z0-9._]{2,24}$/.test(username)) throw new Error(fr ? 'Pseudo TikTok invalide.' : 'Invalid TikTok username.')
  var r = await host.http('https://www.tiktok.com/@' + username, { headers: { 'user-agent': UA, 'accept-language': fr ? 'fr-FR,fr;q=0.9' : 'en-US,en;q=0.9' } })
  if (!r.ok) throw new Error((fr ? 'TikTok a répondu ' : 'TikTok answered ') + r.status)
  var m = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/.exec(r.text)
  if (!m) throw new Error(fr ? 'Page TikTok non reconnue (format changé ou accès bloqué).' : 'TikTok page not recognised (format changed or access blocked).')
  var data
  try { data = JSON.parse(m[1]) } catch (e) { throw new Error(fr ? 'Données TikTok illisibles.' : 'Unreadable TikTok data.') }
  var detail = data && data.__DEFAULT_SCOPE__ && data.__DEFAULT_SCOPE__['webapp.user-detail']
  if (!detail || !detail.userInfo || !detail.userInfo.stats) throw new Error(fr ? 'Profil introuvable ou privé.' : 'Profile not found or private.')
  return detail.userInfo
}

var plugin = {
  resolve: async function (ctx) {
    var info = await fetchProfile(clean(ctx.inputs.username), ctx.lang)
    return { externalId: info.user.uniqueId, displayName: '@' + info.user.uniqueId + (info.user.nickname ? ' · ' + info.user.nickname : '') }
  },
  refresh: async function (ctx) {
    var info = await fetchProfile(clean(ctx.inputs.username), ctx.lang), s = info.stats
    var n = function (v) { var x = Number(v); return isFinite(x) ? x : undefined }
    return { metrics: { followers: n(s.followerCount), following: n(s.followingCount), likes: n(s.heartCount != null ? s.heartCount : s.heart), videos: n(s.videoCount), friends: n(s.friendCount) } }
  }
}
