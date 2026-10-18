# WaveDash

Dashboard Windows centralisé pour tes statistiques **YouTube, Brawlhalla, TikTok, Discord** et tout ce qu'un plugin sait lire.
Windows dashboard for your **YouTube, Brawlhalla, TikTok, Discord** stats, and anything a plugin can read.

Electron · React · TypeScript · SQLite · ECharts — gris/noir/blanc, verre dépoli, thèmes sombre/clair, FR/EN.

> **Version 1.2.0**
>
> Les mises à jour automatiques lisent les Releases GitHub : le dépôt doit rester **public**.

---

## 🇫🇷 Français

### Ce que fait WaveDash
- **Plateforme intégrée** : YouTube (abonnés, vues, vidéos, likes et commentaires des 50 dernières vidéos, meilleures vidéos). Tout le reste passe par des plugins.
- **Historique local** (SQLite) dès le début du suivi ; graphiques courbe, aire, barres, camembert, radar.
- **Vue d'ensemble**, **objectifs**, **paliers** (10, 20, 50, 100…) avec notification Windows et célébration, **export** des données.
- **Mode démo** : données simulées pour tout essayer sans clé API.
- **Personnalisation** : thème, langue, verre (et bureau visible même fenêtre agrandie), animations, onglets renommables, réordonnables et masquables (plugins compris), fréquence d'actualisation, type de graphique par statistique, démarrage avec Windows, barre système.
- **Mises à jour automatiques** silencieuses depuis les Releases GitHub (installateur vérifié par SHA-512).

### Plugins `.wdsh`
Un plugin ajoute une source de données. Il tourne dans un **bac à sable QuickJS**, dans un **processus séparé** : il ne voit que ce que ses permissions déclarées autorisent (domaines réseau, un dossier en lecture seule) et ne peut pas figer l'interface. Guide complet : [docs/PLUGINS.md](docs/PLUGINS.md).

