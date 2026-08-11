// WuWa Build Planner agent -- Supabase Edge Function (Deno).
//
// Phase 2 (see the agentic-phase plan): 4 structured tools wired up --
// get_user_roster, get_character_build (the user's own saved build),
// get_character_guide (Kuro's recommended build -- stat thresholds, echo/
// weapon recs, rotation notes), get_team_comps. All structured lookups
// against user_characters or character_guides.json -- no RAG/embeddings
// (see "Decision 2" in the plan). Endgame-content tools (Tower of
// Adversity/Whimpering Wastes/Endstate Matrix) are deliberately deferred,
// not part of this tool set.
//
// Why an Edge Function and not a separate FastAPI service: see the
// "Decision 1" section of the agentic-phase plan -- this reuses the
// Supabase project's own JWT verification and RLS instead of standing up
// a second hosted service with its own auth story.
//
// LLM provider: Claude API (claude-haiku-4-5), not Groq. This app
// originally ran on Groq specifically because it's free -- see the
// "Decision" note that used to live in architecture.md/agent.md. Switched
// 2026-08-10 after repeatedly hitting Groq's 100K-tokens/day free-tier cap
// during development/testing, which made the agent unusable for stretches
// at a time. That trade-off is now inverted: Claude is billed per token
// (Haiku 4.5 chosen specifically for being the cheapest Claude model, well
// suited to structured tool-calling) but has no comparable hard daily
// wall. Update this comment (and .claude/rules/agent.md) if the provider
// changes again.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01"; // required header, stable across Claude model versions
const MAX_TOOL_ITERATIONS = 5; // matches .claude/rules/agent.md

// Built by scripts/build_agent_character_guides.py from data/wuwa_characters.json
// -- a lean, English-only extract (62KB vs. the 4.6MB raw source) bundled
// directly into this function's deploy so tool calls never need an extra
// network hop. Rerun that script + redeploy whenever character data changes.
import characterGuidesRaw from "./character_guides.json" with { type: "json" };

// Copies of data/{character_stat_curves,weapon_stat_curves,weapon_catalog,
// echo_catalog,echo_stat_curves,echo_sets,sequence_stat_nodes}.json --
// everything get_character_build needs to compute the user's *actual*
// final stats (HP/ATK/DEF/Crit Rate/Crit DMG/elemental DMG bonus) instead
// of handing the model raw stored fields it can't reliably do that math
// over itself. See stats.ts for why this exists and re-copy + redeploy
// whenever the source files in data/ change.
import characterStatCurvesRaw from "./character_stat_curves.json" with { type: "json" };
import weaponStatCurvesRaw from "./weapon_stat_curves.json" with { type: "json" };
// gbId -> name, merged from dotgg's catalog + Kuro's per-character weapon
// texts by scripts/build_agent_weapon_names.py (117/118 coverage) --
// replaced a dotgg-only bundle (100/118) after a real build's weapon
// (21020076, "Everbright Polestar" -- Kuro-only, not in dotgg at all)
// showed up as "Unknown (id 21020076)" in an agent response, silently
// breaking the weapon-vs-recommendation comparison. Re-run that script +
// redeploy whenever weapon_catalog.json or wuwa_characters.json changes.
import weaponNamesRaw from "./weapon_names.json" with { type: "json" };
import echoCatalogRaw from "./echo_catalog.json" with { type: "json" };
import echoStatCurvesRaw from "./echo_stat_curves.json" with { type: "json" };
import echoSetsRaw from "./echo_sets.json" with { type: "json" };
import sequenceStatNodesRaw from "./sequence_stat_nodes.json" with { type: "json" };
import {
  computeEchoStatTotals,
  computeEchoSlotBreakdown,
  computeActiveSetBonuses,
  computeFinalStats,
  computeForteBonusTotals,
  normalizeEchoName,
  type StatCurveData,
  type WeaponStatCurves,
  type EchoStatCurves,
  type EchoCatalogEntry,
  type EchoSet,
  type SavedEchoSlot,
} from "./stats.ts";

