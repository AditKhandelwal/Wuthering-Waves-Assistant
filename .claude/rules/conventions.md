# Conventions

## Python (Backend)
- Python 3.11+
- async/await everywhere — no sync DB calls in FastAPI routes
- Pydantic v2 for all models
- Type hints on all functions
- snake_case for files, functions, variables
- PascalCase for classes
- Use `httpx` for async HTTP (not `requests`)
- Use `asyncpg` or Supabase Python client for DB
- Environment variables via `python-dotenv`, never hardcode secrets

## TypeScript (Frontend)
- Strict mode enabled
- No `any` types
- camelCase for variables and functions
- PascalCase for components and types
- kebab-case for file names
- Use `fetch` with typed responses, or `axios`
- Tailwind CSS for styling
- React Query for server state

## Git
- Branch: `feature/description` or `fix/description`
- Commits: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- Never commit `.env` files
- `wuwa_characters.json` goes in `data/` and IS committed (it's seeded data)

## File naming
- Backend routes: `user_router.py`, `agent_router.py`
- Backend models: `user_model.py`, `echo_model.py`
- Frontend components: `RosterManager.tsx`, `ChatInterface.tsx`
- Frontend pages: `Dashboard.tsx`, `EchoInventory.tsx`

## Environment variables needed
```
# Backend .env
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
GROQ_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

# Frontend .env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=http://localhost:8000
```

## What to avoid
- Don't use LangChain or LangGraph
- Don't use synchronous database calls inside async endpoints
- Don't embed raw JSON — always parse to clean text first
- Don't store Supabase service key in frontend
- Don't build custom JWT auth — use Supabase Auth
- Don't add features outside the current phase
