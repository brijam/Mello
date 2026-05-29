import { resolveLabelColor, readableTextColor } from '../../utils/labelColors.js';

interface LabelBadgeProps {
  color: string;
  name?: string | null;
  size?: 'sm' | 'md';
}

export default function LabelBadge({ color, name, size = 'sm' }: LabelBadgeProps) {
  const bg = resolveLabelColor(color);

  if (size === 'sm') {
    return (
      <span
        className="inline-block rounded-sm w-10 h-2"
        style={{ backgroundColor: bg }}
        title={name ?? color}
      />
    );
  }

  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-sm font-medium min-w-[48px]"
      style={{ backgroundColor: bg, color: readableTextColor(color) }}
    >
      {name ?? ''}
    </span>
  );
}
