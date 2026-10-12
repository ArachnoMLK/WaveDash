// Libellés utilisés par le processus principal (notifications, rapport PDF) et textes par défaut.
import { Lang, MetricKey, Platform, TemplateKey } from './types'

export const PLATFORM_NAMES: Record<Platform, string> = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', brawlhalla: 'Brawlhalla' }

export const METRIC_NAMES: Record<Lang, Record<MetricKey, string>> = {
  fr: { subscribers: 'Abonnés', views: 'Vues', likes: 'Likes', comments: 'Commentaires', videos: 'Vidéos', elo_1v1: 'ELO 1v1', peak_1v1: 'ELO max 1v1',
    elo_2v2: 'ELO 2v2 (meilleure équipe)', games: 'Parties', wins: 'Victoires', winrate: 'Taux de victoire', level: 'Niveau', global_rank: 'Classement mondial', region_rank: 'Classement régional' },
  en: { subscribers: 'Subscribers', views: 'Views', likes: 'Likes', comments: 'Comments', videos: 'Videos', elo_1v1: '1v1 ELO', peak_1v1: '1v1 peak ELO',
    elo_2v2: '2v2 ELO (best team)', games: 'Games', wins: 'Wins', winrate: 'Win rate', level: 'Level', global_rank: 'Global rank', region_rank: 'Regional rank' }
}

export const DEFAULT_TEMPLATES: Record<Lang, Record<TemplateKey, string>> = {
  fr: {
    up: '{statistique} a atteint {palier} (actuel : {valeur}).',
    down: '{statistique} est repassé sous {palier} (actuel : {valeur}).',
    rankUp: 'Nouveau rang : {rang} (avant : {ancien_rang}).',
    rankDown: 'Rang perdu : {rang} (avant : {ancien_rang}).'
  },
  en: {
    up: '{stat} reached {threshold} (now: {value}).',
    down: '{stat} dropped below {threshold} (now: {value}).',
    rankUp: 'New rank: {rank} (was: {oldRank}).',
    rankDown: 'Rank lost: {rank} (was: {oldRank}).'
  }
}

/** Variables disponibles dans les textes (noms français et anglais acceptés). */
export const TEMPLATE_VARIABLES = ['plateforme', 'statistique', 'valeur', 'palier', 'ancienne', 'compte', 'rang', 'ancien_rang']

export interface TemplateData { platform: string; stat: string; value: string; threshold: string; previous: string; account: string; rank: string; oldRank: string }

export function templateVars(d: TemplateData): Record<string, string> {
  return {
    plateforme: d.platform, platform: d.platform, statistique: d.stat, stat: d.stat, valeur: d.value, value: d.value,
    palier: d.threshold, threshold: d.threshold, ancienne: d.previous, previous: d.previous, compte: d.account, account: d.account,
    rang: d.rank, rank: d.rank, ancien_rang: d.oldRank, oldRank: d.oldRank
  }
}

/** Remplace {variable} ; une variable inconnue reste telle quelle. */
export const renderTemplate = (tpl: string, vars: Record<string, string>): string =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m))
