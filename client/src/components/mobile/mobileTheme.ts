// Shared dark iOS theme tokens for the mobile experience.
export const D = {
  bg: '#0A0A0A',
  surface: '#141414',
  surface2: '#1C1C1C',
  surface3: '#242424',
  hair: '#222222',
  hair2: '#2A2A2A',
  hair3: '#383838',
  ink: '#F5F5F5',
  ink2: '#D4D4D4',
  mute: '#8A8A8A',
  mute2: '#555555',
  sky: '#5BA8FF',
  coral: '#FF6B5B',
  lime: '#B8FF5B',
  violet: '#A88FFF',
  amber: '#FFB85B',
  pink: '#FF8FBE',
  teal: '#5BE0CD',
  danger: '#FF5B5B',
};

export const MOBILE_PALETTE = [
  D.coral,
  D.sky,
  D.amber,
  D.lime,
  D.violet,
  D.pink,
  D.teal,
] as const;

export const MOBILE_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif';

export function paletteDot(index: number): string {
  return MOBILE_PALETTE[index % MOBILE_PALETTE.length];
}

export function listAccentColor(
  list: { color?: string | null },
  index: number,
): string {
  return list.color ?? paletteDot(index);
}

export function boardAccentColor(
  board: { accentColor: string | null; backgroundType: string; backgroundValue: string } | null,
): string {
  if (!board) return D.sky;
  if (board.accentColor) return board.accentColor;
  if (board.backgroundType === 'color') return board.backgroundValue;
  return D.sky;
}