- **Catalogue en ligne** ([WaveDash-Plugins](https://github.com/ArachnoMLK/WaveDash-Plugins)) : index **signé** (Ed25519), chaque paquet vérifié par SHA-256, mises à jour silencieuses seulement si les permissions ne changent pas.
- **Plugins fournis** (`examples/plugins/`) :
  - **Brawlhalla (API officielle)** : ELO, classements, victoires et légendes avec ta clé Blue Mammoth Games (remplace l'ancienne plateforme intégrée).
  - **Brawlhalla Replays** : lit et importe tes fichiers `.replay` (patchs 10.02 à 11.00). Bilan par légende, arme, carte, mode, coéquipier et adversaire, avec une barre Mode / Patch / Période qui refait toute la page pour un seul mode ; aperçu de chaque partie avec la vignette de la carte (prise dans ton jeu installé) et une frise des KOs, lancers et provocations ; recherche d'un joueur, d'une carte ou d'une légende, et outil « Croiser tes données » (ex. « Légendes × Modes avec Untel »).
  - **TikTok (profil public)** : abonnés, likes, vidéos depuis la page publique du profil.
  - **Discord (serveurs)** : membres, en ligne, boosts et activité des salons via un bot (API officielle).
  - **Météo** et **Statistiques de dossier** : exemples simples pour écrire son propre plugin.
- Pages de plugin modulables : modules à réduire, déplacer, masquer ; tableaux triables ; cartes de chaleur.
- Paliers réglables pour chaque métrique de plugin, et notifications envoyées par les plugins (ex. changement de rang Brawlhalla).

### Studio Brawlhalla
Rendus lus directement dans les fichiers du jeu installé (rien n'est téléchargé) :
- **Légendes** : légende, skin, couleur, puis animations rangées automatiquement — signatures (neutre / côté / bas de chaque arme, enchaînements compris), attaques et postures des deux armes, 277 emotes et danses.
- **Cosmétiques** : emojis, compagnons, sidekicks, podiums, cadres, insignes ; **portraits** des légendes ; **effets** visuels (fichiers `SFX_*.swf`, ex. les flammes de Yumiko).
- **Exports** : GIF, APNG, WebM et MOV transparents, MP4 sur fond vert (CapCut), ou images PNG.
- **Assets** (bannières, avatars, sprites, décors, map art, images) et **musiques** du jeu (Wwise → MP3).

Le rendu est fait par `BrawlRender.exe`, un moteur .NET du dépôt BrawlStudio basé sur [WallyAnmRenderer](https://github.com/allhailcheese/WallyAnmRenderer) (MIT). Avant `npm run dev` ou `npm run dist`, place BrawlStudio à côté de WaveDash (`git clone --recurse-submodules`) et lance `npm run studio:engine` (SDK .NET 8 requis) : le moteur et vgmstream sont copiés dans `resources/studio/` (non versionné). Sans eux, la page Studio indique simplement que le moteur manque.

### Installer
Télécharge `WaveDash-Setup-x.y.z.exe` dans l'onglet **Releases**. L'installateur n'est **pas signé** : SmartScreen affiche « éditeur inconnu » au premier lancement (« Informations complémentaires » › « Exécuter quand même »).

### Clés API (Paramètres › Comptes connectés, chiffrées par Windows DPAPI)
| Source | Ce qu'il faut | Limites |
|---|---|---|
| YouTube | Clé « YouTube Data API v3 » (Google Cloud Console, gratuit) | Likes/commentaires = 50 dernières vidéos |
| Brawlhalla (plugin) | Clé personnelle demandée à Blue Mammoth Games | Recherche par ID Brawlhalla ou Steam ID64 |
| Discord (plugin) | Jeton d'un bot invité sur le serveur | Ne lit jamais le contenu des messages |
| TikTok (plugin) | Aucune | Page publique, peut casser si TikTok la change |

Les clés ne sont jamais écrites en clair, jamais commitées, et jamais renvoyées à l'interface. Instagram n'est pas pris en charge (pas d'API pour les comptes personnels).

### Développement
```bash
npm install
npm run dev        # application avec rechargement à chaud
npm run typecheck  # vérifie les types
npm test           # tests automatiques (bac à sable, réseau, fichiers, ZIP, base, plugins fournis)
npm run dist       # installateur dans /dist (sous Windows)
```
Chaque envoi sur GitHub lance le workflow *Tests* (types et tests). Publier une version : incrémenter `package.json`, puis `git tag vX.Y.Z && git push origin vX.Y.Z` ; le workflow *Release* relance les tests, puis construit et publie l'installateur.

---

## 🇬🇧 English

WaveDash tracks YouTube natively, keeps a local SQLite history, and shows it with charts, goals, milestones (Windows notifications) and export. A **demo mode** works without any API key.

**Plugins** (`.wdsh`) add data sources. Each runs in a QuickJS sandbox inside a separate process, limited to the network domains and the read-only folder it declares. The online catalog is **signed** (Ed25519) and every package is checked by SHA-256. Bundled plugins: Brawlhalla official API (ELO, rankings, legends), Brawlhalla Replays (reads your `.replay` files: per legend/map/mode/teammate stats, search, data crossing), TikTok public profile, Discord servers (bot, official API), weather and folder stats examples. Plugin guide (French): [docs/PLUGINS.md](docs/PLUGINS.md).

Download the installer from **Releases** (unsigned: SmartScreen warns on first launch). API keys are entered in Settings › Connected accounts and encrypted with Windows DPAPI. Development: `npm install && npm run dev`.

---

## Structure
```
src/main        Processus principal : base SQLite, secrets, planificateur, fournisseurs (providers/), plugins (plugins/), Studio (studio/), IPC
src/preload     Pont sécurisé exposé à l'interface
src/renderer    Interface React (pages/, components/, lib/, i18n/)
src/shared      Types communs et validation des plugins
examples        Plugins fournis
tests           Tests automatiques (npm test)
docs            Guide des plugins, étude du lecteur de replays
```

## Licence
MIT