interface CharacterGuide {
  name: string;
  element: string | null;
  statThresholds: { stat: string; target: string }[];
  recommendedEcho: { name: string | null; sets: string[] };
  recommendedWeapons: string[];
  talentPriority: { skill: string; recommendLevel: number | null }[];
  rotationNotes: string;
  teamComps: { main: string; spares: string[] }[];
}
const characterGuides = characterGuidesRaw as Record<string, CharacterGuide>;

const characterStatCurves = characterStatCurvesRaw as unknown as StatCurveData;
const weaponStatCurves = weaponStatCurvesRaw as unknown as WeaponStatCurves;
const weaponNames = weaponNamesRaw as Record<string, string>;
const echoStatCurves = echoStatCurvesRaw as unknown as EchoStatCurves;
const echoSets = (echoSetsRaw as { sets: EchoSet[] }).sets;
const sequenceStatNodes = (sequenceStatNodesRaw as { nodes: Record<string, Record<string, { stat: string; value: number }[]>> }).nodes;

// Keyed by normalizeEchoName so a saved echoName (sourced from Kuro's guide
// API at save time) reliably matches this catalog's punctuation, same
// tolerance as findEchoByName in frontend/src/lib/echoes.ts.
const echoByNormalizedName = new Map<string, EchoCatalogEntry>();
for (const e of (echoCatalogRaw as { echoes: EchoCatalogEntry[] }).echoes) {
  echoByNormalizedName.set(normalizeEchoName(e.name), e);
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dp[j], dp[j - 1]);
      prevDiag = temp;
    }
  }
  return dp[b.length];
}

// Users (and the model) refer to characters by name, not roleGbId -- resolve
// name -> id here so every tool can just accept character_name. Three
// tiers: exact match, then case-insensitive substring, then Levenshtein
// fuzzy match (same algorithm as fuzzyMatchName in
// frontend/src/lib/echoOcrParse.ts) -- added after a real misspelling
// ("Yangyang: Xiangling" for the real "Yangyang: Xuanling") fell through
// both of the first two tiers (neither name is a substring of the other)
// and had to fall back on the model noticing the near-match itself from a
// prior get_user_roster call instead of the tool resolving it directly.
function resolveCharacterId(name: string): string | null {
  const target = name.trim().toLowerCase();
  if (!target) return null;

  for (const [id, guide] of Object.entries(characterGuides)) {
    if (guide.name.toLowerCase() === target) return id;
  }
  for (const [id, guide] of Object.entries(characterGuides)) {
    if (guide.name.toLowerCase().includes(target) || target.includes(guide.name.toLowerCase())) {
      return id;
    }
  }

  let best: { id: string; distance: number } | null = null;
  for (const [id, guide] of Object.entries(characterGuides)) {
    const candidate = guide.name.toLowerCase();
    const distance = levenshtein(target, candidate);
    const relative = distance / Math.max(target.length, candidate.length);
    if (relative <= 0.3 && (!best || distance < best.distance)) {
      best = { id, distance };
    }
  }
  return best?.id ?? null;
}

