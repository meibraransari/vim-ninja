// ============================================================
// VIM NINJA — App Controller
// ============================================================

// ── State ──
let currentPage = 'home';
let currentLesson = null;
let currentLessonIdx = -1;
let vimEngine = null;
let progress = loadProgress();
let cheatFilter = 'all';
let vimCmdLine = '';
let searchMode = false;
let searchDir = true;

// ── Progress persistence ──
function loadProgress() {
  try {
    const raw = localStorage.getItem('vimninja-progress');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    xp: 0,
    streak: 1,
    completedLessons: [],
    commandsLearned: 0,
    lastVisit: Date.now(),
  };
}

function saveProgress() {
  try {
    localStorage.setItem('vimninja-progress', JSON.stringify(progress));
  } catch (e) {}
  updateXPDisplay();
}

// ── Page navigation ──
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  currentPage = page;
  updateXPDisplay();
}

function showHome() { showPage('home'); renderHomePath(); }
function showLessons() { showPage('lessons'); renderLessonList(); updateProgressRing(); }
function showCheatsheet() { showPage('cheatsheet'); renderCheatsheet(); }
function showProgress() { showPage('progress'); renderProgress(); }
function startLearning() { showLessons(); }

// ── XP/Streak display ──
function updateXPDisplay() {
  const el = document.getElementById('total-xp');
  const streak = document.getElementById('streak-count');
  if (el) el.textContent = `${progress.xp} XP`;
  if (streak) streak.textContent = progress.streak;
}

// ── HOME PAGE ──
function renderHomePath() {
  const grid = document.getElementById('home-path-grid');
  if (!grid) return;
  const levels = [
    { id: 'beginner', label: 'Beginner', icon: '🌱', desc: 'Learn the basics: modes, movement, editing' },
    { id: 'intermediate', label: 'Intermediate', icon: '⚡', desc: 'Text objects, marks, macros, buffers' },
    { id: 'advanced', label: 'Advanced', icon: '⚔️', desc: 'Ex commands, regex, Neovim, Lua' },
  ];
  grid.innerHTML = levels.map(lv => {
    const lessons = LESSONS.filter(l => l.level === lv.id);
    const done = lessons.filter(l => progress.completedLessons.includes(l.id)).length;
    return `<div class="path-card" onclick="showLessons()">
      <span class="path-level ${lv.id}">${lv.icon} ${lv.label}</span>
      <h3>${lv.label} Vim</h3>
      <p>${lv.desc}</p>
      <div class="path-count">${done}/${lessons.length} lessons completed</div>
    </div>`;
  }).join('');
}

// ── LESSON LIST ──
function renderLessonList() {
  const list = document.getElementById('lesson-list');
  if (!list) return;
  const groups = {};
  LESSONS.forEach(l => {
    if (!groups[l.category]) groups[l.category] = [];
    groups[l.category].push(l);
  });

  list.innerHTML = Object.entries(groups).map(([cat, lessons]) => {
    return `<div class="lesson-group-title">${cat}</div>` +
      lessons.map(lesson => {
        const done = progress.completedLessons.includes(lesson.id);
        const active = currentLesson && currentLesson.id === lesson.id;
        const keys = lesson.keys.map(k => `<span class="key">${escapeHtml(k)}</span>`).join('');
        return `<div class="lesson-item ${done ? 'completed' : ''} ${active ? 'active' : ''}" 
          onclick="openLesson('${lesson.id}')" id="lesson-item-${lesson.id}">
          <span class="lesson-item-check">${done ? '✓' : '○'}</span>
          <span class="lesson-item-title">${lesson.title}</span>
          <span class="lesson-item-keys">${keys}</span>
        </div>`;
      }).join('');
  }).join('');
}

function filterLessons() {
  const q = document.getElementById('lesson-search').value.toLowerCase();
  document.querySelectorAll('.lesson-item').forEach(item => {
    const title = item.querySelector('.lesson-item-title').textContent.toLowerCase();
    item.style.display = title.includes(q) ? '' : 'none';
  });
}

