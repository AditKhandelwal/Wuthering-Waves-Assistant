# Database

## Provider
Supabase (free tier) — PostgreSQL + Auth. `user_characters` and Auth are
**implemented and live** (see below). `pgvector`/`knowledge_chunks`/
`conversation_history` are still Phase 3 agent design, not created yet —
`CREATE EXTENSION IF NOT EXISTS vector;` hasn't been run.

## Core Tables

### users
Managed by Supabase Auth. Reference via `auth.users`. Email + password only
(no OAuth providers configured).

### user_characters (implemented)

One row per (user, character) — a full saved build, not just roster
ownership. Scalar columns for what the app actually queries/filters by;
JSONB for the rest, deliberately **not** normalized into per-talent/
per-substat rows. Reasoning: `talent_levels`/`inherent_active`/
`forte_node_active`/`echoes` are fixed-size positional data that the
frontend always reads and writes as one whole build — nothing queries a
single substat or talent level in isolation. See
`frontend/src/pages/BuildScreenPage.tsx`'s `useState` block for the
authoritative in-memory shape this mirrors, and `frontend/src/lib/builds.ts`
for save/load.

```sql
create table if not exists public.user_characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_gb_id text not null,              -- e.g. "1107" for Carlotta. TEXT not INTEGER --
                                          -- the frontend keys everything by roleGbId as a
                                          -- string (route params, Record<string,...> maps,
                                          -- see the comment in lib/characters.ts explaining
                                          -- roleGbId is the JSON object key, not a numeric field)
  character_level int not null default 1 check (character_level between 1 and 90),
  weapon_gb_id text,                     -- also TEXT, same reasoning (WeaponCatalogEntry.gbId)
  weapon_level int default 1 check (weapon_level between 1 and 90),
  weapon_rank int default 1 check (weapon_rank between 1 and 5),
  resonance_level int default 0 check (resonance_level between 0 and 6),  -- sequence nodes unlocked
  talent_levels jsonb not null default '[1,1,1,1,1]'::jsonb,      -- 5 ints 1-10, addPointTarget order:
                                                                   -- Normal Attack/Resonance Skill/
                                                                   -- Forte Circuit/Resonance Liberation/
                                                                   -- Intro Skill
  inherent_active jsonb not null default '[true,true]'::jsonb,    -- 2 bools
  forte_node_active jsonb not null default '[]'::jsonb,           -- 8 bools, flat index = colIdx*2+tierIdx,
                                                                   -- column order matches FORTE_COLUMN_ORDER
                                                                   -- in TalentGrid.tsx
  echoes jsonb not null default '[]'::jsonb,                      -- 5-slot array; each slot stores only
                                                                   -- {echoName, chosenSetName, mainStatPropId,
                                                                   -- level, substats} -- identifiers + user
                                                                   -- values, NOT cached catalog display data
                                                                   -- (name/icon/etc re-resolved live via
                                                                   -- findEchoByName() in lib/echoes.ts on load)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role_gb_id)
);

alter table public.user_characters enable row level security;

create policy "select own builds" on public.user_characters
  for select using (auth.uid() = user_id);
create policy "insert own builds" on public.user_characters
  for insert with check (auth.uid() = user_id);
create policy "update own builds" on public.user_characters
  for update using (auth.uid() = user_id);
create policy "delete own builds" on public.user_characters
  for delete using (auth.uid() = user_id);
```

**No `user_echoes` table.** An earlier sketch had a standalone echo
inventory table (`role_gb_id` nullable for "unequipped" echoes) — dropped,
since nothing in the UI has an echo inventory independent of a specific
character's 5-slot loadout. Echoes only ever exist as part of
`user_characters.echoes` today. Reintroduce a separate table if a standalone
inventory feature actually gets built.

### discord_link_codes / discord_links (implemented 2026-10-16)

Back the Discord bot's `/link` command (see `discord.md`) — code-based
account linking, not OAuth2. Two tables because the two writers have
different trust levels: `discord_link_codes` is written by the Discord
Edge Function (`frontend/api/discord/interactions.ts`), which has **no
Supabase session** at all (Discord's own Ed25519 signature is the only
identity proof at that point, not a Supabase JWT) — so it talks to
Supabase with the plain anon key, as the `anon` role. `discord_links` is
written from the browser on the `/link/:code` confirm step, where the user
already has a real signed-in session — same `auth.uid() = user_id` RLS
pattern as `user_characters`, no anon access needed.

