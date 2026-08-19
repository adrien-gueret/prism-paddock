import { getRandom } from "./utils.js";
import { getState, setState } from "./store.js";
import { sFeed, sPoop, sCollect, sPlace, sUnlock, sWin } from "./sounds.js";

const WD = window.Wavedash ?? null;

// Grid
const W = 9,
  H = 7,
  N = W * H;

// Data (index-based to stay compact)
const COLORS = ["#e33", "#f80", "#fd0", "#3c3", "#39f", "#55f", "#a3e"];
const CNAMES = ["Red", "Orange", "Yellow", "Green", "Blue", "Indigo", "Violet"];
const TNAMES = ["Flower", "Mushroom", "Crystal"];
const COSTS = [2, 3, 5];
// Requirements to unlock each color: list of [type, color] that must exist.
// A type of -1 means "any type" of that color. Green (index 3) is special:
// it is unlocked by the click-combo mini-quest, not by placing decorations.
const REQS = [
  [],
  [[0, 0]],
  [[-1, 1]],
  [],
  [
    [1, 0],
    [1, 1],
    [1, 2],
    [1, 3],
  ],
  [[2, 4]],
  [],
];

const S = getState;
const persist = () => setState(S());

const decoAt = (i) => S().decos.find((d) => d[0] === i);
const poopAt = (i) => S().poops.find((p) => p[0] === i);

// Unlock quests: click these [type, color] elements in order (type -1 = any
// type). Green is by color only; violet follows the six lines of the poem
// (red flower, orange crystal, yellow mushroom, green flower, blue mushroom,
// indigo crystal).
const GREEN_SEQ = [
  [-1, 0],
  [-1, 1],
  [-1, 2],
];
const VIOLET_SEQ = [
  [0, 0],
  [2, 1],
  [1, 2],
  [0, 3],
  [1, 4],
  [2, 5],
];
// Active quest's sequence (or null), whether a decoration matches a step, and
// whether every element of a sequence is present on the board.
const questSeq = () =>
  S().combo === 1 ? GREEN_SEQ : S().combo2 === 1 ? VIOLET_SEQ : null;
const questHit = (d, [t, c]) => (t < 0 || d[1] === t) && d[2] === c;
const hasAll = (seq) => seq.every((s) => S().decos.some((d) => questHit(d, s)));

// Non-persisted game vars
let uni = 31; // unicorn cell (cosmetic, not saved)
let mode = 0; // 0 garden (feed + plant), 2 remove
let selType = 0;
let selColor = 0;
let inited;
let elTop, elPad, elBar, elUni, elUs, cells;
let timer,
  walkT,
  heyT,
  bubHideT,
  introI = -1,
  moves = 0;
let lastLine = ""; // most recent thing she said, replayed when poked
let bgA, bgB; // cross-fading rainbow background layers
let dragC = -1, // color of the fragment being dragged (-1 = none)
  dragT = -1, // plant type being dragged from the shop (-1 = feeding a color)
  dragEl = null, // ghost element following the pointer
  dragStart = null, // pointerdown position (to detect a real drag vs a tap)
  dragging = false; // a real drag is in progress
let happy = false, // transient joyful mood (from eating until pooping)
  poopTarget = -1, // cell the unicorn waddles to after eating (-1 = none)
  poopColor = 0; // color of the poop it will leave there
let ghostAt = -1; // cell currently showing the Grow build preview (-1 = none)
let comboProg = 0; // green quest: how many of red>orange>yellow clicked in order
const pendingUnlock = new Set(); // colors mid unlock-animation (kept greyed)

const gid = (id) => document.getElementById(id);

// Vertical offset (px) that arranges the 7 color buttons into a rainbow arc.
const arcY = (c) => ((((c - 3) / 3) ** 2 - 0.5) * 44).toFixed(1);

function buildGrid() {
  let h = "";
  for (let i = 0; i < N; i++) h += `<div class="cell" data-i="${i}"></div>`;
  h += `<div class="uni"><i class="us"></i></div>`;
  elPad.innerHTML = h;
  cells = [...elPad.querySelectorAll(".cell")];
  elUni = elPad.querySelector(".uni");
  elUs = elPad.querySelector(".us");
}

function renderCells() {
  const st = S();
  ghostAt = -1; // any build preview is wiped by the re-render below
  const seq = questSeq(); // active unlock-quest sequence, if any
  const step = seq && seq[comboProg]; // the [type,color] to click next
  for (let i = 0; i < N; i++) {
    const d = st.decos.find((x) => x[0] === i);
    const p = st.poops.find((x) => x[0] === i);
    let h = "";
    if (d) {
      const li = [22, 15, 51][d[1]] + d[2];
      h = `<b class="ds ${["fl", "mu", "cr"][d[1]]}" style="--r:${li >> 2};--c:${
        li & 3
      };--i:${i}"></b>`;
    } else if (p) {
      // A rainbow poop (color 7) shows only its own tile — no butterfly overlay.
      h =
        p[1] === 7
          ? `<b class="po rb"></b>`
          : `<b class="po"><i class="bf" style="--r:${(15 + p[1]) >> 1};--c:${((15 + p[1]) & 1) * 2}"></i></b>`;
    }
    cells[i].innerHTML = h;
    // During a quest, only the next element to click pulses (progressive hint).
    cells[i].classList.toggle("clk", !!d && !!step && questHit(d, step));
  }
}

function renderUni() {
  elUni.style.transform = `translate(${(uni % W) * 100}%,${((uni / W) | 0) * 100}%)`;
}

// Freeze her on her destination tile, cancelling the 1s glide so she doesn't
// keep sliding while a speech bubble is up.
function stopWalk() {
  elUni.style.transition = "none";
  renderUni();
  void elUni.offsetWidth; // force the snap before restoring the transition
  elUni.style.transition = "";
}

// Set the unicorn's sprite state. `action` is one of "", "walk", "hey",
// "eat", "drag". While joyful (just after eating, on the way to poop) the
// happy sprite row is used instead of the normal one.
function mood(action) {
  elUs.className = "us" + (action ? " " + action : "") + (happy ? " joy" : "");
}

