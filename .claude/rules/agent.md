# Agent

**Status: implemented and deployed** — `supabase/functions/agent/index.ts`
(Deno Edge Function), `frontend/src/pages/ChatPage.tsx` (route `/chat`, a
"Chat" link in `Header.tsx` next to "My Builds"). Everything below
describes what's actually live, not a target design.

## Architecture
Raw ReAct loop using the Claude API's tool calling, running as a Supabase
Edge Function. No frameworks (no LangChain/LangGraph). See `architecture.md`'s
"Decision: Edge Function, not FastAPI" for why this isn't a Python backend.

## LLM
- Provider: **Claude API**, not Groq — switched 2026-08-10. Groq was
  originally chosen specifically for being free (see the git history of
  this file for that reasoning), but its 100K-tokens/day free-tier cap on
  `llama-3.3-70b-versatile` kept getting hit during normal development/
  testing, leaving the agent unusable for stretches at a time. That
  trade-off is now inverted: Claude bills per token (real, if small, cost
  per message) but has no comparable hard daily wall.
- Model: `claude-haiku-4-5-20251001` — chosen as the cheapest current
  Claude model, and a good fit for this workload (structured tool-calling
  over a small, fixed tool set, not open-ended long-form writing).
- Max tokens: 2048 per response
- Temperature: 0.3 (low — we want consistent, factual reasoning over game data)
- API key stored as a Supabase Edge Function secret (`npx supabase secrets
  set ANTHROPIC_API_KEY=...`, from a key created at console.claude.com —
  a separate account/billing setup from a Claude Code subscription, which
  does NOT cover Messages API usage), read via
  `Deno.env.get("ANTHROPIC_API_KEY")`. **Never** put this in any
  `frontend/` file — anything under `VITE_`-prefixed env vars gets bundled
  into the client and is publicly readable.

## No embeddings / no RAG
Deferred entirely for v1, not just "not built yet" — see `architecture.md`'s
"Decision: no RAG in v1". The 4 tools below are all structured lookups; none
need semantic search.

## ReAct loop (as implemented)
Every turn is exactly **one** streamed Claude request
(`streamAnthropicTurn()` in `index.ts`), parsed manually via SSE to
accumulate both text and `tool_use` content blocks from the same response:
```
system = SYSTEM_PROMPT (Claude's system prompt is a separate top-level API
          field, not a "system"-role message like OpenAI/Groq's format)
messages = [...prior chat history, latest user message]
loop (max 5 iterations):
    stream one Claude request over (system, messages)
    if the response has no tool_use blocks -> done, this is the final answer
    else -> append an assistant message with the tool_use block(s), run
            each tool, append ONE user message with a tool_result block per
            call (Anthropic requires all of a turn's tool_results to land
            in a single following message), loop again
stream the final answer to the client as one SSE chunk
```
This single-request-per-turn shape carried over unchanged from the app's
original Groq-based implementation, where making two separate requests per
turn (one non-streamed just to check for tool calls, then a second
streamed one for "the real answer" if none came back) turned out to be
unsound at nonzero temperature — the two calls could disagree, and in
testing a plain-text answer from the first request got silently replaced
by a raw tool-call fragment from the second. Parsing one stream removes
that failure mode entirely, at the cost of buffering the whole answer
server-side instead of forwarding tokens live — acceptable for now,
revisit if token-level streaming becomes a priority.

Max iterations: 5.

**Response format note:** `streamAnthropicTurn` only reads `content_block_start`/
`content_block_delta` SSE events (ignoring `message_start`/`content_block_stop`/
`message_delta`/`message_stop`) — Anthropic's stream format is fundamentally
different from OpenAI/Groq's (typed `event:`/`data:` pairs and per-block
`text_delta`/`input_json_delta` deltas, vs. Groq's flat `choices[0].delta`
shape), not just a renamed field or two. The SSE envelope this function
sends back to `ChatPage.tsx`, however, is unchanged — it's this app's own
invented wrapper, not either provider's wire format, so the frontend needed
zero changes for this provider switch.

## Conversation history
The Edge Function itself is stateless — no `conversation_history` table
(see `database.md`). `ChatPage.tsx` keeps the full message list in React
state for display, but only sends the most recent `MAX_HISTORY_MESSAGES`
(8) as an optional `history: {role, content}[]` array on each request —
added 2026-08-10 after a long chat's full history (resent on every turn,
and again on every tool-call iteration within a turn) turned out to be a
real contributor to hitting Groq's daily token cap. The function prepends
that history to `messages` ahead of the latest user turn. Only plain user/
assistant text is replayed, never past tool calls/results, to keep the
payload small and avoid re-running stale tool calls.

## Auth
Every request must carry a real Supabase session JWT in the `Authorization`
header. The function builds an RLS-scoped Supabase client from that header
(`global.headers.Authorization`) and calls `supabase.auth.getUser()` to
verify it — 401 if missing or invalid. No service-role key exists anywhere
in this function; every DB query a tool makes is bound to the caller's own
`auth.uid()`, same as the rest of the app.

