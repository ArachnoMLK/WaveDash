# Brawlhalla replay "video" player: feasibility study

> Study from 2026-10-16, installed patch 11.00. No code shipped in WaveDash.
> **[V]** = verified during the study (file read, code read, command run).
> **[H]** = hypothesis or deduction, not verified yet.

## In short

A `.replay` only holds the players' **inputs**, not their positions. The game's player
does not play a video: it **re-simulates the whole game** with the full engine. Getting
a real "video" view outside the game means rewriting that engine (physics, collisions, ~2 MB
of attack definitions, combat states, items, modes) identically, for every patch.
Nobody has publicly managed it: the most advanced project only reproduces the ground jump
so far.

**Recommendation:**

1. Do now (2–4 days): an **enriched timeline** from the inputs and KOs, plus
   the **real map as a static image** (platforms, KO zones), without animated characters.
2. Do not start a simulator. Watch `NickTacke/brawlhalla-sim`, and reassess if it
   ever publishes a simulation validated on a corpus of replays.

A 2D view of positions that "looks like" the replay but is wrong adds nothing: a
single one-frame gap at the start skews the rest of the game.

---

## 1. Classic methods: existing open source

| Project | What it does | Useful for a player? |
|---|---|---|
| [NickTacke/brawlhalla-sim](https://github.com/NickTacke/brawlhalla-sim) (TS, MIT, pre-alpha, August 2026) | The only public attempt at a **deterministic simulation** from the inputs. Reads replays 264/268. | Its README says so: *not a replay-accurate engine yet*. Only the **ground jump** chain is proven (impulse −57, gravity 3.75, 16 ms step) on patch **10.09**. Collisions, combat, respawn, dash, dodge: not done or provisional. **[V]** |
| [allhailcheese/WallyAnmRenderer](https://github.com/allhailcheese/WallyAnmRenderer) + BrawlhallaAnimLib + WallyAnmSpinzor (C#, MIT) | Renders **any** `.anm` **animation** with skins, colours and weapons; PNG/SVG/GIF export. | Yes for **drawing** a character in a given pose. But it does not know **which** animation to play or when: the simulated combat state decides that. The README keeps as an upcoming feature "*correct timing for attack animations (harder than it sounds)*". **[V]** |
| [moffel1020/WallyMapEditor](https://github.com/moffel1020/WallyMapEditor) + WallyMapSpinzor2 (C#, MIT) | Reads and renders **maps** (LevelDesc XML, assets, collisions, spawns). | Yes for the **map background** and the collision geometry. **[V]** |
| [allhailcheese/BrawlhallaReplayLibrary](https://github.com/allhailcheese/BrawlhallaReplayLibrary) (+ CLI, NameHider) | Reads and rewrites `.replay` files (format 10.09+). The WaveDash plugin already follows it for the checksum. | Reading only, no simulation. **[V]** |
| [allhailcheese/BrawlhallaDeobfuscate](https://github.com/allhailcheese/BrawlhallaDeobfuscate) | AS3 classes copied from JPEXS, renamed by hand, from 7.12 to 10.08: *replay reader/writer/manager*, *collision manager*, *ActivePower*, *PowerType*, *hurtbox*… | A good map for finding your way in the code. It is only a collection of decompiled files (legal status: see §4), not an engine. **[V]** |
| itselectroz/brawlhalla-replay-reader, Talafhah1/BrawlhallaReplayReader, Anton1P/Workspace-BRAT, sirgladshoes/improveBH | Parsers and analysis tools (stats, input habits). | No game rendering. BRAT advertises "true combos / frame data", probably deduced from the inputs: no simulation in the README. **[V]** for the READMEs, **[H]** for BRAT's method. |
| bhswz-rs, BrawlhallaSwz, npm `brawlhalla-swz` | Decryption of `.swz` files. | Gives access to the game data (§2). **[V]** |

Avoid: searching "brawlhalla hitbox" mostly returns **cheat** repositories
("ESP, speed hack, hitbox visualizer…"). They are probably malware and must not
be used as a source. **[V]** for their presence, **[H]** for their nature.

**Conclusion §1**: **rendering** is solved by the community (maps and animations, in C#).
**Simulation** (knowing where the players are and what they do on every frame) is not.

## 2. Reverse engineering: what the game uses for its player

Everything was read **read-only** in the game folder. Outputs are in the session
scratchpad, outside the repository. No executable was downloaded or run.

### 2.1 The code: `BrawlhallaAir.swf` (Adobe AIR 51, 64-bit)

- zlib-compressed SWF (`CWS`, v43) with 12 DoABC blocks. One of them is **4.03 MB** and holds
  the whole game (SHA-256 `7d308423…6db9` for patch 11.00). **[V]**
- It is **not encrypted**, but it is **obfuscated**: about 25,600 identifiers like
  `_-y2E`, `_-V4R`. The names change with every patch: brawlhalla-sim quotes different
  classes for 10.09. **[V]**
- The original source is **Haxe** (54 `*.hx` files quoted in error messages:
  `Game`, `Camera`, `CollisionObject`, `PowerType`, `HurtboxType`, `RulesManager`…). **[V]**
- The replay player is **in this same code**: strings `REPLAY_MODE_REWIND_*`,
  `REPLAY_MODE_FASTFORWARD_*`, `SLOWMO_*`, `UI_ReplayPlayback_*`, `Error in reading replay`,
  `replayVer=`. All the **rollback** netcode is there too (`Rollback`,
  `RollbackFromInput`, `ForcedRollbacks`, `PostRollback`). **[V]**
  - Deduction **[H]** (strong): rollback netcode requires a **deterministic** simulation that
    can save and restore its state. The player uses that same mechanism: it replays
    the inputs in the real engine, and rewinding works through snapshots and re-simulation.
    So there is **no separate file** specific to the player.
- `UI_Replays.swf` only holds the interface (menus). **[V]** for its presence, **[H]** for its content (not decompiled).
- Possible advantage **[H]**: AS3 computes with `Number` (IEEE-754 double), like JavaScript.
  A faithful JS port could in theory be bit-exact. Exceptions: `Math.sin/cos`,
  whose results depend on the implementation, and int/uint conversions.

### 2.2 The data: `.swz` archives

The key **154281100** is **verified** on all 4 archives: the key checksum is valid and
the 273 files decompress without errors. Decryption done by a Python script
written for the study (port of bhswz-rs, no downloaded library). **[V]**

| Archive | Content useful for the player |
|---|---|
| `Dynamic.swz` (188 files) | One **`LevelDesc` per map**: `CameraBounds`, `HardCollision`, `SoftCollision`, `Bouncy*Collision`, `Respawn`, `ItemSpawn`, platforms and assets. Enough to **draw the exact map**. **[V]** |
| `Init.swz` | `LevelTypes` (328 `LevelID` → name, KO zones `LeftKill/RightKill/TopKill/BottomKill`), `AnimTypes`, `BoneTypes`, `BoneSources`. **[V]** |
| `Game.swz` | `powerTypes` (**1.9 MB**, about 180 columns per attack: `CastTime`, `RecoverTime`, `BaseDamage`, `FixedImpulse`, `VariableImpulse`, `CastImpulseX/Y`, `CancelGravity`, combos…), `hurtboxTypes`, `HeroTypes` (Strength/Dexterity/Defense/Speed stats, weapons, signatures), `DodgeTypes`, `itemTypes`, `GameModeTypes`, `ScoringTypes`. **[V]** |
| `Engine.swz` | `MasterFileList`, languages. **[V]** |

What is **missing** from the data: `HeroTypes` only gives the 4 stats. Run speed,
friction, acceleration, gravity and jump impulses are **computed in the obfuscated
code**. brawlhalla-sim's test file passes them as parameters, with
provisional values. **[V]**

### 2.3 Rendering: `anims/*.anm`, `bones/Bones_*.swf`, `Gfx_*.swf`, `mapArt/`

- 105 `.anm` (42 MB), 112 `Bones_*.swf` (125 MB), 372 `Gfx_*.swf`, `mapArt` (248 MB). **[V]**
- These are the skeletons, animations and vector sprites read by WallyAnmRenderer.
  They are only used for **display** and hold no game logic. **[V]** for the
  files, **[H]** for the absence of logic (deduced from WallyAnmRenderer's role).
- **Attack hitboxes** are probably shapes in the animations, combined with
  `powerTypes` (`AoERadius*`, `CenterOffset*`). They are tied to the combat engine. **[H]**

### 2.4 What the WaveDash plugin already has

`levelId`, `HeroID`, the inputs (timestamp and 14 key bits) and timestamped KOs.
With `LevelTypes` → `LevelDesc`, the **real map** of a replay can already be shown. **[V]**
for the field mapping, **[H]** for covering every map.

## 3. What a real "video" view would take

Full chain: inputs → **deterministic engine** (movement, dash, dodge, wall jump,
gravity cancel, platform collisions, over 1,000 `powers` with their combos, hitboxes
and hurtboxes, damage, knockback, stun, weapons picked up and thrown, items, respawn,
invulnerability, mode rules) → positions and animation state on every tick → rendering
(maps and `.anm`).

| Option | Result | Estimated effort **[H]** | Risk |
|---|---|---|---|
| **A. Enriched timeline + static map** | Image of the real map, legends, timeline of KOs and inputs (jumps, dodges, light/heavy attacks, directions), playback speed and jumping between KOs. No positions. | **2–4 days** (parse `LevelDesc` in the plugin and draw it as SVG, synchronized timeline) | Low. Only data already read or configuration files. But the `.swz` files must be decrypted on the user's machine (key to find again for every patch), or a generated map table must ship (see §4). |
| **B. Approximate "schematic" 2D view** | Dots moving according to approximate physics. | 3–6 weeks | **High, and pointless**: without exact combat and knockback, trajectories diverge within seconds. The dots become wrong while looking plausible. **Not recommended.** |
| **C. Exact simulator (faithful 2D view)** | Exact positions, then rendering like the game (with the Wally libraries, ported or in a side process). | **6 to 18 months full time** for someone experienced in AS3 reverse engineering, plus **several days per patch** (changing obfuscated names, balance changes). | Very high. It needs exact equivalence on every tick: with no ground truth in the file, only the final outcome (KOs and scores) can be validated. brawlhalla-sim has worked on it for months and only has the jump. Legal risk (§4). |
| **D. Drive the real game** | Open the replay in Brawlhalla (copy into the replay folder) and let the game show it, possibly captured with OBS. | 1–3 days | No integration in WaveDash: external rendering, game required and only for the **same patch version**. Replaying a replay is a feature the game provides, so no terms of service issue (**[H]**). |

## 4. Risks: terms of service and legal

- The Brawlhalla and Ubisoft terms of service were **not read** during this
  study: the search did not find them. Major publishers' terms usually forbid
  decompiling and reverse engineering, and a US court has already upheld such a
  clause (bnetd/Blizzard case). **[H]** for Brawlhalla, to check against the official text.
- EU law (directive 2009/24, art. 6): decompiling is allowed under strict conditions
  **for interoperability**. A simulator competing with the engine probably goes
  beyond that. **[H]**, not legal advice.
- Distribution: **never** ship decompiled code, decrypted `.swz` files or game assets
  in WaveDash. The community practice (Wally, brawlhalla-sim) is to read
  the user's local install at runtime. A generated "LevelID → collision
  segments" table is derived from the data: a grey area, safer if it is
  extracted locally. **[H]**
- Anti-cheat: the game process is not touched, only files are read. No risk
  identified. **[H]**
- Maintenance: every patch changes the `.swz` key (suffix = patch number, found by
  brute force or through the `ANE_RawData.Init` pattern in the ABC, like bhswz-rs), the obfuscated
  names, the replay format (versions 261 to 271 already seen) and the balance. **[V]** for the
  key mechanism (read in `keyfinder.rs`), **[H]** for the frequency.

## 5. Proposed next steps (option A)

1. Add a `LevelDesc` reader to the plugin (`*Collision` segments, `Respawn`,
   `CameraBounds`) and `LevelTypes` (`LevelID` → name and KO zones). The source is still
   to choose: local decryption of the `.swz` files (key to find) or an embedded table.
2. Detail screen: SVG of the map, and below it a timeline per player (inputs grouped into
   actions, KOs), with variable-speed playback.
3. Reassess option C if brawlhalla-sim ever announces "ordered replay
   outcomes" validation on a corpus of replays (step 6 of its roadmap).

## Sources

- https://github.com/NickTacke/brawlhalla-sim (README, `docs/provenance.md`, `CONTEXT.md`, `docs/architecture.md`, `packages/core/tests/replay-verify.test.ts`)
- https://github.com/allhailcheese/WallyAnmRenderer, https://github.com/allhailcheese/BrawlhallaAnimLib
- https://github.com/moffel1020/WallyMapEditor
- https://github.com/allhailcheese/BrawlhallaReplayLibrary
- https://github.com/allhailcheese/BrawlhallaDeobfuscate (file tree)
- https://github.com/allhailcheese/bhswz-rs (`swz_random.rs`, `swz_reader.rs`, `swz_utils.rs`, `keyfinder.rs`)
- https://github.com/itselectroz/brawlhalla-replay-reader, https://github.com/Talafhah1/BrawlhallaReplayReader, https://github.com/Anton1P/Workspace-BRAT
- https://www.pinsentmasons.com/out-law/news/battlenet-emulator-broke-dmca-and-eula (bnetd/Blizzard)
- Local game folder: `BrawlhallaAir.swf`, `Init/Game/Dynamic/Engine.swz`, `anims/`, `bones/`, `META-INF/AIR/application.xml`
