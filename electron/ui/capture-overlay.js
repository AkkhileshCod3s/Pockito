const host = window.captureHost;

const bgImg = document.getElementById('bg-image');
const dimTop = document.getElementById('dim-top');
const dimBottom = document.getElementById('dim-bottom');
const dimLeft = document.getElementById('dim-left');
const dimRight = document.getElementById('dim-right');
const box = document.getElementById('selection-box');
const sizeLabel = document.getElementById('size-label');
const hintPill = document.getElementById('hint-pill');

let isDrawing = false;
let startX = 0;
let startY = 0;
let sel = { x: 0, y: 0, width: 0, height: 0 };

function updateLayout() {
  const W = window.innerWidth;
  const H = window.innerHeight;

  if (sel.width < 1 || sel.height < 1) {
    box.classList.add('hidden');
    dimTop.style.top = '0px';
    dimTop.style.left = '0px';
    dimTop.style.width = `${W}px`;
    dimTop.style.height = `${H}px`;
    dimBottom.style.width = '0px';
    dimLeft.style.width = '0px';
    dimRight.style.width = '0px';
    return;
  }

  box.classList.remove('hidden');
  box.style.left = `${sel.x}px`;
  box.style.top = `${sel.y}px`;
  box.style.width = `${sel.width}px`;
  box.style.height = `${sel.height}px`;

  sizeLabel.textContent = `${Math.round(sel.width)} × ${Math.round(sel.height)}`;

  // Dimming panels around selection
  dimTop.style.top = '0px';
  dimTop.style.left = '0px';
  dimTop.style.width = `${W}px`;
  dimTop.style.height = `${sel.y}px`;

  dimBottom.style.top = `${sel.y + sel.height}px`;
  dimBottom.style.left = '0px';
  dimBottom.style.width = `${W}px`;
  dimBottom.style.height = `${Math.max(0, H - (sel.y + sel.height))}px`;

  dimLeft.style.top = `${sel.y}px`;
  dimLeft.style.left = '0px';
  dimLeft.style.width = `${sel.x}px`;
  dimLeft.style.height = `${sel.height}px`;

  dimRight.style.top = `${sel.y}px`;
  dimRight.style.left = `${sel.x + sel.width}px`;
  dimRight.style.width = `${Math.max(0, W - (sel.x + sel.width))}px`;
  dimRight.style.height = `${sel.height}px`;
}

// Load frozen background image
async function init() {
  updateLayout();
  try {
    const dataUrl = await host?.getScreenImage();
    if (dataUrl) {
      bgImg.src = dataUrl;
    }
  } catch (err) {
    console.error('Failed to load screen image:', err);
  }
}

window.addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    // Right click cancels
    e.preventDefault();
    host?.cancelSelection();
    return;
  }
  if (e.button !== 0) return;

  isDrawing = true;
  startX = e.clientX;
  startY = e.clientY;
  sel = { x: startX, y: startY, width: 0, height: 0 };
  hintPill?.classList.add('hidden');
  updateLayout();
});

window.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;

  const curX = e.clientX;
  const curY = e.clientY;

  const x = Math.min(startX, curX);
  const y = Math.min(startY, curY);
  const width = Math.abs(curX - startX);
  const height = Math.abs(curY - startY);

  sel = { x, y, width, height };
  updateLayout();
});

function finishSelection() {
  if (!isDrawing) return;
  isDrawing = false;
  // If selection is too small (<10px), reset
  if (sel.width < 10 || sel.height < 10) {
    sel = { x: 0, y: 0, width: 0, height: 0 };
    hintPill?.classList.remove('hidden');
    updateLayout();
  }
}

window.addEventListener('mouseup', finishSelection);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    host?.cancelSelection();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (sel.width >= 10 && sel.height >= 10) {
      host?.confirmSelection(sel);
    }
  }
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  host?.cancelSelection();
});

init();
