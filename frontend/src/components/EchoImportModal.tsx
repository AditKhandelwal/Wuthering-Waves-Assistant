import { useEffect, useRef, useState } from "react";
import { EchoPicker } from "./EchoPicker";
import { Modal } from "./Modal";
import {
  availableSubStatNames,
  computeEchoMainStatValue,
  COST_DISC_CLASS,
  formatStatValue,
  type EchoCatalog,
} from "../lib/echoes";
import { recognizeEchoCardImage } from "../lib/echoOcrEngine";
import {
  buildEchoOcrVocab,
  parseEchoCardLines,
  type FieldConfidence,
  type ParsedEchoCard,
} from "../lib/echoOcrParse";
import type { EchoCatalogEntry, EchoMainStatOption, EchoSet, EchoStatCurves, SubStatSlot } from "../types/echo";

interface EchoImportModalProps {
  catalog: EchoCatalog;
  sets: EchoSet[];
  recommendedSetNames: string[];
  curves: EchoStatCurves;
  currentEchoName: string | null;
  onApply: (result: {
    echo: EchoCatalogEntry | null;
    chosenSetName: string | null;
    mainStatPropId: number | null;
    level: number;
    substats: SubStatSlot[];
  }) => void;
  onClose: () => void;
}

type Step = "upload" | "processing" | "review";

interface DraftState {
  echo: EchoCatalogEntry | null;
  chosenSetName: string | null;
  mainStatPropId: number | null;
  level: number;
  substats: SubStatSlot[];
}

interface DraftConfidence {
  echo: FieldConfidence;
  level: FieldConfidence;
  mainStat: FieldConfidence;
  substats: FieldConfidence[];
}

const ALL_ECHOES_LOOKUP = (catalog: EchoCatalog) => [
  ...catalog.byCost[4],
  ...catalog.byCost[3],
  ...catalog.byCost[1],
];

function draftFromParsed(
  parsed: ParsedEchoCard,
  catalog: EchoCatalog,
  curves: EchoStatCurves,
): { draft: DraftState; confidence: DraftConfidence } {
  const parsedCost = parsed.cost.value;
  const namePool = parsedCost ? catalog.byCost[parsedCost] : ALL_ECHOES_LOOKUP(catalog);
  const echo = parsed.echoName.value ? (namePool.find((e) => e.name === parsed.echoName.value) ?? null) : null;
  const effectiveCost = echo?.cost ?? parsedCost ?? null;

  let mainStatPropId: number | null = null;
  if (effectiveCost && parsed.variableMainStat.value) {
    const option = curves.mainStatOptionsByCost[effectiveCost].find(
      (o) => o.statName === parsed.variableMainStat.value?.statName,
    );
    mainStatPropId = option?.propId ?? null;
  }

  return {
    draft: {
      echo,
      chosenSetName: echo?.setNames[0] ?? null,
      mainStatPropId,
      level: parsed.level.value ?? 0,
      substats: parsed.substats.map((f) => ({
        statName: f.value?.statName ?? null,
        value: f.value?.value ?? null,
      })),
    },
    confidence: {
      echo: parsed.echoName.confidence,
      level: parsed.level.confidence,
      mainStat: parsed.variableMainStat.confidence,
      substats: parsed.substats.map((f) => f.confidence),
    },
  };
}

// Amber flag for anything the OCR pass didn't confidently resolve -- both
// branches are complete literal class strings (not template-interpolated),
// so Tailwind's static source scan picks them up fine (see .claude/rules/frontend.md).
function confidenceBorderClass(c: FieldConfidence): string {
  return c === "matched" ? "border-border" : "border-amber-500/70";
}

function VerifyCaption({ confidence, rawText }: { confidence: FieldConfidence; rawText: string }) {
  if (confidence === "matched" || !rawText) return null;
  return <p className="mt-0.5 text-[10px] text-amber-500">Verify -- OCR read "{rawText}"</p>;
}

