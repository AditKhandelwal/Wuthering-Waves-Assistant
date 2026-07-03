# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# WUWA Agentic Assistant

A personalized Wuthering Waves AI agent that reasons over a user's actual roster, echo inventory, and build data to answer team composition, build quality, and progression questions in natural language.

## Project Status

**Current phase: Phase 1 — character build screen (frontend-first, mock/local state, no auth or persistence yet)**

Done:
- Reverse engineered Kuro's guide API; roster corrected from 46 → **54**
  characters (brute-force scan originally missed a whole newer ID block,
  1601-1608, all Havoc — see `.claude/rules/api.md`)
- Character-select screen: grid + element/weapon-type filters, all real
  data, element-tinted glow on each portrait ring
- Build screen (`frontend/src/pages/BuildScreenPage.tsx`), built one section
  at a time, each verified visually in a running browser, not just
  type-checked:
  - **Character Level** — real HP/ATK/DEF via a sourced level-scaling curve
  - **Weapon** — full per-weapon-type catalog (not just recommended),
    real computed ATK + secondary stat, rank-scaled passive text
  - **Sequence Nodes** — real per-node names/icons, sequential toggle
  - **Talents** (`TalentGrid.tsx`) — real 5-skill steppers (1-10) in a
    cascading arc layout (Forte Circuit raised, tapering outward, matching
    a real in-game screenshot), Inherent Skills togglable above Forte
    Circuit (column placement is a deliberate simplification, not
    derivable — see `docs/DATA_REQUIREMENTS.md`), plus a real Outro
    Skill/Tune Break row below (`roleSkill.keynoteSkills[]`)
  - **Echoes** — flexible per-slot cost (any of 1/3/4 in any slot, not
    pinned by position), real catalog/sonata-set picker with real set
    icons, real main-stat model (every echo has a fixed *static* main stat
    — flat ATK for cost 3/4, flat HP for cost 1 — plus the existing
    player-chosen *variable* one), real 9-entry substat pool
- **Build Card** — a read-only, shareable "character card" view toggled
  from the same build screen (same live state, no route/data reload since
  there's no persistence yet). Real final-stat aggregation (character base
  + weapon + all equipped echoes → HP/ATK/DEF/Energy Regen/Crit Rate/Crit
  DMG/DMG-bonus categories, see `frontend/src/lib/finalStats.ts`), an
  atmospheric starfield + element-colored background, and the same
  cascading Forte tree as the edit view

See `docs/DATA_REQUIREMENTS.md` for exactly what's confirmed vs. inferred
vs. still blocked in the underlying game data (the per-hit damage formula
and structured echo set-bonus effects are the main remaining gaps).

@.claude/rules/architecture.md
@.claude/rules/api.md
@.claude/rules/database.md
@.claude/rules/agent.md
@.claude/rules/conventions.md
@.claude/rules/frontend.md

## Commands

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev

# Data scripts
cd scripts
python fetch_characters.py       # re-fetch all character data from Kuro API
python seed_database.py          # parse JSON + seed PostgreSQL
python check_data.py             # validate wuwa_characters.json

# Docker
docker-compose up -d             # start PostgreSQL + pgvector locally
```

## Project Structure

```
wuwa-agent/
├── CLAUDE.md
├── CLAUDE.local.md              # personal overrides, gitignored
├── docker-compose.yml
├── .claude/
│   └── rules/
│       ├── architecture.md
│       ├── api.md
│       ├── database.md
│       ├── agent.md
│       └── conventions.md
├── data/
│   └── wuwa_characters.json     # 46 characters, source of truth for knowledge base
├── scripts/
│   ├── fetch_characters.py      # Kuro API ingestion pipeline
│   ├── seed_database.py         # parse JSON → PostgreSQL
│   └── check_data.py            # data validation
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/                 # FastAPI routers
│   │   ├── agent/               # ReAct agent + tools
│   │   ├── rag/                 # embedding + retrieval
│   │   ├── models/              # SQLAlchemy models
│   │   └── core/                # config, auth, db
│   └── requirements.txt
└── frontend/                     # everything that actually exists today (Phase 1)
    ├── public/data/              # frontend's own copy of data/*.json — see frontend.md
    ├── src/
    │   ├── components/           # BuildCard, TalentGrid, EchoPicker, FinalStatsGrid, etc.
    │   ├── pages/                # CharacterSelectPage, BuildScreenPage
    │   ├── lib/                  # per-domain loaders (characters/weapons/echoes/talents/...)
    │   │                         #   + finalStats.ts (stat aggregation)
    │   └── types/                # one file per domain, mirrors lib/
    └── package.json
```