// Update the joyful/digesting mood, reflect it on the bar (disabled cursor)
// and refresh the feed hint so it reads differently while she's busy.
function setHappy(v) {
  happy = v;
  elBar?.classList.toggle("eating", v);
  if (elBar) renderBar();
}

function renderTop() {
  const st = S();
  const show = st.unlocked && st.cleaned;
  elTop.hidden = !show;
  if (!show) return;
  let counts = "";
  for (let c = 0; c < st.unlocked; c++)
    counts += `<span class="bfc" data-c="${c}" title="${CNAMES[c]}"><i class="bfi" style="--r:${
      11 + ((c / 4) | 0)
    };--c:${c % 4}"></i>${st.bf[c]}</span>`;
  elTop.innerHTML = `<div class="meter"><div class="counts">${counts}</div></div>`;
}

// Cross-fade the page background to a rainbow gradient of the unlocked colors.
function renderBg() {
  if (!bgA) return;
  const n = S().unlocked;
  const cols = COLORS.slice(0, n);
  const grad = cols.length
    ? `linear-gradient(120deg, ${
        cols.length > 1 ? cols.join(", ") : `${cols[0]}, ${cols[0]}`
      })`
    : "#000";
  bgB.style.background = grad;
  bgB.style.opacity = 1;
  bgA.style.opacity = 0;
  const t = bgA;
  bgA = bgB;
  bgB = t;
}

// Create the two cross-fading background layers (idempotent). Called early so
// the rainbow shows on the title screen too, not only in-game.
export function initBg() {
  if (bgA) return;
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div id="bg"><div class="bgl"></div><div class="bgl"></div></div>`,
  );
  const layers = document.body.querySelectorAll("#bg .bgl");
  bgA = layers[0];
  bgB = layers[1];
  renderBg();
}

function renderBar() {
  const st = S();

  let panel = "";
  {
    // Garden panel: one shared rainbow palette. Drag a color onto the unicorn to
    // feed her; tap a color to select it, then tap a tile to grow the chosen
    // plant. The plant shop stays hidden until the first harvest (acts) so the
    // early feed-only tutorial isn't cluttered.
    let pal = "";
    for (let c = 0; c < 7; c++) {
      const lock = c >= st.unlocked || pendingUnlock.has(c);
      pal += `<button class="sw${selColor === c && !lock ? " on" : ""}${lock ? " off" : ""}" data-c="${c}"${
        lock ? " disabled" : ""
      } style="background:${COLORS[c]};top:${arcY(c)}px" title="${
        lock ? "Locked" : CNAMES[c]
      }"></button>`;
    }
    let feedLeft = "";
    let feedRight = "";
    if (st.unlocked) {
      feedLeft = `<div class="feedhelp fhl">${happy ? "Wait for the unicorn to finish!" : "Drag a color onto<br>the unicorn to feed her."}</div>`;
      feedRight = st.unlocked >= 2
        ? `<div class="feedhelp fhr">Tap a color to<br>shop with it.</div>`
        : `<div class="fhr"></div>`;
    }

    // Shop (planting) is revealed only once the player has harvested butterflies.
    let shop = "";
    if (st.acts) {
      // Until the first flower is placed, only the Flower card is offered so
      // the player is nudged to create one. Crystals stay hidden until blue is
      // unlocked (unlocked count reaches 5: red..blue).
      const hasFlower = st.decos.some((d) => d[1] === 0);
      const items = TNAMES.map((t, k) => {
        if (k > 0 && !hasFlower) return "";
        if (k === 2 && st.unlocked < 5) return "";
        const off = st.bf[selColor] < COSTS[k]; // not enough of the chosen color
        return (
          `<button class="tb${off ? " off" : ""}" data-t="${k}">` +
          `<span class="ti">${plantHtml(k, "")}</span>` +
          `<span class="tr"><span class="tn">${t}</span>` +
          `<span class="cost"><i class="bfi" style="--r:${11 + ((selColor / 4) | 0)};--c:${selColor % 4}"></i>× ${COSTS[k]}</span></span>` +
          `</button>`
        );
      }).join("");
      shop =
        `<div class="tools">${items}</div>` +
        `<div class="feedhelp">Drag an item onto the grass to place it.</div>`;
    }

    // Palette and shop live in one container so they read as a single panel.
    panel = `<div class="pal"><div class="palrow">${feedLeft}<div class="sws">${pal}</div>${feedRight}</div>${shop}</div>`;
  }

  elBar.innerHTML = panel;
}

function renderAll() {
  renderTop();
  renderCells();
  renderUni();
  renderBar();
}

// When the rainbow is complete, one poop in three comes out rainbow-colored
// (stored as color 7): it shows no butterflies and refunds 3 of every color.
const poopKind = () =>
  S().unlocked === 7 && getRandom(2) === 0 ? 7 : poopColor;

// Little colored squares that spray from the unicorn's mouth while she chews,
// like crumbs of the rainbow fragment she's eating.
function crumbs(color) {
  const r = elUni.getBoundingClientRect();
  const dir = elUs.style.transform.includes("-1") ? -1 : 1; // facing left/right
  const x = Math.round(r.left + r.width / 2 + dir * 16);
  const y = Math.round(r.top + r.height * 0.55);
  for (let k = 0; k < 14; k++) {
    const p = document.createElement("i");
    p.className = "crumb";
    p.style.background = COLORS[color];
    document.body.appendChild(p);
    const dx = getRandom(70) - 35;
    const dy = getRandom(16);
    p.animate(
      [
        { transform: `translate(${x}px,${y}px)`, opacity: 1 },
        { transform: `translate(${x + dx}px,${y + dy}px)`, opacity: 0 },
      ],
      {
        duration: 500 + getRandom(400),
        delay: getRandom(1200),
        easing: "ease-in",
        fill: "forwards",
      },
    ).onfinish = () => p.remove();
  }
}

