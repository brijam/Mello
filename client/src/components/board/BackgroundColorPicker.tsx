import { useState, useRef, useEffect } from 'react';

interface BackgroundColorPickerProps {
  currentColor: string;
  onColorChange: (color: string) => void;
}

// Preset colors (nice palette similar to Trello)
const PRESET_COLORS = [
  '#0079bf', '#d29034', '#519839', '#b04632', '#89609e',
  '#cd5a91', '#4bbf6b', '#00aecc', '#838c91', '#172b4d',
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
];

export default function BackgroundColorPicker({ currentColor, onColorChange }: BackgroundColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customColor, setCustomColor] = useState(currentColor);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Sync custom color when currentColor changes externally
  useEffect(() => {
    setCustomColor(currentColor);
  }, [currentColor]);

  const handlePresetClick = (color: string) => {
    setCustomColor(color);
    onColorChange(color);
  };

  const handleCustomChange = (color: string) => {
    setCustomColor(color);
  };

  const handleCustomApply = () => {
    onColorChange(customColor);
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/20 hover:bg-white/30 text-white transition-colors"
        title="Change background color"
      >
        <div
          className="w-5 h-5 rounded border border-white/40"
          style={{ backgroundColor: currentColor }}
        />
        Background
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-[280px] bg-white rounded-xl shadow-xl border border-gray-200 z-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Board Background</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              &times;
            </button>
          </div>

          {/* Preset color grid */}
          <div className="grid grid-cols-5 gap-2 mb-4">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handlePresetClick(color)}
                className={`w-full aspect-square rounded-lg transition-transform hover:scale-110 ${
                  currentColor === color ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>

          {/* Custom color picker */}
          <div className="border-t border-gray-200 pt-3">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2 block">
              Custom Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customColor}
                onChange={(e) => handleCustomChange(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-gray-300 p-0.5"
              />
              <input
                type="text"
                value={customColor}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                    setCustomColor(val);
                  }
                }}
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="#000000"
              />
              <button
                onClick={handleCustomApply}
                disabled={!/^#[0-9a-fA-F]{6}$/.test(customColor)}
                className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded font-medium transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
