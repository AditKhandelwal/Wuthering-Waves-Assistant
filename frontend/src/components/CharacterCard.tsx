import { ELEMENT_GLOW_ANIMATION_CLASS } from "../lib/characters";
import type { Character } from "../types/character";

export const ELEMENT_RING_CLASS: Record<Character["element"], string> = {
  Glacio: "ring-element-glacio",
  Fusion: "ring-element-fusion",
  Electro: "ring-element-electro",
  Aero: "ring-element-aero",
  Spectro: "ring-element-spectro",
  Havoc: "ring-element-havoc",
};

interface CharacterCardProps {
  character: Character;
  onSelect: (character: Character) => void;
}

export function CharacterCard({ character, onSelect }: CharacterCardProps) {
  return (
    <button
      onClick={() => onSelect(character)}
      className="group flex flex-col items-center gap-2 focus:outline-none"
    >
      <span
        className={`h-20 w-20 overflow-hidden rounded-full ring-2 transition ${ELEMENT_RING_CLASS[character.element]} ${ELEMENT_GLOW_ANIMATION_CLASS[character.element]} group-hover:ring-gold group-focus-visible:ring-gold`}
      >
        <img
          src={character.cardPictureUrl}
          alt={character.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </span>
      <span className="text-sm text-text group-hover:text-gold-soft transition">
        {character.name}
      </span>
    </button>
  );
}
