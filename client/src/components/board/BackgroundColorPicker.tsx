import { useState, useRef, useEffect } from 'react';

interface BackgroundColorPickerProps {
  currentColor: string;
  currentType: 'color' | 'image';
  onColorChange: (color: string) => void;
  onImageUpload: (file: File) => Promise<void>;
  onReset: () => void | Promise<void>;
}

// Preset colors (nice palette similar to Trello)
const PRESET_COLORS = [
  '#0079bf', '#d29034', '#519839', '#b04632', '#89609e',
  '#cd5a91', '#4bbf6b', '#00aecc', '#838c91', '#172b4d',
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
];

export default function BackgroundColorPicker({
  currentColor,
  currentType,
  onColorChange,
  onImageUpload,
  onReset,
}: BackgroundColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customColor, setCustomColor] = useState(currentType === 'color' ? currentColor : '#0079bf');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (currentType === 'color') setCustomColor(currentColor);
  }, [currentColor, currentType]);

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await onImageUpload(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/20 hover:bg-white/30 text-white transition-colors"
        title="Change background"
      >
        <div
          className="w-5 h-5 rounded border border-white/40 bg-cover bg-center"
          style={currentType === 'color'
            ? { backgroundColor: currentColor }
            : { backgroundImage: `url(${currentColor})` }}
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
                  currentType === 'color' && currentColor === color ? 'ring-2 ring-blue-500 ring-offset-2' : ''
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

          {/* Image upload */}
          <div className="border-t border-gray-200 pt-3 mt-3">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2 block">
              Image
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-gray-800 px-3 py-1.5 rounded font-medium transition-colors"
              >
                {uploading ? 'Uploading…' : currentType === 'image' ? 'Replace image' : 'Upload image'}
              </button>
              {currentType === 'image' && (
                <button
                  onClick={() => onReset()}
                  disabled={uploading}
                  className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded transition-colors"
                  title="Remove image, revert to default"
                >
                  Reset
                </button>
              )}
            </div>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
