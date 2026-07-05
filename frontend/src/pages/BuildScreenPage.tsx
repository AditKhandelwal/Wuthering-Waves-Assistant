import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BuildCard } from "../components/BuildCard";
import { EchoImportModal } from "../components/EchoImportModal";
import { EchoPicker } from "../components/EchoPicker";
import { SequenceNodeRow } from "../components/SequenceNodeRow";
import { StatBox } from "../components/StatBox";
import { StatIcon } from "../components/StatIcon";
import { TalentGrid } from "../components/TalentGrid";
import { WeaponPicker } from "../components/WeaponPicker";
import { ELEMENT_PORTRAIT_BORDER_CLASS, ELEMENT_PORTRAIT_GLOW_CLASS, loadRoster } from "../lib/characters";
import {
  availableSubStatNames,
  computeActiveSetBonuses,
  computeEchoMainStatValue,
  computeEchoStatSummary,
  COST_DISC_CLASS,
  formatStatValue,
  loadEchoCatalog,
  loadEchoRecommendation,
  loadEchoSets,
  loadEchoStatCurves,
} from "../lib/echoes";
import { loadForteNodes } from "../lib/forteNodes";
import { loadSequenceNodes } from "../lib/sequenceNodes";
import { loadStatIcons } from "../lib/statIcons";
import { computeStats, loadStatCurves } from "../lib/stats";
import { loadInherentSkills, loadKeynoteSkills, loadTalents } from "../lib/talents";
import { renderRankScaledText, stripHtml } from "../lib/text";
import {
  computeWeaponAtk,
  computeWeaponSecondaryStat,
  loadWeaponCatalog,
  loadWeaponStatCurves,
} from "../lib/weapons";
import type { Character, ElementName } from "../types/character";
import type {
  EchoCatalogEntry,
  EchoMainStatOption,
  EchoSet,
  EchoStatCurves,
  EquippedEcho,
} from "../types/echo";
import type { CharacterForteNodes } from "../types/forteNode";
import type { SequenceNode } from "../types/sequenceNode";
import type { StatCurveData } from "../types/stats";
import type { InherentSkill, KeynoteSkill, Talent } from "../types/talent";
import type { EchoCatalog, EchoRecommendation } from "../lib/echoes";
import type { WeaponCatalog } from "../lib/weapons";
import type { WeaponCatalogEntry, WeaponStatCurves } from "../types/weapon";

// Real builds vary in which slot holds which cost tier (4-3-3-1-1, 4-4-1-1-1,
// etc.) -- so slots aren't pinned to a fixed cost. Each slot's cost is
// whatever echo the user puts in it.
const ECHO_SLOT_COUNT = 5;

