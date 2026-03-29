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
let paraGapEnabled    = true;
let paraGapMultiplier = 2;

// Variable speed state
let variableSpeedEnabled = false;
let minWpm           = 300;
let maxWpm           = 700;
let rampRate         = 50;    // WPM increase per minute
let variableElapsed  = 0;    // accumulated reading minutes (excludes pauses)
let variableStartTime = null; // Date.now() when play started/resumed
let effectiveWpm     = 300;

// PDF page state
let pages       = [];   // [{start_index, thumbnail, thumbnail_hires}, ...]
let currentPage = 0;
let isPdfMode   = false;

// Audio state
let audioEl       = null;  // HTMLAudioElement
let audioPlaying  = false;
let audioObjectURL = null;

// Fullscreen line-preview context window (words on each side of current word)
const FS_LINE_WINDOW = 8;
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
const pdfNav          = document.getElementById('pdfNav');
const pdfThumbnail    = document.getElementById('pdfThumbnail');
const pdfPageLabel    = document.getElementById('pdfPageLabel');
const pdfZoomModal    = document.getElementById('pdfZoomModal');
const pdfZoomImage    = document.getElementById('pdfZoomImage');
const currentWpmDisplay = document.getElementById('currentWpmDisplay');

// Fullscreen DOM refs
const fsOverlay         = document.getElementById('fsOverlay');
const fsWordPrefix      = document.getElementById('fsWordPrefix');
const fsWordFocus       = document.getElementById('fsWordFocus');
const fsWordSuffix      = document.getElementById('fsWordSuffix');
const fsWordDisplay     = document.getElementById('fsWordDisplay');
const fsProgressBar     = document.getElementById('fsProgressBar');
const fsWordCounter     = document.getElementById('fsWordCounter');
const fsTimeEstimate    = document.getElementById('fsTimeEstimate');
const fsCurrentWpmDisplay = document.getElementById('fsCurrentWpmDisplay');
const fsBtnPlay         = document.getElementById('fsBtnPlay');
const fsBtnRestart      = document.getElementById('fsBtnRestart');
const fsBtnStepBack     = document.getElementById('fsBtnStepBack');
const fsBtnStepFwd      = document.getElementById('fsBtnStepFwd');
const fsBtnIconPlay     = fsBtnPlay.querySelector('.icon-play');
const fsBtnIconPause    = fsBtnPlay.querySelector('.icon-pause');
const fsWpmSlider       = document.getElementById('fsWpmSlider');
const fsWpmInput        = document.getElementById('fsWpmInput');
const fsLinePreview     = document.getElementById('fsLinePreview');
const fsFontSelect      = document.getElementById('fsFontSelect');
const fsFontSizeSlider  = document.getElementById('fsFontSizeSlider');
const fsFontSizeInput   = document.getElementById('fsFontSizeInput');
const fsAudioPlayerRow  = document.getElementById('fsAudioPlayerRow');
const fsAudioFilename   = document.getElementById('fsAudioFilename');
const fsAudioVolume     = document.getElementById('fsAudioVolume');
const fsPdfPanel        = document.getElementById('fsPdfPanel');
const fsPdfThumbnail    = document.getElementById('fsPdfThumbnail');
const fsPdfPageLabel    = document.getElementById('fsPdfPageLabel');

// ── Optimal Recognition Point ──────────────────────────────
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

  // Mirror to fullscreen display
  fsWordPrefix.textContent = pre;
  fsWordFocus.textContent  = focus;
  fsWordSuffix.textContent = suf;

  updateLinePreview();
}

function getEffectiveWpm() {
  if (variableSpeedEnabled && variableStartTime !== null) {
    const elapsedMin = variableElapsed + (Date.now() - variableStartTime) / 60000;
    effectiveWpm = Math.min(minWpm + rampRate * elapsedMin, maxWpm);
    return effectiveWpm;
  }
  if (variableSpeedEnabled) {
    const elapsedMin = variableElapsed;
    effectiveWpm = Math.min(minWpm + rampRate * elapsedMin, maxWpm);
    return effectiveWpm;
  }
  return wpm;
}

