# Écrire un plugin WaveDash (`.wdsh`)

Un plugin ajoute une **source de données** à WaveDash : il récupère des chiffres (une API, un dossier de fichiers…) et WaveDash s'occupe du reste : stockage, historique, cartes, graphiques, export.

Un fichier `.wdsh` est une **archive ZIP** contenant deux fichiers : `manifest.json` et un script JavaScript (`main.js` par défaut).

## Démarrage rapide

```bash
node tools/wdsh-pack.mjs examples/plugins/weather-open-meteo      # crée le fichier .wdsh
```

Puis dans WaveDash : **Plugins › Installer un plugin** (ou glisse le fichier dans la fenêtre, ou double-clique dessus). Deux exemples complets sont fournis dans `examples/plugins/` : une météo (réseau) et des statistiques de dossier (fichiers).

## Le manifeste (`manifest.json`)

```json
{
  "wdsh": 1,
  "id": "mon.plugin",
  "name": "Mon plugin",
  "version": "1.0.0",
  "author": "Moi",
  "description": { "fr": "Ce que fait le plugin.", "en": "What the plugin does." },
  "permissions": { "network": ["api.exemple.com", "*.cdn.exemple.com"], "folder": false, "folderExtensions": [".replay"] },
  "inputs":  [ { "key": "ville", "type": "text", "required": true, "label": { "fr": "Ville", "en": "City" } } ],
  "secrets": [ { "key": "apiKey", "label": "Clé API" } ],
  "metrics": [ { "key": "temperature", "label": "Température", "unit": "°C", "decimals": 1, "primary": true } ],
  "itemColumns": [ { "key": "size_kb", "label": "Taille", "unit": "Ko" } ],
  "refreshMinutes": 30
}
```

| Champ | Règles |
|---|---|
| `id` | minuscules, chiffres, `.` `_` `-`, 3 à 64 caractères. Identifie le plugin (une mise à jour réutilise le même `id`). |
| `version` | `x.y.z`. |
| `entry` | script d'entrée, `main.js` par défaut. |
| `minAppVersion` | version minimale de WaveDash (facultatif). |
| `permissions.network` | domaines joignables en **HTTPS**. `*.exemple.com` = tous les sous-domaines (pas le domaine nu). Jusqu'à 10. |
| `permissions.folder` | `true` pour lire **un dossier choisi par l'utilisateur**. Exige exactement un champ `inputs` de type `folder`. |
| `permissions.folderExtensions` | extensions lisibles (ex. `[".replay"]`). Vide = toutes. |
| `inputs` | jusqu'à 8 champs saisis à l'ajout d'un compte : `text`, `number` ou `folder`. |
| `secrets` | jusqu'à 4 valeurs (clés API…) enregistrées **chiffrées** par WaveDash, jamais en clair. |
| `metrics` | de 1 à 20. `format` : `number` (défaut), `percent`, `rank`, `duration` (secondes → mm:ss). `decimals` de 0 à 4. `primary` : métrique affichée d'abord. |
| `itemColumns` | colonnes du tableau d'éléments (facultatif). |
| `itemsMode` | `replace` (défaut) : chaque actualisation remplace la liste d'éléments. `keep` : les éléments renvoyés s'ajoutent à ceux déjà enregistrés (même `id` = mis à jour), jusqu'à 20 000 par compte ; la page les affiche par 50, avec un filtre par mois. Utile pour un historique (une partie par fichier, par exemple). |
| `refreshMinutes` | délai minimal entre deux actualisations (5 à 1440, 30 par défaut). |

Les textes (`label`, `description`, `help`) sont une chaîne simple ou `{ "fr": "…", "en": "…" }`.

## Le script

Le script définit un objet global `plugin` avec une ou deux fonctions asynchrones :

```js
var plugin = {
  // Facultatif. Appelée à l'ajout d'un compte : valide les saisies et donne un nom au compte.
  resolve: async function (ctx) {
    return { externalId: 'identifiant-stable', displayName: 'Nom affiché' }
  },

  // Obligatoire. Appelée à chaque actualisation.
  refresh: async function (ctx) {
    return {
      metrics: { temperature: 17.4 },                       // clés déclarées dans le manifeste
      items:   [{ id: 'a', title: 'Élément', ts: Date.now(), fields: { size_kb: 12 } }],   // facultatif, 200 max
      history: [{ ts: 1700000000000, metrics: { temperature: 12 } }],                   // facultatif : points passés, 5000 max (voir plus bas)
      backlog: 0                                                                         // facultatif : travail restant (voir plus bas)
    }
  }
}
```

