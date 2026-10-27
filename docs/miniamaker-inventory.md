# MiniaMaker 1.3.0: tool inventory (reference for the Studio)

Surveyed on 2026-10-18 on the installed app (Tauri, `%LOCALAPPDATA%\MiniaMaker`). Serves as the specification for the thumbnail editor of the WaveDash Brawlhalla Studio.

## Interface
- Top bar: File (New, Open Ctrl+O, Save Ctrl+S, Save as Ctrl+Shift+S, Export image Ctrl+E), undo / redo, **Templates**, **Styles**, project name, detected game version, help `?`, Save, **Export**.
- Toolbar in groups: CHARACTERS (My character, Characters ▾) · TEXTS (Text, Tag) · BACKGROUND (Background ▾) · EFFECTS (Effect, Light ▾, Speed) · ELEMENTS (Banner, Arrow, More ▾).
- Left: **Layers** (eye, lock, up / down, front / back, duplicate, delete; Ctrl+click add, Shift+click range, Ctrl+A all); **Character packs** (import).
- Centre: 1280×720 artboard (1080p export), handles (move, resize, rotate), zoom (– 70 % +, fit).
- Under the canvas, the **timeline of the selected character**: animation category (Select screen, Bow, Hammer, Unarmed, Emotes…), filter, list of animations with their frame count; |◀ ◀ ▶/❚❚ ▶| ▶|, counter "16 / 39", speed (24 fps), **Loop**, scrub bar, **strip of numbered thumbnails** (click = frame shown).
- Right: tab of the selected layer + **Project** tab.

## Character (layer)
- Legend, Skin, Colour (palette), Pose (animation · frame n/N), **Random pose**.
- Skin of each weapon ("Skin weapon (Pew Pew)"…), Emotion, Eyes, Mouth, Podium + "Put a podium under the character".
- Hide attack effects (FX); Team (cyan Hero / Opponent / Neutral) → character style (4 px white outline + team glow).
- Transform: X, Y, Scale X/Y, Rotation, Opacity, Flip H / Flip V, Centre.
- Effects (values at 720p): affected by the project grading; **Stroke** (colour, eyedropper, width, softness, opacity, 2nd stroke); outer / inner **Glow** (colour, size, intensity, spread, opacity); **Drop shadow** (blur, Y offset, opacity); Blur; **Motion blur** (trail / directional, direction, distance); **Damage** (character taking a hit); Colour adjustments.
- **Eraser**: Erase / Restore, size, soft edge, undo the last stroke, restore all.

## Asset bank (B)
- Tabs: **Legends** · **Map backgrounds** · **Map elements** · **Icons** · **Splash arts**; language of the names; game folder, 70 legends · 795 skins · 64 palettes.
- Legends: list with portrait and skin count; skin grid (head); **palettes** (2-colour swatches: Default, Red… Esports v.7, Blood Moon…); animated preview; animation categories with counters; filter ("★, Ground, Recovery, Dance…"); shortcuts ★ NSig / SSig / DSig / Sig (landing) / NLight…; hide FX; frame slider; weapon skins; **Add to canvas**; "Save to Characters (offline)".
- Map backgrounds: BG_* thumbnails (Current / Original, filter).
- Map elements: per map (list on the left), cut-out pieces (platforms, branches, bushes…).
- Icons: Weapons (18, including silhouettes), Square portraits (70), Cut-out portraits (70), Skins (781).
- Splash arts.

## Game effects (E)
- 1,202 sorted effects: Impacts 132 · Explosions and KO 89 · Fire 67 · Electricity and energy 62 · Water, ice, snow 44 · Smoke and dust 99 · Slashes and trails 71 · Legend signatures 318 · Map decor 150 · Other 170.
- Readable names ("Hit React Blaster 01") + category; hover = animation; Shift+click = add without closing; inventory cached until the game updates.

## Other tools
- **Text**: multi-line text, style (3D Sticker (Ranked)…), font (Lilita One, Anton, Luckiest Guy, Montserrat), size, spacing, line height, alignment, Solid / Gradient / Texture fill, colour, `*words*` in colour, glitch effect, **Strokes and extrusion** (inner stroke, extrusion + angle, outer stroke).
- **Tag** (player name): team (colour), size, stroke, glow, font, text colour, arrow (none / ▼ ▲ ◀ ▶) + size, Tilted −10° / Vertical / Straight.
- **Light**: Warm backlight, Cyan neon, Red rage, Purple aura, Spotlight, God rays, Flare.
- **Speed** (speed lines): count, colour, fade, intensity, focus X/Y (movable target), centre on the character, empty zone, max length, max width, new draw.
- **Ranked banner**: rank (Valhallan…), ELO / Placements (10 matches), text, value (????, 2900, 3000, #1), colour, blur, globe (global rank), inset text, shadow and light, dark box, HD version, deep blue, giant cut on the right / normal size, width.
- **Arrow**: colour, length, curvature, width, tip, stroke, reverse the curve, "YouTube red".
- **More**: Rectangle, Parallelogram, Pointed banner; Rank: Valhallan emblem (winged helmet), Valhallan rank icon; Image (or drag onto the canvas).
- **Background**: random map (F), pick a map (bank), background image; Current / Original map versions.

## Project
- 1280×720 artboard (1080p export), background colour.
- **Scene tilt** (−7°, straight, +7°: tilts background, floor, characters and tags together).
- **Grading** (mode, vignette); stackable **Filters** + presets.

## Templates (T)
ELO banner · Placement game · Placement (character + banner) · Character + big title · VS · Ranked · Pro Player · 1 vs 3 · The hit (kill) · 2v2…
Settings: your character (legend, skin, palette), your tag, banner (rank, value, title `*word*` in red, "ME" arrow), background (current / original, tilted scene, map floor under the characters), pose (dynamic ★ signature attack), style. "Generate" replaces the project (Ctrl+Z to go back).

## Styles (Y)
Fezaru ★ · Fezaru Orange · Neon · Ice · Fire · Synthwave · Black & white + accent…
Apply: team colours (hero / opponent / neutral), characters (outline, glow, colour adjustments), name tags (stroke, glow), titles (3D Sticker style, font, colour, vertical gradient), grading + vignette. Duplicate, export, "template default".

## Export
Name; PNG (lossless) / JPG / WebP; 1280×720 or 1920×1080; quality; stay under 2 MB (YouTube limit); estimated size.

## Shortcuts
T Templates · Y Styles · B Bank · E Effects · L Light · A Arrow · F Random background · Ctrl+Z/Y · Ctrl+C/X/V (also across projects, pastes an image) · Ctrl+D duplicate · Del · arrows (Shift: 10 px) · [ ] layer order · G eraser · double-click to edit a text · Ctrl/Shift+click selection · drag in empty space = rectangle · Ctrl+A · Esc · Shift (axis) · Alt (no snapping / free corner) · Shift rotation 15° · wheel zoom · Space+drag · Ctrl+0 fit · `,` / `.` previous / next frame · K play / pause.

## To add in the Studio (requests beyond MiniaMaker)
- **Colour grading**: settings per layer and for the whole project — temperature, tint, exposure, contrast, saturation / vibrance, shadows / midtones / highlights (colour wheels), RGB curves, LUT (.cube) and presets, before / after.
- Frame selection in the timeline strip (Ctrl+click, Shift+click, Ctrl+A) to export only those frames.
