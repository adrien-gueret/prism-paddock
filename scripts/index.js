import initSections from "./sections.js";
import initUI from "./ui.js";

import initState, { areSoundMuted } from "./state.js";
import initSounds from "./sounds.js";

(async () => {
  await initUI();

  initState();

  let isSoundInit = false;
  initSections(({ currentSection, nextSection, vars }) => {
    if (
      !isSoundInit &&
      ((currentSection === "title" && nextSection !== "title"))
    ) {
      isSoundInit = true;
      initSounds(areSoundMuted());
    }
  });
})();
