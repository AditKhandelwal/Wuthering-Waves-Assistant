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
