import { getRandom } from "./utils.js";
import { getState, setState } from "./store.js";
import { sFeed, sPoop, sCollect, sPlace, sUnlock, sWin } from "./sounds.js";

// Grid
const W = 9,
  H = 7,
  N = W * H;

// Data (index-based to stay compact)
const COLORS = ["#e33", "#f80", "#fd0", "#3c3", "#39f", "#55f", "#a3e"];
const CNAMES = ["Red", "Orange", "Yellow", "Green", "Blue", "Indigo", "Violet"];
const TNAMES = ["Flower", "Mushroom", "Bush"];
const COSTS = [2, 3, 5];
// Requirements to unlock each color: list of [type, color] that must exist
const REQS = [
  [],
  [[0, 0]],
  [
    [1, 0],
    [0, 1],
  ],
  [
    [0, 2],
    [2, 0],
  ],
  [
    [0, 3],
    [1, 1],
  ],
  [
    [0, 4],
    [2, 2],
  ],
  [
    [1, 0],
    [1, 1],
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 5],
  ],
];

const S = getState;
const persist = () => setState(S());

const decoAt = (i) => S().decos.find((d) => d[0] === i);
const poopAt = (i) => S().poops.find((p) => p[0] === i);

// Non-persisted game vars
let uni = 31; // unicorn cell (cosmetic, not saved)
let mode = 0; // 0 feed, 1 build, 2 remove
let selType = 0;
let selColor = 0;
let inited;
let elTop, elPad, elBar, elMsg, elUni, elUs, cells;
let timer,
  msgT,
  walkT,
  heyT,
  introI = -1,
  moves = 0;
let bgA, bgB; // cross-fading rainbow background layers
let dragC = -1, // color of the fragment being dragged (-1 = none)
  dragEl = null, // ghost element following the pointer
  dragStart = null, // pointerdown position (to detect a real drag vs a tap)
  dragging = false; // a real drag is in progress
let happy = false, // transient joyful mood (from eating until pooping)
  poopTarget = -1, // cell the unicorn waddles to after eating (-1 = none)
  poopColor = 0; // color of the poop it will leave there
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
  for (let i = 0; i < N; i++) {
    const d = st.decos.find((x) => x[0] === i);
    const p = st.poops.find((x) => x[0] === i);
    let h = "";
    if (d) {
      if (d[1] < 2) {
        const li = (d[1] ? 19 : 26) + d[2];
        h = `<b class="d ds ${d[1] ? "mu" : "fl"}" style="--r:${li >> 2};--c:${
          li & 3
        };--i:${i}"></b>`;
      } else {
        h = `<b class="d t2" style="background:${COLORS[d[2]]}"></b>`;
      }
    } else if (p) {
      h = `<b class="po"><i class="bf" style="--r:${(17 + p[1]) >> 1};--c:${((17 + p[1]) & 1) * 2}"></i></b>`;
    }
    cells[i].innerHTML = h;
  }
}

function renderUni() {
  elUni.style.transform = `translate(${(uni % W) * 100}%,${((uni / W) | 0) * 100}%)`;
}

// Set the unicorn's sprite state. `action` is one of "", "walk", "hey",
// "eat", "drag". While joyful (just after eating, on the way to poop) the
// happy sprite row is used instead of the normal one.
function mood(action) {
  elUs.className = "us" + (action ? " " + action : "") + (happy ? " joy" : "");
}

