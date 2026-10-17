# Discord Bot

**Status: interactions endpoint verified end-to-end in production
(2026-10-16).** A guild-scoped `/ping` test command was registered via
Discord's REST API and invoked for real in a test server — Discord signed
and POSTed the interaction, `verifyKey()` accepted the signature, and the
fallback "This command isn't wired up yet." reply round-tripped back and
rendered in Discord. That confirms the whole plumbing (Edge Function
deploy, env vars, signature verification, response shape) works; no real
command (`/link`, `/builds`, `/build`) is implemented yet — `interactions.ts`
still only branches on `InteractionType.PING` vs. everything else. This
file will grow alongside `agent.md`/`api.md`/`database.md` as the feature
does.

## Why an HTTP interactions endpoint, not a persistent bot process

Discord supports two shapes for a bot: a long-lived Gateway WebSocket
connection (the classic discord.py/discord.js pattern), or a single HTTPS
endpoint Discord POSTs every interaction to, with no persistent connection
needed. The second is the only one that fits this app's serverless-only
architecture (no always-on process anywhere — see `architecture.md`'s
"Decision: Edge Function, not FastAPI" for the same reasoning applied to
the agent). Concretely: `frontend/api/discord/interactions.ts`, a Vercel
Edge Function.

## Why Vercel Edge runtime, not Vercel's Node runtime

`discord-interactions` (the official-adjacent signature-verification
library) uses Web Crypto (`SubtleCrypto`) under the hood, which Edge
supports natively and Node's classic serverless runtime does not without a
polyfill. Edge also has a lower cold-start than Node serverless functions,
which matters concretely here: Discord requires a response within 3
seconds of an interaction firing, and a cold Node function eating into
that budget is a real risk a cold Edge function mostly isn't.

**This does NOT mean the whole Discord feature stays on Edge.** The
planned screenshot-rendering piece (headless Chromium via
`@sparticuz/chromium` + Playwright, for `/build {character}`) cannot run
on Edge at all — needs a real Node serverless function. The interactions
endpoint will likely end up acknowledging a command immediately
(`DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`) and triggering the actual
screenshot work in a separate Node function, then editing the deferred
response via a follow-up webhook call once the screenshot's ready —
**not designed yet**, don't assume this shape is final.

## Raw-body signature verification -- the one easy way to get this wrong

`verifyKey(rawBody, signature, timestamp, publicKey)` must be called
against the **exact raw bytes** Discord sent (`await req.text()`), before
any `JSON.parse`. Parsing first and re-serializing to verify would change
the byte sequence and fail validation even for a genuinely valid request —
this is a known footgun with this pattern (some frameworks auto-parse the
body before your handler ever sees it, silently breaking this). Vercel
Edge's raw `Request` object doesn't do that automatically, which is a
secondary reason Edge was the easy choice here.

## Environment variables (set directly in Vercel's dashboard, never in chat)

- `DISCORD_BOT_TOKEN` — secret, full control of the bot. Settings →
  Environment Variables on the Vercel project (NOT Supabase's secrets —
  those are a separate system for the agent Edge Function only, easy to
  confuse since this app already uses that pattern elsewhere).
- `DISCORD_PUBLIC_KEY` — not secret, used by `verifyKey()`.
- `DISCORD_APPLICATION_ID` — not secret, needed once slash commands get
  registered via Discord's REST API.
- `SUPABASE_SERVICE_ROLE_KEY` (added 2026-10-16, for `/builds`/`/build`) —
  secret, full DB access bypassing RLS, used only in `getServiceClient()`
  (`_shared.ts`) — see `database.md`'s discord_link_codes/discord_links
  section for why this is a deliberate, narrow exception to this app's
  general "no service-role key" posture.