export function EchoImportModal({
  catalog,
  sets,
  recommendedSetNames,
  curves,
  currentEchoName,
  onApply,
  onClose,
}: EchoImportModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [confidence, setConfidence] = useState<DraftConfidence | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function processImage(file: File | Blob) {
    setPreviewUrl(URL.createObjectURL(file));
    setStep("processing");
    setProgress(0);
    setError(null);
    try {
      const lines = await recognizeEchoCardImage(file, setProgress);
      const vocab = buildEchoOcrVocab(catalog, curves);
      const parsed = parseEchoCardLines(lines, vocab, curves);
      const { draft: nextDraft, confidence: nextConfidence } = draftFromParsed(parsed, catalog, curves);
      setDraft(nextDraft);
      setConfidence(nextConfidence);
      setStep("review");
    } catch {
      setError("Couldn't read that image. Try a clearer screenshot, or fill in the fields manually below.");
      setDraft(draftFromParsed(parseEchoCardLines([], buildEchoOcrVocab(catalog, curves), curves), catalog, curves).draft);
      setConfidence(
        draftFromParsed(parseEchoCardLines([], buildEchoOcrVocab(catalog, curves), curves), catalog, curves)
          .confidence,
      );
      setStep("review");
    }
  }

  useEffect(() => {
    if (step !== "upload") return;
    function handlePaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) processImage(file);
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function updateDraft(patch: Partial<DraftState>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updateSubStat(subIndex: number, statName: string | null, value: number | null) {
    setDraft((current) =>
      current
        ? {
            ...current,
            substats: current.substats.map((s, j) => (j === subIndex ? { statName, value } : s)),
          }
        : current,
    );
    setConfidence((current) =>
      current
        ? { ...current, substats: current.substats.map((c, j) => (j === subIndex ? "matched" : c)) }
        : current,
    );
  }

  const cost = draft?.echo?.cost ?? null;
  const mainStatOptions: EchoMainStatOption[] = cost ? curves.mainStatOptionsByCost[cost] : [];
  const selectedMainOption = mainStatOptions.find((o) => o.propId === draft?.mainStatPropId) ?? null;
  const mainStatValue =
    selectedMainOption && draft ? computeEchoMainStatValue(selectedMainOption, draft.level) : null;
  const staticOption = cost ? curves.staticMainStatByCost[cost] : null;
  const staticValue = staticOption && draft ? computeEchoMainStatValue(staticOption, draft.level) : null;

  // Swaps to the exact same picker used everywhere else in the build screen
  // (grouped by cost, real icons, set filter) instead of a bare <select> --
  // rendered in place of our own Modal (not nested inside it) since EchoPicker
  // already renders its own.
  if (pickerOpen) {
    return (
      <EchoPicker
        catalog={catalog}
        sets={sets}
        recommendedSetNames={recommendedSetNames}
        onSelect={(echo, chosenSetName) => {
          updateDraft({ echo, chosenSetName, mainStatPropId: null });
          setConfidence((current) => (current ? { ...current, echo: "matched" } : current));
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    );
  }

  return (
    <Modal onClose={onClose} panelClassName="flex max-h-[85vh] w-[32rem] max-w-[90vw] flex-col">
      <h2 className="mb-1 shrink-0 text-xs font-semibold uppercase tracking-widest text-text-muted">
        Import Echo From Screenshot
      </h2>
      {currentEchoName && step === "upload" && (
        <p className="mb-4 shrink-0 text-xs text-text-muted">
          Replacing: <span className="text-gold-soft">{currentEchoName}</span>
        </p>
      )}

      {step === "upload" && (
        <div className="flex flex-col gap-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) processImage(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-2 border border-dashed border-border p-6 text-center transition hover:border-gold-soft"
          >
            <span className="text-sm text-text">Click to upload, drag & drop, or paste (Ctrl/Cmd+V)</span>
            <span className="text-xs text-text-muted">A screenshot of a single echo's stat card</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processImage(file);
            }}
          />

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              Expected format
            </p>
            <img
              src="/echo-ocr-samples/example.png"
              alt="Example echo card screenshot"
              className="max-h-48 w-full rounded-sm border border-border object-contain"
            />
          </div>
        </div>
      )}

      {step === "processing" && (
        <div className="flex flex-col items-center gap-4 py-6">
          {previewUrl && (
            <img src={previewUrl} alt="Uploaded echo" className="max-h-48 rounded-sm border border-border" />
          )}
          <p className="text-sm text-text-muted">Reading image... {progress}%</p>
          <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-panel-alt">
            <div className="h-full bg-gold transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {step === "review" && draft && confidence && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {error && <p className="text-xs text-amber-500">{error}</p>}

          <div>
            <span className="text-[10px] uppercase tracking-wide text-text-muted">Echo</span>
            <div
              className={`mt-1 flex items-center gap-3 rounded-sm border bg-panel p-2 ${confidenceBorderClass(confidence.echo)}`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-panel-alt ${draft.echo ? COST_DISC_CLASS[draft.echo.cost] : "border-border text-text-muted"}`}
              >
                {draft.echo?.pictureUrl ? (
                  <img
                    src={draft.echo.pictureUrl}
                    alt={draft.echo.name}
                    className="h-full w-full object-contain"
                  />
                ) : draft.echo ? (
                  <span className="text-xs font-semibold">{draft.echo.cost}</span>
                ) : (
                  <span className="text-lg">+</span>
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm text-text">
                {draft.echo?.name ?? "No echo matched"}
              </span>
              <button
                onClick={() => setPickerOpen(true)}
                className="shrink-0 rounded-sm border border-gold-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gold-soft transition hover:bg-panel-alt"
              >
                {draft.echo ? "Change" : "Select"}
              </button>
            </div>
            <VerifyCaption confidence={confidence.echo} rawText="" />
          </div>

          {draft.echo && draft.echo.setNames.length > 1 && (
            <div>
              <span className="text-[10px] uppercase tracking-wide text-text-muted">Set</span>
              <select
                value={draft.chosenSetName ?? ""}
                onChange={(e) => updateDraft({ chosenSetName: e.target.value })}
                className="mt-1 w-full rounded-sm border border-border bg-panel px-2 py-1.5 text-sm text-text"
              >
                {draft.echo.setNames.map((sn) => (
                  <option key={sn} value={sn}>
                    {sn}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <span className="text-[10px] uppercase tracking-wide text-text-muted">Level</span>
            <div className={`mt-1 flex items-center gap-3 rounded-sm border p-2 ${confidenceBorderClass(confidence.level)}`}>
              <input
                type="range"
                min={0}
                max={25}
                value={draft.level}
                onChange={(e) => {
                  updateDraft({ level: Number(e.target.value) });
                  setConfidence((current) => (current ? { ...current, level: "matched" } : current));
                }}
                className="w-32 accent-gold"
              />
              <span className="w-16 shrink-0 whitespace-nowrap text-right text-sm text-gold-soft">
                {draft.level} / 25
              </span>
            </div>
          </div>

          {staticOption && staticValue !== null && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span className="min-w-0 flex-1">{staticOption.statName} (fixed)</span>
              <span className="shrink-0 whitespace-nowrap tabular-nums text-gold-soft">
                {formatStatValue(staticValue, staticOption.statName)}
              </span>
            </div>
          )}

          <div>
            <span className="text-[10px] uppercase tracking-wide text-text-muted">Main Stat</span>
            <div className={`mt-1 flex items-center gap-2 rounded-sm border p-2 ${confidenceBorderClass(confidence.mainStat)}`}>
              <select
                value={draft.mainStatPropId ?? ""}
                disabled={!cost}
                onChange={(e) => {
                  updateDraft({ mainStatPropId: Number(e.target.value) });
                  setConfidence((current) => (current ? { ...current, mainStat: "matched" } : current));
                }}
                className="min-w-0 flex-1 rounded-sm border border-border bg-panel px-2 py-1 text-xs text-text disabled:opacity-40"
              >
                <option value="">-- Stat --</option>
                {mainStatOptions.map((o) => (
                  <option key={o.propId} value={o.propId}>
                    {o.statName}
                  </option>
                ))}
              </select>
              {mainStatValue !== null && selectedMainOption && (
                <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-gold-soft">
                  {formatStatValue(mainStatValue, selectedMainOption.statName)}
                </span>
              )}
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wide text-text-muted">Substats</span>
            <div className="mt-1 flex flex-col gap-1">
              {draft.substats.map((sub, subIndex) => {
                const available = availableSubStatNames(curves, { ...draft, slotIndex: -1 }, subIndex);
                const chosenOption = curves.subStatOptions.find((o) => o.statName === sub.statName) ?? null;
                return (
                  <div
                    key={subIndex}
                    className={`flex items-center gap-2 rounded-sm border p-1 ${confidenceBorderClass(confidence.substats[subIndex])}`}
                  >
                    <select
                      value={sub.statName ?? ""}
                      onChange={(e) => updateSubStat(subIndex, e.target.value || null, null)}
                      className="min-w-0 flex-1 rounded-sm border border-border bg-panel px-2 py-1 text-xs text-text"
                    >
                      <option value="">-- Stat --</option>
                      {sub.statName && !available.some((o) => o.statName === sub.statName) && (
                        <option value={sub.statName}>{sub.statName}</option>
                      )}
                      {available.map((o) => (
                        <option key={o.statName} value={o.statName}>
                          {o.statName}
                        </option>
                      ))}
                    </select>
                    <select
                      value={sub.value ?? ""}
                      disabled={!chosenOption}
                      onChange={(e) =>
                        updateSubStat(subIndex, sub.statName, e.target.value ? Number(e.target.value) : null)
                      }
                      className="w-24 shrink-0 rounded-sm border border-border bg-panel px-2 py-1 text-xs text-text disabled:opacity-40"
                    >
                      <option value="">--</option>
                      {chosenOption?.values.map((v) => (
                        <option key={v} value={v}>
                          {chosenOption ? formatStatValue(v, chosenOption.statName) : v}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex shrink-0 justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted transition hover:border-gold-soft hover:text-gold-soft"
        >
          Cancel
        </button>
        {step === "review" && draft && (
          <button
            onClick={() =>
              onApply({
                echo: draft.echo,
                chosenSetName: draft.chosenSetName,
                mainStatPropId: draft.mainStatPropId,
                level: draft.level,
                substats: draft.substats,
              })
            }
            className="rounded-sm border border-gold-soft px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gold-soft transition hover:bg-panel-alt"
          >
            Apply
          </button>
        )}
      </div>
    </Modal>
  );
}
