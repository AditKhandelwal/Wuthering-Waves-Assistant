import { supabase } from "./supabase";
import { findEchoByName, type EchoCatalog } from "./echoes";
import type { EquippedEcho, SubStatSlot } from "../types/echo";
import type { WeaponCatalog } from "./weapons";
import type { WeaponCatalogEntry } from "../types/weapon";

const TABLE = "user_characters";

// Saved rows only ever hold identifiers + user-entered values, never catalog
// display data (names/icons/descriptions) -- that's always re-looked-up live
// from the current echo/weapon catalogs on load. Same pattern the rest of the
// app already uses (WeaponCatalogEntry.gbId, findEchoByName in lib/echoes.ts)
// rather than caching full catalog objects into user data. This also means a
// saved build automatically benefits from later catalog data improvements
// (e.g. a better echo icon) instead of going stale.
interface SavedEchoSlot {
  echoName: string | null;
  chosenSetName: string | null;
  mainStatPropId: number | null;
  level: number;
  substats: SubStatSlot[];
}

interface BuildRow {
  role_gb_id: string;
  character_level: number;
  weapon_gb_id: string | null;
  weapon_level: number;
  weapon_rank: number;
  resonance_level: number;
  talent_levels: number[];
  inherent_active: boolean[];
  forte_node_active: boolean[];
  echoes: SavedEchoSlot[];
  updated_at: string;
}

export interface BuildState {
  level: number;
  selectedWeapon: WeaponCatalogEntry | null;
  weaponLevel: number;
  weaponRank: number;
  unlockedCount: number;
  talentLevels: number[];
  inherentActive: boolean[];
  forteNodeActive: boolean[];
  equippedEchoes: EquippedEcho[];
}

export interface SavedBuildSummary {
  roleGbId: string;
  characterLevel: number;
  updatedAt: string;
}

export async function saveBuild(
  userId: string,
  roleGbId: string,
  state: BuildState,
): Promise<{ error: string | null }> {
  const row = {
    user_id: userId,
    role_gb_id: roleGbId,
    character_level: state.level,
    weapon_gb_id: state.selectedWeapon?.gbId ?? null,
    weapon_level: state.weaponLevel,
    weapon_rank: state.weaponRank,
    resonance_level: state.unlockedCount,
    talent_levels: state.talentLevels,
    inherent_active: state.inherentActive,
    forte_node_active: state.forteNodeActive,
    echoes: state.equippedEchoes.map(
      (slot): SavedEchoSlot => ({
        echoName: slot.echo?.name ?? null,
        chosenSetName: slot.chosenSetName,
        mainStatPropId: slot.mainStatPropId,
        level: slot.level,
        substats: slot.substats,
      }),
    ),
  };

  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: "user_id,role_gb_id" });
  return { error: error?.message ?? null };
}

export async function loadBuild(
  userId: string,
  roleGbId: string,
  echoCatalog: EchoCatalog,
  weaponCatalog: WeaponCatalog,
): Promise<BuildState | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "role_gb_id, character_level, weapon_gb_id, weapon_level, weapon_rank, resonance_level, talent_levels, inherent_active, forte_node_active, echoes, updated_at",
    )
    .eq("user_id", userId)
    .eq("role_gb_id", roleGbId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as BuildRow;

  const allWeapons = Object.values(weaponCatalog.byType).flat();
  const selectedWeapon = row.weapon_gb_id
    ? (allWeapons.find((w) => w.gbId === row.weapon_gb_id) ?? null)
    : null;

  const equippedEchoes: EquippedEcho[] = row.echoes.map((slot, i) => {
    const echo = slot.echoName ? findEchoByName(echoCatalog, slot.echoName) : null;
    if (slot.echoName && !echo) {
      console.warn(`Saved echo "${slot.echoName}" not found in current catalog -- slot ${i} left empty.`);
    }
    return {
      slotIndex: i,
      echo,
      chosenSetName: slot.chosenSetName,
      mainStatPropId: slot.mainStatPropId,
      level: slot.level,
      substats: slot.substats,
    };
  });

  return {
    level: row.character_level,
    selectedWeapon,
    weaponLevel: row.weapon_level,
    weaponRank: row.weapon_rank,
    unlockedCount: row.resonance_level,
    talentLevels: row.talent_levels,
    inherentActive: row.inherent_active,
    forteNodeActive: row.forte_node_active,
    equippedEchoes,
  };
}

export async function loadAllBuildSummaries(userId: string): Promise<SavedBuildSummary[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("role_gb_id, character_level, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error || !data) return [];
  return data.map((row) => ({
    roleGbId: row.role_gb_id,
    characterLevel: row.character_level,
    updatedAt: row.updated_at,
  }));
}

export async function deleteBuild(userId: string, roleGbId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from(TABLE).delete().eq("user_id", userId).eq("role_gb_id", roleGbId);
  return { error: error?.message ?? null };
}