function renderTop() {
  const st = S();
  const show = st.unlocked && st.cleaned;
  elTop.hidden = !show;
  if (!show) return;
  let counts = "";
  for (let c = 0; c < st.unlocked; c++)
    counts += `<span class="bfc" data-c="${c}" title="${CNAMES[c]}"><i class="bfi" style="--r:${
      12 + ((c / 4) | 0)
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
  // Fragment palette: always visible once red exists. Draggable onto the
  // unicorn to feed it; also doubles as the color picker while building.
  let pal = "";
  for (let c = 0; c < 7; c++) {
    const lock = c >= st.unlocked || pendingUnlock.has(c);
    const sel = mode === 1 && selColor === c && !lock;
    pal += `<button class="sw${sel ? " on" : ""}${lock ? " off" : ""}" data-c="${c}"${
      lock ? " disabled" : ""
    } style="background:${COLORS[c]};top:${arcY(c)}px" title="${
      lock ? "Locked" : CNAMES[c]
    }"></button>`;
  }
  // Tools depend on the current mode (build type buttons / remove hint).
  let tools = "";
  if (mode === 1 && st.cleaned) {
    tools =
      `<div class="tools">` +
      TNAMES.map(
        (t, k) =>
          `<button class="tb${selType === k ? " on" : ""}" data-t="${k}">${t} ${COSTS[k]}</button>`,
      ).join("") +
      `</div>`;
  } else if (mode === 2 && st.cleaned) {
    tools = `<div class="hint">Click a decoration to remove it. Click a poop anytime to clean it.</div>`;
  }
  // How-to-feed hint.
  const help = st.unlocked
    ? `<div class="feedhelp">Drag fragments to the unicorn to feed it!</div>`
    : "";
  let next = "";
  if (st.unlocked && st.cleaned && st.unlocked < 7) {
    const items = REQS[st.unlocked]
      .map(([t, c]) => {
        const ok = st.decos.some((d) => d[1] === t && d[2] === c);
        return `<span class="${ok ? "ok" : ""}">${CNAMES[c]} ${TNAMES[t]}</span>`;
      })
      .join(", ");
    next = `<div class="next">Next: <b style="color:${COLORS[st.unlocked]}">${CNAMES[st.unlocked]}</b> — ${items}</div>`;
  }
  const modes =
    st.unlocked && st.cleaned
      ? [
          ["🌷", "Build", 1],
          ["✖", "Remove", 2],
        ]
          .map(
            ([ic, label, m]) =>
              `<button class="mb${mode === m ? " on" : ""}" data-m="${m}"><span class="ic">${ic}</span>${label}</button>`,
          )
          .join("")
      : "";
  elBar.innerHTML = `<div class="pal">${pal}</div>${help}${tools}${next}<div class="modes">${modes}</div>`;
}

function renderAll() {
  renderTop();
  renderCells();
  renderUni();
  renderBar();
}

function showMsg(text) {
  elMsg.textContent = text;
  elMsg.classList.add("show");
  clearTimeout(msgT);
  msgT = setTimeout(() => elMsg.classList.remove("show"), 1600);
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
  happy = true;
  poopColor = color;
  mood("eat");
  // Chew for a moment, then set off to find a spot to poop.
  setTimeout(() => {
    poopTarget = findPoopTarget();
    if (poopTarget < 0) return doPoop(); // no room: poop on the spot
    if (firstFeed) {
      // On the very first feed, she thanks the player, then trots off.
      mood("");
      showBubble(DIGEST_MSG);
      timer = setTimeout(() => {
        hideBubble();
        walkToPoop();
      }, 2600);
    } else {
      walkToPoop();
    }
  }, 1600);
}

// Nearest empty tile (no deco, no poop, not the current cell) she waddles to
// before pooping. Normally at least two moves away, but the very first poop is
// one move closer (one step to the target, then the poop on the next move).
function findPoopTarget() {
  const minD = S().pooped ? 2 : 1;
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
  const st = S();
  const firstPoop = !st.pooped;
  st.poops.push([uni, poopColor]);
  st.pooped = 1;
  sPoop();
  persist();
  renderCells();
  poopTarget = -1;
  happy = false; // back to the normal (row 1) mood from this move on
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
    if (firstPoop) showBubble(POOP_MSG);
  }, 700);
  timer = setTimeout(
    () => {
      hideBubble();
      step(); // a new move returns her to the neutral mood
    },
    3000 + getRandom(2000),
  );
}

// Drop a poop of the fed color on the current tile and return to normal.
// (Fallback for when there is no room to waddle to.)
function doPoop() {
  const st = S();
  st.poops.push([uni, poopColor]);
  sPoop();
  persist();
  renderCells();
  poopTarget = -1;
  happy = false;
  mood(""); // back to the normal (row 1) mood
  clearTimeout(walkT);
  timer = setTimeout(step, 2600 + getRandom(3000));
}

// --- Drag a fragment onto the unicorn to feed it (pointer based) ---
function onFragDown(e) {
  if (happy) return; // already full: can't feed until she has pooped
  const sw = e.target.closest(".sw");
  if (!sw || sw.disabled) return;
  const c = +sw.dataset.c;
  if (c < 0 || c >= S().unlocked) return; // locked fragment
  dragC = c;
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
  dragEl.style.left = `${e.clientX}px`;
  dragEl.style.top = `${e.clientY}px`;
  dragEl.classList.toggle("over", pointOverUnicorn(e.clientX, e.clientY));
}

function beginDrag(e) {
  dragging = true;
  // Freeze the unicorn on its eat-anticipation frame while dragging.
  clearTimeout(timer);
  clearTimeout(walkT);
  clearTimeout(heyT);
  mood("drag");
  // Hide any tutorial bubble during the drag.
  document.removeEventListener("click", tutoClick, true);
  hideBubble();
  e.preventDefault();
  dragEl = document.createElement("i");
  dragEl.className = "frag-ghost";
  dragEl.style.background = COLORS[dragC];
  document.body.appendChild(dragEl);
}

