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

**`/stats {character}` (renamed from `/build` 2026-10-16 -- see the
v6/v7 section below) renders a real Build Card image with computed
final stats.** Takes a required string option (`character`), resolved to
a `roleGbId` via `resolveCharacterId()` (case-insensitive, exact match
first then substring — same order the agent's own resolver uses) against
`characters.json`.

**Two-function split, Edge + Node**, because the image render needs real
Node APIs that Edge doesn't provide (see the "Gotcha" note below) but
Discord still requires a response within 3 seconds:
- `interactions.ts`'s `handleStats()` (Edge, fast) does only the cheap
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

**Gotcha, confirmed via a real deploy failure on the first live echo-tile
render: echo image URLs are relative, every other image source isn't.**
Character portraits (`guide-res.aki-game.net`) and weapon icons
(`static.dotgg.gg`) are absolute Kuro/dotgg CDN URLs, but echo images are
self-hosted under `frontend/public/echo-images/`
(`scripts/download_echo_images.py` — avoids CORS issues with their
original game8.co source), so `echo_catalog.json`'s `pictureUrl` is a
site-relative path like `/echo-images/....png`. Satori has no "current
page" to resolve a relative URL against and hard-fails outright (`Image
source must be an absolute URL`) — the whole echo tile row silently never
appeared at all on the first live test (not even empty bordered tiles),
which is what made this confusing to diagnose purely from a screenshot;
the real signal was in Vercel's Runtime Logs. Fixed by
`absoluteUrl()` in `build-card.ts`, prepending `SITE_URL` to any
`pictureUrl` starting with `/` before it reaches `renderBuildCard()`.
Checked the other three image sources (weapon catalog, character
portraits, stat icons, talent/inherent-skill icons) directly against
`data/*.json` afterward and confirmed none of them have this problem —
echo images are the only relative one.

**Styled to match the real site much more closely (v3, same day,
following an explicit "I want it to be a 1:1" request) — exact color
tokens, a gradient wash, and real diamond-shaped nodes:**
- `BG`/`PANEL`/`BORDER`/`GOLD`/`GOLD_SOFT`/`TEXT`/`TEXT_MUTED` are now the
  *exact* hex values from `frontend/src/index.css`'s `@theme` block, not
  approximations — kept in sync by hand (no build-time import across the
  Vite/satori boundary; check that file if this card's palette ever looks
  off from the real site).
- The card background is now a `linear-gradient` wash tinted with the
  character's element color, echoing the real card's `.card-atmosphere`
  CSS (`color-mix(in srgb, var(--card-glow-color) 26%, var(--color-bg))`
  faded to `var(--color-bg)`) — satori's CSS parser doesn't evaluate
  `color-mix()`, so `hexBlend()` precomputes the equivalent plain `rgb()`
  string in JS instead. The real card's starfield dot layer (12 stacked
  `radial-gradient`s) is deliberately NOT replicated — not worth the
  satori-compatibility risk for a background flourish, per discussion.
- **Talent/forte-node/inherent-skill icons are now rotated 45°
  "diamonds"** (`diamondNode()`), matching `BuildCard.tsx`'s real
  `rotate-45` + counter-rotated `-rotate-45` icon pattern, instead of
  plain circles. Confirmed satori supports `transform: rotate()` via an
  isolated local test *before* committing to it across the whole talent
  tree — cheap to verify, would have been expensive to discover broken
  after wiring it through five columns.
- **Still NOT replicated, a deliberate scope line, not an oversight:**
  the `clip-corner` angular panel shape (`clip-path: polygon(...)` —
  satori has no clip-path support at all) and the starfield background
  dots. Plain rounded corners and a flat gradient stand in for those.

**Echo tiles now show real substats, not just a portrait + cost badge** —
the thing the user explicitly flagged as "not there like they're supposed
to be." Each tile is now a taller card (portrait + cost badge, the main
stat line, then all 5 substat rows with icon + formatted value).
`formatStatValue()`/`isFlatStat()` in `_buildCardImage.ts` mirror
`frontend/src/lib/echoes.ts`'s exact convention (HP/ATK/DEF are flat
integers, everything else is a *truncated*-to-1-decimal percentage, not
rounded — the game truncates displayed percentages, confirmed against a
real screenshot once already for the site's own version of this logic,
see that file's comment). Main stat / substats come straight from
`computeEchoSlotBreakdown()` (`stats.ts`, already exported for the
agent's own per-slot detail) via `build-card.ts`'s existing call to it —
no new data pipeline needed, just reading more fields off what was
already being computed. An empty/unresolved substat slot renders as a
plain `—` placeholder row instead of being omitted, keeping all 5 tiles'
row counts visually aligned.

**v4 (same day) — a direct side-by-side comparison against a real site
screenshot surfaced real, concrete gaps beyond color, and one real bug:**
- **Icons invisible against dark panels (the "some icons are black"
  report) — root cause and fix.** The real site always wraps these icons
  in `SolidIcon` (`BuildCard.tsx`), which applies `brightness-0 invert`
  (see `.claude/rules/frontend.md`'s "Recoloring icon images") — without
  it, these dark/semi-transparent line-art icons are nearly invisible on
  a dark panel; some icons' artwork happened to show through faintly
  (looked "almost fine"), others didn't (looked solid black), which is
  exactly the inconsistent pattern reported. Confirmed satori supports
  CSS `filter` via an isolated local test (one icon rendered with and
  without `filter: "brightness(0) invert(1)"` side by side) *before*
  applying it broadly. Now applied to every talent/inherent-skill/
  forte-node/sequence-node/keynote-skill/stat icon (everything that goes
  through `SolidIcon` on the real site) via an `invert` parameter on the
  local `icon()` helper — deliberately NOT applied to the character
  portrait, echo art, or weapon icon, which are real full-color artwork.
- **Layout restructured to match `BuildCard.tsx`'s actual JSX, not just
  its colors.** The real card is `flex items-start gap-4 border-b ...` 
  containing `flex-col` (stats panel + resonance-chain diamond row,
  stacked) next to `flex-1 border-l` (Forte talent tree + Outro Skill/
  Tune Break row, stacked) — side by side, not stats-above-talents like
  the v3 layout had. Rebuilt to match: `statsPanel` + `sequenceRow` in
  one sub-column, `talentCols` + `keynoteRow` in the other, border-
  separated. Card widened 1100px → 1900px to fit this properly (a first
  attempt at 1760px still clipped the 5th talent column and 5th echo
  tile off the right edge — satori doesn't clip overflowing content
  visibly either, it just isn't present in the fixed-size raster output,
  the same failure mode as the earlier HEIGHT-overflow bug on `/builds`'
  grid attempt, just sideways this time).
- **Final stats grew from 7 metrics to the real 12**, in a two-column
  list-panel (icon + label + right-aligned value, uniform `TEXT` color —
  the real card does NOT accent-color Crit Rate/DMG/elemental values the
  way the v3 attempt did) instead of separate boxed tiles. The 4 new
  ones — `basicAttackDmgBonus`/`heavyAttackDmgBonus`/`skillDmgBonus`/
  `liberationDmgBonus` — aren't part of `stats.ts`'s `FinalStats` (the
  agent doesn't need them, and `stats.ts` must stay byte-identical to the
  agent's copy), so they're computed locally in `build-card.ts` instead,
  replicating `frontend/src/lib/finalStats.ts`'s own formula exactly
  (echo totals + the weapon's unconditional passive bonus, nothing else
  contributes) via a sibling `ExtraDmgBonuses` object, not by widening
  `FinalStats` itself.
- **Resonance-chain row and Outro Skill/Tune Break row**, both entirely
  missing before. New data: `talent_data.json`'s extract now also carries
  `keynoteSkills`/`sequenceNodes` (same script, same `wuwa_characters.json`
  source — `roleSkill.keynoteSkills`/`roleResonance.items`, mirroring
  `loadKeynoteSkills()`/`loadSequenceNodes()`'s exact field extraction).
- **Echo tiles gained the echo's real name and full stat *names*** next
  to each value (`Crit. DMG 44.0%`, not just an icon), matching the real
  card instead of showing icon+value alone.
- Talent column labels are now uppercase, matching the real card.

**v5 (same day) — rewrote by transcribing EXACT Tailwind values from the
real component source** (`BuildCard.tsx`, `FinalStatsGrid.tsx`,
`EchoCardTile.tsx`, `StatIcon.tsx`, `TalentGrid.tsx`) instead of
approximating by eye, after v4's screenshot-comparison approach still
wasn't close enough. Concrete corrections this found:
- **Forte stat-bonus nodes are CIRCLES** (`ForteNodeDisplay`,
  `rounded-full`), not diamonds — only the main talent icon, inherent-
  skill nodes, and sequence/resonance nodes are rotated diamonds. An
  earlier version made every node type a diamond.
- Exact sizes: main talent diamond 32px (`h-8 w-8`, not 46px), inherent-
  skill/forte-node 28px, sequence/resonance diamond 44px
  (`bg-panel-ALT`, unlike every other diamond which uses plain `bg-panel`
  — confirmed by reading `CompactSequenceRow` directly), keynote-skill
  circle 32px, weapon icon 64px (`h-16 w-16`, not 48px).
- **`StatIcon.tsx` (used in the stats panel, weapon panel, and echo
  tiles) is a plain `<img>`, NEVER inverted** — only `SolidIcon`
  (talent/inherent/forte/sequence/keynote icons) gets `brightness-0
  invert`. An earlier version inverted every icon uniformly; confirmed by
  reading `StatIcon.tsx` directly (no filter class at all).
- **Echo portraits are small 36px circles** with a cost-tier-colored ring
  (`COST_DISC_CLASS`) and a small sonata-set badge overlaid on the
  corner (now resolved via a new local `echoSetIconByName` map in
  `build-card.ts`, same "separate local lookup" pattern as echo
  pictures — `echo_sets.json`'s `iconUrl` isn't part of `stats.ts`'s
  `EchoSet` type either), not a large rectangular hero image — a v4
  version made the portrait the dominant visual element, which isn't how
  the real tile looks at all.
- **The final-stats panel is ONE bordered box** with an internal
  2-column CSS grid and divider lines between rows (`divide-y
  divide-border/60`, replicated as an explicit `borderTop` on every row
  after the first, since satori can't express a real sibling-selector
  divider), not separate boxed tiles.

**A real, very confusing layout bug and its actual root cause — read
this before touching width/height constants again.** A "5th item
clipped off the right edge" symptom survived, in order: three
successive `WIDTH` increases (1340→1900px), switching the talent
columns and then the echo tiles to explicit fixed widths instead of
`flex: 1`, and adding `minWidth: 0` everywhere a flex-shrink gotcha
seemed plausible. None of it worked, because none of it was the actual
cause. **The real cause: satori's default `box-sizing` is `content-box`
(like raw CSS/SVG), not `border-box` the way Tailwind's global reset
makes every element on the real site behave.** A container declared
`width: "310px"` with `padding: "8px"` and a 1px border was actually
*rendering* at 328px — padding and border add to the declared width
under `content-box` instead of being carved out of it. Across 5 tiles
plus gaps, that compounds into real, substantial drift, and the ROOT
CARD ELEMENT ITSELF had the same problem (`width: WIDTH` + `padding:
"16px"` + a 1px border), meaning the whole card was rendering a few
dozen pixels larger than the fixed satori canvas it was being
rasterized into — so the card's own right/bottom edges, and everything
inside them, were being silently cut by the canvas boundary. Found by
dumping satori's raw SVG output (`DEBUG_SVG=<path>` env var, temporarily
wired into `renderBuildCard` and removed again) and discovering the
root `<rect>` was `1934×684` against a declared `1900×650` canvas — not
by guessing. Fixed with one change: `boxSizing: "border-box"` is now
the default in the `flexCol`/`flexRow` helpers, plus every other
raw-`div` element in this file that combines an explicit width/height
with padding or a border got it added explicitly too (the root card
element, the 5 diamond/circle node functions, the portrait image and
its fallback box, the echo tile's circular portrait). **If a future
edit to this file adds a new sized+bordered element without going
through `flexCol`/`flexRow`, add `boxSizing: "border-box"` to it too,
or risk reintroducing exactly this bug.**

A second, smaller contributor to the same symptom (found and fixed
first, before the box-sizing issue was known): `echoStatLine`'s stat-
name label (`"Resonance Liberation DMG Bonus"` is a real one) had no
wrap/truncation constraint, so long names forced their row wider
regardless of any flex/minWidth setting on ancestors — same root-cause
category as the talent-label overflow fixed in v4, just a second
instance of it. Fixed with the same `overflow: hidden` / `whiteSpace:
nowrap` / `textOverflow: ellipsis` treatment, matching `EchoCardTile
.tsx`'s own `truncate` utility class.

Also worth remembering for next time: a "content looks cut off"
symptom that persists identically across multiple `WIDTH` increases is
a signal to stop guessing and dump the raw SVG instead (`new
Resvg(svg).render()`'s input `svg` string, or just add a temporary
`DEBUG_SVG` env-var check like the one used here) — check the root
`<svg>`'s own `width`/`viewBox` against the actual rendered `<rect>`/
text bounding boxes. A "scale the whole PNG down and see if it's a
preview-display artifact" test (via `new Resvg(svg, { fitTo: { mode:
"width", value: N } })`) and a minimal reproduction with plain colored
boxes (no text, no real data) were both tried first and were both
useful for ruling things out, but didn't find the actual cause as
quickly as just reading the SVG's own coordinates would have.

**New data extract: `frontend/api/discord/talent_data.json`**, a lean
`roleGbId -> {talents: [...5], inherentSkills: [...2], keynoteSkills: [...2],
sequenceNodes: [...6]}` map built by
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

**v6/v7 (2026-10-16, after the first live screenshots came back) — renamed
to `/stats`, made its reply public, and closed real gaps found from
production renders, not screenshots this time:**
- **`/build` renamed to `/stats`** (`handleStats()` in `interactions.ts`,
  `command.json`'s registration payload) — re-registered as a global
  command (`curl.exe -X PUT .../commands -d "@command.json"`, see
  "Registering commands" below; PowerShell 5.1's `curl` alias to
  `Invoke-WebRequest` doesn't support `-d @file` at all, `curl.exe`
  bypasses that). Global command updates can take up to ~1hr to
  propagate to every Discord client even though the API call itself
  succeeds instantly — a stale `/build` autocomplete entry for a while
  after re-registering is expected, not a sign anything failed.
- **`/stats`'s reply is now public, `/builds` stays ephemeral.** Discord
  ties a deferred interaction's visibility to its *initial* deferred
  response, not the later webhook edit that fills in the real content —
  `deferredReply()` (only ever used by `/stats`) no longer sets
  `InteractionResponseFlags.EPHEMERAL`; `/builds` keeps using the
  separate `ephemeralReply()` helper, untouched.
- **Card sent as a plain attached image, not an embed.** `editOriginalWithImage`
  used to wrap the PNG in a Discord embed (`image.url:
  "attachment://..."`); now it's just `attachments` in the payload, no
  `embeds` field at all, per request.
- **Crit DMG (and every other percentage stat) could show raw
  floating-point drift** — `272.59999999999997%` instead of `272.6%`,
  caught live by a user. Root cause: the final-stats panel's left/right
  row values were built with raw string interpolation
  (`` `${stats.critDmg}%` ``) instead of going through the same
  `formatStatValue()` the real `FinalStatsGrid.tsx`'s `Row` component
  always uses for every single row, HP/ATK/DEF included. Fixed by routing
  every value through it, matching the real component exactly.
- **Portrait is a `flex: 1` box, not a fixed-height image.** The real
  `BuildCard.tsx` wraps the portrait in `min-h-0 flex-1` so it fills
  whatever vertical space is left in the left column after the name row
  and weapon panel — a fixed `PORTRAIT_HEIGHT` constant (v5's approach)
  left a visible blank gap below the weapon panel whenever the right
  column's content was taller than that fixed value, and forced a more
  aggressive `object-fit: cover` crop off the *bottom* of the portrait
  art than the real flexible box ever produces. Both were exactly what a
  user flagged from a live screenshot. `PORTRAIT_HEIGHT` is gone entirely
  now; satori resolves the actual leftover height itself, same as a real
  browser would, since the outer row's default `align-items: stretch`
  already gives the left column the card's full height.
- **Talent tree now has the real cascading arc AND real connector
  lines**, found missing by comparing directly against a reference
  screenshot of the real card's Forte tree. `ARC_OFFSET_BY_DISTANCE =
  [0, 14, 46]` (indexed by a column's distance from the center Forte
  Circuit column) is now applied as `marginTop` per column, same as
  `BuildCard.tsx` — requires the talent-column row to use `alignItems:
  "flex-start"` instead of the default `stretch`, or the offsets get
  erased by every column being forced to the row's full height.
  Separately, each stacked node (forte circles / inherent-skill diamonds)
  is now followed by an actual 16px vertical line element
  (`connector()`, matching the real `Connector()` component exactly,
  `h-4 w-px bg-border`) instead of just flex-gap spacing — v5's uniform
  8px gap had no visible line at all between nodes, which read as too
  cramped against the reference. The Forte Circuit column's 2 inherent-
  skill diamonds are now also rendered in the real REVERSED order
  (`[...inherentSkills].reverse()` in `BuildCard.tsx`) — a real
  discrepancy v5 had, not just a cosmetic difference.
- **Element glyph added next to the character name**, matching
  `BuildCard.tsx`'s `ElementIcon` placement. New `elementIconUrl` field
  on the Discord character extract, sourced from
  `wuwa_characters.json`'s `role.element.pictureUrl` (same field
  `frontend/src/lib/characters.ts`'s `elementIcons` map already reads for
  the real site) — `scripts/build_discord_character_names.py` now pulls
  it alongside the existing name/element/picture fields. Rendered
  **untinted and unglowed**: the real `ElementIcon.tsx` colors this
  (already-white-silhouette) icon via a CSS `mask-image` + a colored
  `drop-shadow` glow, and satori's CSS subset has no `mask-image` support
  at all — a deliberate scope line, same category as `clip-path`/the
  starfield background being skipped elsewhere in this file, not a bug.
- **Echo tiles were getting their last substat row clipped at the
  canvas's bottom edge** — caught from a real screenshot of a live
  character (Hiyuki), not locally beforehand, because the local
  verification fixture used at the time had an empty `sequenceNodes`
  array. A real character's card includes a populated 6-node sequence
  row, and that plus the new cascading arc's extra height push the top
  row's natural height past what `HEIGHT=500` (tuned against that
  under-populated fixture) actually had room for — the same "fixed
  satori canvas silently drops anything past its edge" failure mode
  documented in the v5 box-sizing section above, just triggered by a
  fixture gap this time rather than a CSS gap. Fixed by bumping
  `HEIGHT` to 560, re-verified locally with Hiyuki's real 6-node
  sequence data included this time before landing on that number.
  **Lesson for next time:** a verification fixture needs to exercise the
  richest realistic case (populated sequence nodes, keynote skills, full
  echo substats) or a local "looks fine" render can still miss a real
  overflow that only shows up on an actual character.

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
