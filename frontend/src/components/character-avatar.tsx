import { characterEmoji } from "@/lib/sprite";

interface CharacterAvatarProps {
  c: { id: string; avatar?: string | null };
  size?: number; // px, default 24
}

export function CharacterAvatar({ c, size = 24 }: CharacterAvatarProps) {
  if (c.avatar && c.avatar.startsWith("data:image/")) {
    return (
      <img
        src={c.avatar}
        alt={c.id}
        style={{
          width: size,
          height: size,
          imageRendering: "pixelated",
          flexShrink: 0,
        }}
      />
    );
  }
  const emoji = characterEmoji(c);
  return (
    <span
      style={{ fontSize: Math.round(size * 0.75), flexShrink: 0 }}
      role="img"
      aria-label={c.id}
    >
      {emoji}
    </span>
  );
}
