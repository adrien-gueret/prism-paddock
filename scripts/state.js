import { getKey } from "./save.js";
import initStore, { dispatch, getState } from "./store.js";

const defaultState = {
  // TODO: your default state
};

export function reducer(state = defaultState, { type, payload }) {
  switch (type) {
    // TODO: update state according to action type

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
