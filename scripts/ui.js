const soundsCheckbox = document.getElementById("soundsCheckbox");

export function toggleSoundsCheckbox(isChecked) {
  soundsCheckbox.checked = isChecked;
}

export function onSoundsCheckboxChange(callback) {
  soundsCheckbox.onchange = callback;
}

function renderFavicon() {
  // TODO: replace with your own favicon if needed
  const pixels = [
    [0, 0, 0, 0, 1, 1, 1, 1],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 2, 2, 2, 1, 1, 2, 2, 2, 1],
    [0, 1, 2, 2, 2, 1, 1, 2, 2, 2, 1],
    [0, 1, 2, 2, 1, 1, 1, 1, 2, 2, 1],
    [1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1],
    [1, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 1],
    [0, 1, 2, 1, 2, 1, 1, 2, 1, 2, 1],
    [0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [0, 0, 1, 2, 1, 2, 2, 1, 2, 1],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 1, 1, 1, 1, 1, 1],
  ];

  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext("2d");

  const colors = ["transparent", "#fff", "#3f2631"];

  pixels.forEach((row, rowIndex) => {
    row.forEach((pixelValue, columnIndex) => {
      ctx.fillStyle = colors[pixelValue];
      ctx.fillRect(columnIndex + 2, rowIndex, 1, 1);
    });
  });

  favIcon.href = c.toDataURL();
}

export default async function init() {
  renderFavicon();
}