function updateProgressRing() {
  const total = LESSONS.length;
  const done = progress.completedLessons.length;
  const pct = Math.round((done / total) * 100);
  const circumference = 150.8;
  const offset = circumference - (pct / 100) * circumference;
  const fill = document.getElementById('progress-ring-fill');
  const text = document.getElementById('progress-ring-text');
  if (fill) fill.style.strokeDashoffset = offset;
  if (text) text.textContent = `${pct}%`;
}

// ── Ordered lesson list (follows sidebar visual order: grouped by category) ──
function getOrderedLessons() {
  const groups = {};
  const groupOrder = [];
  LESSONS.forEach(l => {
    if (!groups[l.category]) {
      groups[l.category] = [];
      groupOrder.push(l.category);
    }
    groups[l.category].push(l);
  });
  const ordered = [];
  groupOrder.forEach(cat => ordered.push(...groups[cat]));
  return ordered;
}

// ── OPEN LESSON ──
function openLesson(lessonId) {
  const orderedLessons = getOrderedLessons();
  const idx = orderedLessons.findIndex(l => l.id === lessonId);
  if (idx === -1) return;
  currentLesson = orderedLessons[idx];
  currentLessonIdx = idx;

  // Bug fix #1: Always reset challengeCompleted when opening any lesson
  // so completed detection fires fresh, and the completed state is
  // re-checked from progress (already-completed lessons show feedback).
  challengeCompleted = false;

  document.getElementById('lesson-welcome').style.display = 'none';
  document.getElementById('lesson-detail').style.display = 'block';
  document.getElementById('lesson-detail').classList.add('fade-in');



  // Update sidebar active — scroll the item into view within the sidebar only
  document.querySelectorAll('.lesson-item').forEach(el => el.classList.remove('active'));
  const item = document.getElementById(`lesson-item-${lessonId}`);
  if (item) {
    item.classList.add('active');
    // Scroll only within the sidebar list, never the whole page
    const lessonList = document.getElementById('lesson-list');
    if (lessonList) {
      const itemTop = item.offsetTop - lessonList.offsetTop;
      const itemBottom = itemTop + item.offsetHeight;
      const listVisible = lessonList.clientHeight;
      const listScroll = lessonList.scrollTop;
      if (itemTop < listScroll) {
        lessonList.scrollTop = itemTop - 8;
      } else if (itemBottom > listScroll + listVisible) {
        lessonList.scrollTop = itemBottom - listVisible + 8;
      }
    }
  }

  // Render lesson content
  const lesson = currentLesson;
  const lvBadge = document.getElementById('detail-level-badge');
  lvBadge.textContent = lesson.level.charAt(0).toUpperCase() + lesson.level.slice(1);
  lvBadge.className = `lesson-level-badge ${lesson.level}`;
  document.getElementById('detail-category').textContent = lesson.category;
  document.getElementById('detail-title').textContent = lesson.title;
  document.getElementById('detail-desc').textContent = lesson.desc;

  // Commands grid
  const cGrid = document.getElementById('commands-grid');
  cGrid.innerHTML = lesson.commands.map(cmd =>
    `<div class="command-card">
      <span class="command-key">${escapeHtml(cmd.key)}</span>
      <span class="command-desc">${escapeHtml(cmd.desc)}</span>
    </div>`
  ).join('');

  // Explanations
  const expSec = document.getElementById('explanation-sections');
  expSec.innerHTML = (lesson.explanations || []).map(exp =>
    `<div class="explanation-block">
      <h3>${exp.title}</h3>
      <p>${exp.body}</p>
    </div>`
  ).join('');

  // Challenge
  const challenge = lesson.challenge;
  document.getElementById('challenge-instruction').innerHTML = `<strong>${challenge.instruction}</strong>`;
  document.getElementById('vim-filename').textContent = challenge.file;
  document.getElementById('vim-status-file').textContent = challenge.file;

  // Hide feedback/hint first
  document.getElementById('feedback-panel').style.display = 'none';
  document.getElementById('hint-panel').style.display = 'none';

  // Init vim engine (must happen before any challenge check)
  initVim(challenge.initialText);

  // If this lesson is already completed, show the completed state
  if (progress.completedLessons.includes(lesson.id)) {
    challengeCompleted = true;
    showSuccessFeedback();
  }

  // Update nav buttons
  const orderedLen = orderedLessons.length;
  document.getElementById('prev-lesson-btn').disabled = idx === 0;
  document.getElementById('next-lesson-btn').textContent = idx === orderedLen - 1 ? 'Finish ✓' : 'Next →';

  renderLessonList();

  // Scroll the lesson content panel back to top AFTER all DOM is rendered
  // (must be last — earlier placement gets overridden by content injection)
  requestAnimationFrame(() => {
    const lessonContent = document.getElementById('lesson-content');
    if (lessonContent) lessonContent.scrollTop = 0;
  });
}

