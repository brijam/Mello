const COLOR_MAP: Record<string, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  blue: 'bg-blue-500',
  sky: 'bg-sky-400',
  lime: 'bg-lime-500',
  pink: 'bg-pink-500',
  black: 'bg-gray-800',
};

export function getLabelColorClass(colorName: string): string {
  return COLOR_MAP[colorName] ?? 'bg-gray-500';
}

export default COLOR_MAP;