## CORS
The frontend calls the function directly from the browser, so it must
handle the preflight `OPTIONS` request and set
`Access-Control-Allow-Origin`/`-Headers`/`-Methods` on **every** response,
including error ones — this was missing initially and only surfaced once
the chat UI was tested in an actual browser (curl/Node-based testing during
earlier tool development never hit it, since there's no preflight outside a
browser).

## System prompt
Grown well past a one-liner as real usage surfaced gaps — not reproduced
verbatim here anymore (it'll only drift out of sync again), see
`SYSTEM_PROMPT` in `index.ts` for the exact current text. Covers, roughly:
base role/scope (build advisor, no ToA/Whimpering Wastes/Endstate Matrix
data), a **CRITICAL anti-confabulation rule** (added 2026-08-10 — never
state a name/slot label/stat/number not literally present in a tool's
JSON; treat a `*Note` field on a null value as an instruction to say so
plainly), numeric/scannable comparison formatting rules, talent-priority
comparison guidance (see `get_character_guide` below), and permission to
use general Wuthering Waves knowledge — clearly labeled as such — when
asked to evaluate a custom/hypothetical team `get_team_comps` has no data
for.

## Tools (the real 4 — see `architecture.md` for what got dropped from the
original 6-tool sketch and why)

All four take `character_name` (a string, matched case-insensitively —
exact match first, then substring, via `resolveCharacterId()`), except
`get_user_roster` which takes nothing:

- **`get_user_roster`** — every character in `user_characters` for the
  caller, with level/weapon/last-updated
- **`get_character_build`** — the caller's own saved build for one
  character: level, **resolved weapon name** (not a raw ID — resolved via
  `weapon_names.json`, a gbId->name map merged from dotgg's catalog +
  Kuro's per-character weapon texts by
  `scripts/build_agent_weapon_names.py`, 117/118 coverage; a dotgg-only
  bundle used until 2026-08-10 covered only 100/118 and a real user's
  weapon — "Everbright Polestar," Kuro-only — showed up as "Unknown (id
  ...)"), talent levels, sequence nodes unlocked, **computed final stats**
  (HP/ATK/DEF/Crit Rate/Crit DMG/Energy Regen/elemental DMG bonus —
  aggregated from character base + weapon + echoes + active forte nodes),
  **activeEchoSets** (equipped sonata set + piece count + the actual
  active bonus text, not individual echo names), and **`echoes`** — a
  per-slot breakdown (main stat + all 5 substats for each of the 5
  equipped echoes, numbered 1-5, never named by body part) added
  2026-08-10 so the agent can answer "which echo should I replace"
  instead of only having aggregate totals. Only works for characters
  they've actually saved. The stat aggregation is a deliberate Deno port
  of `frontend/src/lib/{stats,weapons,echoes,finalStats}.ts`'s pure
  compute functions, in `supabase/functions/agent/stats.ts` — added
  2026-08-10 after the tool originally returned raw stored fields (weapon
  ID, raw echo substats, a bare talent-level array) and the model
  couldn't reliably turn that into a real comparison: it flagged
  mismatched echo *names* instead of sets, told a user to switch to a
  weapon they already had equipped (no way to map the ID to a name), and
  fabricated a "recommended talent level" that doesn't exist anywhere in
  this app's data. Computing real numbers server-side fixed all three at
  the root. Re-copy the 7 bundled `data/*.json` files into this directory
  and redeploy whenever they change (same rerun-and-redeploy requirement
  as `character_guides.json`).
- **`get_character_guide`** — Kuro's recommended build for any character:
  stat thresholds, recommended echo/sonata set, ranked weapons,
  **per-skill talent priority** (`talentPriority` — an ordered list of the
  5 skills with each one's real `recommendLevel`, first entry = level
  first), and rotation notes. Sourced from `character_guides.json`, a lean
  extract built by `scripts/build_agent_character_guides.py` from the
  4.6MB `data/wuwa_characters.json` (`roleSkill.addPointSequence` — see
  that script's comment) and bundled directly into the function's deploy
  (no runtime fetch). **`talentPriority` was missing until 2026-08-10** —
  the first version of this extract never pulled `addPointSequence` at
  all, so the agent (and this doc) wrongly claimed no per-skill
  recommendation existed anywhere in this app's data, and it both
  invented plausible-sounding excuses for a user's "which talent next?"
  question and — separately, in the same conversation — fabricated
  nonexistent body-part echo slot names ("head"/"chest"/etc., which don't
  exist in this game) when asked which echo to replace. Both are the same
  failure mode: filling a real gap with a confident-sounding guess instead
  of saying "I don't know" or "this data doesn't have that." Fixed two
  ways: (1) extracting the real data that turned out to exist, and (2) a
  new CRITICAL rule in `SYSTEM_PROMPT` telling the model to never state a
  specific (name, slot label, stat, number) that isn't literally present
  in a tool's JSON, and to treat any `*Note` field on a null/missing value
  as instruction to say so plainly instead of guessing. Rerun that script
  + redeploy whenever character data changes.
- **`get_team_comps`** — Kuro's recommended teammates (main pick + spares)
  for any character

All tool implementations live in `index.ts` (`getUserRoster`,
`getCharacterBuild`, `getCharacterGuide`, `getTeamComps`, dispatched by
`runTool()`), using the caller's RLS-scoped client for the two that hit
`user_characters` and the bundled JSON for the two that don't.