// ── VIM EDITOR ──
function initVim(text) {
  if (vimEngine) {
    vimEngine.onUpdate = () => {};
    vimEngine.onModeChange = () => {};
    vimEngine.onStatusMsg = () => {};
  }

  vimEngine = new VimEngine({
    onUpdate: renderVim,
    onModeChange: updateVimMode,
    onStatusMsg: updateVimStatusMsg,
  });

  vimEngine.setText(text);
  renderVim(vimEngine.getState());
  focusVim();
}

function focusVim() {
  const body = document.getElementById('vim-body');
  if (body) body.focus();
}

function resetVim() {
  if (currentLesson) initVim(currentLesson.challenge.initialText);
}

function showHint() {
  const panel = document.getElementById('hint-panel');
  const text = document.getElementById('hint-text');
  if (currentLesson) {
    text.textContent = currentLesson.challenge.hint;
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  }
}

function renderVim(state) {
  const textEl = document.getElementById('vim-text');
  const gutterEl = document.getElementById('vim-gutter');
  if (!textEl || !gutterEl) return;

  // Determine visual range
  let visRange = null;
  if (vimEngine && (vimEngine.mode === 'visual' || vimEngine.mode === 'visualline' || vimEngine.mode === 'visualblock') && vimEngine.visualStart) {
    visRange = vimEngine.getVisualRange();
  }

  // Search highlight positions
  const searchPattern = vimEngine ? vimEngine.searchPattern : '';

  textEl.innerHTML = state.lines.map((line, row) => {
    const isCurrent = row === state.row;
    let cells = '';

    if (line.length === 0) {
      // Empty line — show insert cursor bar or normal block cursor
      if (isCurrent && vimEngine && vimEngine.mode === 'insert') {
        cells = `<span class="vim-insert-cursor"></span><span class="vim-cell"> </span>`;
      } else if (isCurrent) {
        cells = `<span class="vim-cell cursor-cell"> </span>`;
      } else {
        cells = `<span class="vim-cell"> </span>`;
      }
    } else {
      const isInsert = isCurrent && vimEngine && vimEngine.mode === 'insert';
      for (let col = 0; col < line.length; col++) {
        // Inject blinking insert cursor BEFORE the character at the cursor column
        if (isInsert && col === state.col) {
          cells += `<span class="vim-insert-cursor"></span>`;
        }

        const ch = line[col] === ' ' ? '\u00a0' : escapeHtml(line[col]);
        const isCursor = isCurrent && col === state.col;
        const isVisual = visRange && isInVisualRange(row, col, visRange, vimEngine.mode);
        const isSearch = searchPattern && isSearchMatch(line, col, searchPattern);

        let cls = 'vim-cell';
        // In insert mode don't highlight cursor cell — the bar cursor handles it
        if (!isInsert && isCursor) cls += ' cursor-cell';
        else if (isVisual) cls += ' visual-selected';
        else if (isSearch) cls += ' search-match';

        cells += `<span class="${cls}">${ch}</span>`;
      }

      // Cursor/insert-bar at end of line
      if (isCurrent && vimEngine && vimEngine.mode === 'insert' && state.col >= line.length) {
        // Insert cursor bar at end
        cells += `<span class="vim-insert-cursor"></span>`;
      } else if (isCurrent && state.col >= line.length && vimEngine && vimEngine.mode !== 'insert') {
        // Normal block cursor at end of line
        cells += `<span class="vim-cell cursor-cell"> </span>`;
      }
    }

    return `<div class="vim-row${isCurrent ? ' current-row' : ''}">${cells}</div>`;
  }).join('');

  // Gutter
  gutterEl.innerHTML = state.lines.map((_, row) =>
    `<span class="${row === state.row ? 'current-line' : ''}">${row + 1}</span>`
  ).join('');

  // Status bar
  const posEl = document.getElementById('vim-status-pos');
  if (posEl) posEl.textContent = `${state.row + 1},${state.col + 1}`;

  // Mode indicator
  updateVimMode(state.mode);

  // Command line
  const cmdEl = document.getElementById('vim-cmdline');
  const cmdInput = document.getElementById('cmdline-input');
  if (cmdEl && cmdInput) {
    const showCmd = ['command', 'search'].includes(state.mode);
    cmdEl.style.display = showCmd ? 'flex' : 'none';
    if (showCmd) {
      const prompt = state.mode === 'search' ? (vimEngine.cmdBuffer || '/') : ':';
      document.querySelector('.cmdline-prompt').textContent = prompt;
      cmdInput.textContent = vimEngine.cmdLineInput || '';
    }
  }

  // Check challenge completion
  if (currentLesson && vimEngine) {
    checkChallenge(vimEngine.getState());
  }
}

