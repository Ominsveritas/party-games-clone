export const ANIMAL_EMOJIS: string[] = [
  "🐶", "🦊", "🐸", "🦄", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷",
  "🐙", "🦋", "🐬", "🦅", "🦆", "🦉", "🐺", "🦝", "🐻", "🦜",
];

export function generateAvatar(): string {
  return ANIMAL_EMOJIS[Math.floor(Math.random() * ANIMAL_EMOJIS.length)];
}
