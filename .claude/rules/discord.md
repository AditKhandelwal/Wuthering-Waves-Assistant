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

**`/builds` verified end-to-end in production 2026-10-16.** `handleBuilds()`
in `interactions.ts` resolves `discord_user_id -> user_id` via
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
`DISCORD_BOT_TOKEN`). Character name + element resolved via
`frontend/api/discord/characters.json`, a lean `roleGbId -> {name,
element}` map built by `scripts/build_discord_character_names.py` from
`data/agent_character_guides.json` — same "small bundled extract, no
runtime fetch" pattern as the agent's `weapon_names.json`/
`character_guides.json`, needed because the Edge runtime has no
filesystem access (`fs` doesn't exist there) and the full
`wuwa_characters.json` is 4.6MB, nowhere near fitting Discord's 3-second
response budget. Rerun that script (and redeploy) whenever
`agent_character_guides.json` changes.

**Reply is a composed grid image of real character portraits, not text or
an embed with fields** (switched 2026-10-16 — the user explicitly wanted
actual photos, not an emoji substitute). Discord embeds have no per-field
icon slot (only one thumbnail/image for the *whole* embed) and a message
can hold at most 10 embeds, too few for a full roster — so the only way to
get a real portrait next to every name is to render one single image
server-side.

**Built with `satori` + `@resvg/resvg-wasm` directly, NOT `@vercel/og`.**
`@vercel/og`'s `ImageResponse` is the usual way to do this on Vercel and
was tried first, but its `package.json` only resolves to its
Edge-compatible build (`dist/index.edge.js`) when a bundler sets the
`"edge"`/`"edge-light"` export condition. Next.js's build sets that
automatically for edge routes; Vercel's bundler for a plain (non-Next.js)
project's `api/` Edge Functions apparently does not, so it silently
resolved to the Node-targeted build instead (dynamic `require("fs")`
inside) — which Vercel's own deploy-time Edge-compatibility check then
rejected outright: *"The Edge Function 'api/discord/interactions' is
referencing unsupported modules: - @vercel: module"*. `satori` and
`@resvg/resvg-wasm` (what `@vercel/og` uses internally anyway) have no
such edge/node branching — plain universal JS/WASM, both listed as direct
dependencies now — so calling them directly sidesteps the problem
entirely. `frontend/api/discord/_buildsImage.ts` (no default export —
leading underscore is Vercel's own convention for "not a route" files
under `api/`) does the actual rendering; it stays on the Edge runtime
rather than needing a separate Node function.

Two things had to be vendored as a result, since `@vercel/og` previously
supplied both internally:
- **`frontend/api/discord/resvg.wasm`** — a copy of `@resvg/resvg-wasm`'s
  own wasm binary, imported via Vercel's documented precompiled-Wasm
  convention, `import x from "./resvg.wasm?module"`
  (https://vercel.com/docs/functions/wasm — confirmed via WebSearch, the
  only Wasm-loading path that actually works in a Vercel Edge Function; a
  Node `fs` read, which local testing uses instead, isn't available at
  all). Typed by `frontend/api/discord/wasm-module.d.ts` (no built-in TS
  types exist for the `?module` import form). `initWasm()` is memoized at
  module scope so a warm function instance doesn't re-initialize it on
  every invocation.
- **`frontend/api/discord/_fontData.ts`** — Geist-Regular.ttf (Vercel's
  own open-source font, SIL licensed; satori needs a font explicitly, it
  doesn't bundle a default the way `@vercel/og` did) base64-embedded as a
  string constant, decoded to an `ArrayBuffer` at call time. Base64 rather
  than a bundler-specific asset import: unlike the wasm case, there's no
  confirmed-documented Vercel Edge convention for importing a raw `.ttf`,
  and base64 is guaranteed to work identically on any JS runtime with zero
  bundler-specific risk. Sourced originally from `@vercel/og`'s own
  bundled copy of the font — vendored as a static asset, not a code
  dependency on that package.

The element tree itself is written as plain `{type, props}` object
literals, not JSX — satori accepts anything shaped like a React element,
and a plain object is exactly that shape without needing a `.tsx`
extension or a JSX pragma in `tsconfig.api.json`. Satori requires an
explicit `display: "flex"` (or `"none"`) on every element with children;
it doesn't support default block layout like a real browser. Portraits
come from `cardPictureUrl` in `frontend/api/discord/characters.json`
(added to the extract alongside name/element 2026-10-16, pulled from
`data/wuwa_characters.json`'s `role.cardPictureUrl` — same field the
frontend's own `CharacterCard.tsx` uses, so the Discord image matches the
site's real portraits), fetched directly by satori at render time (remote
`<img src>` is a supported, core use case). A character with no picture
URL gets a plain dark circle instead of a broken image. No field/count
cap — image real estate scales with rows, unlike the earlier embed-fields
approach's 25-field ceiling.

**Deferred response, not an immediate one.** Composing the image means
fetching every portrait URL plus the DB lookups, which can easily exceed
Discord's 3-second initial-response budget — especially for a large
roster. `handleBuilds()` returns `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`
(type 5) immediately and kicks off the real work
(`sendBuildsFollowup()`) via `waitUntil()` from `@vercel/functions`
(Edge-compatible background continuation after the response is sent). The
follow-up work edits the deferred placeholder via Discord's webhook
message-edit endpoint (`PATCH
.../webhooks/{application_id}/{interaction_token}/messages/@original`,
multipart with a `payload_json` + `files[0]` part for the PNG) — no bot
token needed for this call, the interaction's own token authorizes it,
and it's valid for 15 minutes, far more headroom than the original 3
seconds. This is the first use of the deferred-response pattern in this
project; `/build`'s screenshot piece (see below) will reuse it.

**Verifying this locally, since it's genuinely new territory (first image
generation in this project):** the production wasm-loading path
(`?module` import) is a Vercel-bundler-specific convention plain Node/tsx
doesn't understand, so it can't be exercised byte-for-byte locally —
same "test against the real deployed thing" limitation as the Supabase
agent function and the interactions endpoint itself. Verified everything
*else* instead: called `satori` + `@resvg/resvg-wasm` directly with the
wasm bytes loaded via `WebAssembly.compile()` over an `fs` read (a
reasonable substitute — both paths end at the same
`initWasm(WebAssembly.Module)` call) and the real `_fontData.ts` import
unchanged. Rendered a 5-7 portrait test grid in ~500ms including a real
remote image fetch, produced a valid PNG both times (before and after
dropping `@vercel/og`), visually confirmed correct (gold-ringed circular
portraits, grid layout, placeholder circle for a missing picture, text
rendering with the embedded font).

**Gotcha hit building this — do NOT use `with { type: "json" }` on JSON
imports in `frontend/api/`:** it satisfies Vercel's build-time type-check
(which resolves `module` as NodeNext for `api/` functions regardless of
`tsconfig.api.json`'s `"esnext"` setting, surfacing as a non-fatal TS1543
in deploy logs) but the actual bundler Vercel uses to produce the deployed
function (esbuild) does NOT support that syntax and hard-fails the whole
deploy (`Expected ';' but found 'with'`). A plain `import x from
"./y.json"` works fine at runtime despite the cosmetic TS1543 — leave it
alone.

**Not built yet:** `/build {character_name}` — the screenshot-rendering
piece (headless Chromium, separate Node function + deferred response, see
"Why Vercel Edge runtime" above) isn't designed yet beyond that one
paragraph. It'll reuse the same service-role lookup pattern `/builds` now
established.

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
