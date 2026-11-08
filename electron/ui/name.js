const host = window.nameHost;

const titleEl = document.getElementById('title');
const inputEl = document.getElementById('name');
const hintEl = document.getElementById('hint');
const formEl = document.getElementById('form');
const btnDefault = document.getElementById('btn-default');
const btnCancel = document.getElementById('btn-cancel');
const btnSave = document.getElementById('btn-save');

const DEFAULT_HINT = "Letters, numbers, spaces, - and ' only.";
// Same rule as cleanPetName() in electron/settings.js (the main process re-checks it on save).
const NOT_ALLOWED = /[^\p{L}\p{M}\p{N} '\-]/gu;
let max = 16;

function setHint(text, isError = false) {
  hintEl.textContent = text;
  hintEl.style.color = isError ? '#c45b76' : '';
}

if (!host) {
  setHint('Something went wrong, please restart Pockito.', true);
  btnSave.disabled = true;
  btnDefault.disabled = true;
} else {
  host.getInfo().then((info) => {
    max = info.max || 16;
    inputEl.maxLength = max;
    inputEl.value = info.name || '';
    inputEl.placeholder = info.label;
    titleEl.textContent = info.name ? `Rename ${info.name}` : `Name your ${info.label.toLowerCase()}`;
    inputEl.focus();
    inputEl.select();
  }).catch(() => setHint('Could not load. Please close this window and try again.', true));
}

inputEl.addEventListener('input', () => {
  const cleaned = inputEl.value.replace(NOT_ALLOWED, '');
  if (cleaned !== inputEl.value) {
    inputEl.value = cleaned;
    setHint("Only letters, numbers, spaces, - and ' are allowed.", true);
  } else {
    setHint(DEFAULT_HINT);
  }
});

async function save(value) {
  btnSave.disabled = true;
  btnDefault.disabled = true;
  try {
    await host.save(value);
    host.close();
  } catch {
    setHint('Could not save. Please try again.', true);
    btnSave.disabled = false;
    btnDefault.disabled = false;
  }
}

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  if (host) save(inputEl.value);
});
btnDefault.addEventListener('click', () => host && save('')); // empty name = back to the default
btnCancel.addEventListener('click', () => host?.close());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') host?.close();
});
