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

**All 54 valid character roleGbIds (verified 2026-07-02 — element ID blocks
correspond to 1=Glacio, 2=Fusion, 3=Electro, 4=Aero, 5=Spectro, 6=Havoc; the
1600s block is the newest and entirely Havoc):**
```python
VALID_IDS = [
    1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109,
    1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211,
    1301, 1302, 1303, 1304, 1305, 1306, 1307, 1308,
    1402, 1403, 1404, 1405, 1406, 1407, 1408, 1409, 1410, 1411, 1412,
    1501, 1502, 1503, 1504, 1505, 1506, 1507, 1508, 1509, 1510, 1511,
    1601, 1602, 1603, 1604, 1605, 1606, 1607, 1608
]
```

**Known API quirk:** for Rover gender-variant pairs (e.g. 1406/1408,
1501/1502, 1604/1605), the API's own `role.roleGbId` field in the response
body has been observed out of sync with the `roleGbId` you queried by —
one variant in each pair reports its sibling's ID instead of its own.
Always key data by the `roleGbId` you requested, never by the response
body's internal `role.roleGbId` field.

**Re-indexing:** Use `modifiedAt` Unix timestamp field from the API response
to detect stale entries. Since new ID blocks get added entirely outside the
existing range (as with 1601-1608), periodically re-probe a few IDs past the
current max — don't assume `VALID_IDS` stays complete forever.

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
