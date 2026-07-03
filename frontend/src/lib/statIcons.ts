// Real in-game stat icons, extracted from wuwa_characters.json's
// roleAttribute/echoAttributes sections (see scripts that produced
// data/stat_icons.json) rather than custom-drawn SVGs.
export async function loadStatIcons(): Promise<Record<string, string>> {
  const res = await fetch("/data/stat_icons.json");
  return res.json();
}
