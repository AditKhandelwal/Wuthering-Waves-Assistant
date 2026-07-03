import { createElement, type ReactNode } from "react";

// Weapon/echo passive text embeds rank-scaled values as a parenthesized,
// slash-separated list of 5 values, e.g. "(12.8%/16%/19.2%/22.4%/25.6%)".
// Replace each with just the value for the selected rank, highlighted.
const RANK_GROUP_RE = /\((\d+(?:\.\d+)?%?(?:\/\d+(?:\.\d+)?%?){4})\)/g;

export function renderRankScaledText(text: string, rank: number): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  RANK_GROUP_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = RANK_GROUP_RE.exec(text))) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const values = match[1].split("/");
    const value = values[rank - 1] ?? values[0];
    const variesByRank = new Set(values).size > 1;
    parts.push(
      variesByRank
        ? createElement("span", { key: key++, className: "font-semibold text-gold-soft" }, value)
        : value,
    );
    lastIndex = match.index + match[0].length;
  }
  parts.push(text.slice(lastIndex));
  return parts;
}
