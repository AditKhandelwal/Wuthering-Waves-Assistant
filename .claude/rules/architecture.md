# Architecture

## Stack
- **Backend/agent runtime:** a single Supabase Edge Function (Deno/
  TypeScript), `supabase/functions/agent/index.ts` — **implemented and
  deployed**, not FastAPI. This file's `## Stack` originally specified
  FastAPI; that was superseded (see "Decision: Edge Function, not FastAPI"
  below) before any FastAPI code was written, so no `backend/` directory
  exists or is planned
- **Database:** PostgreSQL via Supabase (free tier) — `user_characters` +
  Auth are live (see `database.md`). No pgvector — RAG is deferred (see
  "Decision: no RAG in v1" below), not just "not yet enabled"
- **Auth:** Supabase Auth — do NOT build custom JWT auth. **Implemented**:
  email/password, wired via `frontend/src/lib/auth.tsx`'s `AuthProvider`/
  `useAuth()` on the frontend; the Edge Function verifies the caller's JWT
  itself (`supabase.auth.getUser()` on an RLS-scoped client built from the
  forwarded `Authorization` header — no service-role key anywhere in the
  function)
- **Frontend:** React 19 + Vite + TypeScript
- **LLM:** Claude API (`claude-haiku-4-5`) for agent reasoning + tool
  calling — **switched from Groq 2026-08-10**. Originally ran on Groq's
  free tier specifically to keep LLM cost at zero; that traded away too
  much once its 100K-tokens/day cap started blocking normal development
  and testing. Haiku 4.5 was chosen as the cheapest current Claude model,
  well suited to this app's structured tool-calling workload. See
  `agent.md` for the full history (including the original Groq-vs-Cerebras
  research)
- **Embeddings:** none — deferred, see "Decision: no RAG in v1"
- **Agent:** raw Claude tool-calling loop in the Edge Function — NO
  LangChain, NO LangGraph
- **Streaming:** SSE (Server-Sent Events) from the Edge Function to the
  frontend's `ChatPage.tsx`. The Edge Function's own calls to Claude are
  streamed too, but the answer is buffered server-side and forwarded as one
  SSE chunk, not token-by-token — see the comment on `streamAnthropicTurn`
  in `index.ts` for why (avoiding a two-request-per-turn race that caused a
  real bug during development, back when this ran on Groq)

## Decision: Edge Function, not FastAPI

A separate FastAPI backend would mean a second hosted service, its own
deploy pipeline and uptime to track, and a network hop to Supabase using a
service-role key — a real secret to manage. A Supabase Edge Function lives
in the project that already exists, calls Postgres directly under the
caller's own RLS identity, and reuses the same JWT verification the rest of
the app already does. Nothing in the actual loop (receive a message → ask
Claude which tool to call → run a structured DB/JSON lookup → feed the
result back to Claude → repeat, max 5 iterations → stream the answer)
benefits from Python's data/ML ecosystem — it's fetch calls and control
flow.

Local testing caveat: Docker Desktop doesn't run on the dev machine (WSL2
backend issue), so `supabase functions serve` isn't viable. All testing
happens against the real deployed function over HTTPS (`npx supabase
functions deploy agent`, then hit it from the running frontend or a script).

## Decision: no RAG in v1

The original design had a two-layer knowledge base (structured tables +
`pgvector` embeddings via `nomic-embed-text` over Ollama, chunked per
character section: `role_description`/`rotation`/`team_comps`/
`echo_recommendation`/`weapon_ranking`/`stat_thresholds`). Dropped for v1:
Ollama only runs locally, so it's unshippable for a hosted app anyway, and
none of the 4 tools that actually got built need semantic search — they're
all structured lookups against `user_characters` or a lean JSON extract of
`wuwa_characters.json`. Revisit only if a real user question surfaces that
structured tools can't answer.

**Roster IS the memory:** the agent reads the user's current roster and
saved builds via tool calls each turn — no conversation summarization
needed for cross-session "memory," the database is the persistent state.
Within a single chat session, `ChatPage.tsx` sends prior turns as a
`history` array on each request so follow-ups have context; nothing is
persisted server-side per-conversation (no `conversation_history` table —
see `database.md`).

## Agent Tools (implemented — 4, not 6)
- `get_user_roster()` — every character the user has a saved build for
  (level, weapon, last updated), from `user_characters`
- `get_character_build(character_name)` — the user's own saved build for
  one character (level, weapon, talents, sequence nodes, echoes) — only
  works for characters in their roster
- `get_character_guide(character_name)` — Kuro's recommended build for any
  character (stat thresholds, recommended echo/sets, ranked weapons,
  rotation notes) — the counterpart to the tool above, lets the agent
  compare "what you have" against "what's recommended"
- `get_team_comps(character_name)` — Kuro's recommended teammates for any
  character

Dropped from the original 6-tool sketch: `get_user_echoes` (echoes only
ever exist as part of a character's saved build, no standalone inventory —
see `database.md`), `search_knowledge_base` (no RAG, see above),
`evaluate_echo` (no concrete benchmark data source identified; not built).

## What NOT to build
- No re-indexing pipeline (moot without RAG)
- No community features (shared builds, leaderboards)
- No endgame-mode tools (Tower of Adversity / Whimpering Wastes / Endstate
  Matrix) — deliberately deferred, kept as research notes in the agentic
  planning doc, not active scope. The agent's system prompt explicitly
  tells it to say so rather than guess if asked.

Note: echo screenshot OCR import was in this list as blocked until a later
phase, but got built early (client-side, tesseract.js) as part of the
character-build-screen Echoes work — see
`EchoImportModal.tsx`/`echoOcrEngine.ts`/`echoOcrParse.ts` and
`frontend.md`. Likewise, accounts + build persistence and the agent itself
both got built ahead of the original phase ordering once the goal became a
hosted multi-user app — see `CLAUDE.md`'s Project Status for current state.
