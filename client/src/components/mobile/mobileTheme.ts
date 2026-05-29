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

// 13 default list colors offered by the mobile list color picker, tuned to
// read well as dots/tints on the dark UI. Lists may also store a custom hex.
export const LIST_COLOR_PRESETS = [
  '#FF6B5B', // coral
  '#FF8F5B', // orange
  '#FFB85B', // amber
  '#FFE15B', // yellow
  '#B8FF5B', // lime
  '#5BE07A', // green
  '#5BE0CD', // teal
  '#5BA8FF', // sky
  '#5B7CFF', // blue
  '#A88FFF', // violet
  '#D58FFF', // purple
  '#FF8FBE', // pink
  '#FF5B8A', // rose
] as const;

export const MOBILE_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif';

export function paletteDot(index: number): string {
  return MOBILE_PALETTE[index % MOBILE_PALETTE.length];
}

/**
 * Convert a #RGB / #RRGGBB color to an rgba() string at the given alpha. Used
 * to tint list surfaces with their chosen color without hardcoding rgba values.
 * Returns the input unchanged if it isn't a hex color.
 */
export function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function listAccentColor(
  list: { color?: string | null },
  _index: number,
): string {
  // Use a neutral default so picking any palette color produces a visible
  // change. Index-based defaults caused "I picked red, dot was already red".
  return list.color ?? D.mute;
}

export function boardAccentColor(
  board: { accentColor: string | null; backgroundType: string; backgroundValue: string } | null,
): string {
  if (!board) return D.sky;
  if (board.accentColor) return board.accentColor;
  if (board.backgroundType === 'color') return board.backgroundValue;
  return D.sky;
}
