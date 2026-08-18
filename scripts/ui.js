const soundsCheckbox = document.getElementById("soundsCheckbox");

export function toggleSoundsCheckbox(isChecked) {
  soundsCheckbox.checked = isChecked;
}

export function onSoundsCheckboxChange(callback) {
  soundsCheckbox.onchange = callback;
}
