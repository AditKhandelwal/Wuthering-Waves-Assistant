# Discord Bot

**Status: just started (2026-10-16) — only the PING/PONG handshake
exists.** No slash commands are registered or implemented yet. This file
will grow alongside `agent.md`/`api.md`/`database.md` as the feature does;
right now it mostly records decisions made before any real command exists,
so the next session doesn't re-litigate them.

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

## Account linking (designed, not built yet)

Code-based linking, not Discord OAuth2 — chosen because it needs no
registered OAuth redirect URI or consent-screen setup, and the bot already
knows the Discord user's id/username from the interaction itself. Planned
shape:
- `/link` generates a short code, stores `{code, discord_user_id,
  discord_username, created_at}` in a new `discord_link_codes` table
  (short expiry, ~10 min), replies **ephemerally**
  (`InteractionResponseFlags.EPHEMERAL`) with a link to
  `/link/:code` on the live site.
- That frontend route: if signed out, shows login/signup and continues
  into the confirm step after success (same URL survives the redirect);
  if signed in, shows "Link this account to Discord user X? [Confirm]".
- Confirm writes `{user_id: auth.uid(), discord_user_id}` into a
  `discord_links` table (one-to-one both directions) and deletes the code.
- `/builds`/`/build` then resolve `discord_user_id -> user_id ->
  user_characters`, same data `get_user_roster`/`get_character_build`
  already expose to the agent.

Neither table exists yet. Not built: the `/link/:code` page, the two
Supabase tables/migration, or any slash command beyond the bare PING
handshake.
