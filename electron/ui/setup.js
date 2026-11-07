const host = window.setupHost;

const bannerEl = document.getElementById('banner');
const logoImg = document.getElementById('logo-img');
const keyInput = document.getElementById('key-input');
const btnToggleVis = document.getElementById('btn-toggle-vis');
const btnGetKey = document.getElementById('btn-get-key');
const btnCopyUrl = document.getElementById('btn-copy-url');
const statusMsg = document.getElementById('status-msg');
const form = document.getElementById('setup-form');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const btnDelete = document.getElementById('btn-delete');
const sparkleContainer = document.getElementById('sparkle-container');

function showStatus(text, type = 'info') {
  statusMsg.textContent = text;
  statusMsg.className = `status-msg ${type}`;
}

function clearStatus() {
  statusMsg.textContent = '';
  statusMsg.className = 'status-msg hidden';
}

function measureAndReportSize() {
  const container = document.querySelector('.setup-container');
  if (container && host?.reportSize) {
    const rect = container.getBoundingClientRect();
    const h = Math.ceil(rect.height + 16);
    host.reportSize(440, Math.max(420, Math.min(560, h)));
  }
}

// Check for missing preload bridge
if (!host) {
  bannerEl.textContent = 'Something went wrong, please restart Pockito';
  bannerEl.classList.remove('hidden');
  if (btnSave) btnSave.disabled = true;
  if (btnGetKey) btnGetKey.disabled = true;
  if (btnCopyUrl) btnCopyUrl.disabled = true;
}

// Display reason banner if opened with one
const params = new URLSearchParams(window.location.search);
const reason = params.get('reason');
if (reason && host) {
  if (reason.includes('429') || reason.toLowerCase().includes('rate limit') || reason.toLowerCase().includes('quota')) {
    bannerEl.textContent = 'Groq rate limit or quota reached. Free tier quotas apply across your entire account, so a new key from the same account will not reset it. You can wait for the reset or switch accounts.';
  } else if (reason.includes('401') || reason.toLowerCase().includes('invalid')) {
    bannerEl.textContent = 'Your Groq API key was rejected (401). Please check and re-enter a valid key.';
  } else {
    bannerEl.textContent = reason;
  }
  bannerEl.classList.remove('hidden');
}

// Initial status load
async function init() {
  if (!host) return;
  try {
    const status = await host.getStatus();
    if (status && status.hasKey) {
      keyInput.placeholder = '•••••••••••••••• (Saved key)';
      btnDelete.classList.remove('hidden');
      btnSave.textContent = 'Save & Continue';
    } else {
      btnDelete.classList.add('hidden');
      btnSave.textContent = 'Save & Continue';
    }
  } catch (err) {
    showStatus('Failed to load status: ' + (err.message || 'Unknown error'), 'error');
  }

  // Report size to main process
  requestAnimationFrame(measureAndReportSize);
  window.addEventListener('resize', measureAndReportSize);
}

btnToggleVis?.addEventListener('click', () => {
  try {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  } catch (err) {
    console.error('Toggle visibility error:', err);
  }
});

btnGetKey?.addEventListener('click', () => {
  try {
    if (host?.openKeysPage) {
      host.openKeysPage();
    } else {
      window.open('https://console.groq.com/keys', '_blank');
    }
  } catch (err) {
    showStatus('Could not open browser: ' + (err.message || 'Unknown error'), 'error');
  }
});

btnCopyUrl?.addEventListener('click', async () => {
  try {
    if (host?.copyLink) {
      await host.copyLink('https://console.groq.com/keys');
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText('https://console.groq.com/keys');
    }
    const oldText = btnCopyUrl.textContent;
    btnCopyUrl.textContent = 'Copied!';
    setTimeout(() => {
      btnCopyUrl.textContent = oldText;
    }, 1800);
  } catch (err) {
    showStatus('Could not copy link: ' + (err.message || 'Unknown error'), 'error');
  }
});

btnCancel?.addEventListener('click', () => {
  try {
    if (host?.close) {
      host.close();
    } else {
      window.close();
    }
  } catch {
    window.close();
  }
});

btnDelete?.addEventListener('click', async () => {
  try {
    if (!confirm('Are you sure you want to remove your saved Groq API key? AI features will be disabled.')) {
      return;
    }
    btnDelete.disabled = true;
    await host?.deleteKey();
    keyInput.value = '';
    keyInput.placeholder = 'gsk_...';
    btnDelete.classList.add('hidden');
    showStatus('API key removed. AI features disabled.', 'info');
  } catch (err) {
    showStatus(err.message || 'Failed to delete key.', 'error');
  } finally {
    btnDelete.disabled = false;
  }
});

async function submitForm() {
  if (!host) {
    showStatus('Something went wrong, please restart Pockito', 'error');
    return;
  }

  const val = keyInput.value.trim();
  if (!val) {
    showStatus('Please enter your Groq API key.', 'error');
    keyInput.focus();
    return;
  }

  if (!val.startsWith('gsk_') && val.length < 20) {
    showStatus("Groq keys usually start with 'gsk_'. Please check your key.", 'error');
    keyInput.focus();
    return;
  }

  clearStatus();
  btnSave.disabled = true;
  keyInput.disabled = true;
  btnSave.textContent = 'Checking your key…';
  showStatus('Checking your key with Groq…', 'info');

  try {
    const res = await host.testAndSave(val);
    if (res && res.success) {
      showStatus('Success! Key verified.', 'success');
      btnSave.textContent = 'Verified!';

      if (sparkleContainer) {
        sparkleContainer.classList.remove('hidden');
        sparkleContainer.classList.add('sparkle-burst');
      }
      if (logoImg) {
        logoImg.classList.add('wiggle');
      }

      setTimeout(() => {
        try {
          host.close();
        } catch {
          window.close();
        }
      }, 700);
    } else {
      const errMsg = res?.error || 'Failed to validate API key. Please check your key.';
      showStatus(errMsg, 'error');
      btnSave.disabled = false;
      keyInput.disabled = false;
      btnSave.textContent = 'Save & Continue';
    }
  } catch (err) {
    showStatus(err.message || 'Error testing key.', 'error');
    btnSave.disabled = false;
    keyInput.disabled = false;
    btnSave.textContent = 'Save & Continue';
  }
}

form?.addEventListener('submit', (e) => {
  e.preventDefault();
  submitForm();
});

btnSave?.addEventListener('click', (e) => {
  e.preventDefault();
  submitForm();
});

init();