```sql
create table if not exists public.discord_link_codes (
  code text primary key,                 -- 8 random chars, generated in interactions.ts
  discord_user_id text not null,
  discord_username text not null,
  created_at timestamptz not null default now(),  -- 10-minute expiry checked at
                                                    -- query time (lib/discordLink.ts),
                                                    -- no cron/cleanup job
  used_at timestamptz                    -- set on successful confirm; makes a code
                                          -- single-use instead of deleting the row
);

alter table public.discord_link_codes enable row level security;

-- Low-sensitivity, short-lived rows (a Discord id/username pair, not a
-- credential) -- anon read/insert is an acceptable trade for not needing a
-- service-role key in the Discord function. See discord.md.
create policy "anon can insert a code" on public.discord_link_codes
  for insert to anon with check (true);
create policy "anyone can read a code by id" on public.discord_link_codes
  for select using (true);
create policy "authenticated can mark a code used" on public.discord_link_codes
  for update to authenticated using (used_at is null) with check (used_at is not null);

create table if not exists public.discord_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discord_user_id text not null unique,  -- one Discord account links to one site account,
                                          -- both directions (primary key + unique)
  discord_username text not null,
  linked_at timestamptz not null default now()
);

alter table public.discord_links enable row level security;

create policy "select own link" on public.discord_links
  for select using (auth.uid() = user_id);
create policy "insert own link" on public.discord_links
  for insert with check (auth.uid() = user_id);
create policy "delete own link" on public.discord_links
  for delete using (auth.uid() = user_id);
```

`SUPABASE_SERVICE_ROLE_KEY` (implemented 2026-10-16, for `/builds`) — a
new Vercel secret, used narrowly in `getServiceClient()`
(`frontend/api/discord/interactions.ts`) only for lookups keyed by the
verified Discord interaction's own user id, never arbitrary client input.
`/builds` needs it because it resolves `discord_user_id -> user_id ->
user_characters` with **no site session at all** — anon-key RLS can't do
that lookup across tables without leaking data more broadly. A deliberate,
documented exception to this app's general "no service-role key" posture
(see `architecture.md`), not an oversight. `/build` (screenshot rendering)
will reuse the same client once built.

### knowledge_chunks (RAG) — Phase 3, not built
```sql
CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_gb_id INTEGER NOT NULL,
    character_name TEXT NOT NULL,
    section TEXT NOT NULL,                 -- 'rotation' | 'team_comps' | 'echo_recommendation' | 'weapon_ranking' | 'stat_thresholds' | 'role_description'
    content TEXT NOT NULL,                 -- clean English text, no Chinese, no HTML, no image URLs
    embedding vector(768),                 -- nomic-embed-text dimensions
    modified_at INTEGER,                   -- Unix timestamp from Kuro API for re-indexing
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
```

### conversation_history — Phase 3, not built
```sql
CREATE TABLE conversation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    role TEXT NOT NULL,                    -- 'user' | 'assistant'
    content TEXT NOT NULL,
    tool_calls JSONB,                      -- store tool calls for debugging
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Important rules
- Always use `user_id` from Supabase Auth (`auth.uid()` in RLS policies, or
  the client's current session) — never trust a client-provided user ID
- Row Level Security is enabled on `user_characters`, one policy per
  operation (select/insert/update/delete), all scoped to `auth.uid() =
  user_id`
- Never embed raw JSON from `wuwa_characters.json` — parse into clean text
  first (still applies once `knowledge_chunks` gets built)
- `role_gb_id` is the identifier linking everything to Kuro's character
  system — `TEXT`, not `INTEGER` (see above)

## Frontend wiring (implemented)

- `frontend/src/lib/supabase.ts` — client singleton, reads
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from `frontend/.env` (see
  `frontend/.env.example`; real `.env` is gitignored). Does NOT throw at
  import time if either is missing — exports `isSupabaseConfigured: boolean`
  and falls back to an inert placeholder client instead, so character
  browsing/building still works with zero backend configured. An earlier
  version threw here, which crashed the entire app at load (`AuthProvider`
  wraps the whole tree in `main.tsx`) whenever `.env` wasn't set up.
- `frontend/src/lib/auth.tsx` — `AuthProvider`/`useAuth()`, wraps
  `supabase.auth` session state + `signUp`/`signIn`/`signOut`. Mounted once
  in `main.tsx` around the whole app.
- `frontend/src/lib/builds.ts` — `saveBuild`/`loadBuild`/
  `loadAllBuildSummaries`/`deleteBuild`, all operating on the
  `user_characters` table via `supabase-js` directly (no custom backend
  needed — Supabase's client SDK talks to Postgres through RLS-protected
  auto-generated APIs).
- `BuildScreenPage.tsx` auto-loads a signed-in user's saved build for the
  current character on mount (if one exists) and has a "Save Build" button
  (disabled, with a tooltip, when signed out).
- `MyBuildsPage.tsx` (route `/builds`) lists a signed-in user's saved
  builds and lets them delete one.
