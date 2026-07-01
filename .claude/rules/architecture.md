# Architecture

## Stack
- **Backend:** FastAPI (Python 3.11+), async endpoints
- **Database:** PostgreSQL + pgvector via Supabase (free tier)
- **Auth:** Supabase Auth — do NOT build custom JWT auth
- **Frontend:** React 19 + Vite + TypeScript
- **LLM:** Groq API (free tier) — Llama 3.1 70B for agent reasoning
- **Embeddings:** nomic-embed-text via Ollama (local, free)
- **Agent:** Raw API calls with tool calling — NO LangChain, NO LangGraph
- **Streaming:** SSE (Server-Sent Events) for agent responses

## Key Design Decisions

**Single database:** PostgreSQL handles both structured data (user roster, echo inventory) and vector search (pgvector). No separate vector DB.

**Two-layer knowledge base:**
1. Structured tables — character stat thresholds, weapon rankings, team comps (for precise lookups)
2. Vector embeddings — chunked guide text per character section (for semantic retrieval)

**Roster IS the memory:** Agent reads user's current roster and echo inventory via tool calls. No conversation summarization needed for cross-session "memory" — the database is the persistent state.

**Chunking strategy:** Per section, not per character. Each character's guide is split into: role_description, rotation, team_comps, echo_recommendation, weapon_ranking, stat_thresholds. This improves retrieval precision.

## Agent Tools (Phase 3)
- `get_user_roster()` — fetch user's owned characters, resonance levels, weapons
- `get_user_echoes(character_id)` — fetch user's echo inventory for a character
- `search_knowledge_base(query)` — semantic search over embedded guide chunks
- `get_character_build(character_id)` — structured lookup of stat thresholds, weapons, echo sets
- `get_team_comps(character_id)` — lookup recommended team compositions
- `evaluate_echo(character_id, echo_stats)` — compare user echo against benchmarks

## What NOT to build
- No OCR echo import until Phase 4
- No re-indexing pipeline until Phase 4
- No community features (shared builds, leaderboards)
- No pull planning until Phase 3 is stable
