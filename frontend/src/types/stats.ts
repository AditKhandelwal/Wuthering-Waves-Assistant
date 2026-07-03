export interface CharacterBaseStats {
  lifeMax: number;
  atk: number;
  def: number;
}

export interface GrowthCurvePoint {
  level: number;
  breachLevel: number;
  lifeMaxRatio: number;
  atkRatio: number;
  defRatio: number;
}

export interface StatCurveData {
  baseStats: Record<string, CharacterBaseStats>;
  growthCurve: GrowthCurvePoint[];
}

export interface ComputedStats {
  hp: number;
  atk: number;
  def: number;
}
