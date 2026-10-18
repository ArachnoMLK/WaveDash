# MiniaMaker 1.3.0 — inventaire des outils (référence pour le Studio)

Relevé le 18/10/2026 sur l'application installée (Tauri, `%LOCALAPPDATA%\MiniaMaker`). Sert de cahier des charges pour l'éditeur de miniatures du Studio Brawlhalla de WaveDash.

## Interface
- Barre du haut : Fichier (Nouveau, Ouvrir Ctrl+O, Enregistrer Ctrl+S, Enregistrer sous Ctrl+Maj+S, Exporter l'image Ctrl+E), annuler / rétablir, **Templates**, **Styles**, nom du projet, version du jeu détectée, aide `?`, Enregistrer, **Exporter**.
- Barre d'outils par groupes : PERSOS (Mon perso, Persos ▾) · TEXTES (Texte, Tag) · FOND (Fond ▾) · EFFETS (Effet, Lumière ▾, Vitesse) · ÉLÉMENTS (Bannière, Flèche, Plus ▾).
- Gauche : **Calques** (œil, cadenas, monter / descendre, premier / dernier plan, dupliquer, supprimer ; Ctrl+clic ajouter, Maj+clic plage, Ctrl+A tout) ; **Packs persos** (import).
- Centre : artboard 1280×720 (export 1080p), poignées (déplacer, redimensionner, rotation), zoom (– 70 % +, ajuster).
- Sous le canvas, **timeline du perso sélectionné** : catégorie d'animations (Écran de sélection, Arc, Marteau, Mains nues, Emotes…), filtre, liste des animations avec leur nombre d'images ; |◀ ◀ ▶/❚❚ ▶| ▶|, compteur « 16 / 39 », vitesse (24 i/s), **Boucle**, barre de défilement, **bande de vignettes numérotées** (clic = image affichée).
- Droite : onglet du calque sélectionné + onglet **Projet**.

## Perso (calque)
- Légende, Skin, Couleur (palette), Pose (animation · image n/N), **Pose aléatoire**.
- Skin de chaque arme (« Arme du skin (Pew Pew) »…), Émotion, Yeux, Bouche, Podium + « Mettre un podium sous le perso ».
- Masquer les effets d'attaque (FX) ; Équipe (Héros cyan / Adversaire / Neutre) → style perso (outline blanc 4 px + glow d'équipe).
- Transformation : X, Y, Échelle X/Y, Rotation, Opacité, Flip H / Flip V, Centrer.
- Effets (valeurs à 720p) : affecté par l'étalonnage du projet ; **Contour** (couleur, pipette, épaisseur, douceur, opacité, 2ᵉ contour) ; **Glow** extérieur / intérieur (couleur, taille, intensité, étalement, opacité) ; **Ombre portée** (flou, décalage Y, opacité) ; Flou ; **Flou de mouvement** (traînée / directionnel, direction, distance) ; **Dégâts** (perso qui encaisse un coup) ; Ajustements couleur.
- **Gomme** : Gommer / Restaurer, taille, bord doux, annuler le dernier trait, tout restaurer.

## Banque d'assets (B)
- Onglets : **Légendes** · **Fonds de map** · **Éléments de map** · **Icônes** · **Splash arts** ; langue des noms ; dossier du jeu, 70 légendes · 795 skins · 64 palettes.
- Légendes : liste avec portrait et nombre de skins ; grille des skins (tête) ; **palettes** (pastilles 2 couleurs : Défaut, Red… Esports v.7, Blood Moon…) ; aperçu animé ; catégories d'animations avec compteurs ; filtre (« ★, Ground, Recovery, Dance… ») ; raccourcis ★ NSig / SSig / DSig / Sig (atterrissage) / NLight… ; masquer FX ; curseur d'image ; skins d'armes ; **Ajouter au canvas** ; « Enregistrer dans Persos (hors ligne) ».
- Fonds de map : vignettes BG_* (Actuelles / Originales, filtre).
- Éléments de map : par map (liste à gauche), pièces détourées (plateformes, branches, buissons…).
- Icônes : Armes (18, dont silhouettes), Portraits carrés (70), Portraits détourés (70), Skins (781).
- Splash arts.

## Effets du jeu (E)
- 1 202 effets classés : Impacts 132 · Explosions et KO 89 · Feu 67 · Électricité et énergie 62 · Eau, glace, neige 44 · Fumée et poussière 99 · Slashes et traînées 71 · Signatures des légendes 318 · Décors de maps 150 · Autres 170.
- Noms lisibles (« Hit React Blaster 01 ») + catégorie ; survol = animation ; Maj+clic = ajouter sans fermer ; inventaire mis en cache jusqu'à la mise à jour du jeu.