// Feeding a fragment: the unicorn chews (eat animation), then joyfully waddles
// to the nearest empty tile and leaves a poop there before calming down.
function feed(color) {
  sFeed();
  const st = S();
  clearTimeout(timer);
  clearTimeout(walkT);
  clearTimeout(heyT);
  const firstFeed = !st.fed;
  if (firstFeed) {
    st.fed = 1;
    persist();
    endTuto();
  }
  setHappy(true);
  poopColor = color;
  mood("eat");
  crumbs(color);
  // Chew for a moment, then set off to find a spot to poop. Kept in `timer` so
  // an interruption cancels it (avoids a stray second poop trigger).
  timer = setTimeout(() => {
    if (!happy) return; // digestion already finished/cancelled
    poopTarget = findPoopTarget();
    if (poopTarget < 0) return doPoop(); // no room: poop on the spot
    if (firstFeed) {
      // On the very first feed, she thanks the player, then trots off once the
      // player clicks anywhere to dismiss her thank-you.
      mood("");
      showBubble(DIGEST_MSG);
      dismissBubbleThen(walkToPoop);
    } else {
      walkToPoop();
    }
  }, 1600);
}

// Nearest empty tile (no deco, no poop, not the current cell) she waddles to
// before pooping: one step to the target, then the poop on the next move.
function findPoopTarget() {
  const minD = 1;
  let best = [],
    bestD = Infinity;
  for (let i = 0; i < N; i++) {
    if (i === uni || decoAt(i) || poopAt(i)) continue;
    const d =
      Math.abs((i % W) - (uni % W)) + Math.abs(((i / W) | 0) - ((uni / W) | 0));
    if (d < minD) continue;
    if (d < bestD) {
      bestD = d;
      best = [i];
    } else if (d === bestD) best.push(i);
  }
  return best.length ? best[getRandom(best.length - 1)] : -1;
}

// Take one step toward the poop target, then schedule the next until arrival.
function walkToPoop() {
  if (!happy) return; // digestion already done: ignore any stray trigger
  const col = uni % W,
    row = (uni / W) | 0,
    tc = poopTarget % W,
    tr = (poopTarget / W) | 0,
    opts = [];
  if (tc < col) opts.push(uni - 1);
  if (tc > col) opts.push(uni + 1);
  if (tr < row) opts.push(uni - W);
  if (tr > row) opts.push(uni + W);
  // Prefer poop-free tiles among the steps that make progress to the target.
  const dry = opts.filter((i) => !poopAt(i));
  const pool = dry.length ? dry : opts;
  const n = pool[getRandom(pool.length - 1)];
  if (n % W < col) elUs.style.transform = "scaleX(-1)";
  else if (n % W > col) elUs.style.transform = "";
  uni = n;
  renderUni();
  mood("walk");
  clearTimeout(walkT);
  walkT = setTimeout(() => mood(""), 640);
  // Move at the normal roaming cadence. Once we land on the target tile, wait a
  // normal beat, then drop the poop as she starts her third move (see below).
  timer =
    uni === poopTarget
      ? setTimeout(poopAndLeave, 2600 + getRandom(3000))
      : setTimeout(walkToPoop, 2600 + getRandom(3000));
}

// Third move: the poop appears on the tile she's leaving (the target), then she
// steps away and, the first time only, looks embarrassed and asks for a cleanup.
function poopAndLeave() {
  if (!happy) return; // one poop per feed: a duplicate trigger is ignored
  const st = S();
  const firstPoop = !st.pooped;
  const pk = poopKind();
  st.poops.push([uni, pk]);
  st.pooped = 1;
  sPoop();
  if (pk === 7) WD?.setAchievement("RPOOP", true);
  persist();
  renderCells();
  poopTarget = -1;
  setHappy(false); // back to the normal (row 1) mood from this move on
  // Step to a random neighbour; the poop shows right as this move begins.
  const col = uni % W,
    row = (uni / W) | 0,
    o = [];
  if (col > 0) o.push(uni - 1);
  if (col < W - 1) o.push(uni + 1);
  if (row > 0) o.push(uni - W);
  if (row < H - 1) o.push(uni + W);
  // Step onto a poop-free tile if possible.
  const dry = o.filter((i) => !poopAt(i));
  const pool = dry.length ? dry : o;
  const n = pool[getRandom(pool.length - 1)];
  if (n % W < col) elUs.style.transform = "scaleX(-1)";
  else if (n % W > col) elUs.style.transform = "";
  uni = n;
  renderUni();
  mood("walk");
  clearTimeout(walkT);
  // Once the step settles she's shocked at the mess she left (animated sad
  // row), apologising only the very first time. She stays shocked until she
  // sets off again, which snaps her back to a neutral mood.
  walkT = setTimeout(() => {
    mood("shocked");
    if (firstPoop) {
      // First time: show the apology and wait for a click to move on.
      showBubble(POOP_MSG);
      dismissBubbleThen(step);
    }
  }, 700);
  if (!firstPoop) {
    // Later poops have no bubble: just stay shocked a moment, then resume.
    timer = setTimeout(step, 3000 + getRandom(2000));
  }
}

// Drop a poop of the fed color on the current tile and return to normal.
// (Fallback for when there is no room to waddle to.)
function doPoop() {
  if (!happy) return; // one poop per feed: a duplicate trigger is ignored
  const st = S();
  const pk = poopKind();
  st.poops.push([uni, pk]);
  sPoop();
  if (pk === 7) WD?.setAchievement("RPOOP", true);
  persist();
  renderCells();
  poopTarget = -1;
  setHappy(false);
  mood(""); // back to the normal (row 1) mood
  clearTimeout(walkT);
  timer = setTimeout(step, 2600 + getRandom(3000));
}

// --- Drag a color fragment onto the unicorn to feed it, or a shop plant onto
// a tile to place it (both pointer based, sharing the same machinery) ---
function onFragDown(e) {
  const tb = e.target.closest(".tb"); // a shop plant card
  const sw = e.target.closest(".sw"); // a color swatch
  if (tb && !tb.classList.contains("off")) {
    dragT = +tb.dataset.t; // drag this plant type onto a tile
    dragC = -1;
  } else if (sw && !sw.disabled && !happy) {
    // Feeding: blocked while she's digesting, and only for unlocked colors.
    const c = +sw.dataset.c;
    if (c < 0 || c >= S().unlocked) return;
    dragC = c;
    dragT = -1;
    selColor = c;
    renderBar();
  } else return;
  dragging = false;
  dragStart = { x: e.clientX, y: e.clientY };
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragUp);
}

