import type { EchoMainStatOption, EchoStatCurves, SubStatOption } from "../types/echo";
import type { EchoCatalog } from "./echoes";

// Kept separate from echoOcrEngine.ts (which is the only file that actually
// loads tesseract.js) so this pure text-matching logic can be exercised
// without ever pulling in the OCR engine or its wasm payload.
export interface OcrLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export type FieldConfidence = "matched" | "corrected" | "unmatched";

export interface ParsedField<T> {
  value: T | null;
  rawText: string;
  confidence: FieldConfidence;
}

export interface ParsedStatRow {
  statName: string;
  value: number;
}

export interface ParsedEchoCard {
  echoName: ParsedField<string>;
  cost: ParsedField<1 | 3 | 4>;
  level: ParsedField<number>;
  variableMainStat: ParsedField<ParsedStatRow>;
  staticMainStat: ParsedField<ParsedStatRow>;
  substats: ParsedField<ParsedStatRow>[]; // always length 5
}

export interface EchoOcrVocab {
  echoNamesByCost: Record<1 | 3 | 4, string[]>;
  mainStatNamesByCost: Record<1 | 3 | 4, { variable: string[]; static: string }>;
  subStatNames: string[];
}

export function buildEchoOcrVocab(catalog: EchoCatalog, curves: EchoStatCurves): EchoOcrVocab {
  return {
    echoNamesByCost: {
      1: catalog.byCost[1].map((e) => e.name),
      3: catalog.byCost[3].map((e) => e.name),
      4: catalog.byCost[4].map((e) => e.name),
    },
    mainStatNamesByCost: {
      1: {
        variable: curves.mainStatOptionsByCost[1].map((o) => o.statName),
        static: curves.staticMainStatByCost[1].statName,
      },
      3: {
        variable: curves.mainStatOptionsByCost[3].map((o) => o.statName),
        static: curves.staticMainStatByCost[3].statName,
      },
      4: {
        variable: curves.mainStatOptionsByCost[4].map((o) => o.statName),
        static: curves.staticMainStatByCost[4].statName,
      },
    },
    subStatNames: curves.subStatOptions.map((o) => o.statName),
  };
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

// "%" is kept (not stripped like other punctuation) because it's the only
// thing distinguishing e.g. "HP" from "HP%" -- stripping it made those two
// (and the ATK/DEF equivalents) normalize to the same string and become
// indistinguishable to fuzzyMatchName, even though resolveStatName had
// already correctly picked which one to search for.
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Small, known vocabularies (<=180 echo names, 9 substats) so a brute-force
// distance check against every candidate is trivially fast -- no fuzzy-search
// library needed. Rejects (returns null) rather than guessing when nothing is
// close enough, since a wrong-but-confident match is worse than "unmatched".
export function fuzzyMatchName(
  raw: string,
  candidates: string[],
  maxRelativeDistance = 0.3,
): { match: string; distance: number } | null {
  const normRaw = normalizeForMatch(raw);
  if (!normRaw) return null;

  let best: { match: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const normCandidate = normalizeForMatch(candidate);
    if (!normCandidate) continue;
    const distance = levenshtein(normRaw, normCandidate);
    const relative = distance / Math.max(normCandidate.length, normRaw.length);
    if (relative <= maxRelativeDistance && (!best || distance < best.distance)) {
      best = { match: candidate, distance };
    }
  }
  return best;
}

// Some echoes have a purely cosmetic alternate-skin name ("Phantom: Sigillum")
// that's 100% mechanically identical (same cost/set/stats) to their base
// catalog entry ("Sigillum") -- confirmed by the user's real game knowledge,
// 2026-07-05. These skins never get their own catalog row (there's nothing
// mechanically distinct to catalog), so a direct fuzzy match against the
// card's full displayed name fails outright ("Phantom: Sigillum" is nowhere
// near "Sigillum" under any reasonable distance threshold). Retried with the
// prefix stripped before giving up. `usedPrefixStrip` forces "corrected"
// confidence even on an exact post-strip match -- it's a reliable resolution,
// but still worth a glance since it required a structural transform, not a
// plain lookup.
const COSMETIC_NAME_PREFIXES = [/^phantom\s*:?\s*/i];

export function matchEchoName(
  rawName: string,
  candidates: string[],
): { match: string; distance: number; usedPrefixStrip: boolean } | null {
  const direct = fuzzyMatchName(rawName, candidates);
  if (direct) return { ...direct, usedPrefixStrip: false };

  for (const prefixRe of COSMETIC_NAME_PREFIXES) {
    if (!prefixRe.test(rawName)) continue;
    const stripped = rawName.replace(prefixRe, "").trim();
    if (!stripped) continue;
    const retried = fuzzyMatchName(stripped, candidates);
    if (retried) return { ...retried, usedPrefixStrip: true };
  }
  return null;
}

// Safety net against OCR misreading a digit: snaps a parsed value to the
// nearest entry in that stat's real discrete roll ladder, rejecting (null)
// if even the closest ladder entry is too far off to trust.
export function snapToLadder(raw: number, ladder: number[], maxRelativeError = 0.35): number | null {
  if (ladder.length === 0 || Number.isNaN(raw)) return null;
  let best = ladder[0];
  let bestDiff = Math.abs(raw - best);
  for (const value of ladder) {
    const diff = Math.abs(raw - value);
    if (diff < bestDiff) {
      best = value;
      bestDiff = diff;
    }
  }
  const relativeError = bestDiff / Math.max(Math.abs(best), 1);
  return relativeError <= maxRelativeError ? best : null;
}

// Every echo stat in this game's cards is either a whole flat number (ATK
// 84, HP 430) or an X.Y% percent -- tesseract frequently drops the decimal
// point at this font size ("25.2%" -> "252%", "10.1%" -> "101%"), which
// throws the raw value 10x off. Only worth retrying for percent stats
// (flat stats are never formatted with a decimal in-game, so a genuine OCR
// digit error there shouldn't be reinterpreted as a missing decimal point).
// Recovered snaps are never reported as "matched" -- they required a guess.
function snapWithDecimalRecovery(
  raw: number,
  ladder: number[],
  addType: 1 | 2,
): { value: number; recovered: boolean } | null {
  const direct = snapToLadder(raw, ladder);
  if (direct !== null) return { value: direct, recovered: false };
  if (addType !== 2) return null;
  for (const divisor of [10, 100]) {
    const attempt = snapToLadder(raw / divisor, ladder);
    if (attempt !== null) return { value: attempt, recovered: true };
  }
  return null;
}

export type PlusToken = { kind: "substat"; rawName: string; rawValue: number };

// Every substat row starts with "+Name Value" -- disambiguated from the
// level token below by requiring letters between the "+" and the number.
// The trailing "%" is captured as its own group rather than folded into the
// name -- ATK/HP/DEF each have a flat and a percent variant that render with
// the *identical* on-card label ("ATK", not "ATK%"), so whether the value
// ends in "%" is the only signal telling them apart. See resolveStatName.
// Real cards render a small icon glyph directly to the left of every stat
// name (and no icon at all between "+" and a substat name, or before a main
// stat name) -- confirmed 2026-07-05 against a real "Phantom: Sigillum"
// screenshot where "Crit. DMG" failed to parse as BOTH the main stat and a
// substat, while every other stat name on the same card (different icons)
// parsed fine. The icon glyph gets OCR'd as noise merged onto that specific
// line; the previous `[A-Za-z.\s]+?` name-capture required the *entire*
// pre-number span to be clean letters, so a single stray glyph character
// broke the match outright -- silently dropping the whole line rather than
// just mis-tagging it (that's why substats shifted up with an empty slot at
// the end, instead of showing an "unmatched" row in place). Now `.+?`
// accepts any leading junk into the raw-name candidate and leaves filtering
// it out to fuzzyMatchName's Levenshtein tolerance (which already ignores
// non-alphanumeric noise via normalizeForMatch) instead of a hard regex gate.
// The trailing `[^\d]*$` does the same for icon noise trailing the value.
const SUBSTAT_ROW_RE = /^\+\s*(.+?)\s+([\d.]+)\s*(%)?[^\d]*$/;
const MAIN_STAT_ROW_RE = /^(.+?)\s+([\d.]+)\s*(%)?[^\d]*$/;
const COST_RE = /COST\s*[:\s]*([134])\b/i;

// ATK/HP/DEF are the only stat families with both a flat and a "%" variant
// under the same label text in-game -- append "%" before fuzzy-matching so
// e.g. "ATK 7.9%" resolves against "ATK%" rather than flat "ATK".
const AMBIGUOUS_FLAT_PERCENT_NAMES = new Set(["ATK", "HP", "DEF"]);

function resolveStatName(rawName: string, hasPercent: boolean): string {
  const trimmed = rawName.trim();
  return hasPercent && AMBIGUOUS_FLAT_PERCENT_NAMES.has(trimmed) ? `${trimmed}%` : trimmed;
}

// The level readout ("+20") sits on its own line on some cards but shares a
// line with the echo name on others (name left-aligned, level right-aligned
// on the same visual row -- confirmed by testing against a real card layout,
// where tesseract merged them into one OCR line "Kronablight +20"). Matching
// a trailing "+NN" anywhere in a line -- not requiring the whole line to be
// just that token -- handles both cases. `(?!\d)` stops a 3-digit flat stat
// value like "...430" from partial-matching as "...43"; the trailing
// `[^0-9A-Za-z]*$` tolerates stray icon-glyph noise after the number without
// requiring an exact end-of-string.
const TRAILING_LEVEL_RE = /\+\s*(\d{1,2})(?!\d)(?:\s*\/\s*25)?[^0-9A-Za-z]*$/;

export function parsePlusToken(line: string): PlusToken | null {
  const subMatch = SUBSTAT_ROW_RE.exec(line);
  if (subMatch) {
    const rawValue = Number(subMatch[2]);
    if (!Number.isNaN(rawValue)) {
      return { kind: "substat", rawName: resolveStatName(subMatch[1], !!subMatch[3]), rawValue };
    }
  }
  return null;
}

// Finds the first line (top-to-bottom) containing a level token, extracts
// it, and strips that token out of its line so whatever text preceded it
// (e.g. the echo name) can still be classified normally afterward.
function extractLevelToken(texts: string[]): { level: number | null; levelRaw: string; texts: string[] } {
  for (let i = 0; i < texts.length; i++) {
    const m = TRAILING_LEVEL_RE.exec(texts[i]);
    if (!m || m.index === undefined) continue;
    const level = Number(m[1]);
    if (level < 0 || level > 25) continue;
    const stripped = [...texts];
    stripped[i] = texts[i].slice(0, m.index).trim();
    return { level, levelRaw: texts[i], texts: stripped.filter((t) => t.length > 0) };
  }
  return { level: null, levelRaw: "", texts };
}

function emptyField<T>(rawText: string): ParsedField<T> {
  return { value: null, rawText, confidence: "unmatched" };
}

interface RawStatRow {
  rawName: string;
  rawValue: number;
  rawText: string;
}

function ladderForMainStat(option: EchoMainStatOption | undefined, level: number | null): number[] {
  if (!option) return [];
  if (level !== null && option.valuesByLevel[level] !== undefined) {
    return [option.valuesByLevel[level]];
  }
  return Object.values(option.valuesByLevel);
}

function matchMainStat(
  candidate: RawStatRow | undefined,
  names: string[],
  optionsByName: Map<string, EchoMainStatOption>,
  level: number | null,
): ParsedField<ParsedStatRow> {
  if (!candidate) return emptyField("");
  // OCR sometimes reads a main stat's icon glyph as stray leading "text"
  // (confirmed real case: ATK's crossed-swords icon misread as "XR",
  // producing raw text "XR ATK 18.0%") -- unlike substat rows, main-stat
  // rows have no leading "+" anchor to bound where icon noise ends and the
  // real name begins, so MAIN_STAT_ROW_RE's name-capture group swallows it
  // whole ("XR ATK"), which doesn't fuzzy-match "ATK%" closely enough on
  // its own. Retry against just the last whitespace-separated word, since
  // the real stat name is always last -- icons render to the left of text
  // in this game's UI, never the right. Same retry-with-a-cleaned-variant
  // pattern as matchEchoName's cosmetic-prefix stripping.
  const nameMatch =
    fuzzyMatchName(candidate.rawName, names) ??
    fuzzyMatchName(candidate.rawName.split(/\s+/).pop() ?? candidate.rawName, names);
  if (!nameMatch) return { value: null, rawText: candidate.rawText, confidence: "unmatched" };

  const option = optionsByName.get(nameMatch.match);
  const ladder = ladderForMainStat(option, level);
  const snapped = snapWithDecimalRecovery(candidate.rawValue, ladder, option?.addType ?? 2);
  if (snapped === null) return { value: null, rawText: candidate.rawText, confidence: "unmatched" };

  const confidence: FieldConfidence =
    !snapped.recovered && nameMatch.distance === 0 && snapped.value === candidate.rawValue
      ? "matched"
      : "corrected";
  return {
    value: { statName: nameMatch.match, value: snapped.value },
    rawText: candidate.rawText,
    confidence,
  };
}

// Real game rule (already enforced in the manual-entry UI via
// availableSubStatNames in lib/echoes.ts): a given echo's substats never
// repeat a stat name among themselves. Excluding names already assigned to
// earlier substat slots -- not just deprioritizing them -- fixes a real
// mismatch found 2026-07-05: a real Kronablight card's 4th substat "Heavy
// Attack DMG Bonus" got fuzzy-matched to "Basic Attack DMG Bonus" instead
// (those two names differ by only one 5-letter word, so a garbled OCR read
// of "Heavy" can end up numerically closer to "Basic" than to "Heavy"
// itself) -- even though "Basic Attack DMG Bonus" was already taken by
// substat #3 on the very same echo. Falls back to the unfiltered pool if
// excluding used names leaves no viable candidate at all, rather than
// forcing a false "unmatched" on the strength of this heuristic alone.
function matchSubStat(
  candidate: RawStatRow | undefined,
  subStatOptions: SubStatOption[],
  usedNames: Set<string>,
): ParsedField<ParsedStatRow> {
  if (!candidate) return emptyField("");
  const preferredOptions = subStatOptions.filter((o) => !usedNames.has(o.statName));
  const nameMatch =
    fuzzyMatchName(
      candidate.rawName,
      preferredOptions.map((o) => o.statName),
    ) ??
    fuzzyMatchName(
      candidate.rawName,
      subStatOptions.map((o) => o.statName),
    );
  if (!nameMatch) return { value: null, rawText: candidate.rawText, confidence: "unmatched" };

  const option = subStatOptions.find((o) => o.statName === nameMatch.match);
  const snapped = snapWithDecimalRecovery(candidate.rawValue, option?.values ?? [], option?.addType ?? 2);
  if (snapped === null) return { value: null, rawText: candidate.rawText, confidence: "unmatched" };

  const confidence: FieldConfidence =
    !snapped.recovered && nameMatch.distance === 0 && snapped.value === candidate.rawValue
      ? "matched"
      : "corrected";
  return {
    value: { statName: nameMatch.match, value: snapped.value },
    rawText: candidate.rawText,
    confidence,
  };
}

// Turns raw OCR'd lines from one echo-card screenshot into a structured best
// guess for every form field, each tagged with a confidence so the review UI
// can flag anything worth a second look. Lines are sorted top-to-bottom by
// bbox first so vertical order (which stat row is "variable" vs "static",
// which non-numeric line is the echo name) is reliable regardless of how
// tesseract internally grouped blocks/paragraphs.
export function parseEchoCardLines(
  lines: OcrLine[],
  vocab: EchoOcrVocab,
  curves: EchoStatCurves,
): ParsedEchoCard {
  const rawTexts = [...lines]
    .sort((a, b) => a.bbox.y0 - b.bbox.y0)
    .map((l) => l.text.trim().replace(/\s+/g, " "))
    .filter((t) => t.length > 0);

  const { level, levelRaw, texts } = extractLevelToken(rawTexts);

  let cost: 1 | 3 | 4 | null = null;
  let costRaw = "";
  for (const t of texts) {
    const m = COST_RE.exec(t);
    if (m) {
      cost = Number(m[1]) as 1 | 3 | 4;
      costRaw = t;
      break;
    }
  }

  const rawSubstats: RawStatRow[] = [];
  let nameRaw: string | null = null;
  const statRowCandidates: RawStatRow[] = [];

  for (const t of texts) {
    if (t === costRaw) continue;

    const plusToken = parsePlusToken(t);
    if (plusToken?.kind === "substat") {
      rawSubstats.push({ rawName: plusToken.rawName, rawValue: plusToken.rawValue, rawText: t });
      continue;
    }

    const m = MAIN_STAT_ROW_RE.exec(t);
    if (m) {
      const row: RawStatRow = { rawName: resolveStatName(m[1], !!m[3]), rawValue: Number(m[2]), rawText: t };
      if (statRowCandidates.length < 2) {
        // A card only ever has 2 non-"+" main-stat rows, both at the top,
        // right after the cost line.
        statRowCandidates.push(row);
      } else {
        // Any further "name value" line without a "+" is almost certainly a
        // real substat whose "+" glyph OCR failed to recognize -- confirmed
        // 2026-07-05: happened on a real card specifically for a Crit. DMG
        // substat row, right next to that stat's icon glyph (the icon
        // apparently interferes with recognizing the adjacent "+" itself,
        // not just the name text). Recovered here instead of being silently
        // discarded, which is what happened before this fix (the row just
        // vanished from statRowCandidates since only indices 0/1 are ever
        // read, shifting every subsequent substat up by one).
        rawSubstats.push(row);
      }
      continue;
    }

    if (nameRaw === null) nameRaw = t;
  }

  const nameCandidates = cost
    ? vocab.echoNamesByCost[cost]
    : [...vocab.echoNamesByCost[1], ...vocab.echoNamesByCost[3], ...vocab.echoNamesByCost[4]];
  const nameMatch = nameRaw ? matchEchoName(nameRaw, nameCandidates) : null;
  const echoName: ParsedField<string> = nameRaw
    ? {
        value: nameMatch?.match ?? null,
        rawText: nameRaw,
        confidence: nameMatch
          ? nameMatch.usedPrefixStrip || nameMatch.distance !== 0
            ? "corrected"
            : "matched"
          : "unmatched",
      }
    : emptyField("");

  const costField: ParsedField<1 | 3 | 4> = cost
    ? { value: cost, rawText: costRaw, confidence: "matched" }
    : emptyField("");

  const levelField: ParsedField<number> =
    level !== null ? { value: level, rawText: levelRaw, confidence: "matched" } : emptyField("");

  let variableMainStat = emptyField<ParsedStatRow>("");
  let staticMainStat = emptyField<ParsedStatRow>("");
  if (cost) {
    const variableOptions = curves.mainStatOptionsByCost[cost];
    const staticOption = curves.staticMainStatByCost[cost];
    const variableByName = new Map(variableOptions.map((o) => [o.statName, o]));
    const staticByName = new Map([[staticOption.statName, staticOption]]);

    variableMainStat = matchMainStat(
      statRowCandidates[0],
      vocab.mainStatNamesByCost[cost].variable,
      variableByName,
      level,
    );
    staticMainStat = matchMainStat(
      statRowCandidates[1],
      [vocab.mainStatNamesByCost[cost].static],
      staticByName,
      level,
    );
  }

  const usedSubStatNames = new Set<string>();
  const substats: ParsedField<ParsedStatRow>[] = Array.from({ length: 5 }, (_, i) => {
    const field = matchSubStat(rawSubstats[i], curves.subStatOptions, usedSubStatNames);
    if (field.value) usedSubStatNames.add(field.value.statName);
    return field;
  });

  return { echoName, cost: costField, level: levelField, variableMainStat, staticMainStat, substats };
}
