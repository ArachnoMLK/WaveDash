# Writing a WaveDash plugin (`.wdsh`)

A plugin adds a **data source** to WaveDash: it fetches numbers (an API, a folder of files…) and WaveDash takes care of the rest: storage, history, cards, charts, export.

A `.wdsh` file is a **ZIP archive** containing two files: `manifest.json` and a JavaScript script (`main.js` by default).

## Quick start

```bash
node tools/wdsh-pack.mjs examples/plugins/weather-open-meteo      # creates the .wdsh file
```

Then in WaveDash: **Plugins › Install a plugin** (or drop the file onto the window, or double-click it). Two complete examples are provided in `examples/plugins/`: a weather plugin (network) and folder stats (files).

## The manifest (`manifest.json`)

```json
{
  "wdsh": 1,
  "id": "my.plugin",
  "name": "My plugin",
  "version": "1.0.0",
  "author": "Me",
  "description": { "en": "What the plugin does.", "fr": "Ce que fait le plugin." },
  "permissions": { "network": ["api.example.com", "*.cdn.example.com"], "folder": false, "folderExtensions": [".replay"] },
  "inputs":  [ { "key": "city", "type": "text", "required": true, "label": { "en": "City", "fr": "Ville" } } ],
  "secrets": [ { "key": "apiKey", "label": "API key" } ],
  "metrics": [ { "key": "temperature", "label": "Temperature", "unit": "°C", "decimals": 1, "primary": true } ],
  "itemColumns": [ { "key": "size_kb", "label": "Size", "unit": "KB" } ],
  "refreshMinutes": 30
}
```

