# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# WUWA Agentic Assistant

A personalized Wuthering Waves AI agent that reasons over a user's actual roster, echo inventory, and build data to answer team composition, build quality, and progression questions in natural language.

## Project Status

**Current phase: agent + chat UI implemented, not yet deployed live.**
Build screen + accounts/persistence (Supabase Auth + `user_characters`)
were pulled ahead of the original phase ordering once the goal became a
hosted multi-user app, and the agent (Supabase Edge Function + Claude API
tool calling, 4 structured tools, `/chat` chat UI) followed the same path —
built as a Supabase Edge Function instead of the originally-planned FastAPI
backend (see `.claude/rules/architecture.md`'s "Decision: Edge Function,
not FastAPI"), with RAG/embeddings deliberately dropped for v1 (see that
same file's "Decision: no RAG in v1"). What's left: deploying the frontend
+ this Edge Function together (they launch as one product, not
separately — see `.claude/rules/agent.md`).

**⚠ Pick-up note (2026-08-20):** the deployed agent function is currently
STALE — see `.claude/rules/agent.md`'s top note for exactly which 3 commits
haven't been pushed live yet (`npx supabase functions deploy agent` to fix).
Also: a local, **unpushed** branch `feature/sonata-set-icon-detection`
exists with a finished feature (OCR-anchored + trained-YOLOv8-model sonata
set detection from an echo screenshot) that was deliberately kept separate
from the Qingxiao/weapon/sequence-bonus work on `main` this session — see
"In-progress / not on `main` yet" below before assuming it's live.

Done:
- **Agent + chat UI** — `supabase/functions/agent/index.ts` (Deno Edge
  Function): Claude API (`claude-haiku-4-5`) tool-calling ReAct loop, 4
  tools (`get_user_roster`, `get_character_build`, `get_character_guide`,
  `get_team_comps`), JWT auth (401 without a valid session, RLS-scoped
  queries, no service-role key), CORS, SSE streaming. `get_character_build`
  computes real final stats (HP/ATK/DEF/Crit Rate/Crit DMG/etc.) server-side
  via a Deno port of the frontend's stat-aggregation logic
  (`supabase/functions/agent/stats.ts`) rather than handing the model raw
  stored fields — added after the model, working from raw fields alone,
  compared echo *names* instead of sonata *sets* and couldn't tell a raw
  weapon ID matched a recommended weapon *name*. Data for the guide/
  team-comp tools comes from `character_guides.json`, a lean extract built
  by `scripts/build_agent_character_guides.py`. Originally ran on Groq
  (free tier) instead of Claude; switched 2026-08-10 after repeatedly
  hitting Groq's 100K-tokens/day cap during development. Frontend side:
  `frontend/src/pages/ChatPage.tsx` (route `/chat`, linked from `Header.tsx`
  next to "My Builds") — sign-in-gated, sends only the most recent several
  turns as a `history` array (capped client-side to bound cost, since a full
  transcript gets resent on every turn and again on every tool-call
  iteration within a turn) so follow-up questions still have context, parses
  the SSE response into a live message list. Deployed and verified
  end-to-end against the real Supabase project (`npx supabase functions
  deploy agent`; local `functions serve` isn't viable, Docker Desktop
  doesn't run on this machine). See `.claude/rules/agent.md` for the full
  design, including a non-deterministic two-request-per-turn bug caught and
  fixed during the original Groq implementation (the single-request-per-turn
  fix carried over unchanged to the Claude version), and a missing-CORS-
  headers bug caught once the chat UI was tested in an actual browser.
- **Accounts + build persistence** (Supabase Auth, email/password) — sign
  up/in/out (`frontend/src/lib/auth.tsx`, `AuthModal.tsx`), a persistent
  `Header.tsx` with sign-in state + a "My Builds" link, save/load/delete a
  character's full build (level, weapon, sequence nodes, talent levels,
  inherent skill toggles, forte node toggles, echo loadout) against a
  `user_characters` table (`frontend/src/lib/builds.ts`), and a
  `MyBuildsPage.tsx` (route `/builds`) listing a signed-in user's saved
  builds. Schema is a hybrid of scalar + JSONB columns, not fully
  normalized — see `.claude/rules/database.md` for the reasoning. No
  FastAPI backend needed for this — Supabase's client SDK + RLS handles
  auth and CRUD directly from the frontend. Requires a real Supabase
  project; copy `frontend/.env.example` to `frontend/.env` and fill in
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`.
- Reverse engineered Kuro's guide API; roster now at **61** valid
  entity IDs, 59 fetched into `wuwa_characters.json` (still missing
  1106/1402, a pre-existing gap — see `.claude/rules/api.md`). Grew from an
  original 46 → 56 (brute-force scan originally missed the 1601-1608 Havoc
  block) → 60 with the 2026-08 patch's Suisui (1110), the Rover: Electro
  pair (1309/1310), and Yangyang: Xuanling (1610) → 61 with Qingxiao
  (1413, Aero/Sword), pulled via `scripts/fetch_new_characters.py`. Adding
  a character always needs `fetch_character_stat_curves.py` +
  `fetch_forte_nodes.py` rerun too, or they silently show no HP/ATK/DEF or
  forte nodes — see the Commands section below.
- Character-select screen: grid + element/weapon-type filters, all real
  data, element-tinted glow on each portrait ring
- Build screen (`frontend/src/pages/BuildScreenPage.tsx`), built one section
  at a time, each verified visually in a running browser, not just
  type-checked:
  - **Character Level** — real HP/ATK/DEF via a sourced level-scaling curve
  - **Weapon** — the full per-weapon-type catalog, 118 of 122 weapons with
    real name/icon/passive text (recommended-by-a-character weapons from
    Kuro's guide API, filled in for most of the rest from a dotgg.gg
    catalog fetch, with a further Kuro-data fallback pass added
    2026-08-20 for weapons dotgg still doesn't have — see
    `scripts/fetch_weapon_catalog.py` and `.claude/rules/api.md`), real
    computed ATK + secondary stat (`data/weapon_stat_curves.json`, which
    got its own real fetch script — `scripts/fetch_weapon_stat_curves.py`
    — for the first time 2026-08-20, closing a gap where that file had no
    documented way to regenerate at all), rank-scaled passive text, and a
    search box in the picker (`WeaponPicker.tsx`)
  - **Sequence Nodes** — real per-node names/icons, sequential toggle.
    Node unlocks feed into final-stat aggregation too (added 2026-08-20,
    `data/sequence_node_stat_bonuses.json`) — but only for the small,
    hand-curated set of nodes confirmed to be an unconditional flat stat
    bonus (e.g. Qingxiao's chain 1, +16% Crit. Rate); most sequence nodes
    are skill-specific multipliers or conditional procs and are
    deliberately NOT folded into the total — see
    `.claude/rules/frontend.md`'s "Sequence (resonance chain) node stat
    bonuses" section before extending this data
  - **Talents** (`TalentGrid.tsx`) — real 5-skill steppers (1-10) in a
    cascading arc layout (Forte Circuit raised, tapering outward, matching
    a real in-game screenshot), Inherent Skills togglable above Forte
    Circuit (column placement is a deliberate simplification, not
    derivable — see `docs/DATA_REQUIREMENTS.md`), plus a real Outro
    Skill/Tune Break row below (`roleSkill.keynoteSkills[]`)
  - **Forte Circuit stat bonus nodes** — the 8 passive %stat circles above
    each non-Forte-Circuit talent column (Normal Attack, Resonance Skill,
    Resonance Liberation, Intro Skill), 2 per column (lower/upper tier).
    Togglable. Show stat icons (fixed 2026-08-08 — the Build Card's copy of
    this tree wasn't wired to real data at all, just dead placeholder
    circles). Data for all 59 characters sourced from a raw game datamine
    (see `.claude/rules/api.md` and `data/sequence_stat_nodes.json`),
    replacing an earlier dotgg.gg + wutheringlab hybrid that only covered
    42 characters and had at least one hand-approximated value that turned
    out wrong. Live "Stat Node Gains" summary below the tree. Active nodes
    flow into final stat aggregation (see Build Card below).
  - **Echoes** — flexible per-slot cost (any of 1/3/4 in any slot, not
    pinned by position), real catalog/sonata-set picker with real set
    icons, real main-stat model (every echo has a fixed *static* main stat
    — flat ATK for cost 3/4, flat HP for cost 1 — plus the existing
    player-chosen *variable* one), real 9-entry substat pool. Catalog data
    from `scripts/fetch_echo_data.py` (see `docs/DATA_REQUIREMENTS.md`)
  - **Echo screenshot import** (`EchoImportModal.tsx`) — OCR an in-game
    echo card screenshot via `tesseract.js` (lazy-loaded, see
    `echoOcrEngine.ts`) and parse the recognized lines (`echoOcrParse.ts`)
    into a populated echo form, instead of manual entry
- **Build Card** — a read-only, shareable "character card" view toggled
  from the same build screen (same live state, no route/data reload — it's
  a local view-mode flag, not tied to the save/load flow). Real final-stat
  aggregation (character base
  + weapon + echoes + **active forte stat nodes** + **curated sequence-chain
  stat bonuses** (added 2026-08-20, partial coverage) → HP/ATK/DEF/Energy
  Regen/Crit Rate/Crit DMG/DMG-bonus categories, see
  `frontend/src/lib/finalStats.ts`), an atmospheric starfield +
  element-colored background, and the same cascading Forte tree as the
  edit view

See `docs/DATA_REQUIREMENTS.md` for exactly what's confirmed vs. inferred
vs. still blocked in the underlying game data (the per-hit damage formula
and structured echo set-bonus effects are the main remaining gaps).

### In-progress / not on `main` yet

- **Sonata-set auto-detection from an echo screenshot** — a finished
  feature living on a local, **unpushed** branch
  `feature/sonata-set-icon-detection` (branched from `main` before the
  Qingxiao/weapon/sequence-bonus work in this doc, so it does NOT include
  any of that — merge or rebase before continuing). Two-stage detection:
  a trained YOLOv8n model (`echo_sonata_dataset/`, not committed — see its
  own `.gitignore` entry — exported to TensorFlow.js at
  `frontend/public/models/sonata_badge_detector/`) locates the sonata-set
  badge icon on the screenshot; an OCR-anchored coarse/fine crop search
  (`frontend/src/lib/echoIconMatch.ts`) is the fallback when the model
  isn't confident. Both feed the same 8×8 color-signature match against
  self-hosted set-icon references (`frontend/public/echo-set-icons/`,
  `scripts/download_echo_set_icons.py` /
  `scripts/compute_echo_set_icon_hashes.py`) instead of hot-linked
  third-party images. Also fixed two real perf bugs on this branch: the
  Tesseract OCR worker was being created and torn down on every import
  (~9.6s → ~0.3s once fixed by reusing one worker for the page's
  lifetime, `echoOcrEngine.ts`), and running the vision model in parallel
  with OCR caused real CPU contention on machines without a WebGL backend
  (fixed by running detection strictly after OCR finishes). To resume:
  `git checkout feature/sonata-set-icon-detection`.

@.claude/rules/architecture.md
@.claude/rules/api.md
@.claude/rules/database.md
@.claude/rules/agent.md
@.claude/rules/conventions.md
@.claude/rules/frontend.md

## Commands

**No `backend/` directory exists or is planned** — the agent is a Supabase
Edge Function (`supabase/functions/agent/`), not a separate FastAPI
service. See `.claude/rules/architecture.md`.

```bash
# Frontend (works today)
cd frontend
npm install
cp .env.example .env    # then fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
                         # from a real Supabase project (Project Settings -> API) --
                         # sign-in/save-build features throw at runtime without these
npm run dev             # Vite dev server
npm run build            # tsc -b && vite build
npm run lint              # oxlint
npm run preview

# Data scripts (work today, run from repo root)
python scripts/fetch_new_characters.py       # fetch newly-released resonators by roleGbId -> data/wuwa_characters.json (edit NEW_ROLE_IDS first)
python scripts/fetch_character_stat_curves.py # re-fetch level-1 base HP/ATK/DEF + growth curve (Arikatsu datamine) -> data/character_stat_curves.json
python scripts/fetch_forte_nodes.py          # re-fetch forte bonus nodes (Arikatsu datamine, all 59 characters) -> data/sequence_stat_nodes.json
python scripts/fetch_echo_data.py            # re-fetch echo catalog/sets/stat curves -> data/echo_*.json (also mirrors
                                              # echo_sets.json/echo_stat_curves.json to supabase/functions/agent/ --
                                              # echo_catalog.json there needs download_echo_images.py, next line)
python scripts/download_echo_images.py       # rerun whenever echo_catalog.json changes (new echoes need a local copy
                                              # self-hosted too, or their Build Card export silently breaks on CORS)
python scripts/fetch_weapon_stat_curves.py   # re-fetch real ATK/secondary-stat/rank-value curves (Arikatsu datamine) ->
                                              # data/weapon_stat_curves.json (added 2026-08-20 -- this file previously
                                              # had NO fetch script at all; verifies byte-identical against every
                                              # already-known weapon before overwriting, refuses to write on a mismatch)
python scripts/fetch_weapon_catalog.py       # re-fetch full weapon name/icon/passive catalog (dotgg + a Kuro-data
                                              # fallback pass added 2026-08-20 for weapons dotgg doesn't have) ->
                                              # data/weapon_catalog.json -- run fetch_weapon_stat_curves.py FIRST,
                                              # this script filters to ids already in weapon_stat_curves.json's baseAtk
python scripts/build_weapon_passive_bonuses.py  # extract each weapon's unconditional passive stat bonus (regex over
                                                 # effectDescription, handles both dotgg's and Kuro's rank-value text
                                                 # formats as of 2026-08-20) -> data/weapon_passive_bonuses.json +
                                                 # frontend/public/data/ + supabase/functions/agent/ (all 3, no
                                                 # separate mirror step needed) -- rerun whenever weapon_catalog.json changes
# scripts/fetch_resonator_guides.py is dead/commented-out, not currently wired up
#
# After adding new characters (fetch_new_characters.py), always also rerun
# fetch_character_stat_curves.py and fetch_forte_nodes.py -- new characters
# silently show no HP/ATK/DEF or forte nodes until those catch up (bit us
# for the 2026-08 patch's Suisui/Rover:Electro/Yangyang:Xuanling). After
# fetch_echo_data.py picks up a new echo, always also rerun
# download_echo_images.py and redeploy the agent function (bit us for
# Qingxiao's "Calamity Effigy" -- the agent's echo_sets.json/
# echo_stat_curves.json copies don't update themselves). After adding a
# new WEAPON (a new character's signature weapon, most commonly), always
# rerun fetch_weapon_stat_curves.py -> fetch_weapon_catalog.py ->
# build_weapon_passive_bonuses.py -> build_agent_weapon_names.py in that
# order, then redeploy -- bit us for Qingxiao's "Glint of Clouds" (missing
# entirely from weapon_stat_curves.json, so no ATK/Crit Rate showed at
# all) and, independently, for Chisa's pre-existing Kumokiri (present in
# weapon_stat_curves.json but missing from weapon_catalog.json, which
# silently meant its own +12% ATK passive was never applied for anyone).
python scripts/build_agent_character_guides.py  # rebuild the agent's lean character-guide extract ->
                                                 # data/agent_character_guides.json + supabase/functions/agent/character_guides.json
                                                 # rerun whenever wuwa_characters.json changes, then redeploy the function
python scripts/build_agent_weapon_names.py      # rebuild the agent's gbId -> weapon name map (dotgg + Kuro merged) ->
                                                 # data/agent_weapon_names.json + supabase/functions/agent/weapon_names.json
                                                 # rerun whenever weapon_catalog.json or wuwa_characters.json changes, then redeploy

# Agent (Supabase Edge Function -- works today, needs `npx supabase login` once)
npx supabase secrets set GROQ_API_KEY=...   # one-time, or whenever the key rotates
npx supabase functions deploy agent          # deploy/redeploy after any index.ts or *.json change under
                                              # supabase/functions/agent/ -- currently PENDING as of 2026-08-20,
                                              # see .claude/rules/agent.md's top note for exactly what's undeployed
# No local `supabase functions serve` -- Docker Desktop doesn't run on this
# machine. Test against the real deployed function instead.
```

No test suite exists yet (frontend or data scripts). Verify frontend
changes visually per `.claude/rules/frontend.md`'s "Verifying UI changes"
section, not just via `npm run build`.

## Project Structure

```
wuwa-agent/
├── CLAUDE.md
├── CLAUDE.local.md              # personal overrides, gitignored
├── .claude/
│   └── rules/
│       ├── architecture.md      # Edge Function + Auth + 4 agent tools are LIVE; RAG deliberately deferred
│       ├── api.md               # Kuro guide API + dotgg.gg + Arikatsu datamine — accurate, actively used
│       ├── database.md          # user_characters + Auth are LIVE; RAG tables deliberately not built
│       ├── agent.md             # agent + chat UI design — LIVE, matches supabase/functions/agent/index.ts
│       ├── conventions.md
│       └── frontend.md          # accurate, actively used
├── docs/
│   └── DATA_REQUIREMENTS.md     # what's confirmed vs. inferred vs. blocked in the game data
├── data/                        # source JSON; mirrored into frontend/public/data/ (see frontend.md)
│   ├── wuwa_characters.json     # 59 characters (missing 1106/1402 — see api.md)
│   ├── sequence_stat_nodes.json # forte circuit stat bonus nodes, all 59 characters (Arikatsu datamine)
│   ├── sequence_node_stat_bonuses.json # hand-curated, PARTIAL sequence-chain stat bonuses (see frontend.md)
│   ├── character_stat_curves.json
│   ├── weapon_stat_curves.json  # now has a real fetch script -- scripts/fetch_weapon_stat_curves.py (2026-08-20)
│   ├── weapon_catalog.json      # full weapon name/icon/passive catalog (dotgg.gg + a Kuro-data fallback), fills gaps beyond character-recommended weapons
│   ├── weapon_passive_bonuses.json  # each weapon's unconditional passive stat bonus, extracted from effectDescription
│   ├── echo_catalog.json / echo_sets.json / echo_stat_curves.json
│   ├── stat_icons.json
│   ├── agent_character_guides.json  # lean per-character extract for the agent's guide/team-comp tools
│   └── agent_weapon_names.json      # lean gbId -> name map (dotgg + Kuro merged) for the agent's build tool
├── scripts/
│   ├── fetch_new_characters.py        # pulls new resonators' full guide data by roleGbId -> wuwa_characters.json
│   ├── fetch_character_stat_curves.py # level-1 base HP/ATK/DEF + growth curve (Arikatsu datamine, dynamic branch resolution)
│   ├── fetch_forte_nodes.py           # forte bonus data for all 59 characters (Arikatsu datamine)
│   ├── fetch_echo_data.py             # echo catalog/sonata sets/stat curves (game8.co + wutheringlab + Arikatsu datamine)
│   ├── download_echo_images.py        # self-hosts game8.co-sourced echo images (CORS); rerun after fetch_echo_data.py
│   ├── fetch_weapon_stat_curves.py    # real ATK/secondary-stat curves (Arikatsu datamine) -> weapon_stat_curves.json (added 2026-08-20)
│   ├── fetch_weapon_catalog.py        # full weapon catalog (dotgg.gg + Kuro-data fallback pass) -> weapon_catalog.json
│   ├── build_weapon_passive_bonuses.py # extracts each weapon's unconditional passive bonus -> weapon_passive_bonuses.json
│   ├── fetch_resonator_guides.py      # dead code, fully commented out
│   ├── build_agent_character_guides.py # wuwa_characters.json -> agent_character_guides.json + the function's copy
│   └── build_agent_weapon_names.py    # weapon_catalog.json + wuwa_characters.json -> agent_weapon_names.json + the function's copy
├── supabase/
│   └── functions/agent/
│       ├── index.ts              # the agent Edge Function -- see agent.md (currently PENDING deploy, see its top note)
│       ├── stats.ts              # Deno port of frontend/src/lib/{stats,weapons,echoes,finalStats}.ts's stat math
│       ├── character_guides.json # bundled copy of data/agent_character_guides.json (no runtime fetch)
│       ├── weapon_names.json     # bundled copy of data/agent_weapon_names.json (no runtime fetch)
│       ├── sequence_node_stat_bonuses.json # bundled copy, NOT auto-mirrored by any script -- copy by hand if it changes
│       └── (+ raw copies of character_stat_curves/weapon_stat_curves/weapon_passive_bonuses/echo_catalog/echo_sets/
│             echo_stat_curves/sequence_stat_nodes.json, for stats.ts's aggregation -- echo_sets.json/echo_stat_curves.json
│             ARE auto-mirrored by fetch_echo_data.py now, echo_catalog.json needs download_echo_images.py, see Commands)
└── frontend/
    ├── .env.example               # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY -- copy to .env (gitignored)
    ├── public/data/              # frontend's own copy of data/*.json — see frontend.md
    ├── src/
    │   ├── App.tsx                # react-router-dom: "/" (select), "/build/:characterId", "/builds", "/chat"
    │   ├── components/           # BuildCard, TalentGrid, EchoPicker, EchoImportModal, FinalStatsGrid,
    │   │                         #   Header, AuthModal, etc.
    │   ├── pages/                # CharacterSelectPage, BuildScreenPage, MyBuildsPage, ChatPage
    │   ├── lib/                  # per-domain loaders (characters/weapons/echoes/talents/...)
    │   │                         #   + finalStats.ts (stat aggregation), echoOcrEngine/echoOcrParse,
    │   │                         #   supabase.ts (client), auth.tsx (AuthProvider/useAuth), builds.ts
    │   │                         #   (save/load/delete against user_characters)
    │   └── types/                # one file per domain, mirrors lib/
    └── package.json
```
