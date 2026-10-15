# WaveDash

Dashboard Windows centralisé pour tes statistiques **YouTube, Instagram, TikTok et Brawlhalla**.
Windows dashboard for your **YouTube, Instagram, TikTok and Brawlhalla** stats.

Electron · React · TypeScript · SQLite · ECharts — style gris/noir/blanc, verre dépoli, thèmes sombre/clair, FR/EN.

> **Version 0.6.0** — YouTube, Brawlhalla, mode démo, personnalisation avancée, mises à jour automatiques, paliers et notifications, objectifs, export, et **plugins `.wdsh`** exécutés dans un bac à sable isolé (guide : [docs/PLUGINS.md](docs/PLUGINS.md), exemples : `examples/`, dont **Brawlhalla Replays** qui lit tes fichiers `.replay` avec détail et frise des KOs). À venir : paliers pour les plugins, rivaux Brawlhalla, Instagram, TikTok.
>
> Les mises à jour automatiques lisent les Releases GitHub : le dépôt doit être **public**.

---

## 🇫🇷 Français

### Ce qui fonctionne (étape 1)
- Fenêtre en verre (Mica/Acrylic natif sous Windows 11, flou CSS en repli), thèmes sombre/clair, animations réglables
- **YouTube** : abonnés, vues, vidéos, likes et commentaires (50 dernières vidéos), meilleures vidéos
- **Brawlhalla** : ELO 1v1/2v2, ELO max, classements, parties, victoires, taux de victoire, niveau, stats par légende
- Historique local (SQLite) à partir du début du suivi, graphiques courbe / aire / barres / camembert / radar
- Un seul compte par plateforme, chaque plateforme est optionnelle
- **Mode démo** : données simulées pour tout tester sans clé API
- Paramètres : thème, langue, intensité du verre et des animations, fréquence d'actualisation, type de graphique par statistique, clés API, démarrage avec Windows, barre système

### Obtenir le `.exe` (sans rien compiler)
1. Crée un dépôt GitHub et pousse ce dossier.
2. Dans `electron-builder.yml`, la section `publish` utilise le dépôt courant via GitHub Actions ; rien à renseigner de plus.
3. Crée un tag : `git tag v0.1.0 && git push origin v0.1.0`
4. Le workflow *Release* compile `WaveDash-Setup-0.1.0.exe` et le publie dans l'onglet **Releases**.

L'installateur n'est **pas signé** : Windows SmartScreen affichera « éditeur inconnu » au premier lancement (« Informations complémentaires » › « Exécuter quand même »).

### Développement local
```bash
npm install
npm run dev        # lance l'application avec rechargement à chaud
npm run typecheck  # vérifie les types
npm run dist       # génère l'installateur dans /dist (sous Windows)
```

### Clés API (saisies dans Paramètres › Comptes connectés, chiffrées par Windows DPAPI)
| Plateforme | Ce qu'il faut | Limites |
|---|---|---|
| YouTube | Clé API « YouTube Data API v3 » (Google Cloud Console, gratuit) | Statistiques publiques ; likes/commentaires = 50 dernières vidéos |
| Brawlhalla | Clé personnelle demandée à Blue Mammoth Games | Recherche par ID Brawlhalla ou Steam ID64 |
| Instagram | Compte Pro + app Meta (étape 3) | Pas d'API officielle pour les comptes personnels |
| TikTok | API soumise à validation, sinon lecture publique (étape 4) | Lecture publique fragile, peut enfreindre les CGU, désactivée par défaut |

Les clés ne sont jamais écrites en clair, jamais commitées, et jamais renvoyées à l'interface.

---

## 🇬🇧 English

### Working now (step 1)
Glass UI (native Mica/Acrylic on Windows 11, CSS blur fallback), dark/light themes, adjustable animations; YouTube and Brawlhalla tracking; local SQLite history; line/area/bar/pie/radar charts; one account per platform (each platform is optional); **demo mode** with simulated data; full settings page.

### Getting the `.exe` (no local build needed)
Push this folder to GitHub, then `git tag v0.1.0 && git push origin v0.1.0`. The *Release* workflow builds `WaveDash-Setup-0.1.0.exe` and attaches it to the Releases page. The installer is **unsigned**, so Windows SmartScreen shows an "unknown publisher" warning on first launch.

### Local development
```bash
npm install && npm run dev
```

### API keys
Entered in Settings › Connected accounts and encrypted with Windows DPAPI. See the table above for each platform's requirements and limits.

---

## Structure
```
src/main        Processus principal : base SQLite, secrets, planificateur, fournisseurs (providers/), IPC
src/preload     Pont sécurisé exposé à l'interface
src/renderer    Interface React (pages/, components/, lib/, i18n/)
src/shared      Types communs
resources       Logo et icônes
```
Ajouter une plateforme = ajouter un fichier dans `src/main/providers/` qui implémente l'interface `Provider`.

## Licence
MIT