function onDragMove(e) {
  if (!dragging) {
    // Only start a real drag once the pointer has moved a bit (else it's a tap).
    if (Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) < 6)
      return;
    beginDrag(e);
  }
  // The dragged sprite (a color fragment or a plant) trails the pointer.
  dragEl.style.left = `${e.clientX}px`;
  dragEl.style.top = `${e.clientY}px`;
  if (dragT >= 0) {
    // Plant drag: also highlight the tile under the pointer as the drop target.
    const c = document.elementFromPoint(e.clientX, e.clientY)?.closest(".cell");
    showGhost(c ? +c.dataset.i : -1);
    return;
  }
  dragEl.classList.toggle("over", pointOverUnicorn(e.clientX, e.clientY));
}

function beginDrag(e) {
  dragging = true;
  e.preventDefault();
  if (dragT >= 0) {
    // Planting: a full-size plant sprite trails the pointer to the target tile.
    // It lives on <body>, so copy the paddock's cell size (--cs) onto it —
    // the sprite (and its sheet sizing) are all scaled from that variable.
    selType = dragT;
    dragEl = document.createElement("div");
    dragEl.className = "pdrag";
    dragEl.style.setProperty(
      "--cs",
      getComputedStyle(elPad).getPropertyValue("--cs"),
    );
    dragEl.innerHTML = plantHtml(dragT, "");
    document.body.appendChild(dragEl);
    return;
  }
  // Feeding: freeze the unicorn on its eat-anticipation frame while dragging.
  clearTimeout(timer);
  clearTimeout(walkT);
  clearTimeout(heyT);
  mood("drag");
  // Hide any tutorial bubble during the drag.
  document.removeEventListener("click", tutoClick, true);
  hideBubble();
  clearGhost(); // no plant preview should linger while feeding
  dragEl = document.createElement("i");
  dragEl.className = "frag-ghost";
  dragEl.style.background = COLORS[dragC];
  document.body.appendChild(dragEl);
}

function onDragUp(e) {
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragUp);
  if (dragT >= 0) {
    // Plant drag: drop it on the previewed (valid) tile, if any (a plain tap
    // shows no preview, so ghostAt stays -1 and nothing is placed).
    if (dragEl) {
      dragEl.remove();
      dragEl = null;
    }
    const at = ghostAt;
    clearGhost();
    dragT = -1;
    dragging = false;
    if (at >= 0) build(at);
    return;
  }
  if (!dragging) {
    dragC = -1; // was a tap; let the click handler run (e.g. pick feed color)
    return;
  }
  const over = pointOverUnicorn(e.clientX, e.clientY);
  if (dragEl) {
    dragEl.remove();
    dragEl = null;
  }
  const c = dragC;
  dragC = -1;
  dragging = false;
  if (over) feed(c);
  else {
    // Dropped in empty space: resume roaming (tutorial reappears if not fed).
    mood("");
    timer = setTimeout(step, 1000 + getRandom(1500));
  }
}

