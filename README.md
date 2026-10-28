# WaveDash

A Windows dashboard for your **YouTube, Brawlhalla, TikTok and Discord** stats, and anything a plugin can read.

Electron · React · TypeScript · SQLite · ECharts. Grey/black/white design, frosted glass, dark and light themes, 9 languages.

> **Version 1.7.0**: new **Players** page, a player bank fed by your replays: search any player you met (by current or former name, or ID) and see their sheet (legends, win rate, habits, teammates, opponents, recent games). For the test phase, banks are shared with `.wdbank` files (export / import), which only hold extracted data, never replay files.
>
> **Version 1.6.0**: WaveDash follows the Windows language on first launch and is available in English, French, Spanish, Portuguese (Brazil), German, Italian, Japanese, Chinese (Simplified) and Arabic (right-to-left layout). The code, docs and plugins are now English-first.
>
> **Version 1.5.0**: Studio emotes loop like in game (intro, loop, ending), and exports can last a **chosen duration** (e.g. 10 s of a looping emote). Also: a MiniaMaker-style **thumbnail editor** (layers, game asset bank, styled texts, effects, lights, colour grading, YouTube export), attacks sorted by move (NLight, SAir, Recovery…), animated preview on hover, a timeline with frame selection, and composition of several renders.
>
> **Version 1.3.0**: new **Brawlhalla Studio** (renders of legends, cosmetics, assets and music from the installed game).
>
> Automatic updates read the GitHub Releases, so the repository must stay **public**.

## What WaveDash does
- **Built-in platform**: YouTube (subscribers, views, videos, likes and comments of the last 50 videos, top videos). Everything else goes through plugins.
- **Local history** (SQLite) from the moment tracking starts; line, area, bar, pie and radar charts.
- **Overview**, **goals**, **milestones** (10, 20, 50, 100…) with Windows notifications and a celebration screen, data **export** (CSV, JSON, PDF report).
- **Demo mode**: simulated data to try everything without an API key.
- **Player bank** (Players page): every player seen in your replays, searchable by name or ID, with a full sheet; banks can be merged between testers with `.wdbank` files.
- **Customization**: theme, language, glass (the desktop can stay visible even when the window is enlarged), animations, tabs you can rename, reorder and hide (plugins included), refresh rate, chart type per statistic, launch with Windows, system tray.
- **Silent automatic updates** from GitHub Releases (installer checked with SHA-512).

## Languages
English, Français, Español, Português (Brasil), Deutsch, Italiano, 日本語, 中文（简体） and العربية. On first launch WaveDash picks the first supported language in the Windows language list (English otherwise); the choice can be changed in Settings › Appearance. Interface texts live in `src/renderer/src/i18n/` (`en` is the reference; `npm test` checks that every language has every text with the same `{variables}`). Notification texts and the PDF report use `src/shared/labels.ts`.

## `.wdsh` plugins
A plugin adds a data source. It runs in a **QuickJS sandbox**, inside a **separate process**: it only sees what its declared permissions allow (network domains, one read-only folder) and cannot freeze the interface. Full guide: [docs/PLUGINS.md](docs/PLUGINS.md).