function onDragUp(e) {
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragUp);
  if (!dragging) {
    dragC = -1; // was a tap; let the click handler run (e.g. pick build color)
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
  st.poops = st.poops.filter((p) => p[0] !== i);
  st.cleaned = 1; // first cleanup reveals the header and build/remove actions
  sCollect();
  persist();
  renderAll(); // reveal header/actions on the first cleanup
  flyToCounter(i, color, 3);
}

// Fly `amount` butterflies from a cell to its color counter, adding them to
// the count only once they reach it.
function flyToCounter(i, color, amount) {
  const inc = () => {
    const st = S();
    st.bf[color] += amount;
    persist();
    renderTop();
    if (mode === 0) renderBar();
  };
  const target = elTop.querySelector(`.bfc[data-c="${color}"] .bfi`);
  if (!target) return inc();
  const from = cells[i].getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const sx = from.left + from.width / 2;
  const sy = from.top + from.height / 2;
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;
  const li = 17 + color;
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
    REQS[u].every(([t, c]) => st.decos.some((d) => d[1] === t && d[2] === c))
  )
    u++;
  if (u > prev) {
    st.unlocked = u;
    sUnlock();
    if (u === 7 && !st.done) {
      st.done = 1;
      sWin();
    }
    // Keep newly unlocked colors greyed until their arc animation finishes.
    for (let c = prev; c < u; c++) pendingUnlock.add(c);
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
  const findBtn = () =>
    elBar.querySelector(`.sw[data-c="${color}"]`) ||
    elBar.querySelector(`.sw[data-f="${color}"]`);
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
        if (target) {
          target.animate(
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
  if (i === uni || decoAt(i) || poopAt(i)) return;
  const st = S();
  const cost = COSTS[selType];
  if (st.bf[selColor] < cost) {
    showMsg("Not enough " + CNAMES[selColor] + " butterflies");
    return;
  }
  st.bf[selColor] -= cost;
  st.decos.push([i, selType, selColor]);
  sPlace();
  checkUnlocks();
  persist();
  renderAll();
}

function remove(i) {
  const st = S();
  const d = decoAt(i);
  if (!d) return;
  const color = d[2];
  const refund = COSTS[d[1]];
  st.decos = st.decos.filter((x) => x[0] !== i);
  sPlace();
  persist();
  renderCells();
  // Refund the spent butterflies once they fly back to their counter.
  flyToCounter(i, color, refund);
}

function onCell(i) {
  const p = poopAt(i);
  if (p) return clean(i, p[1]);
  if (i === uni) return hey();
  if (mode === 1) build(i);
  else if (mode === 2 && decoAt(i)) remove(i);
}

function hey() {
  // Don't let a click interrupt the digestive walk (or she'd never poop).
  if (happy || elUs.classList.contains("hey")) return;
  clearTimeout(timer);
  clearTimeout(walkT);
  mood("hey");
  heyT = setTimeout(() => {
    mood("");
    timer = setTimeout(step, 2600 + getRandom(3000));
  }, 500);
}

function step() {
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
  let b = document.querySelector(".bub");
  if (!b) {
    b = document.createElement("div");
    b.className = "bub";
    document.body.appendChild(b);
  }
  b.innerHTML = `<div class="bubb"><span>${text}</span></div>`;
  // Anchor to the unicorn in viewport coordinates, then clamp horizontally so
  // the bubble never gets cut off at the edges of the play area / screen.
  // The layout may not be ready on the very first frame, so retry until it is.
  let tries = 0;
  const place = () => {
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
}

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
  const b = document.querySelector(".bub");
  if (b) {
    b.classList.add("out");
    setTimeout(() => b.remove(), 250);
  }
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
  gid("game").insertAdjacentHTML("beforeend", `<div id="msg"></div>`);
  elMsg = gid("msg");

  initBg();

  buildGrid();
  mood(""); // normal idle sprite state

  // Unicorn start: center, or first free cell if occupied
  uni = decoAt(31) ? [...Array(N).keys()].find((i) => !decoAt(i)) : 31;

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
    if (ds.m != null) {
      mode = mode === +ds.m ? 0 : +ds.m; // toggle Build/Remove off
      renderBar();
    } else if (ds.t != null) {
      selType = +ds.t;
      renderBar();
    } else if (ds.c != null && !t.disabled) {
      selColor = +ds.c;
      renderBar();
    }
  };

  renderAll();
  if (!S().unlocked && !S().seen) startIntro();
  else startPlay();
}