function pointOverUnicorn(x, y) {
  const r = elUni.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function clean(i, color) {
  const st = S();
  const firstClean = !st.cleaned;
  st.poops = st.poops.filter((p) => p[0] !== i);
  st.cleaned = 1; // first cleanup reveals the header (butterfly counters)
  sCollect();
  persist();
  renderAll();
  // A rainbow poop refunds 3 butterflies of every color; a normal one, 3 of its own.
  if (color === 7) for (let c = 0; c < 7; c++) flyToCounter(i, c, 3);
  else flyToCounter(i, color, 3);
  // The very first cleanup: the unicorn stops to explain butterflies.
  if (firstClean) cleanTuto();
}

// After the first poop is cleaned, the unicorn stands still and explains what
// cleaning is for. The player clicks anywhere to dismiss and resume play.
function cleanTuto() {
  clearTimeout(timer);
  clearTimeout(walkT);
  clearTimeout(heyT);
  mood("hey"); // stands still while talking
  S().acts = 1; // first harvest done: reveal the Garden shop
  persist();
  renderBar();
  showBubble(CLEAN_MSG);
  dismissBubbleThen(() => {
    mood("");
    timer = setTimeout(step, 1200 + getRandom(1500));
  });
}

// Fly `amount` butterflies from a cell to its color counter, adding them to
// the count only once they reach it.
function flyToCounter(i, color, amount) {
  const inc = () => {
    const st = S();
    st.bf[color] += amount;
    persist();
    renderTop();
    renderBar(); // refresh affordability (shop items / swatches) with the new total
  };
  const target = elTop.querySelector(`.bfc[data-c="${color}"] .bfi`);
  if (!target) return inc();
  const from = cells[i].getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const sx = from.left + from.width / 2;
  const sy = from.top + from.height / 2;
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;
  const li = 15 + color;
  const r = li >> 1;
  const c = (li & 1) * 2;
  const total = amount;
  let done = 0;
  for (let n = 0; n < total; n++) {
    const b = document.createElement("i");
    b.className = "bf fly";
    b.style.setProperty("--r", r);
    b.style.setProperty("--c", c);
    document.body.appendChild(b);
    const dx = getRandom(40) - 20;
    const dy = getRandom(40) - 20;
    b.animate(
      [
        { transform: `translate(${sx - 20}px,${sy - 20}px)`, opacity: 1 },
        {
          transform: `translate(${(sx + tx) / 2 - 20 + dx}px,${
            (sy + ty) / 2 - 50 + dy
          }px)`,
          opacity: 1,
          offset: 0.5,
        },
        { transform: `translate(${tx - 20}px,${ty - 20}px)`, opacity: 0.5 },
      ],
      { duration: 650 + n * 120, easing: "ease-in-out" },
    ).onfinish = () => {
      b.remove();
      if (++done === total) inc();
    };
  }
}

function checkUnlocks() {
  const st = S();
  const prev = st.unlocked;
  let u = st.unlocked;
  while (
    u < 7 &&
    (u === 3
      ? st.combo === 2
      : u === 6
        ? st.combo2 === 2
        : REQS[u].every(([t, c]) =>
            st.decos.some((d) => (t < 0 || d[1] === t) && d[2] === c),
          ))
  )
    u++;
  if (u > prev) {
    st.unlocked = u;
    sUnlock();
    mode = 0; // switch back to the Garden tab to show off the new color
    if (u === 7 && !st.done) {
      st.done = 1;
      sWin();
    }
    // Keep newly unlocked colors greyed until their arc animation finishes, and
    // remember each unlock line now so reloading mid-animation still replays it.
    for (let c = prev; c < u; c++) {
      pendingUnlock.add(c);
      const l = UNLOCK_LINES[c];
      if (l) st.line = l[l.length - 1];
      // Indigo's arc animation speaks VIOLET_POEM; mark the violet quest as
      // already introduced so it starts in quiet mode when triggered later.
      if (c === 5) st.qseen |= 2;
      WD?.setAchievement("COLOR_" + c, true);
    }
    // Trigger the juicy rainbow effect once the bar has re-rendered.
    requestAnimationFrame(() => {
      for (let c = prev; c < u; c++)
        setTimeout(() => rainbowUnlock(c), (c - prev) * 900);
    });
  }
}

// A rainbow arc of the unlocked color sweeps across the screen with a label
// and a confetti burst, then gets sucked into its color button, which pops
// to feel "activated".
function rainbowUnlock(color) {
  const findBtn = () => elBar.querySelector(`.sw[data-c="${color}"]`);
  const w = innerWidth;
  const h = innerHeight;
  const col = COLORS[color];
  const crestX = w / 2;
  const crestY = h * 0.22;

  const wrap = document.createElement("div");
  wrap.className = "rbfx";
  wrap.innerHTML =
    `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="filter:drop-shadow(0 0 18px ${col})">` +
    `<path d="M ${w * -0.05},${h * 0.9} Q ${w / 2},${h * -0.45} ${
      w * 1.05
    },${h * 0.9}" fill="none" stroke="${col}" stroke-width="48" stroke-linecap="round"/>` +
    `</svg>` +
    `<div class="rbmsg" style="color:${col}">${CNAMES[color]} unlocked!</div>`;
  document.body.appendChild(wrap);

  const path = wrap.querySelector("path");
  const msg = wrap.querySelector(".rbmsg");
  const len = path.getTotalLength();
  path.style.strokeDasharray = len;
  path.style.strokeDashoffset = len;

  // Confetti burst from the arc crest.
  burstConfetti(crestX, crestY);

  // Message pops in alongside the arc.
  msg.animate(
    [
      { opacity: 0, transform: "translateX(-50%) scale(0.6)" },
      { opacity: 1, transform: "translateX(-50%) scale(1)" },
    ],
    {
      duration: 600,
      delay: 500,
      easing: "cubic-bezier(.2,1.4,.4,1)",
      fill: "backwards",
    },
  );

  // Phase 1: slowly draw the arc across the screen.
  path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
    duration: 1300,
    easing: "ease-out",
    fill: "forwards",
  }).onfinish = () => {
    // Hold so the player can enjoy the full arc, then lodge it in the button.
    setTimeout(() => {
      // Aim the collapse at the (still greyed) button's position.
      let ox = crestX,
        oy = crestY;
      const preBtn = findBtn();
      if (preBtn) {
        const r = preBtn.getBoundingClientRect();
        ox = r.left + r.width / 2;
        oy = r.top + r.height / 2;
      }
      msg.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 500,
        fill: "forwards",
      });
      wrap.style.transformOrigin = `${ox}px ${oy}px`;
      wrap.animate(
        [
          { transform: "scale(1)", opacity: 1 },
          { transform: "scale(0.02)", opacity: 0.1 },
        ],
        { duration: 900, delay: 200, easing: "ease-in", fill: "forwards" },
      ).onfinish = () => {
        wrap.remove();
        // Only now, once the arc has fully lodged, activate + pop the button.
        pendingUnlock.delete(color);
        renderBar();
        renderBg();
        const target = findBtn();
        let pop;
        if (target) {
          pop = target.animate(
            [
              { transform: "scale(1)", boxShadow: `0 0 0 0 ${col}` },
              {
                transform: "scale(1.6)",
                boxShadow: `0 0 16px 8px ${col}`,
                offset: 0.5,
              },
              { transform: "scale(1)", boxShadow: `0 0 0 0 ${col}` },
            ],
            { duration: 600, easing: "ease-out" },
          );
        }
        // A couple of colors trigger a little speech once their arc lands.
        const lines = UNLOCK_LINES[color];
        if (lines) {
          const say = () => saySequence(lines);
          if (pop) pop.onfinish = say;
          else say();
        }
      };
    }, 650);
  };
}

// Confetti burst from a point that scatters outward then falls and fades.
function burstConfetti(x, y) {
  const h = innerHeight;
  const cont = document.createElement("div");
  cont.className = "rbfx";
  document.body.appendChild(cont);
  const n = 70;
  let done = 0;
  for (let k = 0; k < n; k++) {
    const p = document.createElement("i");
    p.className = "conf";
    p.style.background = COLORS[getRandom(6)];
    if (getRandom(1)) p.style.borderRadius = "50%";
    cont.appendChild(p);
    const spreadX = getRandom(640) - 320;
    const upY = -(100 + getRandom(200));
    const fallY = h * 0.55 + getRandom(220);
    const rot = getRandom(900) - 450;
    const dur = 1600 + getRandom(1400);
    p.animate(
      [
        { transform: `translate(${x}px,${y}px) rotate(0deg)`, opacity: 1 },
        {
          transform: `translate(${x + spreadX * 0.5}px,${
            y + upY
          }px) rotate(${rot * 0.4}deg)`,
          opacity: 1,
          offset: 0.3,
        },
        {
          transform: `translate(${x + spreadX}px,${
            y + fallY
          }px) rotate(${rot}deg)`,
          opacity: 0,
        },
      ],
      { duration: dur, easing: "cubic-bezier(.25,.6,.4,1)", fill: "forwards" },
    ).onfinish = () => {
      if (++done === n) cont.remove();
    };
  }
}

