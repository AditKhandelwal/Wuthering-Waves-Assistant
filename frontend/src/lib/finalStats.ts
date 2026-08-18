import { computeEchoStatTotals } from "./echoes";
import { computeStats } from "./stats";
import { computeWeaponAtk, computeWeaponSecondaryStat } from "./weapons";
import type { Character } from "../types/character";
import type { EchoStatCurves, EquippedEcho } from "../types/echo";
import type { StatCurveData } from "../types/stats";
import type { WeaponCatalogEntry, WeaponStatCurves } from "../types/weapon";

// Universal stats every resonator starts with before any weapon/echo bonus --
// not sourced from this app's data (confirmed nothing in data/*.json encodes
// them), these are well-established constants from the game itself. See
// docs/DATA_REQUIREMENTS.md's "Still blocked" damage-formula note -- this is
// the first UI computation to actually need them.
export const BASE_CRIT_RATE = 5;
export const BASE_CRIT_DMG = 150;
export const BASE_ENERGY_REGEN = 100;

export interface FinalStats {
  hp: number;
  atk: number;
  def: number;
  energyRegen: number;
  critRate: number;
  critDmg: number;
  healingBonus: number;
  elementalDmgBonusName: string;
  elementalDmgBonus: number;
  basicAttackDmgBonus: number;
  heavyAttackDmgBonus: number;
  skillDmgBonus: number;
  liberationDmgBonus: number;
}

interface ComputeFinalStatsArgs {
  character: Character;
  level: number;
  curves: StatCurveData;
  selectedWeapon: WeaponCatalogEntry | null;
  weaponLevel: number;
  weaponCurves: WeaponStatCurves | null;
  equippedEchoes: EquippedEcho[];
  echoCurves: EchoStatCurves | null;
  // Summed active forte node bonuses (stat name → total %).
  // "ATK"/"HP"/"DEF" are percentage multipliers, not flat values.
  forteBonusTotals?: Map<string, number>;
  // The weapon's own always-on passive bonus (stat name → total %), from
  // computeWeaponPassiveBonusTotals -- see that function and
  // scripts/build_weapon_passive_bonuses.py for why only the unconditional
  // part of a weapon's passive text is ever included here. May contain the
  // "ELEMENTAL" placeholder key, resolved below.
  weaponPassiveBonusTotals?: Map<string, number>;
}

// Combines character base (at level) + weapon (ATK + its one secondary stat
// + the unconditional part of its passive) + all equipped echoes'
// main/substats + active forte nodes into the final totals shown on the
// build card. Deliberately excludes echo set-bonus effects (2pc/5pc) -- those
// are only free-text descriptions in this app's data (see
// computeActiveSetBonuses), not structured stat deltas, so folding them in
// here would mean guessing at a parse of English text. Shown separately as
// tags instead. Weapon passives get a narrower exception: ONLY the
// confidently-unconditional first-sentence component is ever included (see
// build_weapon_passive_bonuses.py) -- the conditional/proc remainder is
// still just shown as text, same as echo sets.
export function computeFinalStats({
  character,
  level,
  curves,
  selectedWeapon,
  weaponLevel,
  weaponCurves,
  equippedEchoes,
  echoCurves,
  forteBonusTotals = new Map(),
  weaponPassiveBonusTotals = new Map(),
}: ComputeFinalStatsArgs): FinalStats | null {
  const base = computeStats(curves, character.roleGbId, level);
  if (!base) return null;

  const echoTotals = echoCurves ? computeEchoStatTotals(equippedEchoes, echoCurves) : new Map<string, number>();
  const echo = (statName: string) => echoTotals.get(statName) ?? 0;
  const forte = (statName: string) => forteBonusTotals.get(statName) ?? 0;

  const elementalDmgBonusName = `${character.element} DMG Bonus`;
  // "ELEMENTAL" is build_weapon_passive_bonuses.py's placeholder for a
  // passive phrased as "Attribute DMG Bonus" (whichever element the
  // wielder is) -- resolved here, the one place that already knows
  // elementalDmgBonusName, rather than making every caller know this
  // convention.
  const weaponPassive = (statName: string) =>
    weaponPassiveBonusTotals.get(statName === elementalDmgBonusName ? "ELEMENTAL" : statName) ?? 0;

  const weaponAtk =
    selectedWeapon && weaponCurves
      ? (computeWeaponAtk(weaponCurves, selectedWeapon.gbId, weaponLevel) ?? 0)
      : 0;
  const weaponSecondary =
    selectedWeapon && weaponCurves
      ? computeWeaponSecondaryStat(weaponCurves, selectedWeapon.gbId, weaponLevel)
      : null;
  const weaponStat = (statName: string) => (weaponSecondary?.name === statName ? weaponSecondary.value : 0);

  // Forte "ATK"/"HP"/"DEF" nodes are percentage boosts, not flat values.
  const hpPercent = echo("HP%") + weaponStat("HP%") + forte("HP") + weaponPassive("HP%");
  const atkPercent = echo("ATK%") + weaponStat("ATK%") + forte("ATK") + weaponPassive("ATK%");
  const defPercent = echo("DEF%") + weaponStat("DEF%") + forte("DEF") + weaponPassive("DEF%");

  return {
    hp: Math.round((base.hp * (100 + hpPercent)) / 100 + echo("HP")),
    atk: Math.round(((base.atk + weaponAtk) * (100 + atkPercent)) / 100 + echo("ATK")),
    def: Math.round((base.def * (100 + defPercent)) / 100 + echo("DEF")),
    energyRegen: BASE_ENERGY_REGEN + echo("Energy Regen") + weaponStat("Energy Regen") + weaponPassive("Energy Regen"),
    critRate: BASE_CRIT_RATE + echo("Crit. Rate") + weaponStat("Crit. Rate") + forte("Crit. Rate") + weaponPassive("Crit. Rate"),
    critDmg: BASE_CRIT_DMG + echo("Crit. DMG") + weaponStat("Crit. DMG") + forte("Crit. DMG") + weaponPassive("Crit. DMG"),
    healingBonus: echo("Healing Bonus") + forte("Healing Bonus") + weaponPassive("Healing Bonus"),
    elementalDmgBonusName,
    elementalDmgBonus: echo(elementalDmgBonusName) + forte(elementalDmgBonusName) + weaponPassive(elementalDmgBonusName),
    basicAttackDmgBonus: echo("Basic Attack DMG Bonus") + weaponPassive("Basic Attack DMG Bonus"),
    heavyAttackDmgBonus: echo("Heavy Attack DMG Bonus") + weaponPassive("Heavy Attack DMG Bonus"),
    skillDmgBonus: echo("Resonance Skill DMG Bonus") + weaponPassive("Resonance Skill DMG Bonus"),
    liberationDmgBonus: echo("Resonance Liberation DMG Bonus") + weaponPassive("Resonance Liberation DMG Bonus"),
  };
}
