// Labels used by the main process (notifications, PDF report) and default texts.
import { Lang, MetricKey, Platform, TemplateKey } from './types'

export const PLATFORM_NAMES: Record<Platform, string> = { youtube: 'YouTube' }

export const METRIC_NAMES: Record<Lang, Record<MetricKey, string>> = {
  en: { subscribers: 'Subscribers', views: 'Views', likes: 'Likes', comments: 'Comments', videos: 'Videos' },
  fr: { subscribers: 'Abonnés', views: 'Vues', likes: 'Likes', comments: 'Commentaires', videos: 'Vidéos' },
  es: { subscribers: 'Suscriptores', views: 'Vistas', likes: 'Me gusta', comments: 'Comentarios', videos: 'Vídeos' },
  pt: { subscribers: 'Inscritos', views: 'Visualizações', likes: 'Curtidas', comments: 'Comentários', videos: 'Vídeos' },
  de: { subscribers: 'Abonnenten', views: 'Aufrufe', likes: 'Likes', comments: 'Kommentare', videos: 'Videos' },
  it: { subscribers: 'Iscritti', views: 'Visualizzazioni', likes: 'Mi piace', comments: 'Commenti', videos: 'Video' },
  ja: { subscribers: '登録者数', views: '再生回数', likes: '高評価', comments: 'コメント', videos: '動画' },
  zh: { subscribers: '订阅者', views: '观看次数', likes: '点赞', comments: '评论', videos: '视频' },
  ar: { subscribers: 'المشتركون', views: 'المشاهدات', likes: 'الإعجابات', comments: 'التعليقات', videos: 'الفيديوهات' }
}

export const DEFAULT_TEMPLATES: Record<Lang, Record<TemplateKey, string>> = {
  en: { up: '{stat} reached {threshold} (now: {value}).', down: '{stat} dropped below {threshold} (now: {value}).', rankUp: 'New rank: {rank} (was: {oldRank}).', rankDown: 'Rank lost: {rank} (was: {oldRank}).' },
  fr: { up: '{stat} a atteint {threshold} (actuel : {value}).', down: '{stat} est repassé sous {threshold} (actuel : {value}).', rankUp: 'Nouveau rang : {rank} (avant : {oldRank}).', rankDown: 'Rang perdu : {rank} (avant : {oldRank}).' },
  es: { up: '{stat} alcanzó {threshold} (ahora: {value}).', down: '{stat} bajó de {threshold} (ahora: {value}).', rankUp: 'Nuevo rango: {rank} (antes: {oldRank}).', rankDown: 'Rango perdido: {rank} (antes: {oldRank}).' },
  pt: { up: '{stat} chegou a {threshold} (agora: {value}).', down: '{stat} caiu abaixo de {threshold} (agora: {value}).', rankUp: 'Novo ranque: {rank} (antes: {oldRank}).', rankDown: 'Ranque perdido: {rank} (antes: {oldRank}).' },
  de: { up: '{stat} hat {threshold} erreicht (aktuell: {value}).', down: '{stat} ist unter {threshold} gefallen (aktuell: {value}).', rankUp: 'Neuer Rang: {rank} (vorher: {oldRank}).', rankDown: 'Rang verloren: {rank} (vorher: {oldRank}).' },
  it: { up: '{stat} ha raggiunto {threshold} (ora: {value}).', down: '{stat} è sceso sotto {threshold} (ora: {value}).', rankUp: 'Nuovo grado: {rank} (prima: {oldRank}).', rankDown: 'Grado perso: {rank} (prima: {oldRank}).' },
  ja: { up: '{stat}が{threshold}に達しました（現在: {value}）。', down: '{stat}が{threshold}を下回りました（現在: {value}）。', rankUp: '新しいランク: {rank}（以前: {oldRank}）。', rankDown: 'ランクダウン: {rank}（以前: {oldRank}）。' },
  zh: { up: '{stat}达到了 {threshold}（当前：{value}）。', down: '{stat}跌破了 {threshold}（当前：{value}）。', rankUp: '新段位：{rank}（之前：{oldRank}）。', rankDown: '段位下降：{rank}（之前：{oldRank}）。' },
  ar: { up: 'بلغ {stat} ‏{threshold} (حاليًا: {value}).', down: 'انخفض {stat} إلى ما دون {threshold} (حاليًا: {value}).', rankUp: 'رتبة جديدة: {rank} (سابقًا: {oldRank}).', rankDown: 'خسارة رتبة: {rank} (سابقًا: {oldRank}).' }
}

/** Variables available in notification texts. The former French names ({statistique}, {palier}…) still work. */
export const TEMPLATE_VARIABLES = ['platform', 'stat', 'value', 'threshold', 'previous', 'account', 'rank', 'oldRank']
const LEGACY_VARIABLES: Record<string, string> = { plateforme: 'platform', statistique: 'stat', valeur: 'value', palier: 'threshold', ancienne: 'previous', compte: 'account', rang: 'rank', ancien_rang: 'oldRank' }
/** Rewrites the former French variable names of a saved text to the English ones. */
export const modernizeTemplate = (tpl: string): string => tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in LEGACY_VARIABLES ? `{${LEGACY_VARIABLES[k]}}` : m))