| Field | Rules |
|---|---|
| `id` | lowercase letters, digits, `.` `_` `-`, 3 to 64 characters. Identifies the plugin (an update reuses the same `id`). |
| `version` | `x.y.z`. |
| `entry` | entry script, `main.js` by default. |
| `minAppVersion` | minimum WaveDash version (optional). |
| `permissions.network` | domains reachable over **HTTPS**. `*.example.com` = all subdomains (not the bare domain). Up to 10. |
| `permissions.folder` | `true` to read **one folder chosen by the user**. Requires exactly one `inputs` field of type `folder`. |
| `permissions.folderExtensions` | readable extensions (e.g. `[".replay"]`). Empty = all. |
| `permissions.images` | `true` to **show** images from a folder chosen by the user (e.g. a game's thumbnails). Requires exactly one `inputs` field of type `images`. The script never reads this folder and never gets its path: it only names a file in `detail.image`, which WaveDash shows (JPG, PNG or WebP, at most 3 MB). |
| `inputs` | up to 8 fields entered when adding an account (editable later with the **Edit** button of the account page): `text`, `number`, `folder` or `images`. |
| `secrets` | up to 4 values (API keys…) stored **encrypted** by WaveDash, never in plain text. |
| `metrics` | 1 to 20. `format`: `number` (default), `percent`, `rank`, `duration` (seconds → mm:ss). `decimals` from 0 to 4. `primary`: metric shown first. `milestone` (optional): milestones offered by default, `{ "increment": 100, "notifyDown": true, "enabled": true }` (integer increment ≥ 1; without an increment, the sequence 10, 20, 50…). |
| `itemColumns` | columns of the item table (optional). |
| `views` | `true` if the script defines `view`: the page shows a **filter bar** (drop-down menus) from `filters` in its result; a chosen filter recomputes the overview (`view`) and filters the item list, the search and the cross tool (`ctx.filters`). |
| `notices` | `true` if the plugin sends notifications (`notices` in its result, see below). Shown at install time; each plugin can be muted in Settings › Notifications. |
| `search` | `true` if the script defines `search`: the account page then shows the top search bar. |
| `cross` | "Cross your data" tool: `{ "measures": [{ "key", "label" }], "dimensions": [{ "key", "label" }] }` (2 to 12 each). The script defines `cross(ctx)`; `ctx.cross` = `{ who, measure, a, b }` (`b` may be `none`); it returns a detail, usually `bars` (`{ title, categories, series: [{ name, values }], stacked }`) and a table. |
| `players` | `true` if the plugin feeds the **player bank** (`players` in its result) and defines `player(ctx)`, which builds a player's sheet for the **Players** page (see below). |
| `itemsMode` | `replace` (default): each refresh replaces the item list. `keep`: returned items are added to the ones already saved (same `id` = updated), up to 20,000 per account; the page shows them 50 at a time, with a month filter. Useful for a history (one game per file, for example). |
| `refreshMinutes` | minimum delay between two refreshes (5 to 1440, 30 by default). |

Texts (`label`, `description`, `help`) are a plain string or an object with one entry per language: `{ "en": "…", "fr": "…", "ja": "…" }` (`en`, `fr`, `es`, `pt`, `de`, `it`, `ja`, `zh`, `ar`). WaveDash shows the interface language, otherwise English, otherwise French, otherwise the first one given.

## The script

The script defines a global `plugin` object with a few async functions:

```js
var plugin = {
  // Optional. Called when an account is added: validates the inputs and names the account.
  resolve: async function (ctx) {
    return { externalId: 'stable-identifier', displayName: 'Display name' }
  },

  // Optional. Search bar at the top of an account page: `ctx.query` is the typed text; returns a detail
  // (same format as `detail`, see below) or nothing. Nothing is saved; an error here does not disable the plugin.
  search: async function (ctx) {
    return { chips: ['Result for ' + ctx.query], stats: [{ label: 'Games', value: 12 }] }
  },

  // Required. Called on every refresh.
  refresh: async function (ctx) {
    return {
      metrics: { temperature: 17.4 },                       // keys declared in the manifest
      items:   [{ id: 'a', title: 'Item', ts: Date.now(), fields: { size_kb: 12 } }],      // optional, 200 max
      history: [{ ts: 1700000000000, metrics: { temperature: 12 } }],                   // optional: past points, 5000 max (see below)
      backlog: 0,                                                                        // optional: remaining work (see below)
      notices: [{ id: 'rank:42', title: 'Platinum 0', text: 'New rank: Platinum 0.', direction: 'up' }]   // optional, manifest notices: true
    }
  }
}
```

**`backlog`**: if the plugin cannot process everything at once (compute budget), it reports what is left (for example the number of files not read yet). While `backlog` is positive, WaveDash runs it again 5 s after the run ends, without waiting for `refreshMinutes`, and the page shows the progress. If the backlog does not go down over 3 reruns in a row, WaveDash stops these quick reruns and waits for the next normal refresh: a miscalculated backlog cannot make a plugin run in a loop.

**`filters`** (manifest `views: true`): up to 4 filters `{ key, label, field, options: [{ value, label }] }` (at most 60 choices). `field`: item column filtered by exact match; `"$ts"`: period, the value is a number of days; without `field`, only the overview is filtered. When a filter is chosen, WaveDash calls `view(ctx)` with `ctx.filters` (`{ mode: '1v1 Ranked' }`, only offered values); the script returns an overview (same format as `detail`), which replaces the counters, curve and overview of the page. `search` and `cross` also receive `ctx.filters`.

**`notices`** (manifest `notices: true`): at most 3 notifications per run (`title` 40 characters, `text` 200, `direction` `up` or `down`), sent like a milestone (Windows notification, sound, celebration, history). Each `id` is sent **only once** per account: give each event a new identifier. The user can mute a plugin's notifications in Settings › Notifications.

**`players`** (manifest `players: true`): up to 3,000 records per run, one per player and per game: `{ key, name, game, ts, data }`. `key` is a stable player identifier (letters, digits, `.` `:` `|` `-` `_`, at most 64; e.g. an account ID), `game` identifies the game and must be **the same for every player who recorded it** (derive it from the game content, not from a file name), so a game imported twice is stored once. `data` holds up to 40 fields: numbers, texts (300 characters) or lists of up to 16 numbers. WaveDash stores them in its own table; nothing is sent anywhere.

The **Players** page searches the bank by name (current or former) or exact `key`. Opening a player calls `player(ctx)` with `ctx.records`, the player's records newest first (3,000 at most, from this PC and imported files), and shows the detail it returns (same format as `detail`). Nothing is saved and the function has no folder access.

During the test phase the bank is shared by file: **Export my data** writes a `.wdbank` file (gzipped JSON with only the records read on this PC, never the source files), and **Import** merges `.wdbank` files received from other players; every row is validated again, and the rows of one imported file can be removed together.

**`history` is authoritative**: for each metric, the points already saved between the first returned point and now are replaced by these. A plugin that fills in past data (for example files read over several runs) thus corrects the values computed before; older points are left untouched.

`ctx` contains: `records` (in `player` only), `inputs` (entered values), `secrets` (your keys, decrypted), `lang` (interface language: `en`, `fr`, `es`, `pt`, `de`, `it`, `ja`, `zh` or `ar`), `account` (`{ externalId, displayName }`, in `refresh`).

An item can also carry an optional **`detail`**, shown under its row when clicked. Every part is optional:

```js
detail: {
  image:    { file: 'BrawlhavenSmall.jpg', caption: 'Small Brawlhaven' },                   // images permission: file from the image folder
  chips:    ['Small Brawlhaven', 'Patch 11.00', '3:04'],                                   // badges: 16 max
  stats:    [{ label: 'Games', value: 12 }],                                                 // key figures: 24 max
  table:    { columns: ['Player', 'Score'], rows: [['Alby', 2], ['Close', 1]] },            // 10 columns, 80 rows max
  tables:   [{ title: 'Actions', columns: [...], rows: [...] }],                             // 8 tables max
  grids:    [{ title: 'Dodges', rows: ['↑', '·', '↓'], cols: ['←', '·', '→'], values: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] }],    // heat grids: 8 max, 8 × 8
  series:   [{ title: 'Actions every 15 s', step: 15, lines: [{ name: 'Close', values: [12, 9, 14] }] }],                    // curves: 4 max, 16 lines, 600 points
  timeline: { duration: 183, lanes: ['Alby', 'Close'], events: [{ t: 29.1, lane: 0, label: 'KO' }] }                       // timeline: 16 lanes, 400 markers max, t in seconds
  //        optional events[].kind: 'ko' (diamond, default), 'action' (small dot), 'mark' (triangle)
}
```

`refresh` can also return a **`summary`** in the same format: it is the account **overview**, shown at the top of its page (for example totals per category). Each block of the overview is a module the user can collapse, move or hide (layout kept per account).

An account page offers a **search** in the whole item or in a single column ("Search in" menu); during a search, WaveDash shows stats on the items found, for each column: average, minimum, maximum and total for numbers, average duration for "m:ss" values, distribution for text (for example the win rate from a Result column).

If the plugin reads a folder (`permissions.folder`), the account page offers **Import files**: a window to drag and drop the files into (or pick them). WaveDash first copies them (manifest extensions, 8 MB max each, duplicates ignored) into the **Documents › WaveDash › Imported › <account number>** folder, keeping their date; `host.files` sees them in addition to the files of the chosen folder. The chosen folder is never modified, and the import folder is deleted with the account.

**Anything not declared in the manifest is ignored**: unknown metrics, unknown columns, non-numeric values, absurd timestamps.

### The `host` object: everything a plugin can do

| Function | Role |
|---|---|
| `await host.http(url, { method, headers, body })` | HTTPS request to a declared domain. Returns `{ status, ok, headers, text, json() }`. |
| `host.log(...)` / `console.log(...)` | Log shown on the plugin page (100 lines max). |
| `host.storage.get(key)` / `.set(key, text)` | Persistent memory per account (100 keys, 64 KB per value): useful to process only what is new. A key only contains letters, digits, `.`, `_` and `-` (1 to 64 characters): no `:` or spaces. |
| `host.files.list()` | The 20,000 most recent files of the chosen folder, newest to oldest: `[{ name, size, mtime }]` (`folder` permission). |
| `host.files.readText(name)` / `.readBytes(name)` | Content of a file (text, or `Uint8Array`). 8 MB max per file. |

Nothing else exists: no `fetch`, `require`, `process` or `setTimeout`, and no disk access outside `host.files`.

## Security and limits

The script runs in **QuickJS**, an isolated JavaScript engine (WebAssembly), itself started in a **process separate** from WaveDash ("WaveDash · plugins"): a slow plugin never freezes the interface, and if that process stops, it is restarted and the run retried once (what it writes to its error output goes to `plugin-host.log`, in the app folder). The account storage is copied into that process before the run, then the changes are saved afterwards. The script only sees `host`. On every run:

- **memory**: 48 MB; **stack**: 256 KB;
- **compute**: 8 s of cumulated CPU time (measured on the plugin process, so a busy PC does not count against the plugin); **total duration**: 45 s (network included);
- **network**: 30 requests, 5 MB per response, 15 s per request; HTTPS only; redirects rechecked (to another host, the `Authorization` and `Cookie` headers do not follow); local and private addresses (`localhost`, `192.168.x.x`, `10.x.x.x`…) **always rejected**, even if a domain name points to them;
- **files**: a single folder, no subfolders or symbolic links, read-only.

After **5 consecutive failures**, the plugin is disabled automatically. At install time, WaveDash shows the requested permissions and the user must confirm.

> This isolation greatly reduces the risk but does not remove it, and WaveDash is not digitally signed: **only install plugins whose author you know.**

## Online catalog

The **Plugins › Catalog** page lists the plugins published in the [ArachnoMLK/WaveDash-Plugins](https://github.com/ArachnoMLK/WaveDash-Plugins) repository. WaveDash reads its `index.json` (address built into the app, 3 h cache, last copy kept for offline use). The index is **signed** (Ed25519): WaveDash contains the public key and rejects an index not signed by the owner's private key, which is never online. Before any install, the downloaded package is checked: size and SHA-256 hash identical to those of the signed index, otherwise it is rejected. The install then goes through the usual confirmation screen, with the permissions. At startup and then every 3 hours, an installed plugin is updated silently from the catalog if its new version asks for exactly the same permissions; its accounts are then refreshed right away. The index is read bypassing the GitHub cache, so a release is visible immediately. The catalog never takes a plugin back to an older version.

To publish a plugin: open a pull request on WaveDash-Plugins (see its README). The repository owner reviews every contribution; the **Check** action verifies that packages, hashes and sources match.

## Plugins bundled with WaveDash

The plugins of the `examples/` folder ship in the installer. The **Plugins** page offers the ones that are not installed (or for which a newer version is bundled), in one click, with the usual confirmation screen. At startup, WaveDash **silently** updates an installed plugin for which it bundles a newer version, **only if its permissions are identical**; otherwise the update waits for your confirmation on the Plugins page.

## Milestones and overview

Plugin accounts appear in the **overview** (up to 4 metrics, the main one first; a click opens the account). **Milestones** are set in **Settings › Notifications**, metric by metric (numbers and percentages), for each installed plugin: Windows notification, sound and celebration, as for the built-in platforms. By default: the manifest's `milestone` setting if any, otherwise the sequence 10, 20, 50, 100… on the main metric when it is a plain number. Rules are saved as `plugin:<id>.<metric>` and are part of the configuration backup.

## Updating a plugin

Reinstalling a `.wdsh` with the same `id` updates the plugin while keeping its accounts, keys and storage. The confirmation screen shows the permissions again.

## Debugging

A plugin account page shows the error of the last refresh and a **log** (`host.log`). An error thrown by your code (`throw new Error('…')`) appears as is.

## Bundled plugin: Brawlhalla Replays

`examples/brawlhalla-replays-1.11.0.wdsh` reads **all** the `.replay` files of a folder, plus the imported ones (`folder` permission, no network).

- **Curve and cards**: games, wins, losses, win rate, stocks taken and lost, average length, presses per minute.
- **Top bar**: Mode (1v1 Unranked, 1v1 Ranked, 2v2 Friendly, 2v2 Ranked, 3v3 Ranked, then the other modes played), Patch and Period. The whole overview, the game list, the search and the cross tool are limited to the choice.
- **Overview**: key figures, tables per legend, map, mode, teammate, opponent, day and hour, direction of your dodges, breakdown of your attacks.
- **Player bank**: every player of every game read (yourself included) is recorded with their legend, result, mode, map, KOs, dodges, attacks, jumps, throws, presses per minute, teammates and opponents. The **Players** page shows any player's sheet from all the games recorded on this PC and in imported `.wdbank` files.
- **Game detail**: map thumbnail (if you give the game's `images\thumbnails` folder: WaveDash shows it from your install, no image ships with the plugin), map, mode, patch, date, length, lives, settings; for each player, legend, weapons, stance, placement, KOs taken, KOs dealt (in 1v1), light and heavy attacks per direction, dodges, jumps, throws, taunts, movement time, presses per minute; dodge direction grid, activity curve every 15 s, game timeline (KOs, with their author in 1v1; weapon throws; taunts).

Every game of the folder counts: the totals, the curve (dated by each file's date) and the game list go back to the oldest replay. The plugin decompresses each file itself (table-driven inflate in JavaScript, checked identical to zlib on 9012 files) inside the sandbox: about 50 ms per replay in WaveDash, 2 s of reading per run. On first install, it reports the rest (`backlog`) and WaveDash reruns it every few seconds: about 20 to 30 minutes for 9000 replays, only once. Afterwards, only new files are read. The cache keeps only a summary of each game (about 100 bytes); the detail is sent once to WaveDash, which keeps it (`itemsMode: keep`). The name field accepts several names separated by commas (useful after a name change). The catch-up runs in the plugin process: the interface stays smooth meanwhile.

### What is verified, what is not

Verified on 9012 real replays (versions 261 to 271, patches 10.02 to 11.00):

- **Checksum validation.** The game writes a checksum of the game data (players, cosmetics, legends, map). The plugin recomputes it; if it does not match, the replay is reported as "unrecognized format (version N)" and nothing from it is shown. All 9012 replays pass; a deliberately broken parser is rejected. The leading bit of each legend counts as bit 31 of its combined value (seen in modes with several legends; the C# library ignored it).
- **Legends.** The identifier read from the replay is the game's `HeroID`, identical to the `legend_id` of the official API. The table (70 legends, up to Qinghua & Baobao) comes from the `HeroTypes` file of the patch 11.00 data, and matches the game's replay viewer on Eternity's End. An unknown legend is shown as `#id` and the log reports it ("new legend?"): the table then needs an update.
- **Map.** The name comes from the game's `LevelTypes` table (patch 11.00), checked against the names of 2930 files; otherwise from the file name (`[11.00] SmallBrawlhaven (42).replay` → Small Brawlhaven); failing that, `Map #id`.
- **Weapons.** The two weapons of each legend come from the game's `HeroTypes` table.
- **Player identifier.** Since version 268 (patch 10.09), each player has an account identifier (32 bits, 0 for bots), stable across name changes; the second local player ("name•2") shares its host's. The plugin learns your identifiers from an identical name (with or without clan tag), then recognizes you by them. Teammates and opponents are grouped by identifier; an older game without identifiers is attached to the player whose name without tag matches a single identifier. Unverified assumption: that it is the `brawlhalla_id` of the official API.
- **Win.** A player's score is their placement (1 = winner). Some modes (Kung Foot) add an entity that is not a player, with a score of 0: it is ignored.
- **Inputs.** Each player has the timestamped (ms) list of their key state changes (14 flags: directions, jump, light and heavy attacks, dodge, pick up/throw, four taunts). The plugin counts the presses, notes the direction held at each attack and dodge, measures the time spent holding left or right and the activity every 15 s.
- **Dodge key: dodge, dash, gravity cancel, chase dodge.** The game uses the same key for all four; the replay only keeps the press. Each press is classified from the game rules ([wiki, Movement page](https://brawlhalla.wiki.gg/wiki/Movement)): **gravity cancel** if an attack follows within 18 frames (spot dodge) or within 3 frames in the same direction (directional dodge); **probable chase dodge** between 200 and 850 ms after an attack (the replay does not say whether the attack hit: overestimated); **probable dash** if sideways with no jump within 700 ms (the replay does not say whether the player is grounded). The rest is a **dodge**: only those make up the direction grids. Over 277 real games: 31 % dodges, 28 % probable dashes, 33 % probable chase dodges, 8 % gravity cancels.
- **KO author: no.** A KO only holds the player who loses a stock and the time. The second list (type 7) only appears in special modes (Kung Foot, without KOs) and does not name an author either. In 1v1 the author must be the opponent; elsewhere, the file does not tell.

Unverified assumptions: the exact meaning of the type 7 list; formats older than version 261; stance names (the file gives a number, shown as is); the "held" direction does not tell whether the attack happened on the ground or in the air.

Damage dealt and taken, weapon held, positions (air, ground, wall), combos, dashes, KO authors outside 1v1: none of this is **in** the file. It would take replaying the game with the game engine from the inputs, which Yarralytics does on its servers.

The file format was understood thanks to the open-source projects BrawlhallaReplayLibrary (allhailcheese) and brawlhalla-replay-reader (itselectroz), both under the MIT license.

## Bundled plugin: Brawlhalla (official API)

`examples/brawlhalla-api-1.2.1.wdsh` has replaced the built-in Brawlhalla platform since WaveDash 1.0.1. It reads your profile through the official API (only allowed domain: `api.brawlhalla.com`) with your personal Blue Mammoth Games key, stored as a plugin secret (encrypted by Windows). Input: Brawlhalla ID, Steam ID64 or a `steamcommunity.com/profiles/…` link. Metrics: 1v1 ELO (main) and 2v2, peak ELO, global and region rank, games, wins, win rate, level; one row per legend (games, wins, KOs, falls, level, play time) and an overview (rank, region, clan, 2v2 teams).

On update, a built-in Brawlhalla account is attached to this plugin with its history, key and milestone rules (the ELO keeps a milestone every 100 points); a demo account is removed. Since version 1.2.0 of the plugin, 1v1 rank changes (Gold 5 → Platinum 0…) are notified again, through plugin notifications (see `notices`).

## Bundled plugin: TikTok (public profile)

`examples/tiktok-profile-1.0.1.wdsh` follows a public TikTok profile (followers, following, likes received, videos, friends) by reading its public page, without an account or key, once an hour. Network permission: `www.tiktok.com` only. This is not an official API: reading may stop working if TikTok changes its page, and it is not provided for by its terms of service. When that happens, the plugin shows an error instead of wrong numbers.

## Bundled plugin: Discord (servers)

`examples/discord-server-1.2.5.wdsh` follows Discord servers through the official API (network permission: `discord.com` only). Three ways to use it:

- **Every server of a bot**: leave the invite and the ID empty, then save the bot token in the plugin keys. The account lists each server the bot is in (members, online, messages today and over 7 days, last message); a click opens the server detail (channels, most active members, messages per day). Up to 45 servers followed in detail.
- **A single server**: bot token + server ID; the list then shows its channels.
- **Without a bot**: a permanent invite link gives members, online members, online share and boosts. Verified on the official Brawlhalla server.

For the bot: Discord Developer Portal › New Application › Bot › Reset Token, then invite it to each server (OAuth2 › URL Generator › `bot`, permissions "View Channels" and "Read Message History"). The token is stored encrypted by WaveDash and shared by the accounts of this plugin.

Messages are counted as they come: on the first pass, the last 100 of each channel (within 7 days), then every new one. Their content is neither read nor kept, and bot messages do not count. At most 26 requests per run: channels and servers are read in turn, and WaveDash reruns the plugin while it is still behind. Bot mode was verified on a simulated Discord API (3 servers, forbidden channel, 150 new messages), then on a real server (269 members, 30 channels, 2 boosts). A channel without any message no longer counts as "behind" (1.2.4): before, it made the plugin rerun every 5 s.

The plugin never reads the computer's Discord app or a personal account (a "selfbot" is forbidden by Discord).

## Not available yet

Milestones on ranks and durations.