**`backlog`** : si le plugin ne peut pas tout traiter en une fois (budget de calcul), il indique ce qui reste (par exemple le nombre de fichiers pas encore lus). Tant que `backlog` est positif, WaveDash le relance 5 s après la fin de l'exécution, sans attendre `refreshMinutes`, et la page affiche la progression.

**`history` fait foi** : pour chaque métrique, les points déjà enregistrés entre le premier point renvoyé et maintenant sont remplacés par ceux-ci. Un plugin qui complète des données passées (par exemple des fichiers lus en plusieurs fois) corrige ainsi les valeurs calculées avant ; les points plus anciens ne sont pas touchés.

`ctx` contient : `inputs` (valeurs saisies), `secrets` (vos clés, déchiffrées), `lang` (`fr` ou `en`), `account` (`{ externalId, displayName }`, dans `refresh`).

Un élément peut aussi porter un **`detail`** facultatif, affiché quand on clique sur sa ligne :

```js
detail: {
  table:    { columns: ['Joueur', 'Score'], rows: [['Alby', 2], ['Close', 1]] },        // 8 colonnes, 40 lignes max
  timeline: { duration: 183, lanes: ['Alby', 'Close'], events: [{ t: 29.1, lane: 0, label: 'KO' }] }  // frise : 16 lignes, 400 repères max, t en secondes
}
```

**Tout ce qui n'est pas déclaré dans le manifeste est ignoré** : métriques inconnues, colonnes inconnues, valeurs non numériques, horodatages absurdes.

### L'objet `host` : tout ce que le plugin peut faire

| Fonction | Rôle |
|---|---|
| `await host.http(url, { method, headers, body })` | Requête HTTPS vers un domaine déclaré. Renvoie `{ status, ok, headers, text, json() }`. |
| `host.log(...)` / `console.log(...)` | Journal visible dans la page du plugin (100 lignes max). |
| `host.storage.get(clé)` / `.set(clé, texte)` | Mémoire persistante par compte (100 clés, 64 Ko par valeur) : utile pour ne retraiter que les nouveautés. |
| `host.files.list()` | Les 20 000 fichiers les plus récents du dossier choisi, du plus récent au plus ancien : `[{ name, size, mtime }]` (permission `folder`). |
| `host.files.readText(nom)` / `.readBytes(nom)` | Contenu d'un fichier (texte, ou `Uint8Array`). 8 Mo max par fichier. |

Le reste n'existe pas : ni `fetch`, ni `require`, ni `process`, ni `setTimeout`, ni accès au disque en dehors de `host.files`.

## Sécurité et limites

Le script s'exécute dans **QuickJS**, un moteur JavaScript isolé (WebAssembly). Il ne voit que `host`. À chaque exécution :

- **mémoire** : 48 Mo ; **pile** : 256 Ko ;
- **calcul** : 8 s de temps de calcul cumulé ; **durée totale** : 45 s (réseau compris) ;
- **réseau** : 30 requêtes, 5 Mo par réponse, 15 s par requête ; HTTPS uniquement ; redirections revérifiées ; adresses locales et privées (`localhost`, `192.168.x.x`, `10.x.x.x`…) **toujours refusées**, y compris si un nom de domaine y pointe ;
- **fichiers** : un seul dossier, sans sous-dossiers ni liens symboliques, lecture seule.

Après **5 échecs consécutifs**, le plugin est désactivé automatiquement. À l'installation, WaveDash affiche les permissions demandées et l'utilisateur doit confirmer.

> Cette isolation réduit fortement le risque mais ne le supprime pas, et WaveDash n'est pas signé numériquement : **n'installe que des plugins dont tu connais l'auteur.**

## Mises à jour d'un plugin

Réinstaller un `.wdsh` de même `id` met le plugin à jour en conservant ses comptes, ses clés et son stockage. L'écran de confirmation affiche à nouveau les permissions.

## Pour déboguer

