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

**Missing from `wuwa_characters.json`:** 1106 (Youhu) and 1402 (Yangyang)
were not fetched by the initial brute-force scan and are absent from the
file. The frontend character-select grid therefore cannot show them.
`fetch_forte_nodes.py` works around this with `MANUAL_IDS` overrides.

**Re-indexing:** Use `modifiedAt` Unix timestamp field from the API response
to detect stale entries. Since new ID blocks get added entirely outside the
existing range (as with 1601-1608), periodically re-probe a few IDs past the
current max — don't assume `VALID_IDS` stays complete forever.

## dotgg.gg API (forte circuit stat bonus nodes)

**Endpoint:** `GET https://api.dotgg.gg/cgfw/getgacha?game=wuthering-waves&type=characters`

Returns an array of characters. Each has a `forte_bonuses` array of 8
objects `{id, name}`. Sort by `id` to get canonical order:
- indices 0–3 = lower-tier nodes (closer to the skill diamond)
- indices 4–7 = upper-tier nodes (further from the skill, unlocks second)

Within each tier, column order is: Normal Attack (0), Resonance Skill (1),
Resonance Liberation (2), Intro Skill (3). Forte Circuit has no stat nodes
(it uses Inherent Skills instead).

**Name format:** `"Crit. Rate+1.20%"` — parseable with
`r"^(.+?)(?:\+| Up)([0-9.]+)%$"`. Note the ` Up` variant: Cartethyia
(1409) uses `"Crit. Rate Up1.20%"` instead of `"Crit. Rate+1.20%"` — the
regex handles both.

**Coverage (as of 2026-07-04):** 42 of 56 IDs. Characters not yet in
dotgg (fallback from wutheringlab.com): 1108, 1109, 1208, 1209, 1210,
1211, 1307, 1308, 1508, 1509, 1510, 1511.

**Rover pair naming quirk:**
- `"Rover: Aero"` appears twice (for 1406 and 1408) — both should map to
  `["1406", "1408"]`.
- `"Rover (Male)"` / `"Rover (Female)"` are the **Spectro** Rovers (IDs
  1501/1502), NOT Aero — do not map them to 1406/1408. This distinction
  burned us once; the `ROVER_PAIRS` dict in `fetch_forte_nodes.py` reflects
  the correct mapping.
- `"Rover (Havoc) (Female)"` / `"Rover (Havoc) (Male)"` → `["1604", "1605"]`.

**Output schema** (`data/sequence_stat_nodes.json`, also copied to
`frontend/public/data/`):
```json
{
  "nodes": {
    "1107": {
      "normal_attack":        [{"stat":"Crit. Rate","value":1.2}, {"stat":"Crit. Rate","value":2.8}],
      "resonance_skill":      [{"stat":"ATK","value":1.8},        {"stat":"ATK","value":4.2}],
      "resonance_liberation": [{"stat":"ATK","value":1.8},        {"stat":"ATK","value":4.2}],
      "intro_skill":          [{"stat":"Crit. Rate","value":1.2}, {"stat":"Crit. Rate","value":2.8}]
    }
  }
}
```
Array index `[0]` = lower tier, `[1]` = upper tier. **All forte stat values
are percentages** — even nodes named `"ATK"`, `"HP"`, or `"DEF"` are %
multipliers on the base stat, not flat additions. The flat-index formula
for the 8-element boolean active array is `colIndex * 2 + tierIndex`, where
column order matches `FORTE_COLUMN_ORDER` in `TalentGrid.tsx`.

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
