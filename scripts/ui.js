const soundsCheckbox = document.getElementById("soundsCheckbox");

export function toggleSoundsCheckbox(isChecked) {
  soundsCheckbox.checked = isChecked;
}

export function onSoundsCheckboxChange(callback) {
  soundsCheckbox.onchange = callback;
}

function renderFavicon() {
  // Prism Paddock icon: the first tile (row 1, col 1) of images/sprites.png —
  // the unicorn sprite itself, transcribed pixel for pixel.
  const pixels = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 3, 4, 1, 5, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 1, 2, 1, 6, 1, 1, 5, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 1, 7, 1, 6, 6, 6, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 2, 5, 6, 6, 6, 1, 6, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 1, 8, 6, 6, 6, 1, 6, 6, 1, 0, 0],
    [0, 0, 1, 1, 0, 1, 9, 6, 6, 6, 6, 6, 6, 6, 6, 1, 0],
    [0, 1, 7, 2, 1, 1, 4, 6, 6, 6, 6, 6, 1, 6, 6, 1, 0],
    [0, 1, 5, 1, 6, 6, 6, 6, 6, 6, 6, 6, 6, 1, 1, 1, 0],
    [0, 1, 8, 1, 6, 6, 6, 6, 6, 6, 1, 6, 6, 6, 6, 1, 0],
    [0, 1, 9, 1, 6, 6, 6, 6, 6, 6, 6, 1, 1, 1, 1, 0, 0],
    [0, 1, 4, 1, 6, 6, 6, 6, 6, 6, 1, 0, 0, 0, 0, 0, 0],
    [0, 1, 3, 1, 6, 6, 1, 6, 6, 6, 1, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 1, 6, 1, 1, 1, 6, 6, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 6, 1, 0, 1, 6, 1, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
  ];

  const c = document.createElement("canvas");
  c.width = 17;
  c.height = 17;
  const ctx = c.getContext("2d");

  const colors = [
    "transparent",
    "#000000",
    "#ff0000",
    "#aa33ee",
    "#5555ff",
    "#ffff00",
    "#ffffff",
    "#ff7800",
    "#00ff00",
    "#3399ff",
  ];

  pixels.forEach((row, rowIndex) => {
    row.forEach((pixelValue, columnIndex) => {
      if (!pixelValue) return;
      ctx.fillStyle = colors[pixelValue];
      ctx.fillRect(columnIndex, rowIndex, 1, 1);
    });
  });

  favIcon.href = c.toDataURL();
}

export default async function init() {
  renderFavicon();
}