La page d'un compte de plugin affiche l'erreur de la dernière actualisation et un **journal** (`host.log`). Une erreur lancée par ton code (`throw new Error('…')`) apparaît telle quelle.

## Plugin fourni : Brawlhalla Replays

`examples/brawlhalla-replays-1.2.0.wdsh` lit **tous** les fichiers `.replay` d'un dossier (permission `folder`, aucun réseau) : parties, victoires/défaites, taux de victoire, stocks pris/perdus, durée moyenne, appuis par minute, et pour chaque partie un détail (joueurs, équipes, légendes, place, stocks perdus, attaques légères/lourdes, esquives, appuis par minute) avec une frise des KOs.

Toutes les parties du dossier comptent : les totaux, la courbe (datée par la date de chaque fichier) et la liste des parties remontent jusqu'au plus ancien replay. Le plugin décompresse lui-même chaque fichier (inflate en JavaScript à tables de décodage, vérifié identique à zlib sur 9012 fichiers) dans le bac à sable : environ 50 ms par replay dans WaveDash, 2 s de lecture par exécution. À la première installation, il signale le reste (`backlog`) et WaveDash le relance toutes les quelques secondes : environ 20 à 30 minutes pour 9000 replays, une seule fois. Ensuite, seuls les nouveaux fichiers sont lus. Le cache ne garde qu'un résumé de chaque partie (environ 100 octets) ; le détail est envoyé une fois à WaveDash, qui le conserve (`itemsMode: keep`). Le pseudo accepte plusieurs noms séparés par des virgules (utile après un changement de pseudo). Pendant une exécution, le plugin occupe le processus principal de WaveDash : l'interface peut répondre avec un peu de retard pendant le rattrapage.

### Ce qui est vérifié, ce qui ne l'est pas

Vérifié sur 9012 replays réels (versions 261 à 271, patchs 10.02 à 11.00) :

- **Validation par checksum.** Le jeu écrit un checksum des données de partie (joueurs, cosmétiques, légendes, carte). Le plugin le recalcule ; s'il ne correspond pas, le replay est signalé « format non reconnu (version N) » et rien n'en est affiché. Les 9012 replays passent ; un parseur volontairement faussé est rejeté. Le bit de tête de chaque légende compte comme bit 31 de sa valeur combinée (constaté sur les modes à plusieurs légendes ; la bibliothèque C# l'ignorait).
- **Légendes.** L'identifiant lu dans le replay est le `HeroID` du jeu, identique au `legend_id` de l'API officielle. La table (70 légendes, jusqu'à Qinghua & Baobao) vient du fichier `HeroTypes` des données du patch 11.00, et concorde avec le lecteur de replay du jeu sur Eternity's End. Une légende inconnue s'affiche `#id` et le journal le signale (« nouvelle légende ? ») : il faut alors mettre à jour la table.
- **Carte.** Le nom est lu dans le nom du fichier (`[11.00] SmallBrawlhaven (42).replay` → Small Brawlhaven) ; à défaut, `Carte #id`.
- **Inputs.** Chaque joueur a la liste des changements d'état de ses touches (14 indicateurs : directions, saut, attaques légère et lourde, esquive, ramasser/lancer, quatre provocations). Le plugin compte les appuis ; les horodatages ne sont pas lus.
- **Auteur d'un KO : non.** Un KO ne contient que le joueur qui perd un stock et l'instant. La seconde liste (type 7) n'apparaît que dans des modes spéciaux (Kung Foot, sans KO) et ne désigne pas d'auteur non plus. En 1v1 l'auteur est forcément l'adversaire ; ailleurs, le fichier ne permet pas de le savoir.

Hypothèses non vérifiées : la signification exacte de la liste de type 7 ; les formats antérieurs à la version 261.

Dégâts, combos, positions ou esquives réussies ne sont **pas** dans le fichier : il faudrait rejouer la partie avec le moteur du jeu à partir des inputs (c'est ce que fait un service comme Yarralytics, sur ses serveurs).

Le format de fichier a été compris grâce aux projets open source BrawlhallaReplayLibrary (allhailcheese) et brawlhalla-replay-reader (itselectroz), tous deux sous licence MIT.

## Pas encore disponible

Paliers et notifications pour les métriques de plugins, intégration à la vue d'ensemble, rapport PDF.
