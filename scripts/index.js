import initSections from "./sections.js";
import initUI from "./ui.js";

import initState, { areSoundMuted } from "./state.js";
import initSounds from "./sounds.js";
import initGame, { initBg } from "./game.js";

(async () => {
  await initUI();

  initState();
  initBg();

  let isSoundInit = false;
  let isGameInit = false;

  initSections(({ currentSection, nextSection }) => {
    if (!isSoundInit && currentSection === "title" && nextSection !== "title") {
      isSoundInit = true;
      initSounds(areSoundMuted());
    }

    if (!isGameInit && nextSection === "game") {
      isGameInit = true;
      initGame();
    }
  });
})();