export interface TemplateData { platform: string; stat: string; value: string; threshold: string; previous: string; account: string; rank: string; oldRank: string }

export function templateVars(d: TemplateData): Record<string, string> {
  return {
    plateforme: d.platform, platform: d.platform, statistique: d.stat, stat: d.stat, valeur: d.value, value: d.value,
    palier: d.threshold, threshold: d.threshold, ancienne: d.previous, previous: d.previous, compte: d.account, account: d.account,
    rang: d.rank, rank: d.rank, ancien_rang: d.oldRank, oldRank: d.oldRank
  }
}

/** Replaces {variable}; an unknown variable stays as is. */
export const renderTemplate = (tpl: string, vars: Record<string, string>): string =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m))

/** Labels of the PDF report. */
export const REPORT_LABELS: Record<Lang, { title: string; stat: string; now: string; d7: string; d30: string; trend: string; events: string; none: string; demo: string }> = {
  en: { title: 'WaveDash report', stat: 'Statistic', now: 'Current', d7: '7 days', d30: '30 days', trend: 'Trend (30 d)', events: 'Latest milestones', none: 'No tracked account.', demo: 'simulated data' },
  fr: { title: 'Rapport WaveDash', stat: 'Statistique', now: 'Actuel', d7: '7 jours', d30: '30 jours', trend: 'Tendance (30 j)', events: 'Derniers paliers', none: 'Aucun compte suivi.', demo: 'données simulées' },
  es: { title: 'Informe de WaveDash', stat: 'Estadística', now: 'Actual', d7: '7 días', d30: '30 días', trend: 'Tendencia (30 d)', events: 'Últimos hitos', none: 'Ninguna cuenta en seguimiento.', demo: 'datos simulados' },
  pt: { title: 'Relatório do WaveDash', stat: 'Estatística', now: 'Atual', d7: '7 dias', d30: '30 dias', trend: 'Tendência (30 d)', events: 'Últimos marcos', none: 'Nenhuma conta acompanhada.', demo: 'dados simulados' },
  de: { title: 'WaveDash-Bericht', stat: 'Statistik', now: 'Aktuell', d7: '7 Tage', d30: '30 Tage', trend: 'Trend (30 T)', events: 'Letzte Meilensteine', none: 'Kein verfolgtes Konto.', demo: 'simulierte Daten' },
  it: { title: 'Report di WaveDash', stat: 'Statistica', now: 'Attuale', d7: '7 giorni', d30: '30 giorni', trend: 'Andamento (30 g)', events: 'Ultimi traguardi', none: 'Nessun account monitorato.', demo: 'dati simulati' },
  ja: { title: 'WaveDash レポート', stat: '統計', now: '現在', d7: '7日間', d30: '30日間', trend: '推移（30日）', events: '最近のマイルストーン', none: '記録中のアカウントはありません。', demo: 'シミュレーションデータ' },
  zh: { title: 'WaveDash 报告', stat: '统计', now: '当前', d7: '7 天', d30: '30 天', trend: '趋势（30 天）', events: '最近的里程碑', none: '没有追踪中的账号。', demo: '模拟数据' },
  ar: { title: 'تقرير WaveDash', stat: 'الإحصائية', now: 'الحالي', d7: '7 أيام', d30: '30 يومًا', trend: 'الاتجاه (30 يومًا)', events: 'آخر المراحل', none: 'لا يوجد حساب متابَع.', demo: 'بيانات تجريبية' }
}

/** Name of the sample account in the test notification. */
/** Windows notification shown when an update has been downloaded. */
export const UPDATE_READY: Record<Lang, string> = {
  en: 'Update {version} is ready: restart the app to install it.', fr: 'Mise à jour {version} prête : redémarre l’appli pour l’installer.',
  es: 'La actualización {version} está lista: reinicia la aplicación para instalarla.', pt: 'A atualização {version} está pronta: reinicie o app para instalá-la.',
  de: 'Update {version} ist bereit: Starte die App neu, um es zu installieren.', it: 'L’aggiornamento {version} è pronto: riavvia l’app per installarlo.',
  ja: 'アップデート {version} の準備ができました。アプリを再起動するとインストールされます。', zh: '更新 {version} 已就绪：重启应用即可安装。', ar: 'التحديث {version} جاهز: أعد تشغيل التطبيق لتثبيته.'
}

export const SAMPLE_ACCOUNT: Record<Lang, string> = { en: 'My channel', fr: 'Ma chaîne', es: 'Mi canal', pt: 'Meu canal', de: 'Mein Kanal', it: 'Il mio canale', ja: 'マイチャンネル', zh: '我的频道', ar: 'قناتي' }