function emptyEquippedEchoes(): EquippedEcho[] {
  return Array.from({ length: ECHO_SLOT_COUNT }, (_, i) => ({
    slotIndex: i,
    echo: null,
    chosenSetName: null,
    mainStatPropId: null,
    level: 0,
    substats: Array.from({ length: 5 }, () => ({ statName: null, value: null })),
  }));
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="clip-corner border border-border bg-panel p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function EchoSlotCard({
  slot,
  curves,
  onOpenPicker,
  onOpenImport,
  onUpdate,
  onSubStatChange,
}: {
  slot: EquippedEcho;
  curves: EchoStatCurves | null;
  onOpenPicker: () => void;
  onOpenImport: () => void;
  onUpdate: (patch: Partial<EquippedEcho>) => void;
  onSubStatChange: (subIndex: number, statName: string | null, value: number | null) => void;
}) {
  const cost = slot.echo?.cost ?? null;
  const mainStatOptions: EchoMainStatOption[] = cost && curves ? curves.mainStatOptionsByCost[cost] : [];
  const selectedMainOption = mainStatOptions.find((o) => o.propId === slot.mainStatPropId) ?? null;
  const mainStatValue = selectedMainOption
    ? computeEchoMainStatValue(selectedMainOption, slot.level)
    : null;
  // Every echo has 2 main stats: this fixed one (flat ATK for cost 3/4, flat
  // HP for cost 1) is always present alongside the player-chosen one above --
  // confirmed against a real echo card, see docs/DATA_REQUIREMENTS.md.
  const staticOption = cost && curves ? curves.staticMainStatByCost[cost] : null;
  const staticValue = staticOption ? computeEchoMainStatValue(staticOption, slot.level) : null;

  return (
    <div className="border border-border bg-panel-alt p-3">
      <div className="flex gap-4">
        <div
          className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-panel ${cost ? COST_DISC_CLASS[cost] : "border-border text-text-muted"}`}
        >
          {slot.echo?.pictureUrl ? (
            <img src={slot.echo.pictureUrl} alt={slot.echo.name} className="h-full w-full object-contain" />
          ) : cost ? (
            <span className="text-xs font-semibold">{cost}</span>
          ) : (
            <span className="text-lg">+</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-gold-soft">
              {slot.echo?.name ?? "Empty Slot"}
            </span>
            <div className="flex shrink-0 gap-1.5">
              <button
                onClick={onOpenImport}
                className="rounded-sm border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted transition hover:border-gold-soft hover:text-gold-soft"
              >
                Import
              </button>
              <button
                onClick={onOpenPicker}
                className="rounded-sm border border-gold-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gold-soft transition hover:bg-panel-alt"
              >
                {slot.echo ? "Change" : "Select"}
              </button>
            </div>
          </div>

          {slot.echo && curves && (
            <>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={25}
                  value={slot.level}
                  onChange={(e) => onUpdate({ level: Number(e.target.value) })}
                  className="w-32 accent-gold"
                />
                <span className="w-16 shrink-0 whitespace-nowrap text-right text-sm text-gold-soft">
                  {slot.level} / 25
                </span>
              </div>

              {staticOption && staticValue !== null && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-xs text-text">{staticOption.statName}</span>
                  <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-gold-soft">
                    {formatStatValue(staticValue, staticOption.statName)}
                  </span>
                </div>
              )}

              <div className="mt-1 flex items-center gap-2">
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-muted">Main</span>
                <select
                  value={slot.mainStatPropId ?? ""}
                  onChange={(e) => onUpdate({ mainStatPropId: Number(e.target.value) })}
                  className="min-w-0 flex-1 rounded-sm border border-border bg-panel px-2 py-1 text-xs text-text"
                >
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

              {slot.echo.setNames.length > 1 && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-muted">Set</span>
                  <select
                    value={slot.chosenSetName ?? ""}
                    onChange={(e) => onUpdate({ chosenSetName: e.target.value })}
                    className="min-w-0 flex-1 rounded-sm border border-border bg-panel px-2 py-1 text-xs text-text"
                  >
                    {slot.echo.setNames.map((sn) => (
                      <option key={sn} value={sn}>
                        {sn}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-3">
                <span className="text-[10px] uppercase tracking-wide text-text-muted">Substats</span>
                <div className="mt-1 flex flex-col gap-1">
                  {slot.substats.map((sub, subIndex) => {
                    const available = availableSubStatNames(curves, slot, subIndex);
                    const chosenOption = curves.subStatOptions.find((o) => o.statName === sub.statName) ?? null;
                    return (
                      <div key={subIndex} className="flex items-center gap-2">
                        <select
                          value={sub.statName ?? ""}
                          onChange={(e) => onSubStatChange(subIndex, e.target.value || null, null)}
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
                            onSubStatChange(
                              subIndex,
                              sub.statName,
                              e.target.value ? Number(e.target.value) : null,
                            )
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function BuildScreenPage() {
  const { characterId } = useParams();
  const [character, setCharacter] = useState<Character | null>(null);
  const [curves, setCurves] = useState<StatCurveData | null>(null);
  const [statIcons, setStatIcons] = useState<Record<string, string> | null>(null);
  const [level, setLevel] = useState(1);

  const [weaponCatalog, setWeaponCatalog] = useState<WeaponCatalog | null>(null);
  const [weaponCurves, setWeaponCurves] = useState<WeaponStatCurves | null>(null);
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponCatalogEntry | null>(null);
  const [weaponLevel, setWeaponLevel] = useState(1);
  const [weaponRank, setWeaponRank] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [sequenceNodes, setSequenceNodes] = useState<SequenceNode[]>([]);
  const [unlockedCount, setUnlockedCount] = useState(0);

  const [talents, setTalents] = useState<Talent[]>([]);
  const [talentLevels, setTalentLevels] = useState<number[]>([]);
  const [inherentSkills, setInherentSkills] = useState<InherentSkill[]>([]);
  const [inherentActive, setInherentActive] = useState<boolean[]>([]);
  const [keynoteSkills, setKeynoteSkills] = useState<KeynoteSkill[]>([]);
  const [forteNodes, setForteNodes] = useState<CharacterForteNodes | null>(null);
  // 8 booleans: 4 columns × 2 tiers, all toggled on by default (representing a fully unlocked tree)
  const [forteNodeActive, setForteNodeActive] = useState<boolean[]>(Array(8).fill(true));

  const [echoCatalog, setEchoCatalog] = useState<EchoCatalog | null>(null);
  const [echoSets, setEchoSets] = useState<EchoSet[]>([]);
  const [echoCurves, setEchoCurves] = useState<EchoStatCurves | null>(null);
  const [echoRecommendation, setEchoRecommendation] = useState<EchoRecommendation | null>(null);
  const [equippedEchoes, setEquippedEchoes] = useState<EquippedEcho[]>(emptyEquippedEchoes());
  const [echoPickerSlot, setEchoPickerSlot] = useState<number | null>(null);
  const [echoImportSlot, setEchoImportSlot] = useState<number | null>(null);

  const [cardView, setCardView] = useState(false);
  const [elementIcons, setElementIcons] = useState<Record<ElementName, string> | null>(null);

  useEffect(() => {
    loadRoster().then(({ characters }) => {
      setCharacter(characters.find((c) => c.roleGbId === characterId) ?? null);
    });
    loadStatCurves().then(setCurves);
    setLevel(1);
    setSelectedWeapon(null);
    setWeaponLevel(1);
    setWeaponRank(1);
    setUnlockedCount(0);
    setForteNodeActive(Array(8).fill(true));
    setEquippedEchoes(emptyEquippedEchoes());
    setEchoRecommendation(null);
    if (characterId) {
      loadSequenceNodes(characterId).then(setSequenceNodes);
      loadForteNodes(characterId).then(setForteNodes);
      loadTalents(characterId).then((loaded) => {
        setTalents(loaded);
        setTalentLevels(loaded.map(() => 1));
      });
      loadInherentSkills(characterId).then((loaded) => {
        setInherentSkills(loaded);
        setInherentActive(loaded.map(() => true));
      });
      loadKeynoteSkills(characterId).then(setKeynoteSkills);
      loadEchoRecommendation(characterId).then(setEchoRecommendation);
    }
  }, [characterId]);

  useEffect(() => {
    loadRoster().then(({ elementIcons }) => setElementIcons(elementIcons));
    loadWeaponCatalog().then(setWeaponCatalog);
    loadWeaponStatCurves().then(setWeaponCurves);
    loadStatIcons().then(setStatIcons);
    loadEchoCatalog().then(setEchoCatalog);
    loadEchoSets().then(setEchoSets);
    loadEchoStatCurves().then(setEchoCurves);
  }, []);

  // Default to the character's own top recommended weapon once both the
  // character and catalog have loaded.
  useEffect(() => {
    if (!character || !weaponCatalog || selectedWeapon) return;
    const recommendedIds = weaponCatalog.recommendedByCharacter[character.roleGbId] ?? [];
    const weapons = weaponCatalog.byType[character.weaponType] ?? [];
    const defaultWeapon = weapons.find((w) => w.gbId === recommendedIds[0]) ?? null;
    if (defaultWeapon) setSelectedWeapon(defaultWeapon);
  }, [character, weaponCatalog, selectedWeapon]);

  // Default slot 0 to the character's real signature echo (the only
  // concrete recommended item the data actually gives us -- slots 1-4 stay
  // empty rather than fabricating 4 more picks).
  useEffect(() => {
    if (!echoCatalog || !echoCurves || !echoRecommendation) return;
    if (equippedEchoes[0].echo) return;
    const name = echoRecommendation.signatureEchoName;
    if (!name) return;
    const match = echoCatalog.byCost[4].find((e) => e.name === name);
    if (!match) return;
    const defaultMainOption = echoCurves.mainStatOptionsByCost[match.cost][0];
    setEquippedEchoes((current) =>
      current.map((slot, i) =>
        i === 0
          ? {
              ...slot,
              echo: match,
              chosenSetName:
                match.setNames.find((s) => echoRecommendation.recommendedSetNames.includes(s)) ??
                match.setNames[0] ??
                null,
              mainStatPropId: defaultMainOption?.propId ?? null,
            }
          : slot,
      ),
    );
  }, [echoCatalog, echoCurves, echoRecommendation, equippedEchoes]);

  function updateEquippedEcho(index: number, patch: Partial<EquippedEcho>) {
    setEquippedEchoes((current) =>
      current.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    );
  }

  function updateEchoSubStat(
    slotIndex: number,
    subIndex: number,
    statName: string | null,
    value: number | null,
  ) {
    setEquippedEchoes((current) =>
      current.map((slot, i) =>
        i === slotIndex
          ? { ...slot, substats: slot.substats.map((s, j) => (j === subIndex ? { statName, value } : s)) }
          : slot,
      ),
    );
  }

  function handleEchoSelect(slotIndex: number, echo: EchoCatalogEntry, chosenSetName: string) {
    const defaultMainOption = echoCurves?.mainStatOptionsByCost[echo.cost][0];
    setEquippedEchoes((current) =>
      current.map((slot, i) =>
        i === slotIndex
          ? {
              ...slot,
              echo,
              chosenSetName,
              mainStatPropId: defaultMainOption?.propId ?? null,
              level: 0,
              substats: Array.from({ length: 5 }, () => ({ statName: null, value: null })),
            }
          : slot,
      ),
    );
    setEchoPickerSlot(null);
  }

  // Screenshot import always fully replaces the target slot -- identity,
  // set, level, main stat, and all 5 substats -- rather than merging with
  // whatever was there before, since the whole point is "match what's on
  // this card," not a partial patch.
  function handleEchoImportApply(
    slotIndex: number,
    result: {
      echo: EchoCatalogEntry | null;
      chosenSetName: string | null;
      mainStatPropId: number | null;
      level: number;
      substats: EquippedEcho["substats"];
    },
  ) {
    setEquippedEchoes((current) =>
      current.map((slot, i) =>
        i === slotIndex
          ? {
              ...slot,
              echo: result.echo,
              chosenSetName: result.chosenSetName,
              mainStatPropId: result.mainStatPropId,
              level: result.level,
              substats: result.substats,
            }
          : slot,
      ),
    );
    setEchoImportSlot(null);
  }

  const stats = character && curves ? computeStats(curves, character.roleGbId, level) : null;
  const weaponAtk =
    selectedWeapon && weaponCurves
      ? computeWeaponAtk(weaponCurves, selectedWeapon.gbId, weaponLevel)
      : null;
  const weaponSecondaryStat =
    selectedWeapon && weaponCurves
      ? computeWeaponSecondaryStat(weaponCurves, selectedWeapon.gbId, weaponLevel)
      : null;
  const recommendedWeaponOrder =
    character && weaponCatalog ? (weaponCatalog.recommendedByCharacter[character.roleGbId] ?? []) : [];

  if (!character) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/" className="text-sm text-text-muted hover:text-gold-soft transition">
          &larr; Characters
        </Link>
        <button
          onClick={() => setCardView((current) => !current)}
          className="rounded-sm border border-gold-soft px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gold-soft transition hover:bg-panel-alt"
        >
          {cardView ? "Edit Build" : "View Card"}
        </button>
      </div>

      {cardView ? (
        <BuildCard
          character={character}
          level={level}
          curves={curves}
          statIcons={statIcons}
          elementIcons={elementIcons}
          selectedWeapon={selectedWeapon}
          weaponLevel={weaponLevel}
          weaponRank={weaponRank}
          weaponCurves={weaponCurves}
          sequenceNodes={sequenceNodes}
          unlockedCount={unlockedCount}
          talents={talents}
          talentLevels={talentLevels}
          inherentSkills={inherentSkills}
          inherentActive={inherentActive}
          keynoteSkills={keynoteSkills}
          equippedEchoes={equippedEchoes}
          echoCurves={echoCurves}
          echoSets={echoSets}
        />
      ) : (
      <div className="grid grid-cols-[240px_1fr] gap-8">
        {/* Left: portrait + level */}
        <div className="flex flex-col gap-4">
          <div className={ELEMENT_PORTRAIT_GLOW_CLASS[character.element]}>
            <div
              className={`clip-corner overflow-hidden border-2 bg-panel ${ELEMENT_PORTRAIT_BORDER_CLASS[character.element]}`}
            >
              <img
                src={character.illustrationPictureUrl}
                alt={character.name}
                className="h-72 w-full object-cover"
              />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gold-soft">{character.name}</h1>
            <p className="text-sm text-text-muted">{character.element}</p>
          </div>
          <Panel title="Level">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={90}
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                className="w-32 accent-gold"
              />
              <span className="w-16 shrink-0 whitespace-nowrap text-right text-sm text-gold-soft">
                {level} / 90
              </span>
            </div>

            {stats && (
              <div className="mt-4 flex flex-wrap gap-2">
                <StatBox
                  icon={<StatIcon icons={statIcons} name="HP" />}
                  label="HP"
                  value={stats.hp.toLocaleString()}
                />
                <StatBox
                  icon={<StatIcon icons={statIcons} name="ATK" />}
                  label="ATK"
                  value={stats.atk.toLocaleString()}
                />
                <StatBox
                  icon={<StatIcon icons={statIcons} name="DEF" />}
                  label="DEF"
                  value={stats.def.toLocaleString()}
                />
              </div>
            )}
          </Panel>
        </div>

        {/* Right: build sections (stubs for now) */}
        <div className="flex flex-col gap-6">
          <Panel title="Weapon">
            {selectedWeapon ? (
              <div className="flex gap-4">
                <img
                  src={selectedWeapon.pictureUrl}
                  alt={selectedWeapon.name}
                  className="h-16 w-16 shrink-0 object-contain"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gold-soft">
                      {selectedWeapon.name}
                    </span>
                    <button
                      onClick={() => setPickerOpen(true)}
                      className="shrink-0 rounded-sm border border-gold-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gold-soft transition hover:bg-panel-alt"
                    >
                      Change
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    {renderRankScaledText(selectedWeapon.effectDescription, weaponRank)}
                  </p>

                  <div className="mt-3 flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={90}
                      value={weaponLevel}
                      onChange={(e) => setWeaponLevel(Number(e.target.value))}
                      className="w-32 accent-gold"
                    />
                    <span className="w-16 shrink-0 whitespace-nowrap text-right text-sm text-gold-soft">
                      {weaponLevel} / 90
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {weaponAtk !== null && (
                      <StatBox
                        icon={<StatIcon icons={statIcons} name="ATK" />}
                        label="ATK"
                        value={String(weaponAtk)}
                      />
                    )}
                    {weaponSecondaryStat && (
                      <StatBox
                        icon={<StatIcon icons={statIcons} name={weaponSecondaryStat.name} />}
                        label={weaponSecondaryStat.name}
                        value={weaponSecondaryStat.displayValue}
                      />
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-text-muted">Rank</span>
                    {[1, 2, 3, 4, 5].map((rank) => (
                      <button
                        key={rank}
                        onClick={() => setWeaponRank(rank)}
                        className={`flex h-6 w-6 items-center justify-center rounded-sm border text-[10px] transition ${
                          rank === weaponRank
                            ? "border-gold text-gold-soft"
                            : "border-border text-text-muted hover:border-gold-soft"
                        }`}
                      >
                        {rank}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setPickerOpen(true)}
                className="text-sm text-text-muted hover:text-gold-soft transition"
              >
                Select Weapon
              </button>
            )}
          </Panel>

          <Panel title="Sequence Nodes">
            <SequenceNodeRow
              nodes={sequenceNodes}
              unlockedCount={unlockedCount}
              onToggle={(sequence) =>
                setUnlockedCount((current) => (sequence === current ? sequence - 1 : sequence))
              }
            />
          </Panel>

          <Panel title="Talents">
            <TalentGrid
              talents={talents}
              levels={talentLevels}
              onChange={(index, newLevel) =>
                setTalentLevels((current) =>
                  current.map((lvl, i) => (i === index ? Math.min(10, Math.max(1, newLevel)) : lvl)),
                )
              }
              inherentSkills={inherentSkills}
              inherentActive={inherentActive}
              onToggleInherent={(index) =>
                setInherentActive((current) =>
                  current.map((active, i) => (i === index ? !active : active)),
                )
              }
              keynoteSkills={keynoteSkills}
              forteNodes={forteNodes}
              forteNodeActive={forteNodeActive}
              onToggleForteNode={(flatIndex) =>
                setForteNodeActive((current) =>
                  current.map((active, i) => (i === flatIndex ? !active : active)),
                )
              }
            />

            {forteNodes && (() => {
              // Forte nodes are always percentage boosts regardless of stat name
              // (e.g. ATK nodes give +1.8% ATK, not flat ATK).
              const COLS = ["normal_attack", "resonance_skill", "resonance_liberation", "intro_skill"] as const;
              const totals = new Map<string, number>();
              COLS.forEach((col, colIdx) => {
                [0, 1].forEach((tierIdx) => {
                  if (forteNodeActive[colIdx * 2 + tierIdx]) {
                    const node = forteNodes[col][tierIdx];
                    totals.set(node.stat, (totals.get(node.stat) ?? 0) + node.value);
                  }
                });
              });
              const entries = [...totals.entries()];
              return (
                <div className="mt-4 border-t border-border pt-3">
                  <span className="text-[10px] uppercase tracking-wide text-text-muted">
                    Stat Node Gains
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {entries.length === 0 ? (
                      <p className="text-xs text-text-muted">No nodes active.</p>
                    ) : (
                      entries.map(([stat, total]) => (
                        <StatBox
                          key={stat}
                          icon={<StatIcon icons={statIcons} name={stat} />}
                          label={stat}
                          value={`+${total.toFixed(1)}%`}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })()}
          </Panel>

          <Panel title="Echoes">
            <div className="flex flex-col gap-3">
              {equippedEchoes.map((slot, i) => (
                <EchoSlotCard
                  key={i}
                  slot={slot}
                  curves={echoCurves}
                  onOpenPicker={() => setEchoPickerSlot(i)}
                  onOpenImport={() => setEchoImportSlot(i)}
                  onUpdate={(patch) => updateEquippedEcho(i, patch)}
                  onSubStatChange={(subIndex, statName, value) =>
                    updateEchoSubStat(i, subIndex, statName, value)
                  }
                />
              ))}
            </div>

            {echoCurves && (
              <div className="mt-4 border-t border-border pt-3">
                <span className="text-[10px] uppercase tracking-wide text-text-muted">
                  Echo Stat Summary
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {computeEchoStatSummary(equippedEchoes, echoCurves, stats).length === 0 && (
                    <p className="text-xs text-text-muted">No stats gained yet.</p>
                  )}
                  {computeEchoStatSummary(equippedEchoes, echoCurves, stats).map((total) => (
                    <StatBox
                      key={total.statName}
                      icon={<StatIcon icons={statIcons} name={total.statName} />}
                      label={total.statName}
                      value={formatStatValue(total.value, total.statName)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 border-t border-border pt-3">
              <span className="text-[10px] uppercase tracking-wide text-text-muted">
                Active Set Bonuses
              </span>
              <div className="mt-2 flex flex-col gap-2">
                {computeActiveSetBonuses(equippedEchoes, echoSets).length === 0 && (
                  <p className="text-xs text-text-muted">No echoes equipped yet.</p>
                )}
                {computeActiveSetBonuses(equippedEchoes, echoSets).map((bonus) => (
                  <div key={bonus.setName} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text">{bonus.setName}</span>
                      <span className="text-text-muted">{bonus.count}/5</span>
                    </div>
                    {bonus.activeEffects.map((eff) => (
                      <p key={eff.pieceCount} className="mt-0.5 text-gold-soft">
                        {eff.pieceCount}pc: {eff.description}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {echoRecommendation?.recommendDescriptionHtml && (
              <div className="mt-3 border-t border-border pt-3">
                <span className="text-[10px] uppercase tracking-wide text-text-muted">
                  Substat Priority
                </span>
                <p className="mt-1 text-xs text-text-muted">
                  {stripHtml(echoRecommendation.recommendDescriptionHtml)}
                </p>
              </div>
            )}
          </Panel>
        </div>
      </div>
      )}

      {pickerOpen && weaponCatalog && character && (
        <WeaponPicker
          weapons={weaponCatalog.byType[character.weaponType] ?? []}
          recommendedOrder={recommendedWeaponOrder}
          onSelect={(weapon) => {
            setSelectedWeapon(weapon);
            setWeaponLevel(1);
            setWeaponRank(1);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {echoPickerSlot !== null && echoCatalog && (
        <EchoPicker
          catalog={echoCatalog}
          sets={echoSets}
          recommendedSetNames={echoRecommendation?.recommendedSetNames ?? []}
          onSelect={(echo, chosenSetName) => handleEchoSelect(echoPickerSlot, echo, chosenSetName)}
          onClose={() => setEchoPickerSlot(null)}
        />
      )}

      {echoImportSlot !== null && echoCatalog && echoCurves && (
        <EchoImportModal
          catalog={echoCatalog}
          sets={echoSets}
          recommendedSetNames={echoRecommendation?.recommendedSetNames ?? []}
          curves={echoCurves}
          currentEchoName={equippedEchoes[echoImportSlot].echo?.name ?? null}
          onApply={(result) => handleEchoImportApply(echoImportSlot, result)}
          onClose={() => setEchoImportSlot(null)}
        />
      )}
    </div>
  );
}
