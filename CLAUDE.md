# WUWA Agentic Assistant

A personalized Wuthering Waves AI agent that reasons over a user's actual roster, echo inventory, and build data to answer team composition, build quality, and progression questions in natural language.

## Project Status

**Current phase: Phase 1 — character build screen (frontend-first, mock/local state, no auth or persistence yet)**

Done:
- Reverse engineered Kuro's guide API; roster corrected from 46 → **54**
  characters (brute-force scan originally missed a whole newer ID block,
  1601-1608, all Havoc — see `.claude/rules/api.md`)
- Character-select screen: grid + element/weapon-type filters, all real data
- Build screen (`frontend/src/pages/BuildScreenPage.tsx`), built one section
  at a time, each verified visually in a running browser, not just
  type-checked:
  - **Character Level** — real HP/ATK/DEF via a sourced level-scaling curve
  - **Weapon** — full per-weapon-type catalog (not just recommended),
    real computed ATK + secondary stat, rank-scaled passive text
  - **Sequence Nodes** — real per-node names/icons, sequential toggle
  - **Talents** — real 5-skill steppers (1-10) + Inherent Skills (togglable,
    positioned above Forte Circuit as a deliberate simplification — see
    `docs/DATA_REQUIREMENTS.md` for why exact per-skill placement isn't
    derivable from available data)
- Not started: **Echoes** (most data-blocked section — see
  `docs/DATA_REQUIREMENTS.md`)

See `docs/DATA_REQUIREMENTS.md` for exactly what's confirmed vs. inferred
vs. still blocked in the underlying game data before touching Echoes or
revisiting the weapon secondary-stat inference.

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
└── frontend/
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   └── hooks/
    └── package.json
```
