const AVATAR_TONES = [
  "avatar-tone-sage",
  "avatar-tone-lavender",
  "avatar-tone-sky",
  "avatar-tone-sand",
  "avatar-tone-rose",
  "avatar-tone-slate",
] as const;

export function getAvatarToneClass(
  value: string | null | undefined,
  index?: number,
) {
  if (index !== undefined) return AVATAR_TONES[index % AVATAR_TONES.length];

  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return AVATAR_TONES[0];

  let hash = 0;
  for (const character of normalized) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}