## Autres outils
- **Texte** : texte multiligne, style (Sticker 3D (Ranked)…), police (Lilita One, Anton, Luckiest Guy, Montserrat), taille, espacement, interligne, alignement, remplissage Uni / Dégradé / Texture, couleur, `*mots*` en couleur, effet glitch, **Contours et extrusion** (contour intérieur, extrusion + angle, contour extérieur).
- **Tag** (pseudo) : équipe (couleur), taille, contour, glow, police, couleur du texte, flèche (aucune / ▼ ▲ ◀ ▶) + taille, Incliné −10° / Vertical / Droit.
- **Lumière** : Contre-jour chaud, Néon cyan, Rage rouge, Aura violette, Projecteur, Rayons divins, Éclat (flare).
- **Vitesse** (lignes de vitesse) : nombre, couleur, fondu, intensité, focus X/Y (cible déplaçable), centrer sur le perso, zone vide, longueur max, épaisseur max, nouveau tirage.
- **Bannière classée** : rang (Valhallan…), ELO / Placements (10 matchs), texte, valeur (????, 2900, 3000, #1), couleur, flou, globe (classement mondial), texte incrusté, ombre et lumière, encart sombre, version HD, bleu profond, géante coupée à droite / taille normale, largeur.
- **Flèche** : couleur, longueur, courbure, épaisseur, pointe, contour, inverser la courbe, « Rouge YouTube ».
- **Plus** : Rectangle, Parallélogramme, Bandeau pointu ; Rang : Emblème Valhallan (casque ailé), Icône de rang Valhallan ; Image (ou glisser sur le canvas).
- **Fond** : map au hasard (F), choisir une map (banque), image de fond ; version des maps Actuelles / Originales.

## Projet
- Artboard 1280×720 (export 1080p), couleur de fond.
- **Inclinaison de la scène** (−7°, droite, +7° : penche fond, sol, persos et tags ensemble).
- **Étalonnage** (mode, vignette) ; **Filtres** cumulables + préréglages.

## Templates (T)
Bannière ELO · Game de placement · Placement (perso + bannière) · Perso + gros titre · VS · Ranked · Pro Player · 1 contre 3 · Le coup (kill) · 2v2…
Paramètres : ton perso (légende, skin, palette), ton tag, bannière (rang, valeur, titre `*mot*` en rouge, flèche « ME »), fond (actuelles / originales, scène inclinée, sol de la map sous les persos), pose (attaque signature ★ dynamique), style. « Générer » remplace le projet (Ctrl+Z pour revenir).

## Styles (Y)
Fezaru ★ · Fezaru Orange · Néon · Glace · Feu · Synthwave · Noir & blanc + accent…
Appliquer : couleurs d'équipe (héros / adversaire / neutre), persos (outline, glow, ajustements couleur), name tags (contour, glow), titres (style Sticker 3D, police, couleur, dégradé vertical), étalonnage + vignette. Dupliquer, exporter, « défaut des templates ».

## Export
Nom ; PNG (sans perte) / JPG / WebP ; 1280×720 ou 1920×1080 ; qualité ; rester sous 2 Mo (limite YouTube) ; taille estimée.

## Raccourcis
T Templates · Y Styles · B Banque · E Effets · L Lumière · A Flèche · F Fond au hasard · Ctrl+Z/Y · Ctrl+C/X/V (aussi entre projets, colle une image) · Ctrl+D dupliquer · Suppr · flèches (Maj : 10 px) · [ ] ordre des calques · G gomme · double-clic éditer un texte · Ctrl/Maj+clic sélection · glisser dans le vide = rectangle · Ctrl+A · Échap · Maj (axe) · Alt (sans magnétisme / coin libre) · Maj rotation 15° · molette zoom · Espace+glisser · Ctrl+0 ajuster · `,` / `.` image précédente / suivante · K lire / pause.

## À ajouter dans le Studio (demandes en plus de MiniaMaker)
- **Colorimétrie** : réglages par calque et pour tout le projet — température, teinte, exposition, contraste, saturation / vibrance, ombres / tons moyens / hautes lumières (roues de couleur), courbes RVB, LUT (.cube) et préréglages, avant / après.
- Sélection d'images dans la bande de la timeline (Ctrl+clic, Maj+clic, Ctrl+A) pour n'exporter que ces images.