function updateProgress() {
  const total = words.length;
  const pct   = total > 0 ? (currentIndex / total) * 100 : 0;
  progressBar.style.width = pct + '%';
  fsProgressBar.style.width = pct + '%';
  wordCounter.textContent = `${currentIndex} / ${total}`;
  fsWordCounter.textContent = `${currentIndex} / ${total}`;

  const currentWpm = getEffectiveWpm();

  // Update live WPM display
  if (variableSpeedEnabled) {
    currentWpmDisplay.textContent = Math.round(currentWpm) + ' WPM';
    fsCurrentWpmDisplay.textContent = Math.round(currentWpm) + ' WPM';
  }

  // Remaining time estimate
  const remaining = total - currentIndex;
  const mins = remaining / currentWpm;
  let timeText;
  if (mins < 1) {
    timeText = `< 1 min left`;
  } else {
    const m = Math.floor(mins);
    const s = Math.round((mins - m) * 60);
    timeText = s > 0 ? `~${m}m ${s}s left` : `~${m}m left`;
  }
  timeEstimate.textContent = timeText;
  fsTimeEstimate.textContent = timeText;

  updatePagePreview();
}

// ── Playback engine ────────────────────────────────────────
function tick() {
  if (!isPlaying || currentIndex >= words.length) {
    if (currentIndex >= words.length && words.length > 0) {
      isPlaying = false;
      updatePlayButton();
      wordCounter.textContent = `${words.length} / ${words.length}`;
      progressBar.style.width = '100%';
      timeEstimate.textContent = 'Done!';
    }
    return;
  }

  const token = words[currentIndex];
  const currentWpm = getEffectiveWpm();
  const interval = 60000 / currentWpm;

  // Update live WPM display
  if (variableSpeedEnabled) {
    currentWpmDisplay.textContent = Math.round(currentWpm) + ' WPM';
  }

  // Paragraph break: insert a longer pause, skip the sentinel
  if (token === '__PARA__' && paraGapEnabled) {
    currentIndex++;
    updateProgress();
    timerId = setTimeout(tick, interval * paraGapMultiplier);
    return;
  }
  // If gap disabled, just skip the sentinel silently
  if (token === '__PARA__') {
    currentIndex++;
    tick();
    return;
  }

  displayWord(token);
  currentIndex++;
  updateProgress();

  timerId = setTimeout(tick, interval);
}

function play() {
  if (words.length === 0) return;
  if (currentIndex >= words.length) currentIndex = 0;
  isPlaying = true;
  updatePlayButton();
  placeholderText.style.display = 'none';

  // Variable speed: start/resume timing
  if (variableSpeedEnabled) {
    variableStartTime = Date.now();
  }

  tick();
}

function pause() {
  isPlaying = false;
  clearTimeout(timerId);
  timerId = null;
  updatePlayButton();

  // Variable speed: accumulate elapsed time
  if (variableSpeedEnabled && variableStartTime !== null) {
    variableElapsed += (Date.now() - variableStartTime) / 60000;
    variableStartTime = null;
  }
}

function togglePlay() {
  if (isPlaying) pause(); else play();
}

function restart() {
  pause();
  currentIndex = 0;
  variableElapsed = 0;
  variableStartTime = null;
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
  while (currentIndex > 0 && words[currentIndex] === '__PARA__') currentIndex--;
  if (words.length > 0 && currentIndex < words.length) {
    displayWord(words[currentIndex]);
    currentIndex++;
    updateProgress();
  }
}

function stepForward() {
  pause();
  while (currentIndex < words.length && words[currentIndex] === '__PARA__') currentIndex++;
  if (currentIndex < words.length) {
    displayWord(words[currentIndex]);
    currentIndex++;
    updateProgress();
  }
}

function updatePlayButton() {
  if (isPlaying) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
    fsBtnIconPlay.classList.add('hidden');
    fsBtnIconPause.classList.remove('hidden');
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
    fsBtnIconPlay.classList.remove('hidden');
    fsBtnIconPause.classList.add('hidden');
  }
}

