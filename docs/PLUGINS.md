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
      history: [{ ts: 1700000000000, metrics: { temperature: 12 } }]                    // facultatif : points passés, 5000 max
    }
  }
}
```

`ctx` contient : `inputs` (valeurs saisies), `secrets` (vos clés, déchiffrées), `lang` (`fr` ou `en`), `account` (`{ externalId, displayName }`, dans `refresh`).

**Tout ce qui n'est pas déclaré dans le manifeste est ignoré** : métriques inconnues, colonnes inconnues, valeurs non numériques, horodatages absurdes.

### L'objet `host` : tout ce que le plugin peut faire

| Fonction | Rôle |
|---|---|
| `await host.http(url, { method, headers, body })` | Requête HTTPS vers un domaine déclaré. Renvoie `{ status, ok, headers, text, json() }`. |
| `host.log(...)` / `console.log(...)` | Journal visible dans la page du plugin (100 lignes max). |
| `host.storage.get(clé)` / `.set(clé, texte)` | Mémoire persistante par compte (100 clés, 64 Ko par valeur) : utile pour ne retraiter que les nouveautés. |
| `host.files.list()` | Fichiers du dossier choisi : `[{ name, size, mtime }]` (permission `folder`). |
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

## Pas encore disponible

Paliers et notifications pour les métriques de plugins, intégration à la vue d'ensemble, rapport PDF.