- `DISCORD_INTERNAL_SECRET` (added 2026-10-16, for `/build`'s card render)
  — a shared secret gating `build-card.ts`'s internal endpoint, checked
  against the `X-Internal-Secret` header `interactions.ts` sends. Not tied
  to any external provider (self-issued, revocable anytime by just
  changing the value) — unlike the other secrets here, it's fine to
  generate it with any local random-bytes command, since nothing outside
  this app's own two functions ever needs to know it.

## Testing so far

The only testable thing right now: set the Interactions Endpoint URL in
the Discord Developer Portal (General Information tab) to
`https://wuthering-waves-assistant.vercel.app/api/discord/interactions`
and confirm Discord accepts it (it sends a live signed PING and won't save
the URL unless the handshake round-trips correctly) — this is Discord's
own verification step, not something that can be faked/skipped locally.
No local emulation path exists for this (same "test against the real
deployed thing" pattern as the Supabase agent function, see
`architecture.md`'s local-testing caveat) — Vercel's preview deployments
could theoretically be used for a staging interactions endpoint later, not
set up yet.

## Account linking (`/link` verified end-to-end in production 2026-10-16; `/builds`/`/build` not yet)

Code-based linking, not Discord OAuth2 — chosen because it needs no
registered OAuth redirect URI or consent-screen setup, and the bot already
knows the Discord user's id/username from the interaction itself.

**As built:**
- `/link` (`handleLink()` in `interactions.ts`) generates an 8-char code
  (`crypto.getRandomValues`, a 32-symbol alphabet with `0/O/1/I` excluded),
  inserts `{code, discord_user_id, discord_username}` into
  `discord_link_codes`, and replies **ephemerally**
  (`InteractionResponseFlags.EPHEMERAL`) with a link to
  `{SITE_URL}/link/:code`. This insert runs as the Supabase `anon` role —
  no service-role key, no site session exists at this point (see
  `database.md`'s "discord_link_codes / discord_links" section for the RLS
  reasoning and the exact schema).
- `frontend/src/pages/LinkDiscordPage.tsx` (route `/link/:code`,
  `frontend/src/lib/discordLink.ts` for the Supabase calls): looks up the
  code (`not_found`/`expired` [10 min]/`used`/`valid`), then — if signed
  out — shows the existing `AuthModal`; if signed in — shows "Link this
  account ({email}) to Discord user X? [Confirm Link]". Confirm upserts
  `{user_id: auth.uid(), discord_user_id, discord_username}` into
  `discord_links` (RLS-scoped exactly like `user_characters`, this step
  *does* have a real session) and marks the code `used_at` instead of
  deleting it.
- Command registered as a **guild command** (instant propagation, for
  testing) via Discord's REST API — see "Registering commands" below for
  the exact request shape. Not yet registered globally.

**`/builds` implemented as a plain-text reply.** `handleBuilds()` in
`interactions.ts` resolves `discord_user_id -> user_id` via
`discord_links`, then `user_id -> user_characters` rows, using a
**service-role Supabase client** (`getServiceClient()`) — this is the
deliberate, narrowly-scoped exception flagged in `database.md`: there's no
site session to RLS-scope against at all here, only the Discord
interaction's own (signature-verified, unspoofable) `discord_user_id`.
Every query made with that client is scoped in code by a value derived
from that verified identity, never by raw client input. New Vercel secret:
`SUPABASE_SERVICE_ROLE_KEY` (Supabase dashboard → Project Settings → API
Keys → `service_role`/`secret` key — **secret**, full DB access bypassing
RLS, never paste it in chat, set directly in Vercel same as
`DISCORD_BOT_TOKEN`). Character name resolved via
`frontend/api/discord/characters.json`, a lean `roleGbId -> {name,
element, cardPictureUrl}` map built by
`scripts/build_discord_character_names.py` from
`data/agent_character_guides.json` + `data/wuwa_characters.json` — same
"small bundled extract, no runtime fetch" pattern as the agent's
`weapon_names.json`/`character_guides.json`, needed because the Edge
runtime has no filesystem access (`fs` doesn't exist there) and the full
`wuwa_characters.json` is 4.6MB, nowhere near fitting Discord's 3-second
response budget. Rerun that script (and redeploy) whenever
`agent_character_guides.json` changes. Reply is one ephemeral bullet list,
`• **Name** — Lv X/90` per saved build.

**A composed grid image of real character portraits was built and then
scrapped the same day (2026-10-16) — functionality first, visuals
later.** Worth knowing before trying this again: Discord embeds have no
per-field icon slot and cap at 10 embeds per message (too few for a full
roster), so a real portrait next to every name needs one rendered image.
`@vercel/og`'s `ImageResponse` is the usual way to do this on Vercel but
only resolves to its Edge-compatible build when a bundler sets the
`"edge"`/`"edge-light"` export condition — Next.js sets that
automatically, Vercel's bundler for a plain (non-Next.js) `api/` Edge
Function apparently does not, so it silently pulled in the Node-targeted
build and got rejected by Vercel's deploy-time Edge-compatibility check
("referencing unsupported modules: @vercel"). Calling `satori` +
`@resvg/resvg-wasm` directly (what `@vercel/og` uses internally) sidesteps
that, but surfaces the same class of problem one layer deeper: `satori`
0.33.0+ depends on `harfbuzzjs` for complex-script text shaping, and that
package's WASM loader also hard-breaks on Edge (reads
`self.location.href`, needs `__dirname`, compiles WASM from raw bytes at
runtime) — pinning `satori` to exactly `0.32.0` (the last version before
that dependency) fixes it, a well-documented issue (see satori GitHub
issues #794/#878/#796). Getting the WASM binary into the function at all
also needs Vercel's documented `import x from "./file.wasm?module"`
precompiled-Wasm convention (https://vercel.com/docs/functions/wasm) — a
Node `fs` read, which is what local testing has to use instead, isn't
available at runtime. None of this is wrong, it's just real complexity
that wasn't worth paying before the simple version even worked — revisit
once `/builds`/`/build` are solid.

**JSON import attributes — opposite requirement depending on which
runtime the file is.** This genuinely differs between the two functions,
confirmed by two separate real failures, so get it right per file:
- **Edge** (`interactions.ts`): do NOT use `with { type: "json" }`.
  Vercel's build-time type-check wants it (resolves `module` as NodeNext
  for `api/` functions regardless of `tsconfig.api.json`'s `"esnext"`
  setting, surfacing as a non-fatal TS1543 in deploy logs if you leave it
  off) but the actual bundler Vercel uses for Edge functions (esbuild)
  pre-inlines JSON at build time and does NOT support that syntax at
  all — hard-fails the whole deploy (`Expected ';' but found 'with'`). A
  plain `import x from "./y.json"` works fine at runtime despite the
  cosmetic TS1543 — leave it alone.
- **Node** (`build-card.ts`, and any future Node-runtime file here): DO
  use `with { type: "json" }` — the opposite requirement. A real Node.js
  runtime isn't pre-bundled into one inlined file the way Edge is; it
  loads actual ES modules subject to Node's own strict import-attribute
  rule for JSON, and a plain import fails at **runtime** (not caught by
  local `tsc -b`, which doesn't enforce this under this project's
  `bundler` moduleResolution — only surfaces as a real deploy/invocation
  failure): `TypeError [ERR_IMPORT_ATTRIBUTE_MISSING]: Module
  ".../characters.json" needs an import attribute of "type: json"`,
  confirmed via `build-card.ts`'s first live test 2026-10-16.

**`/build {character}` renders a real Build Card image with computed
final stats.** Takes a required string option (`character`), resolved to
a `roleGbId` via `resolveCharacterId()` (case-insensitive, exact match
first then substring — same order the agent's own resolver uses) against
`characters.json`.

**Two-function split, Edge + Node**, because the image render needs real
Node APIs that Edge doesn't provide (see the "Gotcha" note below) but
Discord still requires a response within 3 seconds:
- `interactions.ts`'s `handleBuild()` (Edge, fast) does only the cheap
  validation — resolve the character, resolve `discord_user_id ->
  user_id` via `discord_links` (service-role client, same as `/builds`).
  If either fails, replies immediately with a plain error, no deferral
  needed. If both succeed, returns `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`
  (type 5) right away and fires `waitUntil(triggerBuildCard(...))` — a
  fire-and-forget internal `fetch()` to `build-card.ts`, carrying
  `{userId, roleGbId, applicationId, interactionToken}`.
- `frontend/api/discord/build-card.ts` (plain Node — no `runtime: "edge"`
  config, which is what makes a Vercel `api/` file Edge; omitting it
  defaults to Node) does everything else: fetches the saved
  `user_characters` row (service-role client, all fields needed for the
  math — `forte_node_active`, `echoes`, not just the summary columns
  `/builds` uses), computes echo totals / active set bonuses / forte
  bonus totals / sequence bonus totals / final stats via
  `frontend/api/discord/stats.ts`, composes the card image, then edits
  the deferred placeholder itself via Discord's webhook message-edit
  endpoint (multipart `payload_json` + `files[0]`) — same pattern
  `/builds`' scrapped image attempt already worked out. **Never called
  directly by Discord** — protected by a shared-secret header
  (`X-Internal-Secret` / `DISCORD_INTERNAL_SECRET`, a new Vercel secret,
  self-issued — not tied to any external provider, so it's fine to
  generate locally and never needs to touch chat). Without this check,
  anyone could hit this route directly and either burn compute or read
  another linked user's build data, since Discord user ids aren't secret
  and this bypasses Discord's own interaction-signature verification
  entirely. **Handler signature is `(req: VercelRequest, res:
  VercelResponse)`, NOT `(req: Request) => Response`** — confirmed via a
  real deploy failure (`TypeError: req.headers.get is not a function`):
  Vercel's Node.js function runtime invokes the handler Express-style
  (headers as a plain lowercased object, `req.body` auto-parsed when
  `Content-Type: application/json`, response via `res.status(n).send(...)`
  not `return new Response(...)`), unlike Edge's Fetch-API shape. Edge and
  Node function handlers are NOT interchangeable in shape on this
  platform — don't copy one's handler signature onto the other. Needs
  `@vercel/node` installed (dev dependency) for the `VercelRequest`/
  `VercelResponse` types.
- `frontend/api/discord/_shared.ts` (no default export, not a route) —
  `getAnonClient()`/`getServiceClient()`/`editOriginalText()`/
  `editOriginalWithImage()`, used by both functions so the webhook-edit
  and Supabase-client logic isn't duplicated across them. Nothing
  runtime-specific in it (`createClient`/`fetch`/`FormData`/`Blob` all
  work identically on Edge and Node), so one file is safe to import from
  either.

**Stat computation: `frontend/api/discord/stats.ts` is a byte-identical
copy of `supabase/functions/agent/stats.ts`** (the agent's already-working
port of `frontend/src/lib/{stats,weapons,echoes,finalStats}.ts`'s pure
compute functions), not a fresh re-derivation — confirmed via investigation
that direct cross-package import from `frontend/src/lib` was technically
*possible* (no browser globals, no `import.meta.env` usage in that chain)
but would still need adapting every `fetch("/data/...")` call to an
absolute URL, and the forte-bonus aggregation loop isn't in `lib/` at all
(it's inlined in `BuildCard.tsx`) — the agent's `stats.ts` had already done
all of that adaptation once, correctly, including that exact loop as
`computeForteBonusTotals`. Copying it was less risk than re-deriving a
third implementation. **Do NOT let the two copies drift** — diff against
`supabase/functions/agent/stats.ts` if either needs a fix and apply it to
both; re-copy + redeploy both whenever `frontend/src/lib`'s originals
change. Needed data files
(`character_stat_curves/weapon_stat_curves/weapon_passive_bonuses/
echo_catalog/echo_stat_curves/echo_sets/sequence_stat_nodes/
sequence_node_stat_bonuses.json`) are bundled directly into
`frontend/api/discord/` too, same reasoning as `characters.json` — no
runtime fetch, no network-latency cost, consistent with wanting this
near-instant.

**Card rendering: `frontend/api/discord/_buildCardImage.ts`**, satori +
`@resvg/resvg-js` — the **native** binary addon this time, not
`@resvg/resvg-wasm`. This is the key difference from `/builds`' scrapped
Edge-runtime image attempt: running on a real Node function removes every
Edge-compatibility problem that attempt hit. `satori` is unpinned (latest,
`^0.62.0` as of this writing) — its `harfbuzzjs` dependency (the thing
that broke Edge) needs real Node `fs`/no-`self.location` assumptions that
a genuine Node runtime actually has, so there's no reason to hold it back
anymore. Font: still base64-embedded (`_fontData.ts`, same Geist font,
regenerated the same way — temporarily install `@vercel/og` just to copy
its bundled `.ttf`, then uninstall it again) rather than
`fs.readFileSync()`'d from a bundled asset file, specifically to avoid
*any* uncertainty over whether Vercel's build-time file tracer would
reliably include a binary asset referenced only via a runtime path — untested,
and not worth the risk after this session's deploy-cycle track record.
`@resvg/resvg-js` itself needs no such treatment at all: normal `npm
install` on Vercel's own Linux build machines resolves the correct
platform binary automatically, no manual asset bundling of any kind.

**Card shows (v2, widened to a 1100px card, revised 2026-10-16):**
portrait (`illustrationPictureUrl` — the larger build-card portrait the
site itself uses, not the roster-grid `cardPictureUrl`), name + level, a
weapon panel (icon from `weapon_catalog.json`, name, level/rank, computed
ATK + secondary stat), resonance chain progress, a computed final-stats
grid (HP/ATK/DEF/Energy Regen/Crit Rate/Crit DMG/elemental DMG bonus,
stat-icon-labeled via `stat_icons.json`, element-accent-colored), **a real
5-column Forte talent tree** (talent icon + skill-type label + level per
column, Forte Circuit showing the 2 real inherent-skill icons with
active/inactive styling, the other 4 columns showing their real forte
stat-bonus node icons with the same active/inactive styling — all sourced
from the new `talent_data.json` extract + the already-bundled
`sequence_stat_nodes.json`), active echo set badges (name + piece count),
and **a row of 5 real echo portrait tiles** (added same day — resolved via
a *local-to-`build-card.ts`* `echoPictureByNormalizedName` map built
straight from `echo_catalog.json`'s own `pictureUrl` field, deliberately
kept separate from `stats.ts`'s `EchoCatalogEntry` type rather than adding
`pictureUrl` there, since `stats.ts` must stay byte-identical to
`supabase/functions/agent/stats.ts` and the agent has no use for an image
URL; `computeEchoSlotBreakdown` — already exported by `stats.ts` for the
agent's own per-slot detail — supplies the cost-tier badge shown in each
tile's corner). Still deliberately NOT included: the per-echo-slot
substat detail and the resonance-chain diamond icon row — judged
lower-value than real portraits/stats/Forte-tree for a quick Discord
glance. Falls back cleanly when data's missing (no portrait → plain
bordered box, no `finalStats` → "Final stats unavailable" text, no weapon
→ "No weapon equipped", empty talents/inherentSkills/forteColumns → bare
circles with no label, no active sets → the badge row omitted, an empty
echo slot → a plain bordered tile with no cost badge).

**New data extract: `frontend/api/discord/talent_data.json`**, a lean
`roleGbId -> {talents: [...5], inherentSkills: [...2]}` map built by
`scripts/build_discord_talent_data.py` from `data/wuwa_characters.json`,
mirroring the exact field extraction + positional-skillType-fallback logic
in `frontend/src/lib/talents.ts`'s `loadTalents()`/`loadInherentSkills()`
(some characters' skillType text is zh-Hans-only, same gotcha documented
there). `characters.json` also gained `illustrationPictureUrl` (same
script, `build_discord_character_names.py`). `weapon_catalog.json` and
`stat_icons.json` are now bundled directly too (small enough — 62KB and
2.4KB — not worth a leaner extract).

**Why not a real screenshot — the actual tradeoff considered and
rejected, not skipped over:** a real headless-Chromium screenshot of the
live `BuildCard.tsx` was seriously evaluated. Two blockers killed it: (1)
the full `@sparticuz/chromium` binary is 70MB unpacked, over Vercel's
standard Node function size limit, and the workaround
(`@sparticuz/chromium-min`, fetching Chromium from an external host at
every cold start) trades that for real cold-start latency and a new
external-availability dependency; (2) even with that solved, `BuildCard.tsx`
only renders for whoever's logged into the browser — reaching it headless
for one specific Discord-linked user needs a whole new auth-bridging
piece (a signed short-lived token, a new unauthenticated-but-scoped
render route, a new endpoint to fetch that one user's row past RLS). A
hosted screenshot API (ScreenshotOne/ApiFlash/etc.) was also considered —
avoids the Chromium packaging problem, but adds a paid external SaaS
dependency with its own rate limits for something that can be computed
locally in under a second. Composing from the same underlying data wins
on every axis the user actually cared about (latency, compute cost, no
new external dependency) at the cost of not being pixel-identical and not
auto-tracking future site redesigns.

**Verified locally before deploying**, same discipline as every other
piece of this feature: called `renderBuildCard()` directly with realistic
mock data (including the empty-data fallback path) via a scratch `tsx`
script, caught and fixed a real layout bug this way before it ever reached
Vercel (the Forte tree columns had no room next to the stats grid and
wrapped into an overflowing vertical stack — fixed by stacking stats
above the talent row instead of beside it, and widening the card).
Render time: ~570-1600ms depending on how many remote images (portrait +
talent/forte icons) need fetching — still comfortably within Discord's
15-minute deferred-response window, and this path has NO Edge-WASM
loading tricks to go wrong the way `/builds`' scrapped attempt did, so
local verification here is a strong signal production will behave the
same way.

## Registering commands

Guild-scoped (instant, for dev/testing):
```
PUT https://discord.com/api/v10/applications/{DISCORD_APPLICATION_ID}/guilds/{guild_id}/commands
Authorization: Bot <token>          -- NEVER paste the real token into chat; set it as a
Content-Type: application/json      -- local env var or type it directly into the command
```
Body is a JSON array of command objects, e.g.
`[{"name": "link", "description": "Link your Discord account to your WuWa Build Planner account", "type": 1}]`.
Drop `/guilds/{guild_id}` for a global command (~1hr propagation instead of
instant) once a command is ready for everyone. On Windows PowerShell 5.1,
write the body to a file first (`Set-Content -Path command.json -Encoding
ASCII -Value '...'` — note `utf8NoBOM` is PS7+-only, 5.1 only has
`UTF8`/`ASCII`/etc., and plain `UTF8` in 5.1 prepends a BOM that can
corrupt the JSON) and pass it via `curl.exe -d "@command.json"`, since
PowerShell's own escaping (and `Invoke-RestMethod`/`Invoke-WebRequest`,
which hit real TLS-renegotiation issues on this machine) made inline
JSON unreliable during initial testing.