const SYSTEM_PROMPT =
  "You are a Wuthering Waves build advisor. You answer questions about " +
  "team composition, build quality, and progression based on the user's " +
  "actual roster and saved builds, compared against Kuro's own recommended " +
  "builds. Always call get_user_roster first if you don't already know " +
  "what characters the user has. Use character names (not IDs) when calling " +
  "tools. If a tool reports a character wasn't found, tell the user rather " +
  "than guessing. You do not have information about Tower of Adversity, " +
  "Whimpering Wastes, or Endstate Matrix -- say so if asked, don't guess.\n\n" +
  "CRITICAL -- never invent specifics that aren't literally present in a " +
  "tool's JSON response. This includes: item/weapon/echo names, slot " +
  "labels, stat names, and numeric values. If a field is null, missing, or " +
  "unresolved (tools include an explanatory *Note field when this happens, " +
  "e.g. weaponNameNote, echoNameNote), say plainly what's missing and why " +
  "-- do not fill the gap with a plausible-sounding guess. Concretely: " +
  "Wuthering Waves echo slots are 5 generic numbered slots with no body-" +
  "part names -- never call one 'head'/'chest'/'hands'/'feet'/'waist' or " +
  "similar, that convention doesn't exist in this game. This does NOT mean " +
  "avoid echo names altogether -- get_character_build's echoes array gives " +
  "each slot's real echoName; use it (e.g. 'your Sentry Construct in slot " +
  "3'), just never substitute an invented body-part label for it. If " +
  "you're not sure whether a detail came from a tool result or from your " +
  "own inference, treat it as inference and label it as such.\n\n" +
  "When comparing a build to a guide (get_character_build vs " +
  "get_character_guide), be concrete and numeric, not a vague restatement " +
  "of raw fields:\n" +
  "- Stats: state the user's actual number next to the target for each stat " +
  "in statThresholds (e.g. 'Crit Rate: 62% vs. a 70% target -- 8% short'), " +
  "and say plainly whether each one is met. Targets are floors, not ranges.\n" +
  "- Weapon: compare finalStats' resolved weapon NAME against " +
  "recommendedWeapons. If it's already on the list, say so -- don't suggest " +
  "the user switch to a weapon they're already using.\n" +
  "- Echoes: compare activeEchoSets (the SET and piece count) against " +
  "recommendedEcho.sets. Never mention individual echo names/pictures as a " +
  "problem -- which specific echo item is equipped doesn't matter, only the " +
  "set it belongs to and the resulting stat rolls.\n" +
  "- Talent levels: get_character_guide's talentPriority gives a REAL per-" +
  "skill recommended level, ordered by priority (level the first entry " +
  "first). Compare each skill's actual level (from get_character_build) " +
  "against that same skill's recommendLevel -- only flag a skill as under-" +
  "leveled if it's below its own target, not just because it's lower than " +
  "other skills (a lower-priority skill sitting below a higher-priority " +
  "one is expected, not a mistake).\n" +
  "- Keep it scannable: short lines or a compact list per stat/category, " +
  "not one long paragraph. Lead with the verdict (ready / needs work and " +
  "why), then the specifics.\n\n" +
  "get_team_comps only returns Kuro's single official pick per slot -- it " +
  "is NOT the full universe of good teams, and it is not a tool for " +
  "evaluating a team the user proposes. When asked to evaluate a custom/" +
  "hypothetical team (e.g. 'how does X with Y and Z work?'), do NOT just " +
  "say you lack a tool for it -- give a real, confident opinion. But first, " +
  "call get_character_guide for EVERY character named in the question, " +
  "even ones already covered earlier in the conversation -- their element " +
  "is real tool data (guide.element), not something to recall from memory. " +
  "A wrong-but-confident guess here is a real failure mode that has " +
  "happened before (e.g. calling a team 'single-element' when the three " +
  "characters were actually three different elements). Only the SYNERGY " +
  "reasoning on top of those real elements/stat thresholds -- resonance " +
  "chaining, quickswap/outro-intro timing, concerto energy economy, known " +
  "archetypes -- is where general Wuthering Waves knowledge belongs. " +
  "Before endorsing any team, sanity-check it has an actual damage dealer " +
  "-- this game is damage-check-gated, so a team of e.g. two healers and a " +
  "support with no real DPS is not viable regardless of how well their " +
  "elements pair, and should be flagged as a problem, not glossed over. " +
  "Clearly label which parts are Kuro's official recommendation (from a " +
  "tool) versus your own assessment, but don't hedge into vagueness when " +
  "you actually know the answer.\n\n" +
  "When comparing MULTIPLE builds at once (e.g. 'which of my builds is " +
  "closest to its target?' or 'rank my roster'), state the actual answer " +
  "-- the winner, the ranking, whatever was asked -- in the first 1-2 " +
  "sentences, before the supporting per-character detail. A long response " +
  "can run out of room before finishing; if that happens, the answer " +
  "itself must already be there. Keep per-character detail brief (a line " +
  "or two each, not a full stat-by-stat breakdown per character) unless " +
  "asked to go deep on one specific character.";

type JsonSchema = Record<string, unknown>;

// Anthropic's native tool schema -- {name, description, input_schema}, no
// nested "function" wrapper like OpenAI/Groq's tool-calling format used.
interface ToolDef {
  name: string;
  description: string;
  input_schema: JsonSchema;
}