// ── Progress bar seek ──────────────────────────────────────
function seekTo(event) {
  if (words.length === 0) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  let idx  = Math.floor(pct * words.length);
  while (idx < words.length && words[idx] === '__PARA__') idx++;
  currentIndex = idx;
  if (currentIndex < words.length) {
    displayWord(words[currentIndex]);
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
  fsWpmSlider.value = val;
  fsWpmInput.value  = val;
  updateProgress();
}

function updateFont(value) {
  fontFamily = value;
  document.getElementById('fontSelect').value = value;
  fsFontSelect.value = value;
  applyFontStyle();
}

function updateFontSize(value) {
  const val = Math.max(24, Math.min(96, parseInt(value) || 52));
  fontSize = val;
  fontSizeSlider.value   = val;
  fontSizeInput.value    = val;
  fsFontSizeSlider.value = val;
  fsFontSizeInput.value  = val;
  applyFontStyle();
}

function applyFontStyle() {
  wordDisplay.style.fontFamily   = fontFamily;
  wordDisplay.style.fontSize     = fontSize + 'px';
  fsWordDisplay.style.fontFamily = fontFamily;
  fsWordDisplay.style.fontSize   = fontSize + 'px';
}

// ── Paragraph gap ──────────────────────────────────────────
function toggleParaGap(enabled) {
  paraGapEnabled = enabled;
  document.getElementById('paraGapLabel').textContent = enabled ? 'On' : 'Off';
  const sliderRow = document.getElementById('paraGapSliderRow');
  const slider = document.getElementById('paraGapSlider');
  if (enabled) {
    slider.disabled = false;
    sliderRow.style.opacity = '1';
  } else {
    slider.disabled = true;
    sliderRow.style.opacity = '0.35';
  }
}

function updateParaGapMultiplier(value) {
  const val = Math.max(1, Math.min(10, parseFloat(value) || 3));
  paraGapMultiplier = val;
  document.getElementById('paraGapSlider').value = val;
  document.getElementById('paraGapValue').textContent = val + 'x';
}

// ── Variable speed ─────────────────────────────────────────
function toggleVariableSpeed(enabled) {
  variableSpeedEnabled = enabled;
  document.getElementById('variableSpeedLabel').textContent = enabled ? 'On' : 'Off';
  document.getElementById('variableSpeedSettings').classList.toggle('hidden', !enabled);

  // Disable (not hide) the fixed-speed controls when variable speed is active
  const wpmGroup = document.getElementById('wpmSettingGroup');
  wpmGroup.classList.toggle('setting-group--disabled', enabled);
  wpmSlider.disabled = enabled;
  wpmInput.disabled  = enabled;

  // Sync fullscreen fixed-speed controls
  const fsSpeedGroup = document.getElementById('fsSpeedGroup');
  fsSpeedGroup.classList.toggle('setting-group--disabled', enabled);
  fsWpmSlider.disabled = enabled;
  fsWpmInput.disabled  = enabled;

  currentWpmDisplay.classList.toggle('hidden', !enabled);
  fsCurrentWpmDisplay.classList.toggle('hidden', !enabled);

  // Reset variable speed timing
  variableElapsed = 0;
  variableStartTime = null;
  effectiveWpm = enabled ? minWpm : wpm;

  if (enabled) {
    currentWpmDisplay.textContent = Math.round(effectiveWpm) + ' WPM';
    fsCurrentWpmDisplay.textContent = Math.round(effectiveWpm) + ' WPM';
  }
}

function updateMinWpm(value) {
  minWpm = Math.max(50, Math.min(maxWpm - 10, parseInt(value) || 200));
  document.getElementById('minWpmSlider').value = minWpm;
  document.getElementById('minWpmInput').value = minWpm;
}

function updateMaxWpm(value) {
  maxWpm = Math.max(minWpm + 10, Math.min(1200, parseInt(value) || 600));
  document.getElementById('maxWpmSlider').value = maxWpm;
  document.getElementById('maxWpmInput').value = maxWpm;
}

function updateRampRate(value) {
  rampRate = Math.max(5, Math.min(200, parseInt(value) || 50));
  document.getElementById('rampRateSlider').value = rampRate;
  document.getElementById('rampRateInput').value = rampRate;
}

// ── Fullscreen mode ─────────────────────────────────────────
function updateLinePreview() {
  if (words.length === 0) {
    fsLinePreview.innerHTML = '<span class="fs-line-placeholder">—</span>';
    return;
  }

  const WINDOW = FS_LINE_WINDOW; // real words on each side
  const displayIdx = Math.max(0, currentIndex - 1);

  // Find start: go back WINDOW real words
  let start = displayIdx;
  let count = 0;
  while (start > 0 && count < WINDOW) {
    start--;
    if (words[start] !== '__PARA__') count++;
  }

  // Find end: go forward WINDOW real words
  let end = displayIdx;
  count = 0;
  while (end < words.length - 1 && count < WINDOW) {
    end++;
    if (words[end] !== '__PARA__') count++;
  }

  // Build span elements
  fsLinePreview.innerHTML = '';
  for (let i = start; i <= end; i++) {
    if (words[i] === '__PARA__') continue;
    const span = document.createElement('span');
    span.className = 'fs-line-word' + (i === displayIdx ? ' fs-current-word' : '');
    span.textContent = words[i];
    fsLinePreview.appendChild(span);
  }
}

function enterFullscreen() {
  // Sync WPM sliders
  fsWpmSlider.value = wpm;
  fsWpmInput.value  = wpm;

  // Sync variable speed state in header
  const fsSpeedGroup = document.getElementById('fsSpeedGroup');
  fsSpeedGroup.classList.toggle('setting-group--disabled', variableSpeedEnabled);
  fsWpmSlider.disabled = variableSpeedEnabled;
  fsWpmInput.disabled  = variableSpeedEnabled;
  fsCurrentWpmDisplay.classList.toggle('hidden', !variableSpeedEnabled);
  if (variableSpeedEnabled) {
    fsCurrentWpmDisplay.textContent = Math.round(getEffectiveWpm()) + ' WPM';
  }

  // Sync font controls
  fsFontSelect.value      = document.getElementById('fontSelect').value;
  fsFontSizeSlider.value  = fontSize;
  fsFontSizeInput.value   = fontSize;

  // Sync audio: volume slider; show player row only if audio loaded
  if (audioEl) {
    fsAudioVolume.value = document.getElementById('audioVolume').value;
    fsAudioPlayerRow.classList.remove('hidden');
    fsAudioFilename.textContent =
      document.getElementById('audioFilename').textContent;
    updateAudioButton();
  }

  // Sync font styles
  applyFontStyle();

  // Show / hide PDF panel and sync initial thumbnail
  if (isPdfMode && pages.length > 0) {
    fsPdfThumbnail.src = pages[currentPage].thumbnail;
    fsPdfPageLabel.textContent = `Page ${currentPage + 1} / ${pages.length}`;
    fsPdfPanel.classList.remove('hidden');
  } else {
    fsPdfPanel.classList.add('hidden');
  }

  // Update line preview
  updateLinePreview();

  // Show the overlay
  fsOverlay.classList.remove('hidden');

  // Request native fullscreen when supported
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function exitFullscreen() {
  fsOverlay.classList.add('hidden');
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

// Exit fullscreen when browser native fullscreen is exited (e.g. Esc key)
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    fsOverlay.classList.add('hidden');
  }
});

