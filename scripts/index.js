import initSections from "./sections.js";

import initState, { areSoundMuted } from "./state.js";
import initSounds from "./sounds.js";
import initGame, { initBg } from "./game.js";
import { hydrate } from "./save.js";

(async () => {
  await hydrate(); // pull the Wavedash cloud save before the store reads it
  initState();
  initBg();
  window.Wavedash?.init();

  let isSoundInit = false;
  let isGameInit = false;

  initSections(({ currentSection, nextSection }) => {
    if (!isSoundInit && currentSection === "title" && nextSection !== "title") {
      isSoundInit = true;
      initSounds(areSoundMuted());
    }

    if (!isGameInit && nextSection === "game") {
      isGameInit = true;
      window.Wavedash?.toggleFullscreen();
      initGame();
    }
  });
})();
