/* ============================================================
   Fast-Reader — Main application logic
   ============================================================ */

// ── State ──────────────────────────────────────────────────
let words        = [];
let currentIndex = 0;
let wpm          = 300;
let isPlaying    = false;
let timerId      = null;
let fontFamily   = 'Georgia';
let fontSize     = 52;
let selectedFile = null;

// ── DOM refs ───────────────────────────────────────────────
const wordPrefix      = document.getElementById('wordPrefix');
const wordFocus       = document.getElementById('wordFocus');
const wordSuffix      = document.getElementById('wordSuffix');
const wordDisplay     = document.getElementById('wordDisplay');
const placeholderText = document.getElementById('placeholderText');
const progressBar     = document.getElementById('progressBar');
const wordCounter     = document.getElementById('wordCounter');
const timeEstimate    = document.getElementById('timeEstimate');
const errorMsg        = document.getElementById('errorMsg');
const btnPlay         = document.getElementById('btnPlay');
const btnRestart      = document.getElementById('btnRestart');
const btnStepBack     = document.getElementById('btnStepBack');
const btnStepFwd      = document.getElementById('btnStepFwd');
const iconPlay        = btnPlay.querySelector('.icon-play');
const iconPause       = btnPlay.querySelector('.icon-pause');
const wpmSlider       = document.getElementById('wpmSlider');
const wpmInput        = document.getElementById('wpmInput');
const fontSizeSlider  = document.getElementById('fontSizeSlider');
const fontSizeInput   = document.getElementById('fontSizeInput');

// ── Optimal Recognition Point ──────────────────────────────
// Returns the index of the focus letter within the word.
// Based on Spritz-style ORP: roughly at ~35% into the word.
function getORP(word) {
  const len = word.length;
  if (len <= 1) return 0;
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  if (len <= 13) return 3;
  return 4;
}

// ── Word rendering ─────────────────────────────────────────
function displayWord(word) {
  const orp   = getORP(word);
  const pre   = word.slice(0, orp);
  const focus = word[orp];
  const suf   = word.slice(orp + 1);

  wordPrefix.textContent = pre;
  wordFocus.textContent  = focus;
  wordSuffix.textContent = suf;
}

function updateProgress() {
  const total = words.length;
  const pct   = total > 0 ? (currentIndex / total) * 100 : 0;
  progressBar.style.width = pct + '%';
  wordCounter.textContent = `${currentIndex} / ${total}`;

  // Remaining time estimate
  const remaining = total - currentIndex;
  const mins = remaining / wpm;
  if (mins < 1) {
    timeEstimate.textContent = `< 1 min left`;
  } else {
    const m = Math.floor(mins);
    const s = Math.round((mins - m) * 60);
    timeEstimate.textContent = s > 0 ? `~${m}m ${s}s left` : `~${m}m left`;
  }
}

// ── Playback engine ────────────────────────────────────────
// Recursive setTimeout so WPM changes take effect on the next word.
function tick() {
  if (!isPlaying || currentIndex >= words.length) {
    if (currentIndex >= words.length && words.length > 0) {
      // Reached the end
      isPlaying = false;
      updatePlayButton();
      wordCounter.textContent = `${words.length} / ${words.length}`;
      progressBar.style.width = '100%';
      timeEstimate.textContent = 'Done!';
    }
    return;
  }

  displayWord(words[currentIndex]);
  currentIndex++;
  updateProgress();

  timerId = setTimeout(tick, 60000 / wpm);
}

function play() {
  if (words.length === 0) return;
  if (currentIndex >= words.length) currentIndex = 0; // auto-restart at end
  isPlaying = true;
  updatePlayButton();
  placeholderText.style.display = 'none';
  tick();
}

function pause() {
  isPlaying = false;
  clearTimeout(timerId);
  timerId = null;
  updatePlayButton();
}

function togglePlay() {
  if (isPlaying) pause(); else play();
}

function restart() {
  pause();
  currentIndex = 0;
  if (words.length > 0) {
    displayWord(words[0]);
    updateProgress();
    placeholderText.style.display = 'none';
  }
}

function stepBack() {
  pause();
  if (currentIndex > 1) currentIndex -= 2;
  else currentIndex = 0;
  if (words.length > 0) {
    displayWord(words[currentIndex]);
    currentIndex++;
    updateProgress();
  }
}

function stepForward() {
  pause();
  if (currentIndex < words.length - 1) {
    displayWord(words[currentIndex]);
    currentIndex++;
    updateProgress();
  }
}

