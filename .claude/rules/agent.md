# Agent

## Architecture
Raw ReAct loop using Groq API tool calling. No frameworks.

## LLM
- Provider: Groq (free tier)
- Model: `llama-3.1-70b-versatile`
- Max tokens: 2048 per response
- Temperature: 0.3 (low — we want consistent, factual reasoning over game data)

## Embeddings
- Model: `nomic-embed-text` via Ollama (local, free, 768 dimensions)
- Ollama must be running locally: `ollama pull nomic-embed-text`
- Embedding endpoint: `http://localhost:11434/api/embeddings`

## ReAct Loop
```
User query
    → inject system prompt + user roster context
    → LLM reasons and selects tool
    → tool executes (DB query or vector search)
    → result injected back into context
    → LLM reasons again or produces final answer
    → stream final answer via SSE
```

Max iterations: 5 (prevent infinite loops)

## System Prompt
Always inject at start of every conversation:
- User's owned characters and resonance levels
- Current echo inventory summary
- Agent role: WW build advisor, answers based on user's actual roster

## Tools
```python
tools = [
    {
        "name": "get_user_roster",
        "description": "Get the user's owned characters, their levels, resonance sequences, and equipped weapons",
        "input_schema": {"type": "object", "properties": {}}
    },
    {
        "name": "get_user_echoes",
        "description": "Get echo inventory for a specific character or all unequipped echoes",
        "input_schema": {
            "type": "object",
            "properties": {
                "role_gb_id": {"type": "integer", "description": "Character ID, or null for all echoes"}
            }
        }
    },
    {
        "name": "search_knowledge_base",
        "description": "Semantic search over Wuthering Waves character build guides",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "role_gb_id": {"type": "integer", "description": "Optional: filter by character"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_character_build",
        "description": "Get structured build data for a character: stat thresholds, weapons, echo sets",
        "input_schema": {
            "type": "object",
            "properties": {
                "role_gb_id": {"type": "integer"}
            },
            "required": ["role_gb_id"]
        }
    }
]
```

## Knowledge Base Chunking
When seeding from `wuwa_characters.json`, split each character into these sections:
- `role_description` — what the character does, their role, element, weapon type
- `rotation` — skill sequence and combo notation
- `team_comps` — recommended teammates with reasoning
- `echo_recommendation` — echo sets, main stats per slot, substat priority
- `weapon_ranking` — ranked weapon list with explanations
- `stat_thresholds` — target Crit Rate, Crit DMG, ER, ATK values

Strip all HTML tags, image URLs, Chinese characters, and empty strings before embedding.