- **Online catalog** ([WaveDash-Plugins](https://github.com/ArachnoMLK/WaveDash-Plugins)): **signed** index (Ed25519), every package checked with SHA-256, silent updates only when the permissions do not change.
- **Bundled plugins** (`examples/plugins/`):
  - **Brawlhalla (official API)**: ELO, rankings, wins and legends with your Blue Mammoth Games key (replaces the old built-in platform).
  - **Brawlhalla Replays**: reads and imports your `.replay` files (patches 10.02 to 11.00). Overview per legend, weapon, map, mode, teammate and opponent, with a Mode / Patch / Period bar that rebuilds the whole page for a single mode; a preview of each game with the map thumbnail (taken from your installed game) and a timeline of KOs, throws and taunts; search for a player, a map or a legend, and a "Cross your data" tool (e.g. "Legends × Modes with someone").
  - **TikTok (public profile)**: followers, likes and videos from the profile's public page.
  - **Discord (servers)**: members, online members, boosts and channel activity through a bot (official API).
  - **Weather** and **Folder stats**: simple examples to write your own plugin.
- Modular plugin pages: modules can be collapsed, moved and hidden; sortable tables; heat maps.
- Adjustable milestones for every plugin metric, and notifications sent by plugins (e.g. a Brawlhalla rank change).

## Brawlhalla Studio
Renders read straight from the installed game files (nothing is downloaded):
- **Legends**: legend, skin and colour, then animations sorted automatically: signatures (neutral / side / down of each weapon, follow-ups included), attacks and stances of both weapons, 277 emotes and dances.
- **Cosmetics**: emojis, companions, sidekicks, podiums, frames, badges; legend **portraits**; visual **effects** (`SFX_*.swf` files, e.g. Yumiko's flames).
- **Exports**: transparent GIF, APNG, WebM and MOV, MP4 on a green background (CapCut), or PNG frames.
- Game **assets** (banners, avatars, sprites, backgrounds, map art, images) and **music** (Wwise → MP3).

Rendering is done by `BrawlRender.exe`, a .NET engine from the BrawlStudio repository based on [WallyAnmRenderer](https://github.com/allhailcheese/WallyAnmRenderer) (MIT). Before `npm run dev` or `npm run dist`, put BrawlStudio next to WaveDash (`git clone --recurse-submodules`) and run `npm run studio:engine` (.NET 8 SDK required): the engine and vgmstream are copied to `resources/studio/` (not versioned). Without them, the Studio page simply says the engine is missing.

Published installers include the engine: the *Release* workflow downloads the `studio-engine.zip` archive from the `studio-engine-rN` pre-release named by `STUDIO_ENGINE_TAG` in `.github/workflows/release.yml` (pre-releases are ignored by automatic updates). To publish a new engine: `npm run studio:engine`, zip the content of `resources/studio/` as `studio-engine.zip`, publish it in a new `studio-engine-rN` pre-release, then put that name in `STUDIO_ENGINE_TAG`.

## Install
Download `WaveDash-Setup-x.y.z.exe` from the **Releases** tab. The installer is **not signed**: SmartScreen shows "unknown publisher" on first launch ("More info" › "Run anyway").

## API keys (Settings › Connected accounts, encrypted with Windows DPAPI)
| Source | What you need | Limits |
|---|---|---|
| YouTube | A "YouTube Data API v3" key (Google Cloud Console, free) | Likes/comments = last 50 videos |
| Brawlhalla (plugin) | A personal key requested from Blue Mammoth Games | Lookup by Brawlhalla ID or Steam ID64 |
| Discord (plugin) | The token of a bot invited to the server | Never reads message content |
| TikTok (plugin) | Nothing | Public page, may break if TikTok changes it |

Keys are never written in plain text, never committed, and never sent back to the interface. Instagram is not supported (no API for personal accounts).

## Development
```bash
npm install
npm run dev        # app with hot reload
npm run typecheck  # type check
npm test           # automated tests (sandbox, network, files, ZIP, database, bundled plugins, translations)
npm run dist       # installer in /dist (on Windows)
```
Every push to GitHub runs the *Tests* workflow (types and tests). To release a version: bump `package.json`, then `git tag vX.Y.Z && git push origin vX.Y.Z`; the *Release* workflow runs the tests again, then builds and publishes the installer.

## Structure
```
src/main        Main process: SQLite database, secrets, scheduler, providers (providers/), plugins (plugins/), Studio (studio/), IPC
src/preload     Secure bridge exposed to the interface
src/renderer    React interface (pages/, components/, lib/, i18n/)
src/shared      Shared types, labels and plugin validation
examples        Bundled plugins
tests           Automated tests (npm test)
docs            Plugin guide, replay player study
```

## License
MIT
