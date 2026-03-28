import { getLabelColorClass } from '../../utils/labelColors.js';

interface LabelBadgeProps {
  color: string;
  name?: string | null;
  size?: 'sm' | 'md';
}

export default function LabelBadge({ color, name, size = 'sm' }: LabelBadgeProps) {
  const bgClass = getLabelColorClass(color);

  if (size === 'sm') {
    return (
      <span
        className={`${bgClass} inline-block rounded-sm w-10 h-2`}
        title={name ?? color}
      />
    );
  }

  return (
    <span
      className={`${bgClass} inline-flex items-center rounded px-2 py-0.5 text-sm font-medium text-white min-w-[48px]`}
    >
      {name ?? ''}
    </span>
  );
}