// ── Word loading helpers ───────────────────────────────────
function onWordsLoaded(data) {
  words        = data.words;
  currentIndex = 0;

  // Reset variable speed timing
  variableElapsed = 0;
  variableStartTime = null;

  // PDF mode detection
  if (data.pages && data.pages.length > 0) {
    pages = data.pages;
    isPdfMode = true;
    currentPage = 0;
    pdfNav.classList.remove('hidden');
    fsPdfPanel.classList.remove('hidden');
  } else {
    pages = [];
    isPdfMode = false;
    currentPage = 0;
    pdfNav.classList.add('hidden');
    fsPdfPanel.classList.add('hidden');
  }

  // Show first word paused
  placeholderText.style.display = 'none';
  displayWord(words[0]);
  updateProgress();

  // Enable controls
  btnPlay.disabled     = false;
  btnRestart.disabled  = false;
  btnStepBack.disabled = false;
  btnStepFwd.disabled  = false;
  fsBtnPlay.disabled     = false;
  fsBtnRestart.disabled  = false;
  fsBtnStepBack.disabled = false;
  fsBtnStepFwd.disabled  = false;

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
    switchTab('pdf');
  } else {
    showError('Please drop a PDF file.');
  }
});

// ── Keyboard shortcuts ─────────────────────────────────────
document.addEventListener('keydown', (e) => {
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
    case 'PageDown':
      e.preventDefault();
      if (isPdfMode) goToNextPage(); else goToNextPara();
      break;
    case 'PageUp':
      e.preventDefault();
      if (isPdfMode) goToPrevPage(); else goToPrevPara();
      break;
    case 'f':
    case 'F':
      e.preventDefault();
      if (fsOverlay.classList.contains('hidden')) {
        enterFullscreen();
      } else {
        exitFullscreen();
      }
      break;
    case 'Escape':
      if (!fsOverlay.classList.contains('hidden')) {
        exitFullscreen();
      }
      closePdfZoom();
      break;
  }
});