const CHARACTER_NAME_PARAM: JsonSchema = {
  type: "object",
  properties: {
    character_name: {
      type: "string",
      description: "The character's name, e.g. \"Carlotta\". Not case-sensitive.",
    },
  },
  required: ["character_name"],
};

const TOOLS: ToolDef[] = [
  {
    name: "get_user_roster",
    description:
      "List every character the user has a saved build for, with their level, weapon, and when it was last updated. Call this first when you don't already know the user's roster.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_character_build",
    description:
      "Get the user's own saved build for one character, including COMPUTED final stats (finalStats.hp/atk/def/critRate/critDmg/energyRegen/elementalDmgBonus etc.) ready to compare directly against get_character_guide's statThresholds -- no manual math needed. Also returns the resolved weapon name (compare this, not an ID), activeEchoSets (compare sonata SETS, not individual echo names), and a per-slot echoes breakdown (main stat + all substats for each of the 5 equipped echoes) for judging which specific echo is weakest and worth replacing. Only works for characters in the user's roster.",
    input_schema: CHARACTER_NAME_PARAM,
  },
  {
    name: "get_character_guide",
    description:
      "Get Kuro's official recommended build for a character: target Crit Rate/Crit DMG/ATK stat thresholds, recommended echo + sonata set, ranked weapon recommendations, a PER-SKILL talent level priority order (talentPriority -- which skill to level first and its target level), and combat rotation notes. Works for any character, not just ones in the user's roster -- use this to compare what the user has against what's recommended, or to answer questions about characters they don't own yet.",
    input_schema: CHARACTER_NAME_PARAM,
  },
  {
    name: "get_team_comps",
    description:
      "Get Kuro's recommended teammates for a character (a main pick plus alternates for each team slot). Works for any character.",
    input_schema: CHARACTER_NAME_PARAM,
  },
];

// Anthropic Messages API content-block shapes. A "user" message carries
// tool_result blocks back to the model; an "assistant" message carries
// tool_use blocks when the model wants to call a tool. Plain conversation
// turns just use a bare string for `content` (the API accepts either).
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

