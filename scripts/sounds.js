import initZZFX, {
  playSound,
  toggle,
  generateMusic,
  playMusic,
} from "./zzfx.js";
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

// Background music (ZzFXM): a gentle, dreamy loop in C major, progression
// C - G - Am - F. Base frequency 16.35 (C0) so note values are MIDI numbers.
// Three tracks: warm bass, soft arpeggio, singing lead.
const MUSIC = [
  // instruments
  [
    [0.5, 0, 16.35, 0.03, 0.15, 0.35, 1, 1, , , , , , , , , , 0.4], // bass
    [0.3, 0, 16.35, 0.01, 0, 0.2, 0], // arp
    [0.35, 0, 16.35, 0.02, 0.08, 0.5, 1, 1.5, , , , , , , , , , 0.3], // lead
  ],
  // patterns (each = 1 bar of 16 sixteenths, channels: bass, arp, lead)
  [
    [
      [0, 0, 36, 0, 0, 0, 0, 0, 0, 0, 36, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 60, 0, 64, 0, 67, 0, 72, 0, 76, 0, 72, 0, 67, 0, 64, 0],
      [2, 0, 72, 0, 0, 0, 71, 0, 0, 0, 72, 0, 0, 0, 0, 0, 0, 0],
    ],
    [
      [0, 0, 43, 0, 0, 0, 0, 0, 0, 0, 43, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 55, 0, 59, 0, 62, 0, 67, 0, 71, 0, 67, 0, 62, 0, 59, 0],
      [2, 0, 74, 0, 0, 0, 0, 0, 0, 0, 67, 0, 0, 0, 0, 0, 0, 0],
    ],
    [
      [0, 0, 45, 0, 0, 0, 0, 0, 0, 0, 45, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 57, 0, 60, 0, 64, 0, 69, 0, 72, 0, 69, 0, 64, 0, 60, 0],
      [2, 0, 72, 0, 0, 0, 69, 0, 0, 0, 71, 0, 0, 0, 0, 0, 0, 0],
    ],
    [
      [0, 0, 41, 0, 0, 0, 0, 0, 0, 0, 41, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 53, 0, 57, 0, 60, 0, 65, 0, 69, 0, 65, 0, 60, 0, 57, 0],
      [2, 0, 69, 0, 0, 0, 0, 0, 0, 0, 65, 0, 0, 0, 0, 0, 0, 0],
    ],
  ],
  // sequence
  [0, 1, 2, 3],
  // BPM
  80,
];

let musicStarted = false;
export function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  // Render off the critical path so the game doesn't hitch on start.
  setTimeout(() => playMusic(generateMusic(MUSIC), true), 60);
}

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

  startMusic();
}
