import { load } from "./save.js";
import initStore, { dispatch, getState } from "./store.js";

const defaultState = {
  muted: false,
  unlocked: 0, // number of unlocked colors (colors unlock in order)
  bf: [0, 0, 0, 0, 0, 0, 0], // butterflies per color
  poops: [], // [cell, color]
  decos: [], // [cell, type, color]
  done: 0, // rainbow completion message shown
  seen: 0, // intro tutorial shown
  fed: 0, // unicorn has been fed at least once
  cleaned: 0, // player has cleaned at least one poop (reveals header/actions)
  pooped: 0, // unicorn has pooped at least once (shy prompt shown only once)
  acts: 0, // build/remove actions + next-color hint revealed
  combo: 0, // green quest: 0 not started, 1 active (click red>orange>yellow), 2 solved
  combo2: 0, // violet quest: same states, click the six poem elements in order
  qseen: 0, // bitmask of quest intros already shown (bit0 green, bit1 violet) — no repeat on re-activation
  line: "", // unicorn's last spoken line, so poking replays it after a reload
};

export function reducer(state = defaultState, { type, payload }) {
  switch (type) {
    case "toggleMuteSounds":
      return { ...state, muted: payload.isMuted };

    default:
      return state;
  }
}

export const areSoundMuted = () => getState().muted;

export const toggleMuteSounds = (isMuted) =>
  dispatch({
    type: "toggleMuteSounds",
    payload: { isMuted },
  });

export default function init() {
  initStore(reducer, load() || defaultState);
}
