import { getKey } from "./save.js";
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
  initStore(reducer, getKey("state") || defaultState);
}