// ── Audio player ───────────────────────────────────────────
function loadAudio(file) {
  if (!file) return;
  if (audioObjectURL) URL.revokeObjectURL(audioObjectURL);
  if (audioEl) {
    audioEl.pause();
    audioEl = null;
    audioPlaying = false;
  }

  audioObjectURL = URL.createObjectURL(file);
  audioEl = new Audio(audioObjectURL);
  audioEl.loop = document.getElementById('audioLoopToggle').checked;
  audioEl.volume = parseFloat(document.getElementById('audioVolume').value);

  audioEl.addEventListener('ended', () => {
    if (!audioEl.loop) {
      audioPlaying = false;
      updateAudioButton();
    }
  });

  // Sync main audio section
  document.getElementById('audioFilename').textContent = file.name;
  document.getElementById('audioPlayerRow').classList.remove('hidden');

  // Sync fullscreen audio section
  fsAudioFilename.textContent = file.name;
  fsAudioPlayerRow.classList.remove('hidden');
  // Keep volume slider in sync
  fsAudioVolume.value = document.getElementById('audioVolume').value;

  audioPlaying = false;
  updateAudioButton();
}

function toggleAudio() {
  if (!audioEl) return;
  if (audioPlaying) {
    audioEl.pause();
    audioPlaying = false;
  } else {
    audioEl.play();
    audioPlaying = true;
  }
  updateAudioButton();
}

function updateAudioButton() {
  const btn = document.getElementById('btnAudioPlay');
  const iconPlay  = btn.querySelector('.audio-icon-play');
  const iconPause = btn.querySelector('.audio-icon-pause');
  if (audioPlaying) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  }

  // Sync fullscreen audio button
  const fsBtn = document.getElementById('fsBtnAudioPlay');
  const fsIconPlay  = fsBtn.querySelector('.audio-icon-play');
  const fsIconPause = fsBtn.querySelector('.audio-icon-pause');
  if (audioPlaying) {
    fsIconPlay.classList.add('hidden');
    fsIconPause.classList.remove('hidden');
  } else {
    fsIconPlay.classList.remove('hidden');
    fsIconPause.classList.add('hidden');
  }
}

function setAudioVolume(value) {
  if (audioEl) audioEl.volume = parseFloat(value);
  // Keep both volume sliders in sync
  document.getElementById('audioVolume').value = value;
  fsAudioVolume.value = value;
}