function isInVisualRange(row, col, range, mode) {
  if (mode === 'visualline') {
    return row >= range.startRow && row <= range.endRow;
  }
  if (row < range.startRow || row > range.endRow) return false;
  if (row === range.startRow && col < range.startCol) return false;
  if (row === range.endRow && col > range.endCol) return false;
  return true;
}

function isSearchMatch(line, col, pattern) {
  if (!pattern) return false;
  try {
    const re = new RegExp(pattern, 'g');
    let m;
    while ((m = re.exec(line)) !== null) {
      if (col >= m.index && col < m.index + m[0].length) return true;
      if (m[0].length === 0) re.lastIndex++;
    }
  } catch (e) {}
  return false;
}

function updateVimMode(mode) {
  const el = document.getElementById('vim-mode-indicator');
  if (!el) return;
  const modeMap = {
    normal: { label: 'NORMAL', cls: 'mode-normal' },
    insert: { label: 'INSERT', cls: 'mode-insert' },
    visual: { label: 'VISUAL', cls: 'mode-visual' },
    visualline: { label: 'V-LINE', cls: 'mode-visual' },
    visualblock: { label: 'V-BLOCK', cls: 'mode-visual' },
    command: { label: 'COMMAND', cls: 'mode-command' },
    replace: { label: 'REPLACE', cls: 'mode-replace' },
    search: { label: 'SEARCH', cls: 'mode-command' },
  };
  const m = modeMap[mode] || { label: 'NORMAL', cls: 'mode-normal' };
  el.textContent = m.label;
  el.className = `mode-indicator ${m.cls}`;
}

