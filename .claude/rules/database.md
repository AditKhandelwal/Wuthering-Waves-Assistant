# Database

## Provider
Supabase (free tier) — PostgreSQL + pgvector + Auth in one service.
Enable pgvector: `CREATE EXTENSION IF NOT EXISTS vector;`

## Core Tables

### users
Managed by Supabase Auth. Reference via `auth.users`.

### user_characters
```sql
CREATE TABLE user_characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role_gb_id INTEGER NOT NULL,           -- Kuro's character ID e.g. 1107 for Carlotta
    character_name TEXT NOT NULL,
    resonance_level INTEGER DEFAULT 0,     -- 0-6 (sequence nodes unlocked)
    character_level INTEGER DEFAULT 1,     -- 1-90
    weapon_gb_id INTEGER,                  -- weapon ID
    weapon_name TEXT,
    weapon_level INTEGER DEFAULT 1,
    weapon_rank INTEGER DEFAULT 1,         -- R1-R5
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role_gb_id)
);
```

### user_echoes
```sql
CREATE TABLE user_echoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role_gb_id INTEGER,                    -- which character this echo is equipped on (null = unequipped)
    echo_name TEXT NOT NULL,
    echo_set TEXT NOT NULL,                -- e.g. "Moonlit Clouds"
    cost INTEGER NOT NULL,                 -- 1, 3, or 4
    level INTEGER DEFAULT 0,              -- 0-25
    main_stat TEXT NOT NULL,               -- e.g. "Crit. Rate"
    main_stat_value NUMERIC,
    sub_stat_1 TEXT,
    sub_stat_1_value NUMERIC,
    sub_stat_2 TEXT,
    sub_stat_2_value NUMERIC,
    sub_stat_3 TEXT,
    sub_stat_3_value NUMERIC,
    sub_stat_4 TEXT,
    sub_stat_4_value NUMERIC,
    sub_stat_5 TEXT,
    sub_stat_5_value NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### knowledge_chunks (RAG)
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

### conversation_history
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
- Always use `user_id` from Supabase Auth — never trust client-provided user IDs
- Row Level Security (RLS) must be enabled on all user tables
- Never embed raw JSON from `wuwa_characters.json` — parse into clean text first
- `role_gb_id` is the foreign key linking everything to Kuro's character system

## Known schema gap (deferred intentionally)

The frontend build screen (character level, weapon, sequence nodes, talents)
is built and working against local component state only — no persistence
yet. When a "save build" feature gets scoped, `user_characters` will need:
- **Per-skill talent levels** (5 skills × 1-10 each) — no column for this at
  all currently, `addPointTarget` skill order is Normal Attack/Resonance
  Skill/Forte Circuit/Resonance Liberation/Intro Skill.
- **Inherent Skill toggle state** (2 per character, on/off) — also no
  column.
- `resonance_level INTEGER` (0-6) is probably still fine for sequence nodes
  as long as nodes only ever unlock in order 1→6 (not confirmed out-of-order
  unlock is impossible, but the frontend already assumes sequential).

Not fixing this now — flagging so it's not rediscovered from scratch later.