function build(i) {
  if (i === uni || poopAt(i)) return;
  // Dropping onto an existing element replaces it: remove it first so its
  // butterflies fly back to the counter before the new one is placed.
  if (decoAt(i)) remove(i);
  const st = S();
  st.bf[selColor] -= COSTS[selType];
  st.decos.push([i, selType, selColor]);
  sPlace();
  checkUnlocks();
  persist();
  renderAll();
  // Juicy pop: the placed element scales up from nothing with a slight wobble.
  const placed = cells[i].querySelector(".ds");
  if (placed) placed.animate(
    [
      { transform: "scale(0) rotate(-12deg)", opacity: 0 },
      { transform: "scale(1.3) rotate(4deg)", opacity: 1, offset: 0.55 },
      { transform: "scale(0.9) rotate(-1deg)", offset: 0.8 },
      { transform: "scale(1) rotate(0deg)" },
    ],
    { duration: 420, easing: "ease-out" },
  );
  // Kick off the green mini-quest once the red + orange + yellow elements it
  // needs are all present (whichever one the player placed last).
  if (st.combo === 0 && st.unlocked === 3 && hasAll(GREEN_SEQ))
    startGreenQuest();
  // Once every poem element exists (and indigo is unlocked), start the violet one.
  if (st.combo2 === 0 && st.unlocked === 6 && hasAll(VIOLET_SEQ))
    startVioletQuest();
}

// A quest: the unicorn pauses, shows a hint bubble, and the matching elements
// start pulsing. The bubble is dismissed on any click (which also counts as the
// first combo step), after which she resumes roaming while the player clicks.
function startQuest(msg, quiet) {
  comboProg = 0;
  clearTimeout(timer);
  clearTimeout(walkT);
  clearTimeout(heyT);
  renderCells(); // light up the clickable elements
  if (quiet) {
    // Re-activation (a removed ingredient came back, or a reload): highlight the
    // elements again, but don't repeat the intro speech. She just keeps roaming.
    timer = setTimeout(step, 1200 + getRandom(1500));
    return;
  }
  stopWalk(); // freeze her in place while the hint bubble is up
  mood("hey"); // brief attention-grabbing pose while the hint shows
  showBubble(msg);
  dismissBubbleThen(() => {
    mood("");
    timer = setTimeout(step, 1200 + getRandom(1500));
  }, true);
}

function startGreenQuest() {
  const first = !(S().qseen & 1); // only speak the first time this quest starts
  S().combo = 1;
  S().qseen |= 1;
  persist();
  startQuest(GREEN_MSG, !first);
}

function startVioletQuest() {
  const first = !(S().qseen & 2); // only recite the poem the first time
  S().combo2 = 1;
  S().qseen |= 2;
  persist();
  startQuest(VIOLET_POEM, !first);
}

// Advance the active quest after its highlighted (next) element was clicked.
function comboStep() {
  comboProg++;
  sPlace();
  if (comboProg === questSeq().length) return solveQuest();
  renderCells(); // move the pulsing hint to the next element
}

function solveQuest() {
  const st = S();
  if (st.combo === 1) st.combo = 2;
  else st.combo2 = 2;
  hideBubble();
  checkUnlocks(); // the quest's color (and any further ones) now unlock
  persist();
  renderAll(); // clears the .clk hints (no quest is active anymore)
  // No need to restart the walk loop: she's already roaming since the hint
  // bubble was dismissed at the start of the combo.
}

// Once green's unlock animation is over, the unicorn says a couple of lines,
// each dismissed by a click, then goes back to roaming.
function saySequence(lines, k = 0) {
  if (!k) {
    clearTimeout(timer);
    clearTimeout(walkT);
    clearTimeout(heyT);
    stopWalk(); // don't keep sliding while the lines are shown
    mood("hey");
  }
  if (k >= lines.length) {
    mood("");
    timer = setTimeout(step, 1200 + getRandom(1500));
    return;
  }
  showBubble(lines[k]);
  dismissBubbleThen(() => saySequence(lines, k + 1));
}

function remove(i) {
  const st = S();
  const d = decoAt(i);
  if (!d) return;
  const color = d[2];
  const refund = COSTS[d[1]];
  st.decos = st.decos.filter((x) => x[0] !== i);
  sPlace();
  // If this element belonged to the active quest and its line-up is now
  // incomplete, deactivate the quest; it re-triggers once every ingredient is
  // back on the board.
  const seq = questSeq();
  if (seq && !hasAll(seq)) {
    if (st.combo === 1) st.combo = 0;
    else st.combo2 = 0;
    comboProg = 0;
    hideBubble();
  }
  persist();
  renderCells();
  // Refund the spent butterflies once they fly back to their counter.
  flyToCounter(i, color, refund);
}

function onCell(i) {
  const p = poopAt(i);
  const d = decoAt(i);
  if (p) return clean(i, p[1]);
  // In Remove mode, deleting a decoration always wins, even during a quest and
  // even on the currently highlighted element (the hint just moves / clears).
  if (mode === 2) return void (d && remove(i));
  // During a quest, clicking the highlighted (next) element advances the combo;
  // clicking anything else resets it. Either way the normal action still runs.
  const seq = questSeq();
  if (seq) {
    const st = seq[comboProg];
    if (d && st && questHit(d, st)) return comboStep();
    if (comboProg) {
      comboProg = 0;
      renderCells();
    }
  }
  if (i === uni) return hey();
}

// Sprite markup for a plant of the given `type`, in the selected color.
// `extra` adds a class (e.g. " gh" for the translucent grid preview).
function plantHtml(type, extra) {
  const li = [22, 15, 51][type] + selColor;
  return `<b class="ds ${["fl", "mu", "cr"][type]}${extra}" style="--r:${li >> 2};--c:${li & 3}"></b>`;
}

function clearGhost() {
  if (ghostAt >= 0 && cells[ghostAt]) {
    const g = cells[ghostAt].querySelector(".gh");
    if (g) g.remove();
  }
  ghostAt = -1;
}

// Show the build preview on cell `i` (empty or occupied reachable cells; on an
// occupied cell the ghost visually replaces the element there). Only once
// planting is available.
function showGhost(i) {
  if (i === ghostAt) return;
  clearGhost();
  if (mode === 2 || !S().acts || i < 0 || i === uni || poopAt(i)) return;
  cells[i].insertAdjacentHTML("beforeend", plantHtml(selType, " gh"));
  ghostAt = i;
}

