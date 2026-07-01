# WUWA Agentic Assistant

A personalized Wuthering Waves AI agent that reasons over a user's actual roster, echo inventory, and build data to answer team composition, build quality, and progression questions in natural language.

## Project Status

**Current phase: Phase 1 — Project Setup**

Completed pre-work:
- Reverse engineered Kuro Games' official guide API (`guide-server.aki-game.net`)
- Discovered all 46 character IDs via brute force scan
- Fetched complete build data for all 46 characters (English + translated Chinese entries)
- Validated and cleaned dataset — 0 issues, all characters have guide, stats, and weapon data
- Saved to `data/wuwa_characters.json`

@.claude/rules/architecture.md
@.claude/rules/api.md
@.claude/rules/database.md
@.claude/rules/agent.md
@.claude/rules/conventions.md

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
