/** 5 个种子 NPC 的占位 emoji 头像。后续可被 Character.avatar 字段覆盖。 */
export const NPC_EMOJI: Record<string, string> = {
  "char-zhangmo": "🤐",
  "char-lihuan": "😄",
  "char-wanggang": "😤",
  "char-xiaojing": "🌸",
  "char-laoli": "🧓",
};

export const NPC_FALLBACK_EMOJI = "👤";

/** spriteKey 列表（与 globals.css 中的调色板对应）；缺失走 fallback。 */
const KNOWN_SPRITES = new Set([
  "town",
  "school",
  "classroom",
  "playground",
  "restaurant",
  "park",
  "home-warm",
  "home-cool",
]);

export function paletteVarsFor(spriteKey: string | undefined): {
  base: string;
  shadow: string;
  hi: string;
} {
  const key = spriteKey && KNOWN_SPRITES.has(spriteKey) ? spriteKey : "fallback";
  return {
    base: `var(--palette-${key}-base)`,
    shadow: `var(--palette-${key}-shadow)`,
    hi: `var(--palette-${key}-hi)`,
  };
}