function hey() {
  // Don't let a click interrupt the digestive walk (or she'd never poop).
  if (happy || elUs.classList.contains("hey")) return;
  clearTimeout(timer);
  clearTimeout(walkT);
  stopWalk(); // stop the glide so she stands still while repeating her line
  mood("hey");
  const resume = () => {
    mood("");
    timer = setTimeout(step, 2600 + getRandom(3000));
  };
  if (lastLine) {
    // Poking her replays her most recent line, dismissed by a click like the
    // other dialogues.
    showBubble(lastLine);
    dismissBubbleThen(resume);
  } else {
    heyT = setTimeout(resume, 500);
  }
}

function step() {
  // Safety net: while joyful she must finish her digestive walk and poop. If
  // that routine got interrupted (an unlock speech or the cleanup tutorial
  // reused the shared timer), resume it here instead of roaming forever in the
  // full state — otherwise she never poops and can't be fed again.
  if (happy) {
    if (poopTarget === uni) return poopAndLeave();
    if (poopTarget < 0 || decoAt(poopTarget) || poopAt(poopTarget)) {
      poopTarget = findPoopTarget();
      if (poopTarget < 0) return doPoop();
    }
    return walkToPoop();
  }
  const col = uni % W,
    row = (uni / W) | 0,
    o = [];
  if (col > 0) o.push(uni - 1);
  if (col < W - 1) o.push(uni + 1);
  if (row > 0) o.push(uni - W);
  if (row < H - 1) o.push(uni + W);
  // Prefer tiles without poop; only step on one if every neighbour has poop.
  const dry = o.filter((i) => !poopAt(i));
  const free = dry.length ? dry : o;
  if (free.length) {
    const n = free[getRandom(free.length - 1)];
    if (n % W < col) elUs.style.transform = "scaleX(-1)";
    else if (n % W > col) elUs.style.transform = "";
    uni = n;
    renderUni();
    mood("walk");
    clearTimeout(walkT);
    walkT = setTimeout(() => mood(""), 640);
    // While red is still locked, nudge the player back to the tutorial
    // if the unicorn has wandered twice without being clicked. Wait for the
    // move transition (1s) to finish before repeating the line.
    if (isTuto() && ++moves >= 2)
      return void (timer = setTimeout(repeatTuto, 1000));
  }
  timer = setTimeout(step, 2600 + getRandom(3000));
}

// Intro tutorial: the unicorn greets the player with comic speech bubbles.
const INTRO = [
  "Oh, hello there! I've been waiting for you!",
  "My rainbow has lost its colors... And that's dreadful, for it is my only source of food!",
  "Please, I beg you... Help me!",
  "I may have some magic left in my stomach...",
];

// Second tutorial line: prompt the player to feed the unicorn a red fragment.
const FEED_MSG =
  "Oh, you found the color red! Quick, give me a red fragment of the rainbow to feed me, I'm so hungry!";

// Line said the very first time the unicorn is fed, before its digestive walk.
const DIGEST_MSG =
  "That was delicious, thank you! And now, a little digestive stroll...";

// Embarrassed line said after she leaves a butterfly-poop behind.
const POOP_MSG =
  "Oops... I made a butterfly-poop... Can you clean it up, please?";

// Explanation shown the first time the player cleans a butterfly-poop.
const CLEAN_MSG =
  "Thank you! Cleaning a butterfly-poop gives you butterflies back! You can spend them to make the surroundings prettier!";

// Line said when the first yellow decoration fails to unlock green, starting
// the click-in-order mini-quest.
const GREEN_MSG = "Huh, green didn't unlock... What can we do?";

// Two lines said once green's unlock animation finishes.
const GREEN_DONE = [
  "I'd never have figured that out on my own!",
  "By the way, do you like mushrooms? I love them!",
];

// Line said once blue's unlock animation finishes.
const BLUE_MSG =
  "They say there are magic crystals that draw their power from the sea... Can you believe that?";

// Poem said once indigo unlocks: a hint for the violet quest's click order.
// The colored words use the .c0-.c5 palette classes (see style.css).
const VIOLET_POEM =
  "My mom told me this poem when I was a little unicorn:<br><em>" +
  "A <b class='c0'>crimson bloom</b> begins the trail,<br>" +
  "Then <b class='c1'>amber crystal</b> starts to glow.<br>" +
  "A <b class='c2'>golden mushroom</b> follows next,<br>" +
  "Then <b class='c3'>emerald petals</b> softly show.<br>" +
  "A <b class='c4'>sapphire toadstool</b> marks the way,<br>" +
  "And <b class='c5'>indigo rock</b> ends the play.</em>";

// Line said once the last color (violet) unlocks and the rainbow is complete.
const WIN_MSG =
  "Wow, you've completely restored the rainbow, thank you so much!<br>If you feel like it, you can keep decorating my surroundings however you please.";

// Lines said when each color's unlock arc lands, indexed by color. The last
// line is stored in state at unlock time (see checkUnlocks) so a reload during
// the animation still lets her say/replay it instead of an older line.
const UNLOCK_LINES = [, , , GREEN_DONE, [BLUE_MSG], [VIOLET_POEM], [WIN_MSG]];

// A tutorial cycle is active while red is locked, or once unlocked but not yet fed.
const isTuto = () => !S().unlocked || !S().fed;
const tutoLine = () => (S().unlocked ? FEED_MSG : INTRO[INTRO.length - 1]);

function startIntro() {
  introI = 0;
  mood("hey"); // static greeting pose, unicorn stays put
  showBubble();
  setTimeout(() => document.addEventListener("click", nextIntro, true), 0);
}

function showBubble(text = INTRO[introI]) {
  clearTimeout(bubHideT); // a new line cancels any pending fade-out removal
  if (text) {
    lastLine = text; // remember it so poking her can replay it
    S().line = text; // ...even after a page reload
    persist();
  }
  let b = document.querySelector(".bub");
  if (!b) {
    b = document.createElement("div");
    b.className = "bub";
    document.body.appendChild(b);
  } else {
    b.classList.remove("out");
  }
  b.innerHTML = `<div class="bubb"><span>${text}</span></div>`;
  // Anchor to the unicorn in viewport coordinates, then clamp horizontally so
  // the bubble never gets cut off at the edges of the play area / screen.
  // The layout may not be ready on the very first frame, so retry until it is.
  let tries = 0;
  const place = () => {
    if (!b.isConnected) return;
    const r = elUni.getBoundingClientRect();
    if (!r.width && tries++ < 30) return requestAnimationFrame(place);
    const anchorX = r.left + r.width / 2;
    const below = r.top < 140;
    b.classList.toggle("down", below);
    const m = 8;
    const bw = b.offsetWidth;
    const cx = Math.max(m + bw / 2, Math.min(anchorX, innerWidth - m - bw / 2));
    const tx = Math.max(-(bw / 2 - 18), Math.min(anchorX - cx, bw / 2 - 18));
    b.style.left = `${cx}px`;
    b.style.top = `${below ? r.bottom : r.top}px`;
    b.style.setProperty("--tx", `${tx}px`);
  };
  place();
  // Keep the bubble glued to the unicorn when the viewport changes or the page
  // scrolls. Registered once (idempotent); it no-ops once the bubble is gone.
  placeBubble = place;
}