function updateVimStatusMsg(msg) {
  const el = document.getElementById('vim-status-msg');
  if (el) {
    el.textContent = msg;
    // Also update cmdline prompt area
    const cmdInput = document.getElementById('cmdline-input');
    const cmdEl = document.getElementById('vim-cmdline');
    if (cmdInput && cmdEl && msg && msg.startsWith(':')) {
      cmdEl.style.display = 'flex';
      cmdInput.textContent = msg.slice(1);
    } else if (cmdEl && (!msg || (!msg.startsWith(':') && !msg.startsWith('/') && !msg.startsWith('?')))) {
      if (vimEngine && !['command', 'search'].includes(vimEngine.mode)) {
        cmdEl.style.display = 'none';
      }
    }
  }
}

// Keyboard handler for vim
document.addEventListener('keydown', (e) => {
  const vimBody = document.getElementById('vim-body');
  if (!vimEngine || !vimBody || !document.activeElement === vimBody) {
    // Check if vim body is focused
    if (document.activeElement !== vimBody) return;
  }
  if (document.activeElement !== vimBody) return;

  // Don't intercept text inputs
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

  let key = e.key;

  // Normalize key
  if (e.ctrlKey && key === 'r') { key = 'Ctrl+r'; e.preventDefault(); }
  else if (e.ctrlKey && key === 'o') { key = 'Ctrl+o'; e.preventDefault(); }
  else if (e.ctrlKey && key === 'i') { key = 'Ctrl+i'; e.preventDefault(); }
  else if (e.ctrlKey && key === 'd') { key = 'Ctrl+d'; e.preventDefault(); }
  else if (e.ctrlKey && key === 'u') { key = 'Ctrl+u'; e.preventDefault(); }
  else if (e.ctrlKey && key === 'f') { key = 'Ctrl+f'; e.preventDefault(); }
  else if (e.ctrlKey && key === 'b') { key = 'Ctrl+b'; e.preventDefault(); }
  else if (e.ctrlKey && key === 'v') { key = 'Ctrl+v'; e.preventDefault(); }
  else if (e.ctrlKey && key === 'a') { key = 'Ctrl+a'; e.preventDefault(); }
  else if (e.ctrlKey && key === 'x') { key = 'Ctrl+x'; e.preventDefault(); }
  else if (e.ctrlKey && key === 'c') { key = 'Escape'; e.preventDefault(); } // Map Ctrl+C to Escape
  else if (e.ctrlKey && key === 'w') { key = 'Ctrl+w'; e.preventDefault(); } // Allow Ctrl+W
  else if (e.ctrlKey && key === '[') { key = 'Escape'; e.preventDefault(); }
  else if (key === 'Tab') { e.preventDefault(); key = 'Tab'; }
  else if (key === 'Backspace' || key === 'Enter' || key === 'Escape' || key === 'Delete') { e.preventDefault(); }
  else if (e.ctrlKey) { e.preventDefault(); return; } // ignore other ctrl combos
  else if (key.length > 1 && key !== 'Backspace' && key !== 'Enter' && key !== 'Escape' && key !== 'Delete' && key !== 'Ctrl+w' && !key.startsWith('Arrow')) {
    return; // ignore F-keys etc.
  }

  // Map arrow keys
  if (key === 'ArrowLeft') key = 'ArrowLeft';
  if (key === 'ArrowRight') key = 'ArrowRight';
  if (key === 'ArrowUp') key = 'ArrowUp';
  if (key === 'ArrowDown') key = 'ArrowDown';

  // Prevent page scroll with arrow keys when vim is focused
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }

  vimEngine.handleKey(key, e);
});

// ── Challenge validation ──
let challengeCompleted = false;

function checkChallenge(state) {
  if (!currentLesson || challengeCompleted) return;
  const challenge = currentLesson.challenge;
  if (!challenge.validate) return;

  try {
    if (challenge.validate(state)) {
      challengeCompleted = true;
      showSuccessFeedback();
    }
  } catch (e) {}
}

