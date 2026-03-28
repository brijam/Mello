import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FontSize = 'normal' | 'large' | 'xlarge';

interface SettingsState {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
}

export const fontSizeMap: Record<FontSize, number> = {
  normal: 16,
  large: 18,
  xlarge: 20,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      fontSize: 'normal',
      setFontSize: (fontSize) => set({ fontSize }),
    }),
    {
      name: 'mello-settings',
    },
  ),
);
