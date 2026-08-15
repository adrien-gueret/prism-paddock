import initZZFX, { playSound, toggle } from "./zzfx.js";
import { toggleMuteSounds } from "./state.js";
import { toggleSoundsCheckbox, onSoundsCheckboxChange } from "./ui.js";

// Tiny generated sound effects (ZZFX params start at frequency)
export const sFeed = () => playSound([400, , 0.02, 0.08, 0.12, , 1.5]);
export const sPoop = () => playSound([90, , 0.03, 0.05, 0.2, , 4]);
export const sCollect = () =>
  playSound([600, , 0.01, 0.06, 0.15, , , , , , 150, 0.04]);
export const sPlace = () => playSound([220, , 0.02, 0.05, 0.1, 1]);
export const sUnlock = () =>
  playSound([500, , 0.05, 0.15, 0.3, , , , , , 300, 0.05, 0.08]);
export const sWin = () =>
  playSound([400, , 0.1, 0.3, 0.5, , , , , , 500, 0.08, 0.15, , , , 0.1]);

export function toggleSounds(isMuted) {
  toggle(isMuted);
  toggleSoundsCheckbox(!isMuted);
  toggleMuteSounds(isMuted);
}

export default function init(initialMuted = false) {
  initZZFX({ defaultMuted: initialMuted });
  toggleSoundsCheckbox(!initialMuted);

  onSoundsCheckboxChange((e) => {
    toggleSounds(!e.currentTarget.checked);
  });
}