function showSuccessFeedback() {
  const panel = document.getElementById('feedback-panel');
  const icon = document.getElementById('feedback-icon');
  const title = document.getElementById('feedback-title');
  const msg = document.getElementById('feedback-msg');
  const btn = document.getElementById('feedback-btn');

  if (!panel) return;

  panel.style.display = 'flex';
  panel.className = 'feedback-panel success fade-in';
  icon.textContent = '🎉';
  title.textContent = 'Challenge Complete!';
  msg.textContent = `You earned ${currentLesson.xp} XP! Great work mastering "${currentLesson.title}".`;
  btn.textContent = currentLessonIdx < getOrderedLessons().length - 1 ? 'Next Lesson →' : 'View Progress 🏆';

  // Update progress
  if (!progress.completedLessons.includes(currentLesson.id)) {
    progress.completedLessons.push(currentLesson.id);
    progress.xp += currentLesson.xp;
    progress.commandsLearned += currentLesson.commands.length;
    saveProgress();
  }
  updateProgressRing();
  renderLessonList();
}

function nextLesson() {
  const orderedLessons = getOrderedLessons();
  if (currentLessonIdx < orderedLessons.length - 1) {
    openLesson(orderedLessons[currentLessonIdx + 1].id);
  } else {
    showProgress();
  }
}

function goPrevLesson() {
  const orderedLessons = getOrderedLessons();
  if (currentLessonIdx > 0) {
    openLesson(orderedLessons[currentLessonIdx - 1].id);
  }
}

// ── CHEATSHEET ──
function renderCheatsheet() {
  renderCheatFilters();
  renderCheatGrid();
}

function renderCheatFilters() {
  const tabs = document.getElementById('cheatsheet-filter-tabs');
  if (!tabs) return;
  const categories = ['All', ...new Set(CHEATSHEET.map(s => s.title))];
  // Use shorter filter approach
  const filters = ['All', 'Movement', 'Insert', 'Editing', 'Delete', 'Copy', 'Visual', 'Search', 'Files', 'Config', 'Diff'];
  tabs.innerHTML = filters.map(f =>
    `<button class="filter-tab ${f === 'All' ? 'active' : ''}" onclick="filterCheatTab(this, '${f}')">${f}</button>`
  ).join('');
}

function filterCheatTab(btn, filter) {
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  cheatFilter = filter.toLowerCase();
  renderCheatGrid();
}

function filterCheatsheet() {
  renderCheatGrid();
}

function renderCheatGrid() {
  const grid = document.getElementById('cheatsheet-grid');
  const search = (document.getElementById('cheat-search')?.value || '').toLowerCase();

  let sections = CHEATSHEET;
  if (cheatFilter !== 'all') {
    sections = sections.filter(s =>
      s.title.toLowerCase().includes(cheatFilter) ||
      s.id.includes(cheatFilter)
    );
  }
  if (search) {
    sections = sections.map(s => ({
      ...s,
      commands: s.commands.filter(([cmd, desc]) =>
        cmd.toLowerCase().includes(search) || desc.toLowerCase().includes(search)
      )
    })).filter(s => s.commands.length > 0);
  }

  grid.innerHTML = sections.map(section =>
    `<div class="cheat-section fade-in">
      <div class="cheat-section-header">
        <span class="cheat-section-icon">${section.icon}</span>
        <span class="cheat-section-title">${section.title}</span>
        <span class="cheat-section-count">${section.commands.length} cmds</span>
      </div>
      <table class="cheat-table">
        ${section.commands.map(([cmd, desc]) =>
          `<tr>
            <td><kbd class="key">${escapeHtml(cmd)}</kbd></td>
            <td>${escapeHtml(desc)}</td>
          </tr>`
        ).join('')}
      </table>
    </div>`
  ).join('');
}

