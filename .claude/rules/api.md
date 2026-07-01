# API Rules

## Kuro Games Guide API

Base URL: `https://guide-server.aki-game.net`

**Required headers for every request:**
```python
headers = {
    "x-os": "pc",
    "x-language": "en",
    "Referer": "https://wuwaguide.kurogames.com/",
    "Origin": "https://wuwaguide.kurogames.com"
}
```

Without these headers, the API returns `{"code": 200, "data": null}`.

**Key endpoints:**
- `GET /introduction/list?roleGbId={id}` — list of guide entries for a character
- `GET /introduction/info?roleGbId={id}&id={guide_id}` — full build data for a guide entry

**All 46 valid character roleGbIds:**
```python
VALID_IDS = [
    1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109,
    1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211,
    1301, 1302, 1303, 1304, 1305, 1306, 1307, 1308,
    1402, 1403, 1404, 1405, 1406, 1407, 1408, 1409, 1410, 1411, 1412,
    1501, 1502, 1503, 1504, 1505, 1506, 1507, 1508, 1509, 1510, 1511
]
```

**Re-indexing:** Use `modifiedAt` Unix timestamp field from the API response to detect stale entries.

## FastAPI conventions
- All endpoints async
- Pydantic v2 for request/response models
- Return 400 for validation errors with field-level details
- Return 401 for auth errors, 404 for not found
- All routes prefixed: `/api/v1/`
- Auth routes: `/api/v1/auth/`
- User routes: `/api/v1/user/`
- Agent routes: `/api/v1/agent/`

## Groq API (LLM)
- Model: `llama-3.1-70b-versatile`
- Free tier — be mindful of rate limits (30 req/min, 14400 req/day)
- Use tool calling for agent reasoning loop
- Stream responses via SSE

## SSE Streaming pattern
```python
from fastapi.responses import StreamingResponse

async def stream_agent_response(query, user_id):
    async def generate():
        async for chunk in agent.stream(query, user_id):
            yield f"data: {json.dumps(chunk)}\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream")
```