function setAudioLoop(enabled) {
  if (audioEl) audioEl.loop = enabled;
}

// ── PDF page tracking ──────────────────────────────────────
function getCurrentPage(index) {
  let lo = 0, hi = pages.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (pages[mid].start_index <= index) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

function updatePagePreview() {
  if (!isPdfMode || pages.length === 0) return;
  const pageIdx = getCurrentPage(Math.max(0, currentIndex - 1));
  if (pageIdx !== currentPage) {
    currentPage = pageIdx;
  }
  const label = `Page ${currentPage + 1} / ${pages.length}`;
  pdfThumbnail.src = pages[currentPage].thumbnail;
  pdfPageLabel.textContent = label;

  // Mirror to fullscreen PDF panel
  fsPdfThumbnail.src = pages[currentPage].thumbnail;
  fsPdfPageLabel.textContent = label;

  // Update zoom image if modal is open
  if (!pdfZoomModal.classList.contains('hidden')) {
    pdfZoomImage.src = pages[currentPage].thumbnail_hires;
  }
}

// ── PDF page navigation ────────────────────────────────────
function goToNextPage() {
  if (!isPdfMode || currentPage >= pages.length - 1) return;
  pause();
  const nextPage = currentPage + 1;
  currentIndex = pages[nextPage].start_index;
  while (currentIndex < words.length && words[currentIndex] === '__PARA__') currentIndex++;
  if (currentIndex < words.length) {
    displayWord(words[currentIndex]);
    currentIndex++;
    updateProgress();
    placeholderText.style.display = 'none';
  }
}

function goToPrevPage() {
  if (!isPdfMode || currentPage <= 0) return;
  pause();
  const prevPage = currentPage - 1;
  currentIndex = pages[prevPage].start_index;
  while (currentIndex < words.length && words[currentIndex] === '__PARA__') currentIndex++;
  if (currentIndex < words.length) {
    displayWord(words[currentIndex]);
    currentIndex++;
    updateProgress();
    placeholderText.style.display = 'none';
  }
}

// ── Paragraph navigation ───────────────────────────────────
function goToNextPara() {
  pause();
  let idx = currentIndex;
  while (idx < words.length && words[idx] !== '__PARA__') idx++;
  while (idx < words.length && words[idx] === '__PARA__') idx++;
  if (idx < words.length) {
    currentIndex = idx;
    displayWord(words[currentIndex]);
    currentIndex++;
    updateProgress();
    placeholderText.style.display = 'none';
  }
}

function goToPrevPara() {
  pause();
  let idx = currentIndex - 2;
  if (idx < 0) idx = 0;

  while (idx > 0 && words[idx] !== '__PARA__') idx--;

  if (words[idx] === '__PARA__' && idx > 0) {
    idx--;
    while (idx > 0 && words[idx] !== '__PARA__') idx--;
    if (words[idx] === '__PARA__') idx++;
  } else {
    idx = 0;
  }

  currentIndex = idx;
  if (currentIndex < words.length && words[currentIndex] !== '__PARA__') {
    displayWord(words[currentIndex]);
    currentIndex++;
    updateProgress();
    placeholderText.style.display = 'none';
  }
}

// ── PDF zoom ───────────────────────────────────────────────
function togglePdfZoom() {
  if (!isPdfMode || pages.length === 0) return;
  pdfZoomImage.src = pages[currentPage].thumbnail_hires;
  pdfZoomModal.classList.remove('hidden');
}

function closePdfZoom() {
  pdfZoomModal.classList.add('hidden');
}

// ── Suggestions toggle ─────────────────────────────────────
function toggleSuggestions(e) {
  e.preventDefault();
  const content = document.getElementById('suggestionsContent');
  const toggle  = document.getElementById('suggestionsToggle');
  const isHidden = content.classList.toggle('hidden');
  toggle.textContent = isHidden ? 'Show suggestions' : 'Hide suggestions';
}

// ── Init ───────────────────────────────────────────────────
applyFontStyle();
