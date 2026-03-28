import { useSettingsStore, type FontSize } from '../../stores/settingsStore.js';

const options: { value: FontSize; label: string }[] = [
  { value: 'normal', label: 'A' },
  { value: 'large', label: 'A+' },
  { value: 'xlarge', label: 'A++' },
];

export default function FontSizeSelector() {
  const fontSize = useSettingsStore((s) => s.fontSize);
  const setFontSize = useSettingsStore((s) => s.setFontSize);

  return (
    <div className="flex items-center gap-0.5 bg-white/10 rounded overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setFontSize(opt.value)}
          className={`px-2 py-1 text-sm font-medium transition-colors ${
            fontSize === opt.value
              ? 'bg-white/30 text-white'
              : 'text-white/70 hover:bg-white/20 hover:text-white'
          }`}
          title={`Font size: ${opt.value}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