// ── PROGRESS PAGE ──
function renderProgress() {
  document.getElementById('prog-xp').textContent = progress.xp;
  document.getElementById('prog-lessons').textContent = progress.completedLessons.length;
  document.getElementById('prog-streak').textContent = progress.streak;
  document.getElementById('prog-commands').textContent = progress.commandsLearned;

  // Level bar
  const totalXP = LESSONS.reduce((a, l) => a + l.xp, 0);
  const pct = Math.min(100, Math.round((progress.xp / totalXP) * 100));
  document.getElementById('level-bar').style.width = `${pct}%`;

  const labels = document.getElementById('level-labels');
  labels.innerHTML = `<span>Beginner (0 XP)</span><span>Intermediate (${Math.floor(totalXP * 0.35)} XP)</span><span>Master (${totalXP} XP)</span>`;

  // Achievements
  renderAchievements();

  // Lesson list
  const lessonList = document.getElementById('lesson-progress-list');
  lessonList.innerHTML = LESSONS.map(l => {
    const done = progress.completedLessons.includes(l.id);
    return `<div class="lesson-progress-item ${done ? 'completed' : ''}">
      <span class="lp-icon">${done ? '✅' : '⬜'}</span>
      <span class="lp-title">${l.title}</span>
      <span class="lp-level">${l.level}</span>
      <span class="lp-status ${done ? 'done' : 'pending'}">${done ? 'Completed' : 'Not started'}</span>
      <span class="lp-xp">+${l.xp} XP</span>
    </div>`;
  }).join('');
}

function renderAchievements() {
  const grid = document.getElementById('achievements-grid');
  grid.innerHTML = ACHIEVEMENTS.map(ach => {
    const unlocked = ach.condition(progress);
    return `<div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
      <div class="achievement-icon">${ach.icon}</div>
      <div class="achievement-name">${ach.name}</div>
      <div class="achievement-desc">${ach.desc}</div>
    </div>`;
  }).join('');
}

// ── PARTICLES ──
function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#22c55e'];
  for (let i = 0; i < 25; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 6 + 2;
    p.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${Math.random() * 100}%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      animation-duration: ${Math.random() * 15 + 10}s;
      animation-delay: ${Math.random() * 10}s;
    `;
    container.appendChild(p);
  }
}

// ── Utilities ──
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Scroll header effect
window.addEventListener('scroll', () => {
  const header = document.getElementById('header');
  if (header) header.classList.toggle('scrolled', window.scrollY > 20);
});

// Hero terminal animation
function animateHeroTerminal() {
  const lines = [
    { text: 'const ninja = "legendary";', delay: 200 },
    { text: '', delay: 100 },
    { text: 'function learnVim() {', delay: 300 },
    { text: '  // master the editor', delay: 200 },
    { text: '  console.log("Hello, Vim!");', delay: 400 },
    { text: '  return ninja;', delay: 200 },
    { text: '}', delay: 100 },
  ];
  // Terminal already has static content, just do cursor blink
}

// ── Init ──
window.addEventListener('DOMContentLoaded', () => {
  createParticles();
  showHome();
  renderHomePath();
  updateXPDisplay();
  animateHeroTerminal();

  // Load saved theme
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    updateThemeIcons(true);
  } else {
    updateThemeIcons(false);
  }

  // Set up vim body click focus
  document.addEventListener('click', (e) => {
    const vimBody = document.getElementById('vim-body');
    if (vimBody && e.target.closest('#vim-body')) {
      vimBody.focus();
    }
  });
});

// ── Sidebar Toggle ──
function toggleSidebar() {
  const sidebar = document.getElementById('lessons-sidebar');
  const expandBtn = document.getElementById('sidebar-expand-btn');
  if (!sidebar) return;

  const isCollapsed = sidebar.classList.toggle('collapsed');
  if (expandBtn) {
    expandBtn.style.display = isCollapsed ? 'flex' : 'none';
  }
}

// ── Theme Switcher ──
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  updateThemeIcons(isLight);
}

function updateThemeIcons(isLight) {
  const sunIcon = document.getElementById('theme-sun-icon');
  const moonIcon = document.getElementById('theme-moon-icon');
  if (sunIcon && moonIcon) {
    if (isLight) {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    } else {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    }
  }
}