function updatePlayButton() {
  if (isPlaying) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  }
}

// ── Progress bar seek ──────────────────────────────────────
function seekTo(event) {
  if (words.length === 0) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const idx  = Math.floor(pct * words.length);
  currentIndex = idx;
  if (words.length > 0) {
    displayWord(words[Math.min(idx, words.length - 1)]);
    updateProgress();
    placeholderText.style.display = 'none';
  }
  if (isPlaying) {
    clearTimeout(timerId);
    tick();
  }
}

// ── Settings ───────────────────────────────────────────────
function updateWPM(value) {
  const val = Math.max(100, Math.min(1200, parseInt(value) || 300));
  wpm = val;
  wpmSlider.value = val;
  wpmInput.value  = val;
  updateProgress();
}

function updateFont() {
  fontFamily = document.getElementById('fontSelect').value;
  applyFontStyle();
}

function updateFontSize(value) {
  const val = Math.max(24, Math.min(96, parseInt(value) || 52));
  fontSize = val;
  fontSizeSlider.value = val;
  fontSizeInput.value  = val;
  applyFontStyle();
}

function applyFontStyle() {
  wordDisplay.style.fontFamily = fontFamily;
  wordDisplay.style.fontSize   = fontSize + 'px';
}

// ── Word loading helpers ───────────────────────────────────
function onWordsLoaded(data) {
  words        = data.words;
  currentIndex = 0;

  // Show first word paused
  placeholderText.style.display = 'none';
  displayWord(words[0]);
  updateProgress();

  // Enable controls
  btnPlay.disabled     = false;
  btnRestart.disabled  = false;
  btnStepBack.disabled = false;
  btnStepFwd.disabled  = false;

  showError(null);
}

function showError(msg) {
  if (msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
  } else {
    errorMsg.classList.add('hidden');
  }
}

// ── Tab switching ──────────────────────────────────────────
function switchTab(tab) {
  document.getElementById('tabText').classList.toggle('active', tab === 'text');
  document.getElementById('tabPdf').classList.toggle('active', tab === 'pdf');
  document.getElementById('panelText').classList.toggle('hidden', tab !== 'text');
  document.getElementById('panelPdf').classList.toggle('hidden', tab !== 'pdf');
  showError(null);
}

// ── Text input ─────────────────────────────────────────────
async function loadText() {
  const text = document.getElementById('textInput').value.trim();
  if (!text) { showError('Please paste some text first.'); return; }

  try {
    const res  = await fetch('/api/upload-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) { showError(data.detail || 'Failed to load text.'); return; }
    onWordsLoaded(data);
  } catch (e) {
    showError('Network error: ' + e.message);
  }
}

// ── PDF input ──────────────────────────────────────────────
function loadPDF(file) {
  if (!file) return;
  selectedFile = file;
  document.getElementById('uploadFilename').textContent = file.name;
  document.getElementById('loadPdfBtn').disabled = false;
}

async function submitPDF() {
  if (!selectedFile) { showError('Please select a PDF file.'); return; }

  const formData = new FormData();
  formData.append('file', selectedFile);

  try {
    const res  = await fetch('/api/upload-pdf', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) { showError(data.detail || 'Failed to parse PDF.'); return; }
    onWordsLoaded(data);
  } catch (e) {
    showError('Network error: ' + e.message);
  }
}

// ── Drag-and-drop for PDF area ─────────────────────────────
const uploadArea = document.getElementById('uploadArea');

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.name.toLowerCase().endsWith('.pdf')) {
    loadPDF(file);
    // auto-switch to PDF tab
    switchTab('pdf');
  } else {
    showError('Please drop a PDF file.');
  }
});

// ── Keyboard shortcuts ─────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Don't fire when typing in textarea or inputs
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

  switch (e.key) {
    case ' ':
    case 'k':
      e.preventDefault();
      togglePlay();
      break;
    case 'r':
    case 'R':
      e.preventDefault();
      restart();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      stepBack();
      break;
    case 'ArrowRight':
      e.preventDefault();
      stepForward();
      break;
    case 'ArrowUp':
      e.preventDefault();
      updateWPM(wpm + 50);
      break;
    case 'ArrowDown':
      e.preventDefault();
      updateWPM(wpm - 50);
      break;
  }
});

// ── Init ───────────────────────────────────────────────────
applyFontStyle();
