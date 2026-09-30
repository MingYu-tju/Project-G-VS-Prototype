import { create } from 'zustand';

interface Settings {
  isDarkScene: boolean;
  isRimLightOn: boolean;
  isOutlineOn: boolean;
  showStats: boolean;
  areNPCsPaused: boolean;
  toggle: (key: 'isDarkScene' | 'isRimLightOn' | 'isOutlineOn' | 'showStats' | 'areNPCsPaused') => void;
}
export const useSettings = create<Settings>(set => ({
  isDarkScene: false, isRimLightOn: true, isOutlineOn: false, showStats: false, areNPCsPaused: true,
  toggle: key => set(state => ({ ...state, [key]: !state[key] })),
}));
