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
| `permissions.images` | `true` pour **afficher** des images d'un dossier choisi par l'utilisateur (ex. vignettes d'un jeu). Exige exactement un champ `inputs` de type `images`. Le script ne lit jamais ce dossier et ne reçoit pas son chemin : il nomme seulement un fichier dans `detail.image`, que WaveDash affiche (JPG, PNG ou WebP, 3 Mo au plus). |
| `inputs` | jusqu'à 8 champs saisis à l'ajout d'un compte (modifiables ensuite avec le bouton **Modifier** de la page du compte) : `text`, `number`, `folder` ou `images`. |
| `secrets` | jusqu'à 4 valeurs (clés API…) enregistrées **chiffrées** par WaveDash, jamais en clair. |
| `metrics` | de 1 à 20. `format` : `number` (défaut), `percent`, `rank`, `duration` (secondes → mm:ss). `decimals` de 0 à 4. `primary` : métrique affichée d'abord. `milestone` (facultatif) : paliers proposés par défaut, `{ "increment": 100, "notifyDown": true, "enabled": true }` (incrément entier ≥ 1 ; sans incrément, séquence 10, 20, 50…). |
| `itemColumns` | colonnes du tableau d'éléments (facultatif). |
| `notices` | `true` si le plugin envoie des notifications (`notices` dans son résultat, voir plus bas). Affiché à l'installation ; chaque plugin peut être coupé dans Paramètres › Notifications. |
| `search` | `true` si le script définit `search` : la page du compte affiche alors la barre de recherche du haut. |
| `cross` | Outil « Croiser tes données » : `{ "measures": [{ "key", "label" }], "dimensions": [{ "key", "label" }] }` (2 à 12 chacun). Le script définit `cross(ctx)` ; `ctx.cross` = `{ who, measure, a, b }` (`b` peut valoir `none`) ; il renvoie un détail, en général des `bars` (`{ title, categories, series: [{ name, values }], stacked }`) et un tableau. |
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

  // Facultatif. Barre de recherche en haut de la page d'un compte : `ctx.query` est le texte tapé ; renvoie un détail
  // (même format que `detail`, voir plus bas) ou rien. Rien n'est enregistré ; une erreur ici ne désactive pas le plugin.
  search: async function (ctx) {
    return { chips: ['Résultat pour ' + ctx.query], stats: [{ label: 'Parties', value: 12 }] }
  },

  // Obligatoire. Appelée à chaque actualisation.
  refresh: async function (ctx) {
    return {
      metrics: { temperature: 17.4 },                       // clés déclarées dans le manifeste
      items:   [{ id: 'a', title: 'Élément', ts: Date.now(), fields: { size_kb: 12 } }],   // facultatif, 200 max
      history: [{ ts: 1700000000000, metrics: { temperature: 12 } }],                   // facultatif : points passés, 5000 max (voir plus bas)
      backlog: 0,                                                                        // facultatif : travail restant (voir plus bas)
      notices: [{ id: 'rang:42', title: 'Platine 0', text: 'Nouveau rang : Platine 0.', direction: 'up' }]   // facultatif, manifeste notices: true
    }
  }
}
```

**`backlog`** : si le plugin ne peut pas tout traiter en une fois (budget de calcul), il indique ce qui reste (par exemple le nombre de fichiers pas encore lus). Tant que `backlog` est positif, WaveDash le relance 5 s après la fin de l'exécution, sans attendre `refreshMinutes`, et la page affiche la progression. Si le retard ne baisse pas pendant 3 relances de suite, WaveDash cesse ces relances rapides et attend l'actualisation normale suivante : un retard mal calculé ne peut pas faire tourner un plugin en boucle.

**`notices`** (manifeste `notices: true`) : 3 notifications au plus par exécution (`title` 40 caractères, `text` 200, `direction` `up` ou `down`), envoyées comme un palier (notification Windows, son, célébration, historique). Chaque `id` n'est envoyé **qu'une fois** par compte : donne un identifiant nouveau à chaque événement. L'utilisateur peut couper les notifications d'un plugin dans Paramètres › Notifications.

**`history` fait foi** : pour chaque métrique, les points déjà enregistrés entre le premier point renvoyé et maintenant sont remplacés par ceux-ci. Un plugin qui complète des données passées (par exemple des fichiers lus en plusieurs fois) corrige ainsi les valeurs calculées avant ; les points plus anciens ne sont pas touchés.

`ctx` contient : `inputs` (valeurs saisies), `secrets` (vos clés, déchiffrées), `lang` (`fr` ou `en`), `account` (`{ externalId, displayName }`, dans `refresh`).

Un élément peut aussi porter un **`detail`** facultatif, affiché sous sa ligne quand on clique dessus. Toutes les parties sont facultatives :

```js
detail: {
  image:    { file: 'BrawlhavenSmall.jpg', caption: 'Small Brawlhaven' },                   // permission images : fichier du dossier d'images
  chips:    ['Small Brawlhaven', 'Patch 11.00', '3:04'],                                   // badges : 16 max
  stats:    [{ label: 'Parties', value: 12 }],                                               // chiffres clés : 24 max
  table:    { columns: ['Joueur', 'Score'], rows: [['Alby', 2], ['Close', 1]] },             // 10 colonnes, 80 lignes max
  tables:   [{ title: 'Actions', columns: [...], rows: [...] }],                             // 8 tableaux max
  grids:    [{ title: 'Esquives', rows: ['↑', '·', '↓'], cols: ['←', '·', '→'], values: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] }],  // grilles de chaleur : 8 max, 8 × 8
  series:   [{ title: 'Actions toutes les 15 s', step: 15, lines: [{ name: 'Close', values: [12, 9, 14] }] }],              // courbes : 4 max, 16 lignes, 600 points
  timeline: { duration: 183, lanes: ['Alby', 'Close'], events: [{ t: 29.1, lane: 0, label: 'KO' }] }                       // frise : 16 lignes, 400 repères max, t en secondes
  //        events[].kind facultatif : 'ko' (losange, par défaut), 'action' (petit rond), 'mark' (triangle)
}
```

`refresh` peut aussi renvoyer un **`summary`** au même format : c'est le **bilan** du compte, affiché en haut de sa page (par exemple des totaux par catégorie). Chaque bloc du bilan est un module que l'utilisateur peut réduire, déplacer ou masquer (disposition gardée par compte).

La page d'un compte propose une **recherche** dans tout l'élément ou dans une seule colonne (menu « Chercher dans ») ; pendant une recherche, WaveDash affiche des stats sur les éléments trouvés, pour chaque colonne : moyenne, minimum, maximum et total pour les nombres, durée moyenne pour les valeurs « m:ss », répartition pour le texte (par exemple le taux de victoire d'après une colonne Résultat).

Si le plugin lit un dossier (`permissions.folder`), la page du compte propose **Importer des fichiers** : une fenêtre où glisser-déposer les fichiers (ou les choisir). WaveDash les copie d'abord (extensions du manifeste, 8 Mo max chacun, doublons ignorés) dans le dossier **Documents › WaveDash › Parties importées › <n° du compte>**, en gardant leur date ; `host.files` les voit en plus de ceux du dossier choisi. Le dossier choisi n'est jamais modifié, et le dossier d'imports est supprimé avec le compte.

**Tout ce qui n'est pas déclaré dans le manifeste est ignoré** : métriques inconnues, colonnes inconnues, valeurs non numériques, horodatages absurdes.

### L'objet `host` : tout ce que le plugin peut faire

| Fonction | Rôle |
|---|---|
| `await host.http(url, { method, headers, body })` | Requête HTTPS vers un domaine déclaré. Renvoie `{ status, ok, headers, text, json() }`. |
| `host.log(...)` / `console.log(...)` | Journal visible dans la page du plugin (100 lignes max). |
| `host.storage.get(clé)` / `.set(clé, texte)` | Mémoire persistante par compte (100 clés, 64 Ko par valeur) : utile pour ne retraiter que les nouveautés. Une clé ne contient que lettres, chiffres, `.`, `_` et `-` (1 à 64 caractères) : pas de `:` ni d'espace. |
| `host.files.list()` | Les 20 000 fichiers les plus récents du dossier choisi, du plus récent au plus ancien : `[{ name, size, mtime }]` (permission `folder`). |
| `host.files.readText(nom)` / `.readBytes(nom)` | Contenu d'un fichier (texte, ou `Uint8Array`). 8 Mo max par fichier. |

Le reste n'existe pas : ni `fetch`, ni `require`, ni `process`, ni `setTimeout`, ni accès au disque en dehors de `host.files`.

## Sécurité et limites

Le script s'exécute dans **QuickJS**, un moteur JavaScript isolé (WebAssembly), lui-même lancé dans un **processus séparé** de WaveDash (« WaveDash · plugins ») : un plugin lent ne fige jamais l'interface, et si ce processus s'arrête, il est relancé et l'exécution réessayée une fois (ce qu'il écrit sur sa sortie d'erreur va dans `plugin-host.log`, dans le dossier de l'appli). Le stockage du compte est copié dans ce processus avant l'exécution, puis les changements sont enregistrés après. Le script ne voit que `host`. À chaque exécution :

- **mémoire** : 48 Mo ; **pile** : 256 Ko ;
- **calcul** : 8 s de temps de calcul cumulé ; **durée totale** : 45 s (réseau compris) ;
- **réseau** : 30 requêtes, 5 Mo par réponse, 15 s par requête ; HTTPS uniquement ; redirections revérifiées (vers un autre hôte, les en-têtes `Authorization` et `Cookie` ne suivent pas) ; adresses locales et privées (`localhost`, `192.168.x.x`, `10.x.x.x`…) **toujours refusées**, y compris si un nom de domaine y pointe ;
- **fichiers** : un seul dossier, sans sous-dossiers ni liens symboliques, lecture seule.

Après **5 échecs consécutifs**, le plugin est désactivé automatiquement. À l'installation, WaveDash affiche les permissions demandées et l'utilisateur doit confirmer.

> Cette isolation réduit fortement le risque mais ne le supprime pas, et WaveDash n'est pas signé numériquement : **n'installe que des plugins dont tu connais l'auteur.**

## Catalogue en ligne

La page **Plugins › Catalogue** liste les plugins publiés sur le dépôt [ArachnoMLK/WaveDash-Plugins](https://github.com/ArachnoMLK/WaveDash-Plugins). WaveDash lit son `index.json` (adresse écrite dans l'application, cache de 3 h, dernière copie gardée pour le mode hors ligne). L'index est **signé** (Ed25519) : WaveDash contient la clé publique et refuse un index non signé par la clé privée du propriétaire, qui n'est jamais en ligne. Avant toute installation, le paquet téléchargé est vérifié : taille et empreinte SHA-256 identiques à celles de l'index signé, sinon il est refusé. L'installation passe ensuite par l'écran de confirmation habituel, avec les permissions. Au démarrage puis toutes les 3 heures, un plugin installé est mis à jour en silence depuis le catalogue si sa nouvelle version demande exactement les mêmes permissions ; ses comptes sont alors actualisés aussitôt. L'index est lu en contournant le cache de GitHub : une publication est visible tout de suite. Le catalogue ne fait jamais revenir un plugin à une version plus ancienne.

Pour publier un plugin : pull request sur WaveDash-Plugins (voir son README). Le propriétaire du dépôt relit chaque contribution ; l'action **Check** vérifie que paquets, empreintes et sources correspondent.

## Plugins fournis avec WaveDash

Les plugins du dossier `examples/` sont livrés dans l'installateur. La page **Plugins** propose ceux qui ne sont pas installés (ou dont une version plus récente est fournie), en un clic, avec l'écran de confirmation habituel. Au démarrage, WaveDash met à jour **en silence** un plugin installé dont il fournit une version plus récente, **seulement si ses permissions sont identiques** ; sinon, la mise à jour attend ta confirmation depuis la page Plugins.

## Paliers et vue d'ensemble

Les comptes de plugins apparaissent dans la **vue d'ensemble** (jusqu'à 4 métriques, la principale d'abord ; un clic ouvre le compte). Les **paliers** se règlent dans **Paramètres › Notifications**, métrique par métrique (nombres et pourcentages), pour chaque plugin installé : notification Windows, son et célébration, comme pour les plateformes intégrées. Par défaut : le réglage `milestone` du manifeste s'il existe, sinon la séquence 10, 20, 50, 100… sur la métrique principale quand c'est un simple nombre. Les règles sont enregistrées sous `plugin:<id>.<métrique>` et suivent la sauvegarde de la configuration.

## Mises à jour d'un plugin

Réinstaller un `.wdsh` de même `id` met le plugin à jour en conservant ses comptes, ses clés et son stockage. L'écran de confirmation affiche à nouveau les permissions.

## Pour déboguer

La page d'un compte de plugin affiche l'erreur de la dernière actualisation et un **journal** (`host.log`). Une erreur lancée par ton code (`throw new Error('…')`) apparaît telle quelle.

## Plugin fourni : Brawlhalla Replays

`examples/brawlhalla-replays-1.9.1.wdsh` lit **tous** les fichiers `.replay` d'un dossier, plus ceux importés (permission `folder`, aucun réseau).

- **Courbe et cartes** : parties, victoires, défaites, taux de victoire, stocks pris et perdus, durée moyenne, appuis par minute.
- **Bilan** : chiffres clés, tableaux par légende, carte, mode, coéquipier, adversaire, jour et heure, direction de tes esquives, répartition de tes attaques.
- **Détail d'une partie** : vignette de la carte (si tu indiques le dossier `images	humbnails` du jeu : WaveDash l'affiche depuis ton installation, aucune image n'est livrée), carte, mode, patch, date, durée, vies, réglages ; pour chaque joueur, légende, armes, posture, place, KOs subis, KOs infligés (en 1v1), attaques légères et lourdes par direction, esquives, sauts, lancers, provocations, temps de déplacement, appuis par minute ; grille de direction des esquives, courbe d'activité toutes les 15 s, frise de la partie (KOs, avec leur auteur en 1v1 ; lancers d'arme ; provocations).

Toutes les parties du dossier comptent : les totaux, la courbe (datée par la date de chaque fichier) et la liste des parties remontent jusqu'au plus ancien replay. Le plugin décompresse lui-même chaque fichier (inflate en JavaScript à tables de décodage, vérifié identique à zlib sur 9012 fichiers) dans le bac à sable : environ 50 ms par replay dans WaveDash, 2 s de lecture par exécution. À la première installation, il signale le reste (`backlog`) et WaveDash le relance toutes les quelques secondes : environ 20 à 30 minutes pour 9000 replays, une seule fois. Ensuite, seuls les nouveaux fichiers sont lus. Le cache ne garde qu'un résumé de chaque partie (environ 100 octets) ; le détail est envoyé une fois à WaveDash, qui le conserve (`itemsMode: keep`). Le pseudo accepte plusieurs noms séparés par des virgules (utile après un changement de pseudo). Le rattrapage tourne dans le processus des plugins : l'interface reste fluide pendant ce temps.

### Ce qui est vérifié, ce qui ne l'est pas

Vérifié sur 9012 replays réels (versions 261 à 271, patchs 10.02 à 11.00) :

- **Validation par checksum.** Le jeu écrit un checksum des données de partie (joueurs, cosmétiques, légendes, carte). Le plugin le recalcule ; s'il ne correspond pas, le replay est signalé « format non reconnu (version N) » et rien n'en est affiché. Les 9012 replays passent ; un parseur volontairement faussé est rejeté. Le bit de tête de chaque légende compte comme bit 31 de sa valeur combinée (constaté sur les modes à plusieurs légendes ; la bibliothèque C# l'ignorait).
- **Légendes.** L'identifiant lu dans le replay est le `HeroID` du jeu, identique au `legend_id` de l'API officielle. La table (70 légendes, jusqu'à Qinghua & Baobao) vient du fichier `HeroTypes` des données du patch 11.00, et concorde avec le lecteur de replay du jeu sur Eternity's End. Une légende inconnue s'affiche `#id` et le journal le signale (« nouvelle légende ? ») : il faut alors mettre à jour la table.
- **Carte.** Le nom vient de la table `LevelTypes` du jeu (patch 11.00), vérifiée contre les noms de 2930 fichiers ; sinon du nom du fichier (`[11.00] SmallBrawlhaven (42).replay` → Small Brawlhaven) ; à défaut, `Carte #id`.
- **Armes.** Les deux armes de chaque légende viennent de la table `HeroTypes` du jeu.
- **Identifiant de joueur.** Depuis la version 268 (patch 10.09), chaque joueur a un identifiant de compte (32 bits, 0 pour les bots), stable malgré les changements de pseudo ; le second joueur local (« pseudo•2 ») partage celui de son hôte. Le plugin apprend tes identifiants à partir d'un pseudo identique (avec ou sans tag de clan), puis te reconnaît par eux. Coéquipiers et adversaires sont regroupés par identifiant ; une partie plus ancienne, sans identifiant, est rattachée au joueur dont le pseudo sans tag correspond à un seul identifiant. Hypothèse non vérifiée : que ce soit le `brawlhalla_id` de l'API officielle.
- **Victoire.** Le score d'un joueur est sa place (1 = vainqueur). Certains modes (Kung Foot) ajoutent une entité qui n'est pas un joueur, avec un score de 0 : elle est ignorée.
- **Inputs.** Chaque joueur a la liste horodatée (ms) des changements d'état de ses touches (14 indicateurs : directions, saut, attaques légère et lourde, esquive, ramasser/lancer, quatre provocations). Le plugin compte les appuis, note la direction tenue au moment de chaque attaque et de chaque esquive, mesure le temps passé à tenir gauche ou droite et l'activité toutes les 15 s.
- **Touche esquive : esquive, dash, gravity cancel, chase dodge.** Le jeu utilise la même touche pour les quatre ; le replay ne garde que l'appui. Chaque appui est classé d'après les règles du jeu ([wiki, page Movement](https://brawlhalla.wiki.gg/wiki/Movement)) : **gravity cancel** si une attaque suit dans les 18 frames (esquive sur place) ou dans les 3 frames dans la même direction (esquive dirigée) ; **chase dodge probable** entre 200 et 850 ms après une attaque (le replay ne dit pas si l'attaque a touché : surestimé) ; **dash probable** si latéral sans saut dans les 700 ms (le replay ne dit pas si le joueur est au sol). Le reste est une **esquive** : seules celles-ci forment les grilles de direction. Sur 277 parties réelles : 31 % d'esquives, 28 % de dashs probables, 33 % de chase dodges probables, 8 % de gravity cancels.
- **Auteur d'un KO : non.** Un KO ne contient que le joueur qui perd un stock et l'instant. La seconde liste (type 7) n'apparaît que dans des modes spéciaux (Kung Foot, sans KO) et ne désigne pas d'auteur non plus. En 1v1 l'auteur est forcément l'adversaire ; ailleurs, le fichier ne permet pas de le savoir.

Hypothèses non vérifiées : la signification exacte de la liste de type 7 ; les formats antérieurs à la version 261 ; le nom des postures (le fichier donne un numéro, affiché tel quel) ; la direction « tenue » ne dit pas si l'attaque a eu lieu au sol ou en l'air.

Dégâts infligés et subis, arme tenue, positions (air, sol, mur), combos, dashs, auteur des KOs hors 1v1 : rien de cela n'est **dans** le fichier. Il faudrait rejouer la partie avec le moteur du jeu à partir des inputs, ce que fait Yarralytics sur ses serveurs.

Le format de fichier a été compris grâce aux projets open source BrawlhallaReplayLibrary (allhailcheese) et brawlhalla-replay-reader (itselectroz), tous deux sous licence MIT.

## Plugin fourni : Brawlhalla (API officielle)

`examples/brawlhalla-api-1.2.0.wdsh` remplace, depuis WaveDash 1.0.1, la plateforme Brawlhalla intégrée. Il lit ton profil par l'API officielle (seul domaine permis : `api.brawlhalla.com`) avec ta clé personnelle Blue Mammoth Games, enregistrée comme secret du plugin (chiffrée par Windows). Saisie : ID Brawlhalla, Steam ID64 ou lien `steamcommunity.com/profiles/…`. Métriques : ELO 1v1 (principale) et 2v2, ELO max, classements mondial et régional, parties, victoires, taux de victoire, niveau ; une ligne par légende (parties, victoires, KOs, chutes, niveau, temps de jeu) et un bilan (rang, région, clan, équipes 2v2).

À la mise à jour, un compte Brawlhalla intégré est rattaché à ce plugin avec son historique, sa clé et ses règles de paliers (l'ELO garde un palier tous les 100 points) ; un compte de démo est supprimé. Depuis la version 1.2.0 du plugin, le changement de rang 1v1 (Or 5 → Platine 0…) est de nouveau notifié, par les notifications de plugin (voir `notices`).

## Plugin fourni : TikTok (profil public)

`examples/tiktok-profile-1.0.0.wdsh` suit un profil TikTok public (abonnés, abonnements, likes reçus, vidéos, amis) en lisant sa page publique, sans compte ni clé, une fois par heure. Permission réseau : `www.tiktok.com` seulement. Ce n'est pas une API officielle : la lecture peut cesser si TikTok change sa page, et elle n'est pas prévue par ses conditions d'utilisation. En cas de changement, le plugin affiche une erreur au lieu de chiffres faux.

## Plugin fourni : Discord (serveurs)

`examples/discord-server-1.2.4.wdsh` suit des serveurs Discord avec l'API officielle (permission réseau : `discord.com` seulement). Trois façons de l'utiliser :

- **Tous les serveurs d'un bot** : laisse l'invitation et l'ID vides, puis enregistre le jeton du bot dans les clés du plugin. Le compte liste chaque serveur où le bot est présent (membres, en ligne, messages du jour et des 7 jours, dernier message) ; un clic ouvre le détail du serveur (salons, membres les plus actifs, messages par jour). Jusqu'à 45 serveurs suivis en détail.
- **Un seul serveur** : jeton du bot + ID du serveur ; la liste montre alors ses salons.
- **Sans bot** : un lien d'invitation permanent donne membres, membres en ligne, part en ligne et boosts. Vérifié sur le serveur officiel Brawlhalla.

Pour le bot : Discord Developer Portal › New Application › Bot › Reset Token, puis l'inviter sur chaque serveur (OAuth2 › URL Generator › `bot`, permissions « Voir les salons » et « Lire l'historique des messages »). Le jeton est enregistré chiffré par WaveDash et partagé par les comptes de ce plugin.

Les messages sont comptés au fil de l'eau : au premier passage, les 100 derniers de chaque salon (dans la limite de 7 jours), ensuite tous les nouveaux. Leur contenu n'est ni lu ni gardé, et les messages des bots ne comptent pas. Au plus 26 requêtes par exécution : salons et serveurs sont lus à tour de rôle, et WaveDash relance le plugin tant qu'il reste du retard. Le mode bot a été vérifié sur une API Discord simulée (3 serveurs, salon interdit, 150 nouveaux messages), puis sur un vrai serveur (269 membres, 30 salons, 2 boosts). Un salon sans aucun message ne compte plus comme « en retard » (1.2.4) : avant, il faisait relancer le plugin toutes les 5 s.

Le plugin ne lit jamais l'application Discord de l'ordinateur ni un compte personnel (un « selfbot » est interdit par Discord).

## Pas encore disponible

Paliers sur les rangs et les durées.