interface ToolUseBlock {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicTurnResult {
  content: string;
  toolUses: ToolUseBlock[];
}

// Every turn is exactly one streamed Claude request, parsed manually via
// SSE to accumulate both text and tool_use content blocks from the same
// response. This single-request-per-turn shape carried over from the
// app's original Groq-based implementation, where making two separate
// requests per turn (one just to check for tool calls, one for "the real
// answer") turned out to be unsound at nonzero temperature -- the two
// calls could disagree, and a plain-text answer from the first request
// could be silently replaced by a tool-call fragment from the second. One
// parsed stream removes that failure mode entirely, at the cost of
// buffering the whole answer server-side instead of forwarding tokens
// live to the client -- acceptable for now, revisit if the chat UI wants
// token-level streaming.
async function streamAnthropicTurn(system: string, messages: ChatMessage[]): Promise<AnthropicTurnResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      system,
      messages,
      temperature: 0.3, // matches .claude/rules/agent.md -- consistent, factual reasoning over game data
      // 2048 was too tight for a full-roster comparison (14 characters,
      // each with a stat/weapon/echo/talent breakdown) -- it cut off
      // mid-response, before ever stating the actual answer. Raised
      // alongside a system-prompt change to lead with the verdict first,
      // so a still-truncated response at least lands the answer.
      max_tokens: 4096,
      stream: true,
      ...(TOOLS.length > 0 ? { tools: TOOLS } : {}),
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "(no body)");
    throw new Error(`Claude API error (${res.status}): ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  // Anthropic streams content blocks by index (content_block_start, then a
  // series of content_block_delta events) -- text blocks accumulate a
  // "text_delta" string, tool_use blocks accumulate an "input_json_delta"
  // string that's only valid JSON once fully concatenated.
  const blocksByIndex: Record<
    number,
    { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; inputJson: string }
  > = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // last line may be incomplete, keep it for next read

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue; // ignores this SSE stream's "event:" lines, only data: carries the payload
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;

      const parsed = JSON.parse(payload);
      switch (parsed.type) {
        case "content_block_start": {
          const block = parsed.content_block;
          blocksByIndex[parsed.index] =
            block.type === "tool_use"
              ? { type: "tool_use", id: block.id, name: block.name, inputJson: "" }
              : { type: "text", text: "" };
          break;
        }
        case "content_block_delta": {
          const b = blocksByIndex[parsed.index];
          if (!b) break;
          if (parsed.delta.type === "text_delta" && b.type === "text") {
            b.text += parsed.delta.text;
            content += parsed.delta.text;
          } else if (parsed.delta.type === "input_json_delta" && b.type === "tool_use") {
            b.inputJson += parsed.delta.partial_json;
          }
          break;
        }
        default:
          break; // message_start/content_block_stop/message_delta/message_stop carry nothing we need
      }
    }
  }

  const toolUses: ToolUseBlock[] = Object.values(blocksByIndex)
    .filter((b): b is { type: "tool_use"; id: string; name: string; inputJson: string } => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, input: b.inputJson ? JSON.parse(b.inputJson) : {} }));

  return { content, toolUses };
}

async function getUserRoster(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("user_characters")
    .select("role_gb_id, character_level, weapon_gb_id, updated_at")
    .order("updated_at", { ascending: false });
  if (error) return JSON.stringify({ error: error.message });

  const roster = (data ?? []).map((row) => ({
    name: characterGuides[row.role_gb_id]?.name ?? row.role_gb_id,
    level: row.character_level,
    hasWeapon: row.weapon_gb_id !== null,
    lastUpdated: row.updated_at,
  }));
  return JSON.stringify({ roster });
}

// Fixed order every saved build's talent_levels/forte columns follow --
// matches the addPointTarget order documented in database.md and
// TalentGrid.tsx's FORTE_COLUMN_ORDER (Forte Circuit has no stat-bonus
// nodes of its own, hence only 4 columns there vs. 5 talents here).
const TALENT_LABELS = [
  "Normal Attack",
  "Resonance Skill",
  "Forte Circuit",
  "Resonance Liberation",
  "Intro Skill",
];

async function getCharacterBuild(supabase: SupabaseClient, characterName: unknown): Promise<string> {
  if (typeof characterName !== "string") return JSON.stringify({ error: "character_name is required" });
  const id = resolveCharacterId(characterName);
  if (!id) return JSON.stringify({ error: `No character found matching "${characterName}"` });

  const { data, error } = await supabase
    .from("user_characters")
    .select(
      "character_level, weapon_gb_id, weapon_level, weapon_rank, resonance_level, talent_levels, inherent_active, forte_node_active, echoes",
    )
    .eq("role_gb_id", id)
    .maybeSingle();
  if (error) return JSON.stringify({ error: error.message });
  if (!data) {
    return JSON.stringify({
      error: `${characterGuides[id]?.name ?? characterName} isn't in the user's saved roster yet.`,
    });
  }

  const echoSlots = (data.echoes ?? []) as SavedEchoSlot[];
  const echoTotals = computeEchoStatTotals(echoSlots, echoByNormalizedName, echoStatCurves);
  const activeEchoSets = computeActiveSetBonuses(echoSlots, echoSets);
  const forteBonusTotals = computeForteBonusTotals(
    (data.forte_node_active ?? []) as boolean[],
    sequenceStatNodes[id],
  );
  const finalStats = computeFinalStats({
    roleGbId: id,
    element: characterGuides[id]?.element ?? null,
    level: data.character_level,
    curves: characterStatCurves,
    weaponGbId: data.weapon_gb_id,
    weaponLevel: data.weapon_level,
    weaponCurves: weaponStatCurves,
    echoTotals,
    forteBonusTotals,
  });

  const talentLevels = (data.talent_levels ?? []) as number[];
  return JSON.stringify({
    character: characterGuides[id]?.name ?? characterName,
    level: data.character_level,
    weapon: data.weapon_gb_id
      ? {
          name: weaponNames[data.weapon_gb_id] ?? null,
          weaponNameNote: weaponNames[data.weapon_gb_id]
            ? undefined
            : `This weapon's id (${data.weapon_gb_id}) isn't in this app's name lookup -- a real gap in this app's data, not something you can infer. Say plainly that the weapon's name is unknown and you can't compare it to recommendedWeapons; ask the user to name it if they want that comparison done. Do not guess a name.`,
          level: data.weapon_level,
          rank: data.weapon_rank,
          rankNote: "Rank ranges 1-5. Rank 5 is the maximum refinement, rank 1 is unrefined -- do not call rank 1 \"maximum.\"",
        }
      : null,
    sequenceNodesUnlocked: data.resonance_level,
    talentLevels: TALENT_LABELS.map((label, i) => ({ skill: label, level: talentLevels[i] ?? null })),
    talentLevelsNote:
      "Compare each skill's level here against that same skill's entry in get_character_guide's talentPriority (call that tool too if you haven't) -- talentPriority is Kuro's real recommended level PER skill, ordered by priority (first entry = level first). Uneven levels aren't automatically a mistake -- if a lower-level skill is also lower priority in talentPriority, that's correct as-is; only flag a skill as under-leveled if it's below its OWN recommendLevel target.",
    // finalStats is null if this character/level combo has no base-stat data
    // (a genuine data gap, not a build problem -- say so plainly if it happens).
    finalStats,
    activeEchoSets: activeEchoSets.length
      ? activeEchoSets.map((s) => ({
          set: s.setName,
          pieceCount: s.count,
          activeBonuses: s.activeEffects.map((e) => `${e.pieceCount}pc: ${e.description}`),
        }))
      : [],
    echoSetsNote:
      "Compare activeEchoSets (the SET the user equipped) against the guide's recommendedEcho.sets -- never compare individual echo names/pictures, those don't matter for build quality, only which sonata set bonus is active and at what piece count.",
    echoes: computeEchoSlotBreakdown(echoSlots, echoByNormalizedName, echoStatCurves),
    echoesNote:
      "Per-slot breakdown (main stat(s) + all 5 substats) for questions like 'which echo should I replace' -- judge a slot as weak if its substats are mostly low-value/off-role stats (e.g. flat HP/DEF, Energy Regen on a non-support) rather than Crit Rate/Crit DMG/ATK% or the character's element DMG bonus. A slot with an empty substats array or null echoName is unequipped or has no recorded name -- call that out plainly (it's the clearest replacement target if one exists) rather than describing it in any other way. Refer to slots only by their number (1-5) -- Wuthering Waves echoes are NOT named by body part (no \"head\"/\"chest\"/\"hands\"/\"feet\"/\"waist\" slots exist in this game, unlike some other games' artifact systems). Never state a specific echo name, main stat, or substat that isn't literally present in this array.",
  });
}

function getCharacterGuide(characterName: unknown): string {
  if (typeof characterName !== "string") return JSON.stringify({ error: "character_name is required" });
  const id = resolveCharacterId(characterName);
  if (!id) return JSON.stringify({ error: `No character found matching "${characterName}"` });
  const guide = characterGuides[id];
  return JSON.stringify({
    character: guide.name,
    element: guide.element,
    statThresholds: guide.statThresholds,
    statThresholdsNote:
      "Each target is a MINIMUM floor to reach (e.g. Crit. Rate target '70.0%' means aim for at least 70%), not a range -- there is no upper bound in this data. Compare directly against get_character_build's finalStats.",
    recommendedEcho: guide.recommendedEcho,
    recommendedWeapons: guide.recommendedWeapons,
    talentPriority: guide.talentPriority,
    talentPriorityNote:
      "Kuro's real recommended level for each of the 5 skills, ORDERED by priority -- the first entry is the skill to level first, the last is lowest priority. Compare each skill's recommendLevel against that same skill's actual level in get_character_build's talentLevels to answer 'which talent should I upgrade next': the highest-priority skill (earliest in this list) that is still below its own recommendLevel is the answer. A null recommendLevel means Kuro's guide doesn't specify a target for that skill.",
    rotationNotes: guide.rotationNotes,
  });
}

function getTeamComps(characterName: unknown): string {
  if (typeof characterName !== "string") return JSON.stringify({ error: "character_name is required" });
  const id = resolveCharacterId(characterName);
  if (!id) return JSON.stringify({ error: `No character found matching "${characterName}"` });
  const guide = characterGuides[id];
  return JSON.stringify({ character: guide.name, teamComps: guide.teamComps });
}

// Runs a tool by name against the caller's own RLS-scoped Supabase client
// (so a tool can never see another user's data -- no service-role key used
// anywhere in this function).
async function runTool(name: string, args: Record<string, unknown>, supabase: SupabaseClient): Promise<string> {
  switch (name) {
    case "get_user_roster":
      return getUserRoster(supabase);
    case "get_character_build":
      return getCharacterBuild(supabase, args.character_name);
    case "get_character_guide":
      return getCharacterGuide(args.character_name);
    case "get_team_comps":
      return getTeamComps(args.character_name);
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// The frontend calls this function directly from the browser (not
// server-to-server), so the browser sends a CORS preflight OPTIONS request
// first and checks Access-Control-Allow-* on every response, including
// error ones -- missing this doesn't show up in curl/Node-based testing at
// all, only in an actual browser, which is how this got missed initially.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  // RLS-scoped client: every query this function ever runs is bound to
  // the caller's own auth.uid(), the same as every other table access in
  // this app (see .claude/rules/database.md's RLS policies). No
  // service-role key exists in this function at all.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  let body: { message?: string; history?: { role?: string; content?: string }[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  if (!body.message || typeof body.message !== "string") {
    return new Response(JSON.stringify({ error: "Missing 'message' string in body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  // Optional prior turns from the chat UI so follow-up questions ("what
  // about her weapon?") have context -- each turn's tool calls/results are
  // deliberately NOT replayed here, only the plain user/assistant text, to
  // keep the history compact and avoid re-running stale tool calls.
  // ChatPage.tsx also caps how many messages it sends (MAX_HISTORY_MESSAGES)
  // so a long chat can't grow this unboundedly.
  const history: ChatMessage[] = (body.history ?? [])
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content }));

  // Unlike OpenAI/Groq's format, Claude's system prompt is a separate
  // top-level API field, not a message with role "system".
  const messages: ChatMessage[] = [...history, { role: "user", content: body.message }];

  // ReAct loop: one streamed Claude request per turn (see
  // streamAnthropicTurn's comment for why not two). A turn with tool_use
  // blocks runs the tools and loops again; a turn with only text is the
  // final answer.
  let finalContent: string;
  try {
    let turnResult: AnthropicTurnResult | null = null;
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      turnResult = await streamAnthropicTurn(SYSTEM_PROMPT, messages);
      if (turnResult.toolUses.length === 0) break;

      const assistantContent: ContentBlock[] = [];
      if (turnResult.content) assistantContent.push({ type: "text", text: turnResult.content });
      for (const tu of turnResult.toolUses) {
        assistantContent.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
      }
      messages.push({ role: "assistant", content: assistantContent });

      // Anthropic requires every tool_use block in an assistant turn to
      // have a matching tool_result in the immediately following user
      // message -- batch them all into one message rather than one each.
      const toolResultBlocks: ContentBlock[] = [];
      for (const tu of turnResult.toolUses) {
        const result = await runTool(tu.name, tu.input, supabase);
        toolResultBlocks.push({ type: "tool_result", tool_use_id: tu.id, content: result });
      }
      messages.push({ role: "user", content: toolResultBlocks });

      turnResult = null; // consumed into a tool round, not a final answer yet
    }

    if (turnResult === null) {
      return new Response(JSON.stringify({ error: "Exceeded max tool iterations" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    finalContent = turnResult.content;
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  // Buffered, not token-by-token (see streamAnthropicTurn) -- still
  // delivered in an SSE envelope so the chat UI's parsing doesn't need to
  // change based on which upstream provider is behind this function. This
  // response shape is this app's own invention, not Anthropic's or Groq's
  // wire format -- ChatPage.tsx only ever needs to understand this one.
  const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: finalContent } }] })}\n\ndata: [DONE]\n\n`;
  return new Response(sse, { headers: { "Content-Type": "text/event-stream", ...CORS_HEADERS } });
});