// Reposition the currently visible speech bubble (set by showBubble). Bound to
// resize/scroll so the bubble never drifts from the unicorn.
let placeBubble = null;
const repositionBubble = () => placeBubble && placeBubble();
addEventListener("resize", repositionBubble);
addEventListener("scroll", repositionBubble, true);

function nextIntro(e) {
  e.preventDefault();
  e.stopPropagation();
  introI++;
  if (introI >= INTRO.length) endIntro();
  else showBubble();
}

function endIntro() {
  document.removeEventListener("click", nextIntro, true);
  introI = -1;
  mood("");
  hideBubble();
  S().seen = 1;
  persist();
  startPlay();
}

// After the intro (or on a reload with red still locked), the unicorn roams
// and can be clicked to unlock red.
function startPlay() {
  moves = 0;
  if (!S().unlocked) elUni.classList.add("poke"); // clickable + pointer cursor
  timer = setTimeout(step, 1600 + getRandom(2000));
}

// Fade out and remove the current speech bubble.
function hideBubble() {
  placeBubble = null; // stop tracking resize/scroll for the vanishing bubble
  const b = document.querySelector(".bub");
  if (b) {
    b.classList.add("out");
    bubHideT = setTimeout(() => b.remove(), 250);
  }
}

// Single dialogue-dismiss helper: keep the current bubble up until the player
// clicks anywhere, then dismiss it and run `next`. By default the click is
// consumed; pass keepClick to let it also act on the board (e.g. a combo tap).
function dismissBubbleThen(next, keepClick) {
  const handler = (e) => {
    if (!keepClick) {
      e.preventDefault();
      e.stopPropagation();
    }
    document.removeEventListener("click", handler, true);
    hideBubble();
    if (next) next();
  };
  setTimeout(() => document.addEventListener("click", handler, true), 0);
}

// Unicorn stops and repeats the current tutorial line to prompt the player.
function repeatTuto() {
  clearTimeout(timer);
  clearTimeout(walkT);
  mood("hey");
  showBubble(tutoLine());
  document.addEventListener("click", tutoClick, true);
}

// Dismiss the tuto bubble and resume the roaming cycle.
function dismissTuto() {
  hideBubble();
  mood("");
  moves = 0;
  timer = setTimeout(step, 1600 + getRandom(2000));
}

// While a tuto line is showing:
// - phase 1 (red locked): clicking the unicorn unlocks red;
// - any other click dismisses the bubble and resumes the roaming cycle.
function tutoClick(e) {
  if (!S().unlocked && elUni.contains(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    document.removeEventListener("click", tutoClick, true);
    return unlockRed();
  }
  e.preventDefault();
  e.stopPropagation();
  document.removeEventListener("click", tutoClick, true);
  dismissTuto();
}

// Feeding for the first time ends the tutorial for good (feed() handles the
// eating animation and resuming movement).
function endTuto() {
  document.removeEventListener("click", tutoClick, true);
  hideBubble();
}

// Clicking the unicorn while red is locked grants red (with the rainbow effect).
function unlockRed() {
  clearTimeout(timer);
  clearTimeout(walkT);
  clearTimeout(heyT);
  introI = -1;
  moves = 0;
  elUni.classList.remove("poke");
  mood("");
  hideBubble();
  checkUnlocks(); // REQS[0] is empty, so this unlocks red
  persist();
  renderAll();
  // Let the rainbow effect play, then start the feed tutorial.
  timer = setTimeout(repeatTuto, 2600);
}

export default function initGame() {
  if (inited) return;
  inited = 1;

  elTop = gid("top");
  elPad = gid("pad");
  elBar = gid("bar");

  initBg();

  buildGrid();
  mood(""); // normal idle sprite state
  lastLine = S().line || ""; // restore her last line so poking can replay it

  uni = 31; // unicorn always starts at the center tile

  elPad.onclick = (e) => {
    const c = e.target.closest(".cell");
    if (c) onCell(+c.dataset.i);
  };

  elUni.onclick = () => {
    if (!S().unlocked) unlockRed();
  };

  // Start dragging a fragment from the palette to feed the unicorn.
  elBar.addEventListener("pointerdown", onFragDown);

  elBar.onclick = (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const ds = t.dataset;
    if (ds.c != null && !t.disabled) {
      selColor = +ds.c;
      renderBar();
    }
  };

  const st = S();
  // A quest flag is only valid while all its ingredients are still on the
  // board; clear any stale one (e.g. an element was removed in a past session)
  // BEFORE the first render, so it neither resumes nor keeps highlighting with
  // an incomplete line-up.
  if (st.combo === 1 && !hasAll(GREEN_SEQ)) st.combo = 0;
  if (st.combo2 === 1 && !hasAll(VIOLET_SEQ)) st.combo2 = 0;
  persist();
  renderAll();
  if (st.combo === 1) startGreenQuest();
  else if (st.combo2 === 1) startVioletQuest();
  else if (!st.unlocked && !st.seen) startIntro();
  // The quests are normally triggered from build(); re-check here so a reload
  // still starts them if the prerequisites are already met on the board.
  else if (st.combo === 0 && st.unlocked === 3 && hasAll(GREEN_SEQ))
    startGreenQuest();
  else if (st.combo2 === 0 && st.unlocked === 6 && hasAll(VIOLET_SEQ))
    startVioletQuest();
  else {
    startPlay();
    if (lastLine) hey(); // on reload, auto-replay her last line once
  }
}
