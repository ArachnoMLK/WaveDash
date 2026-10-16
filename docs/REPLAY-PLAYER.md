# Lecteur « vidéo » des replays Brawlhalla — étude de faisabilité

> Étude du 16/10/2026, patch installé 11.00. Aucun code livré dans WaveDash.
> **[V]** = vérifié pendant l'étude (fichier lu, code lu, commande exécutée).
> **[H]** = hypothèse ou déduction, pas encore vérifiée.

## En bref

Un `.replay` ne contient que les **inputs** des joueurs, pas les positions. Le lecteur du jeu
ne lit pas une vidéo : il **re-simule toute la partie** avec le moteur complet. Pour obtenir
une vraie vue « vidéo » hors du jeu, il faut réécrire ce moteur (physique, collisions, ~2 Mo
de définitions d'attaques, états de combat, objets, modes) à l'identique, à chaque patch.
Personne n'y est arrivé publiquement : le projet le plus avancé ne reproduit à ce jour que
le saut au sol.

**Recommandation :**

1. Faire maintenant (2–4 jours) : une **frise enrichie** à partir des inputs et des KOs, plus
   la **carte réelle en image statique** (plateformes, zones de KO), sans personnages animés.
2. Ne pas lancer de simulateur. Surveiller `NickTacke/brawlhalla-sim`, et réévaluer s'il
   publie un jour une simulation validée sur un corpus de replays.

Une vue 2D des positions qui « ressemble » au replay mais se trompe n'apporte rien : un
seul écart d'une frame au début fausse toute la suite de la partie.

---

## 1. Méthodes classiques : l'existant open source

| Projet | Ce qu'il fait | Utile pour un lecteur ? |
|---|---|---|
| [NickTacke/brawlhalla-sim](https://github.com/NickTacke/brawlhalla-sim) (TS, MIT, pré-alpha, août 2026) | Seule tentative publique de **simulation déterministe** à partir des inputs. Lit les replays 264/268. | Son README le dit : *not a replay-accurate engine yet*. Seule la chaîne du **saut au sol** est prouvée (impulsion −57, gravité 3,75, pas de 16 ms) sur le patch **10.09**. Collisions, combat, respawn, dash, dodge : non faits ou provisoires. **[V]** |
| [allhailcheese/WallyAnmRenderer](https://github.com/allhailcheese/WallyAnmRenderer) + BrawlhallaAnimLib + WallyAnmSpinzor (C#, MIT) | Rend **n'importe quelle animation** `.anm` avec skins, couleurs et armes ; export PNG/SVG/GIF. | Oui pour le **dessin** d'un personnage dans une pose donnée. Mais il ne sait pas **quelle** animation jouer ni à quel moment : c'est l'état de combat simulé qui le décide. Le README garde comme fonction à venir « *correct timing for attack animations (harder than it sounds)* ». **[V]** |
| [moffel1020/WallyMapEditor](https://github.com/moffel1020/WallyMapEditor) + WallyMapSpinzor2 (C#, MIT) | Lit et rend les **cartes** (LevelDesc XML, assets, collisions, spawns). | Oui pour le **fond de carte** et la géométrie de collision. **[V]** |
| [allhailcheese/BrawlhallaReplayLibrary](https://github.com/allhailcheese/BrawlhallaReplayLibrary) (+ CLI, NameHider) | Lit et réécrit les `.replay` (format 10.09+). Le plugin WaveDash s'en inspire déjà pour le checksum. | Lecture seulement, pas de simulation. **[V]** |
| [allhailcheese/BrawlhallaDeobfuscate](https://github.com/allhailcheese/BrawlhallaDeobfuscate) | Classes AS3 copiées depuis JPEXS, renommées à la main, de 7.12 à 10.08 : *replay reader/writer/manager*, *collision manager*, *ActivePower*, *PowerType*, *hurtbox*… | Bonne carte d'orientation dans le code. Ce n'est qu'une collection de fichiers décompilés (statut juridique : voir §4), pas un moteur. **[V]** |
| itselectroz/brawlhalla-replay-reader, Talafhah1/BrawlhallaReplayReader, Anton1P/Workspace-BRAT, sirgladshoes/improveBH | Parseurs et outils d'analyse (stats, habitudes d'inputs). | Pas de rendu de partie. BRAT annonce des « true combos / frame data », sans doute déduits des inputs : pas de simulation dans le README. **[V]** pour les README, **[H]** pour la méthode de BRAT. |
| bhswz-rs, BrawlhallaSwz, npm `brawlhalla-swz` | Déchiffrement des `.swz`. | Donne accès aux données de jeu (§2). **[V]** |

À éviter : la recherche « brawlhalla hitbox » renvoie surtout des dépôts de **triche**
(« ESP, speed hack, hitbox visualizer… »). Ce sont probablement des malwares, et il ne
faut pas s'en servir comme source. **[V]** pour leur présence, **[H]** pour leur nature.

**Conclusion §1** : le **rendu** est résolu par la communauté (cartes et animations, en C#).
La **simulation** (savoir où sont les joueurs et ce qu'ils font à chaque frame) ne l'est pas.

## 2. Rétro-ingénierie : ce que le jeu utilise pour le lecteur

Tout a été lu en **lecture seule** dans le dossier du jeu. Les sorties sont dans le
scratchpad de la session, hors du dépôt. Aucun exécutable n'a été téléchargé ni lancé.

### 2.1 Le code : `BrawlhallaAir.swf` (Adobe AIR 51, 64 bits)

- SWF compressé zlib (`CWS`, v43) avec 12 blocs DoABC. L'un d'eux fait **4,03 Mo** et contient
  tout le jeu (SHA-256 `7d308423…6db9` pour le patch 11.00). **[V]**
- Il n'est **pas chiffré**, mais il est **obfusqué** : on compte environ 25 600 identifiants du type
  `_-y2E`, `_-V4R`. Les noms changent à chaque patch : brawlhalla-sim cite des classes
  différentes pour la 10.09. **[V]**
- Le source d'origine est du **Haxe** (54 fichiers `*.hx` cités dans les messages d'erreur :
  `Game`, `Camera`, `CollisionObject`, `PowerType`, `HurtboxType`, `RulesManager`…). **[V]**
- Le lecteur de replay est **dans ce même code** : chaînes `REPLAY_MODE_REWIND_*`,
  `REPLAY_MODE_FASTFORWARD_*`, `SLOWMO_*`, `UI_ReplayPlayback_*`, `Error in reading replay`,
  `replayVer=`. On y trouve aussi tout le netcode **rollback** (`Rollback`,
  `RollbackFromInput`, `ForcedRollbacks`, `PostRollback`). **[V]**
  - Déduction **[H]** (forte) : un netcode rollback impose une simulation **déterministe** qui
    sait sauvegarder et restaurer son état. Le lecteur utilise ce même mécanisme : il rejoue
    les inputs dans le vrai moteur, et le retour arrière se fait par snapshots et re-simulation.
    Il n'existe donc **aucun fichier séparé** propre au lecteur.
- `UI_Replays.swf` ne contient que l'interface (menus). **[V]** pour sa présence, **[H]** pour son contenu (non décompilé).
- Avantage possible **[H]** : AS3 calcule en `Number` (double IEEE-754), comme JavaScript.
  Un portage JS fidèle peut donc en théorie être exact au bit près. Exceptions : `Math.sin/cos`,
  dont les résultats dépendent de l'implémentation, et les conversions int/uint.

### 2.2 Les données : archives `.swz`

La clé **154281100** est **vérifiée** sur les 4 archives : le checksum de clé est valide et
les 273 fichiers se décompressent sans erreur. Déchiffrement fait par un script Python
écrit pour l'étude (portage de bhswz-rs, sans bibliothèque téléchargée). **[V]**

| Archive | Contenu utile au lecteur |
|---|---|
| `Dynamic.swz` (188 fichiers) | Une **`LevelDesc` par carte** : `CameraBounds`, `HardCollision`, `SoftCollision`, `Bouncy*Collision`, `Respawn`, `ItemSpawn`, plateformes et assets. Permet de **dessiner la carte exacte**. **[V]** |
| `Init.swz` | `LevelTypes` (328 `LevelID` → nom, zones de KO `LeftKill/RightKill/TopKill/BottomKill`), `AnimTypes`, `BoneTypes`, `BoneSources`. **[V]** |
| `Game.swz` | `powerTypes` (**1,9 Mo**, environ 180 colonnes par attaque : `CastTime`, `RecoverTime`, `BaseDamage`, `FixedImpulse`, `VariableImpulse`, `CastImpulseX/Y`, `CancelGravity`, combos…), `hurtboxTypes`, `HeroTypes` (stats Force/Dex/Défense/Vitesse, armes, signatures), `DodgeTypes`, `itemTypes`, `GameModeTypes`, `ScoringTypes`. **[V]** |
| `Engine.swz` | `MasterFileList`, langues. **[V]** |

Ce qui **manque** dans les données : `HeroTypes` ne donne que les 4 stats. Vitesse de course,
friction, accélération, gravité et impulsions de saut sont **calculées dans le code**
obfusqué. Le fichier de test de brawlhalla-sim les passe d'ailleurs en paramètre, avec des
valeurs provisoires. **[V]**

### 2.3 Le rendu : `anims/*.anm`, `bones/Bones_*.swf`, `Gfx_*.swf`, `mapArt/`

- 105 `.anm` (42 Mo), 112 `Bones_*.swf` (125 Mo), 372 `Gfx_*.swf`, `mapArt` (248 Mo). **[V]**
- Ce sont les squelettes, les animations et les sprites vectoriels lus par WallyAnmRenderer.
  Ils ne servent qu'à l'**affichage** et ne contiennent aucune logique de partie. **[V]** pour les
  fichiers, **[H]** pour l'absence de logique (déduite du rôle de WallyAnmRenderer).
- Les **hitboxes d'attaque** sont probablement des formes dans les animations, combinées à
  `powerTypes` (`AoERadius*`, `CenterOffset*`). Elles sont liées au moteur de combat. **[H]**

### 2.4 Ce que le plugin WaveDash a déjà

`levelId`, `HeroID`, les inputs (horodatage et 14 bits de touches) et les KOs horodatés.
Avec `LevelTypes` → `LevelDesc`, on peut déjà **afficher la vraie carte** d'un replay. **[V]**
pour la correspondance des champs, **[H]** pour la couverture de toutes les cartes.

## 3. Ce qu'il faudrait pour une vraie vue « vidéo »

Chaîne complète : inputs → **moteur déterministe** (déplacements, dash, dodge, saut mural,
gravity cancel, collisions de plateformes, plus de 1 000 `powers` avec leurs combos, hitboxes
et hurtboxes, dégâts, knockback, stun, armes ramassées et lancées, objets, respawn,
invulnérabilité, règles de mode) → positions et état d'animation à chaque tick → rendu
(cartes et `.anm`).

| Option | Résultat | Effort estimé **[H]** | Risque |
|---|---|---|---|
| **A. Frise enrichie + carte statique** | Image de la vraie carte, légendes, frise des KOs et des inputs (sauts, dodges, attaques légères/lourdes, directions), vitesse de lecture et navigation entre KOs. Pas de positions. | **2–4 jours** (parser `LevelDesc` dans le plugin et le dessiner en SVG, frise synchronisée) | Faible. Seulement des données déjà lues ou des fichiers de configuration. Mais il faut déchiffrer les `.swz` sur la machine de l'utilisateur (clé à retrouver à chaque patch), ou livrer une table de cartes générée (voir §4). |
| **B. Vue 2D « schématique » approximative** | Points qui bougent selon une physique approchée. | 3–6 semaines | **Élevé, et sans intérêt** : sans combat ni knockback exacts, les trajectoires divergent en quelques secondes. Les points deviennent faux tout en ayant l'air plausibles. **Déconseillé.** |
| **C. Simulateur exact (vue 2D fidèle)** | Positions exactes, puis un rendu comme le jeu (avec les bibliothèques Wally, portées ou en processus annexe). | **6 à 18 mois à temps plein** pour une personne expérimentée en rétro-ingénierie AS3, plus **plusieurs jours par patch** (noms obfusqués qui changent, équilibrages). | Très élevé. Il faut une équivalence exacte à chaque tick : sans vérité de référence dans le fichier, on ne valide que sur le résultat final (KOs et scores). brawlhalla-sim y travaille depuis des mois et n'a que le saut. Risque juridique (§4). |
| **D. Piloter le vrai jeu** | Ouvrir le replay dans Brawlhalla (copie dans le dossier des replays) et laisser le jeu l'afficher, éventuellement capturé par OBS. | 1–3 jours | Pas d'intégration dans WaveDash : rendu externe, jeu requis et seulement pour la **même version de patch**. Rejouer un replay est une fonction prévue par le jeu, donc aucun problème de conditions d'utilisation (**[H]**). |

## 4. Risques : conditions d'utilisation et légal

- Les conditions d'utilisation de Brawlhalla et d'Ubisoft n'ont **pas été lues** pendant cette
  étude : la recherche ne les a pas trouvées. Les CGU des grands éditeurs interdisent en
  général décompilation et rétro-ingénierie, et un tribunal américain a déjà jugé une telle
  clause opposable (affaire bnetd/Blizzard). **[H]** pour Brawlhalla, à vérifier sur le texte officiel.
- Droit de l'UE (directive 2009/24, art. 6) : la décompilation est tolérée sous conditions
  strictes **pour l'interopérabilité**. Un simulateur concurrent du moteur va probablement
  au-delà. **[H]**, pas un avis juridique.
- Distribution : ne **jamais** livrer de code décompilé, de `.swz` déchiffrés ni d'assets du jeu
  dans WaveDash. La pratique de la communauté (Wally, brawlhalla-sim) est de lire
  l'installation locale de l'utilisateur au moment de l'exécution. Une table « LevelID → segments
  de collision » générée est un dérivé des données : zone grise, plus sûre si elle est
  extraite localement. **[H]**
- Anti-triche : on ne touche pas au processus du jeu, on ne lit que des fichiers. Pas de risque
  identifié. **[H]**
- Maintenance : chaque patch change la clé `.swz` (suffixe = numéro de patch, retrouvé par
  force brute ou par le motif `ANE_RawData.Init` dans l'ABC, comme bhswz-rs), les noms
  obfusqués, le format de replay (versions 261 à 271 déjà vues) et l'équilibrage. **[V]** pour le
  mécanisme de la clé (lu dans `keyfinder.rs`), **[H]** pour la fréquence.

## 5. Prochaines étapes proposées (option A)

1. Ajouter au plugin un lecteur de `LevelDesc` (segments `*Collision`, `Respawn`,
   `CameraBounds`) et `LevelTypes` (`LevelID` → nom et zones de KO). La source reste à
   choisir : déchiffrement local des `.swz` (clé à trouver) ou table embarquée.
2. Écran de détail : SVG de la carte, et en dessous une frise par joueur (inputs regroupés en
   actions, KOs), avec lecture à vitesse variable.
3. Réévaluer l'option C si brawlhalla-sim annonce un jour la validation « ordered replay
   outcomes » sur un corpus de replays (étape 6 de sa feuille de route).

## Sources

- https://github.com/NickTacke/brawlhalla-sim (README, `docs/provenance.md`, `CONTEXT.md`, `docs/architecture.md`, `packages/core/tests/replay-verify.test.ts`)
- https://github.com/allhailcheese/WallyAnmRenderer, https://github.com/allhailcheese/BrawlhallaAnimLib
- https://github.com/moffel1020/WallyMapEditor
- https://github.com/allhailcheese/BrawlhallaReplayLibrary
- https://github.com/allhailcheese/BrawlhallaDeobfuscate (arborescence)
- https://github.com/allhailcheese/bhswz-rs (`swz_random.rs`, `swz_reader.rs`, `swz_utils.rs`, `keyfinder.rs`)
- https://github.com/itselectroz/brawlhalla-replay-reader, https://github.com/Talafhah1/BrawlhallaReplayReader, https://github.com/Anton1P/Workspace-BRAT
- https://www.pinsentmasons.com/out-law/news/battlenet-emulator-broke-dmca-and-eula (bnetd/Blizzard)
- Dossier local du jeu : `BrawlhallaAir.swf`, `Init/Game/Dynamic/Engine.swz`, `anims/`, `bones/`, `META-INF/AIR/application.xml`
