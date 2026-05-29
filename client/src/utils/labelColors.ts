// Hex values for the named default label colors. Kept stable so existing
// labels stored by name keep their look; custom labels store a hex string
// directly (e.g. "#1abc9c"). Names mirror LABEL_COLORS in @mello/shared.
const NAMED_HEX: Record<string, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
  purple: '#a855f7',
  blue: '#3b82f6',
  sky: '#0ea5e9',
  lime: '#84cc16',
  pink: '#ec4899',
  black: '#1f2937',
  teal: '#14b8a6',
  indigo: '#6366f1',
  rose: '#f43f5e',
};

const FALLBACK = '#6b7280'; // gray-500

/** Resolve any stored label color (named default or custom hex) to a hex string. */
export function resolveLabelColor(color: string): string {
  if (!color) return FALLBACK;
  if (color.startsWith('#')) return color;
  return NAMED_HEX[color] ?? FALLBACK;
}

/** Black or white text, whichever is more legible on the given background. */
export function readableTextColor(color: string): string {
  const h = resolveLabelColor(color).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (full.length !== 6) return '#ffffff';
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1f2937' : '#ffffff';
}
