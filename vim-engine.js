// ============================================================
// VIM NINJA — Vim Engine (Browser Vim Emulator)
// ============================================================

class VimEngine {
  constructor(options = {}) {
    this.lines = [''];
    this.cursor = { row: 0, col: 0 };
    this.mode = 'normal';   // normal | insert | visual | visualline | visualblock | command | replace
    this.visualStart = null;
    this.visualEnd = null;
    this.register = {};     // named registers
    this.marks = {};
    this.searchPattern = '';
    this.searchMatches = [];
    this.cmdBuffer = '';    // for multi-char normal commands
    this.countBuffer = '';  // for numeric prefix
    this.cmdLineInput = '';
    this.undoStack = [];
    this.redoStack = [];
    this.statusMsg = '';
    this.lastCommand = null;
    this.onUpdate = options.onUpdate || (() => {});
    this.onModeChange = options.onModeChange || (() => {});
    this.onStatusMsg = options.onStatusMsg || (() => {});
    // Tracking for challenges
    this.stats = {
      modeChanges: 0,
      maxRow: 0,
      wordJumps: 0,
      searchCount: 0,
      undoCount: 0,
      visualUsed: false,
      findUsed: false,
      marksUsed: false,
      macroUsed: false,
      registerUsed: false,
      lineNavUsed: false,
      usedGG: false,
      jumpUsed: false,
      textObjUsed: false,
      operatorUsed: false,
      indentUsed: false,
    };
    // Macro recording
    this.macroRecording = null;
    this.macroBuffer = {};
    this.lastMacro = null;
    // Jump list
    this.jumpList = [];
    this.jumpIndex = -1;
    // Replace mode
    this.replacedChars = [];
  }

  setText(text) {
    this.lines = text.split('\n');
    if (this.lines.length === 0) this.lines = [''];
    this.cursor = { row: 0, col: 0 };
    this.undoStack = [];
    this.redoStack = [];
    this.stats = {
      modeChanges: 0, maxRow: 0, wordJumps: 0, searchCount: 0,
      undoCount: 0, visualUsed: false, findUsed: false,
      marksUsed: false, macroUsed: false, registerUsed: false,
      lineNavUsed: false, usedGG: false, jumpUsed: false,
      textObjUsed: false, operatorUsed: false, indentUsed: false,
    };
    this.register = {};
    this.marks = {};
    this.mode = 'normal';
    this.visualStart = null;
    this.visualEnd = null;
    this.cmdBuffer = '';
    this.countBuffer = '';
    this.cmdLineInput = '';
    this.searchPattern = '';
    this.searchMatches = [];
    this.update();
  }

  getText() { return this.lines.join('\n'); }

  getState() {
    return {
      text: this.getText(),
      lines: this.lines,
      row: this.cursor.row,
      col: this.cursor.col,
      mode: this.mode,
      ...this.stats,
    };
  }

  // ── Undo/Redo ──
  saveUndo() {
    this.undoStack.push({
      lines: [...this.lines],
      cursor: { ...this.cursor },
    });
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) { this.setStatus('Already at oldest change'); return; }
    this.redoStack.push({ lines: [...this.lines], cursor: { ...this.cursor } });
    const snap = this.undoStack.pop();
    this.lines = snap.lines;
    this.cursor = snap.cursor;
    this.clampCursor();
    this.stats.undoCount++;
    this.setStatus('Undo');
    this.update();
  }

  redo() {
    if (this.redoStack.length === 0) { this.setStatus('Already at newest change'); return; }
    this.undoStack.push({ lines: [...this.lines], cursor: { ...this.cursor } });
    const snap = this.redoStack.pop();
    this.lines = snap.lines;
    this.cursor = snap.cursor;
    this.clampCursor();
    this.setStatus('Redo');
    this.update();
  }

  // ── Cursor utilities ──
  clampCursor() {
    this.cursor.row = Math.max(0, Math.min(this.cursor.row, this.lines.length - 1));
    const line = this.lines[this.cursor.row] || '';
    const maxCol = this.mode === 'insert' ? line.length : Math.max(0, line.length - 1);
    this.cursor.col = Math.max(0, Math.min(this.cursor.col, maxCol));
  }

  currentLine() { return this.lines[this.cursor.row] || ''; }
  lineLength(row) { return (this.lines[row] || '').length; }

  setMode(mode) {
    const prev = this.mode;
    this.mode = mode;
    if (prev !== mode) {
      this.stats.modeChanges++;
      this.onModeChange(mode);
    }
    if (mode === 'normal') {
      this.clampCursor();
      // after insert, cursor moves back one if not at start
      const line = this.currentLine();
      if (this.cursor.col > 0 && this.cursor.col >= line.length) {
        this.cursor.col = Math.max(0, line.length - 1);
      }
    }
  }

  setStatus(msg) {
    this.statusMsg = msg;
    this.onStatusMsg(msg);
  }

  // ── Jump list ──
  addJump() {
    const pos = { row: this.cursor.row, col: this.cursor.col };
    if (this.jumpList.length === 0 || this.jumpList[this.jumpList.length - 1].row !== pos.row) {
      this.jumpList.push(pos);
      this.jumpIndex = this.jumpList.length - 1;
    }
  }

  jumpBack() {
    if (this.jumpIndex > 0) {
      this.jumpIndex--;
      const pos = this.jumpList[this.jumpIndex];
      this.cursor.row = pos.row;
      this.cursor.col = pos.col;
      this.clampCursor();
      this.stats.jumpUsed = true;
      this.update();
    }
  }

  jumpForward() {
    if (this.jumpIndex < this.jumpList.length - 1) {
      this.jumpIndex++;
      const pos = this.jumpList[this.jumpIndex];
      this.cursor.row = pos.row;
      this.cursor.col = pos.col;
      this.clampCursor();
      this.update();
    }
  }

  // ── Search ──
  search(pattern, forward = true) {
    if (!pattern) return;
    this.searchPattern = pattern;
    this.stats.searchCount++;
    const text = this.getText();
    const lines = this.lines;
    let found = false;

    if (forward) {
      for (let r = this.cursor.row; r < lines.length; r++) {
        const startCol = r === this.cursor.row ? this.cursor.col + 1 : 0;
        const idx = lines[r].indexOf(pattern, startCol);
        if (idx !== -1) {
          this.addJump();
          this.cursor.row = r;
          this.cursor.col = idx;
          found = true;
          break;
        }
      }
      if (!found) {
        for (let r = 0; r <= this.cursor.row; r++) {
          const idx = lines[r].indexOf(pattern);
          if (idx !== -1) {
            this.addJump();
            this.cursor.row = r;
            this.cursor.col = idx;
            found = true;
            break;
          }
        }
      }
    } else {
      for (let r = this.cursor.row; r >= 0; r--) {
        const endCol = r === this.cursor.row ? this.cursor.col : lines[r].length;
        const sub = lines[r].substring(0, endCol);
        const idx = sub.lastIndexOf(pattern);
        if (idx !== -1) {
          this.addJump();
          this.cursor.row = r;
          this.cursor.col = idx;
          found = true;
          break;
        }
      }
      if (!found) {
        for (let r = lines.length - 1; r >= this.cursor.row; r--) {
          const idx = lines[r].lastIndexOf(pattern);
          if (idx !== -1) {
            this.addJump();
            this.cursor.row = r;
            this.cursor.col = idx;
            found = true;
            break;
          }
        }
      }
    }

    if (!found) this.setStatus(`Pattern not found: ${pattern}`);
    this.update();
  }

  repeatSearch(forward = true) {
    if (!this.searchPattern) return;
    this.search(this.searchPattern, forward);
  }

  searchWordUnderCursor(forward = true) {
    const line = this.currentLine();
    let start = this.cursor.col;
    while (start > 0 && /\w/.test(line[start - 1])) start--;
    let end = this.cursor.col;
    while (end < line.length && /\w/.test(line[end])) end++;
    const word = line.slice(start, end);
    if (word) this.search(word, forward);
  }

  // ── Yank/Delete/Change helpers ──
  yankRange(startRow, startCol, endRow, endCol, linewise = false) {
    if (linewise) {
      const yanked = this.lines.slice(startRow, endRow + 1).join('\n');
      this.register['"'] = { text: yanked, linewise: true };
      this.register['0'] = { text: yanked, linewise: true };
    } else {
      if (startRow === endRow) {
        const text = this.lines[startRow].slice(startCol, endCol + 1);
        this.register['"'] = { text, linewise: false };
        this.register['0'] = { text, linewise: false };
      } else {
        let text = this.lines[startRow].slice(startCol);
        for (let r = startRow + 1; r < endRow; r++) text += '\n' + this.lines[r];
        text += '\n' + this.lines[endRow].slice(0, endCol + 1);
        this.register['"'] = { text, linewise: false };
        this.register['0'] = { text, linewise: false };
      }
    }
  }

  deleteRange(startRow, startCol, endRow, endCol, linewise = false) {
    this.saveUndo();
    if (linewise) {
      this.yankRange(startRow, startCol, endRow, endCol, true);
      this.lines.splice(startRow, endRow - startRow + 1);
      if (this.lines.length === 0) this.lines = [''];
      this.cursor.row = Math.min(startRow, this.lines.length - 1);
      this.cursor.col = 0;
    } else {
      this.yankRange(startRow, startCol, endRow, endCol, false);
      if (startRow === endRow) {
        this.lines[startRow] = this.lines[startRow].slice(0, startCol) + this.lines[startRow].slice(endCol + 1);
        this.cursor.col = startCol;
      } else {
        const newLine = this.lines[startRow].slice(0, startCol) + this.lines[endRow].slice(endCol + 1);
        this.lines.splice(startRow, endRow - startRow + 1, newLine);
        this.cursor.row = startRow;
        this.cursor.col = startCol;
      }
    }
    this.clampCursor();
  }

  paste(before = false) {
    const reg = this.register['"'];
    if (!reg) return;
    this.saveUndo();
    if (reg.linewise) {
      const targetRow = before ? this.cursor.row : this.cursor.row + 1;
      const newLines = reg.text.split('\n');
      this.lines.splice(targetRow, 0, ...newLines);
      this.cursor.row = targetRow;
      this.cursor.col = 0;
    } else {
      const line = this.lines[this.cursor.row];
      const pos = before ? this.cursor.col : this.cursor.col + 1;
      this.lines[this.cursor.row] = line.slice(0, pos) + reg.text + line.slice(pos);
      this.cursor.col = pos + reg.text.length - 1;
    }
    this.clampCursor();
    this.update();
  }

  // ── Motion calculations ──
  wordForwardStart() {
    const line = this.currentLine();
    let col = this.cursor.col;
    const isWordChar = (c) => /\w/.test(c);
    // skip current word chars
    while (col < line.length && isWordChar(line[col])) col++;
    // skip spaces/punct
    while (col < line.length && !isWordChar(line[col])) col++;
    if (col >= line.length && this.cursor.row < this.lines.length - 1) {
      return { row: this.cursor.row + 1, col: 0 };
    }
    return { row: this.cursor.row, col };
  }

  wordForwardEnd() {
    const line = this.currentLine();
    let col = this.cursor.col + 1;
    if (col >= line.length) {
      if (this.cursor.row < this.lines.length - 1) {
        const nLine = this.lines[this.cursor.row + 1];
        let nc = 0;
        while (nc < nLine.length && !/\w/.test(nLine[nc])) nc++;
        const end = nLine.slice(nc);
        const m = end.match(/^\w*/);
        return { row: this.cursor.row + 1, col: nc + (m ? m[0].length - 1 : 0) };
      }
      return { row: this.cursor.row, col: line.length - 1 };
    }
    const isWordChar = (c) => /\w/.test(c);
    while (col < line.length && !isWordChar(line[col])) col++;
    while (col + 1 < line.length && isWordChar(line[col + 1])) col++;
    return { row: this.cursor.row, col: Math.min(col, line.length - 1) };
  }

  wordBackwardStart() {
    let col = this.cursor.col - 1;
    let row = this.cursor.row;
    const isWordChar = (c) => /\w/.test(c);
    if (col < 0 && row > 0) {
      row--;
      col = this.lines[row].length - 1;
    }
    if (col < 0) return { row: 0, col: 0 };
    const line = this.lines[row];
    while (col > 0 && !isWordChar(line[col])) col--;
    while (col > 0 && isWordChar(line[col - 1])) col--;
    return { row, col };
  }

  findChar(ch, forward = true, till = false) {
    const line = this.currentLine();
    if (forward) {
      let col = this.cursor.col + 1;
      while (col < line.length) {
        if (line[col] === ch) {
          this.stats.findUsed = true;
          return till ? col - 1 : col;
        }
        col++;
      }
    } else {
      let col = this.cursor.col - 1;
      while (col >= 0) {
        if (line[col] === ch) {
          this.stats.findUsed = true;
          return till ? col + 1 : col;
        }
        col--;
      }
    }
    return null;
  }

  // ── Text object range ──
  innerWord() {
    const line = this.currentLine();
    let start = this.cursor.col;
    let end = this.cursor.col;
    while (start > 0 && /\w/.test(line[start - 1])) start--;
    while (end < line.length - 1 && /\w/.test(line[end + 1])) end++;
    return { startRow: this.cursor.row, startCol: start, endRow: this.cursor.row, endCol: end };
  }

  innerPair(open, close) {
    const text = this.getText();
    const pos = this.cursor.row * 1000 + this.cursor.col; // approx
    // Find in current line first
    const line = this.currentLine();
    let openIdx = -1, depth = 0;
    for (let i = this.cursor.col; i >= 0; i--) {
      if (line[i] === close) depth++;
      else if (line[i] === open) {
        if (depth === 0) { openIdx = i; break; }
        depth--;
      }
    }
    if (openIdx === -1) return null;
    let closeIdx = -1;
    depth = 0;
    for (let i = openIdx + 1; i < line.length; i++) {
      if (line[i] === open) depth++;
      else if (line[i] === close) {
        if (depth === 0) { closeIdx = i; break; }
        depth--;
      }
    }
    if (closeIdx === -1) return null;
    return { startRow: this.cursor.row, startCol: openIdx + 1, endRow: this.cursor.row, endCol: closeIdx - 1 };
  }

  innerQuote(q) {
    const line = this.currentLine();
    let first = -1, second = -1;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === q) {
        if (first === -1) first = i;
        else { second = i; break; }
      }
    }
    if (first === -1 || second === -1) return null;
    if (this.cursor.col > first && this.cursor.col < second) {
      return { startRow: this.cursor.row, startCol: first + 1, endRow: this.cursor.row, endCol: second - 1 };
    }
    return null;
  }

  // ── Substitution ──
  substitute(cmd) {
    // Parse :s/pat/repl/flags or :%s/pat/repl/flags
    const match = cmd.match(/^(%?)s\/((?:[^\/\\]|\\.)*)\/([^\/]*)\/([gciI]*)$/);
    if (!match) { this.setStatus('Invalid substitute command'); return; }
    const [, global, pat, repl, flags] = match;
    const allFile = global === '%';
    const globalFlag = flags.includes('g');
    const caseFlag = flags.includes('i') || flags.includes('I');
    this.saveUndo();
    let count = 0;
    const startRow = allFile ? 0 : this.cursor.row;
    const endRow = allFile ? this.lines.length - 1 : this.cursor.row;
    try {
      const re = new RegExp(pat, (globalFlag ? 'g' : '') + (caseFlag ? 'i' : ''));
      for (let r = startRow; r <= endRow; r++) {
        const orig = this.lines[r];
        this.lines[r] = orig.replace(re, repl);
        if (this.lines[r] !== orig) count++;
      }
      this.setStatus(count > 0 ? `${count} substitution(s) made` : 'No matches found');
    } catch (e) {
      this.setStatus('Invalid pattern');
    }
    this.update();
  }

  // ── Global command ──
  globalCmd(cmd) {
    // :g/pat/d or :g/pat/normal @a
    const match = cmd.match(/^g\/((?:[^\/\\]|\\.)*)\/(.*)/);
    if (!match) return;
    const [, pat, action] = match;
    this.saveUndo();
    const re = new RegExp(pat);
    if (action === 'd') {
      const before = this.lines.length;
      this.lines = this.lines.filter(l => !re.test(l));
      if (this.lines.length === 0) this.lines = [''];
      const deleted = before - this.lines.length;
      this.cursor.row = Math.min(this.cursor.row, this.lines.length - 1);
      this.setStatus(`${deleted} line(s) deleted`);
    }
    this.clampCursor();
    this.update();
  }

  // ── Execute command line ──
  executeCommand(cmd) {
    cmd = cmd.trim();
    if (cmd === 'q' || cmd === 'q!') {
      this.setStatus('(Browser Vim) Cannot quit — you\'re in the browser!');
    } else if (cmd === 'w' || cmd === 'wq' || cmd === 'x') {
      this.setStatus('File saved! (simulated)');
      if (cmd === 'wq' || cmd === 'x') this.setStatus('Saved and quit (simulated)');
    } else if (cmd === 'noh' || cmd === 'nohlsearch') {
      this.searchPattern = '';
      this.setStatus('');
    } else if (cmd.startsWith('%s') || cmd.startsWith('s') || cmd.match(/^\d+,\d+s/)) {
      // Handle :%s/... and :s/...
      const s = cmd.replace(/^\d+,\d+/, '%').replace(/^%?/, '%');
      this.substitute(cmd);
    } else if (cmd.startsWith('g/') || cmd.startsWith('g!/')) {
      this.globalCmd(cmd);
    } else if (cmd.match(/^\d+$/)) {
      const lineNum = parseInt(cmd) - 1;
      if (lineNum >= 0 && lineNum < this.lines.length) {
        this.addJump();
        this.cursor.row = lineNum;
        this.cursor.col = 0;
        this.clampCursor();
        this.update();
      }
    } else if (cmd === 'reg' || cmd === 'registers') {
      const regStr = Object.entries(this.register).map(([k,v]) => `"${k}   ${v.text.substring(0,20)}`).join('\n') || 'No registers';
      this.setStatus(regStr);
    } else if (cmd === 'marks') {
      this.setStatus(Object.entries(this.marks).map(([k,v]) => `${k}: ${v.row+1},${v.col+1}`).join('  ') || 'No marks');
    } else if (cmd.startsWith('set ')) {
      this.setStatus(`(${cmd} applied — simulated)`);
    } else if (cmd === 'ls' || cmd === 'files' || cmd === 'buffers') {
      this.setStatus('1 %a "[current file]" line 1');
    } else {
      this.setStatus(`(Command: :${cmd})`);
    }
  }

  // ── Update (re-render) ──
  update() {
    if (this.cursor.row > this.stats.maxRow) this.stats.maxRow = this.cursor.row;
    this.onUpdate(this.getState());
  }

  // ── Main key handler ──
  handleKey(key, e) {
    // Always handle Ctrl+C to go back to Normal
    if (key === 'Escape' || key === 'Ctrl+[') {
      this.handleEscape();
      return;
    }

    if (this.mode === 'insert') {
      this.handleInsert(key);
    } else if (this.mode === 'replace') {
      this.handleReplace(key);
    } else if (this.mode === 'command') {
      this.handleCommandLine(key);
    } else if (this.mode === 'visual' || this.mode === 'visualline' || this.mode === 'visualblock') {
      this.handleVisual(key);
    } else {
      this.handleNormal(key);
    }
  }

  handleEscape() {
    if (this.mode === 'command') {
      this.cmdLineInput = '';
      this.onStatusMsg('');
    }
    if (this.mode !== 'normal') {
      this.setMode('normal');
      this.clampCursor();
      this.cmdBuffer = '';
      this.countBuffer = '';
      this.visualStart = null;
      this.visualEnd = null;
      this.update();
    }
  }

  handleInsert(key) {
    if (key === 'Backspace') {
      if (this.cursor.col > 0) {
        const line = this.lines[this.cursor.row];
        this.lines[this.cursor.row] = line.slice(0, this.cursor.col - 1) + line.slice(this.cursor.col);
        this.cursor.col--;
      } else if (this.cursor.row > 0) {
        const prevLine = this.lines[this.cursor.row - 1];
        const curLine = this.lines[this.cursor.row];
        this.cursor.col = prevLine.length;
        this.lines[this.cursor.row - 1] = prevLine + curLine;
        this.lines.splice(this.cursor.row, 1);
        this.cursor.row--;
      }
    } else if (key === 'Delete') {
      const line = this.lines[this.cursor.row];
      if (this.cursor.col < line.length) {
        // delete character at cursor position
        this.lines[this.cursor.row] = line.slice(0, this.cursor.col) + line.slice(this.cursor.col + 1);
      } else if (this.cursor.row < this.lines.length - 1) {
        // at end of line: merge next line into current
        const nextLine = this.lines[this.cursor.row + 1];
        this.lines[this.cursor.row] = line + nextLine;
        this.lines.splice(this.cursor.row + 1, 1);
      }
    } else if (key === 'Enter') {
      const line = this.lines[this.cursor.row];
      const before = line.slice(0, this.cursor.col);
      const after = line.slice(this.cursor.col);
      // Auto-indent: detect leading spaces
      const indent = before.match(/^(\s*)/)[1];
      this.lines[this.cursor.row] = before;
      this.lines.splice(this.cursor.row + 1, 0, indent + after);
      this.cursor.row++;
      this.cursor.col = indent.length;
    } else if (key === 'Tab') {
      this.insertText('  ');
    } else if (key === 'ArrowLeft') {
      if (this.cursor.col > 0) this.cursor.col--;
    } else if (key === 'ArrowRight') {
      const line = this.currentLine();
      if (this.cursor.col < line.length) this.cursor.col++;
    } else if (key === 'ArrowUp') {
      if (this.cursor.row > 0) this.cursor.row--;
    } else if (key === 'ArrowDown') {
      if (this.cursor.row < this.lines.length - 1) this.cursor.row++;
    } else if (key.length === 1) {
      this.insertText(key);
    }
    this.update();
  }

  insertText(text) {
    const line = this.lines[this.cursor.row];
    this.lines[this.cursor.row] = line.slice(0, this.cursor.col) + text + line.slice(this.cursor.col);
    this.cursor.col += text.length;
  }

  handleReplace(key) {
    if (key === 'Backspace') {
      if (this.replacedChars.length > 0) {
        const c = this.replacedChars.pop();
        const line = this.lines[this.cursor.row];
        this.lines[this.cursor.row] = line.slice(0, this.cursor.col - 1) + c + line.slice(this.cursor.col);
        this.cursor.col--;
      }
    } else if (key.length === 1) {
      const line = this.lines[this.cursor.row];
      this.replacedChars.push(line[this.cursor.col] || '');
      if (this.cursor.col < line.length) {
        this.lines[this.cursor.row] = line.slice(0, this.cursor.col) + key + line.slice(this.cursor.col + 1);
      } else {
        this.lines[this.cursor.row] = line + key;
      }
      this.cursor.col++;
    }
    this.update();
  }

  handleCommandLine(key) {
    if (key === 'Enter') {
      const cmd = this.cmdLineInput;
      this.cmdLineInput = '';
      this.setMode('normal');
      this.onStatusMsg('');
      this.executeCommand(cmd);
    } else if (key === 'Backspace') {
      if (this.cmdLineInput.length > 0) {
        this.cmdLineInput = this.cmdLineInput.slice(0, -1);
        this.onStatusMsg(':' + this.cmdLineInput);
      } else {
        this.setMode('normal');
        this.onStatusMsg('');
      }
    } else if (key.length === 1) {
      this.cmdLineInput += key;
      this.onStatusMsg(':' + this.cmdLineInput);
    }
  }

  handleVisual(key) {
    const movKeys = ['h', 'j', 'k', 'l', 'w', 'e', 'b', 'W', 'E', 'B', '0', '^', '$', 'G', 'gg'];
    // Movement first
    this.handleNormalMovement(key);
    this.visualEnd = { ...this.cursor };
    this.stats.visualUsed = true;

    // Visual operators
    if (key === 'd' || key === 'x') {
      this.executeVisualDelete();
    } else if (key === 'y') {
      this.executeVisualYank();
    } else if (key === 'c') {
      this.executeVisualDelete();
      this.saveUndo();
      this.setMode('insert');
    } else if (key === '>') {
      this.executeVisualIndent(1);
    } else if (key === '<') {
      this.executeVisualIndent(-1);
    } else if (key === '~') {
      this.executeVisualToggleCase();
    } else if (key === 'u') {
      this.executeVisualCase(false);
    } else if (key === 'U') {
      this.executeVisualCase(true);
    } else if (key === 'o') {
      // Swap start and end
      const tmp = { ...this.visualStart };
      this.visualStart = { ...this.visualEnd };
      this.cursor = tmp;
      this.visualEnd = { ...this.cursor };
    }
    this.update();
  }

  getVisualRange() {
    const start = this.visualStart;
    const end = this.visualEnd || this.cursor;
    if (start.row < end.row || (start.row === end.row && start.col <= end.col)) {
      return { startRow: start.row, startCol: start.col, endRow: end.row, endCol: end.col };
    }
    return { startRow: end.row, startCol: end.col, endRow: start.row, endCol: start.col };
  }

  executeVisualDelete() {
    const range = this.getVisualRange();
    const isLinewise = this.mode === 'visualline';
    this.deleteRange(range.startRow, range.startCol, range.endRow, range.endCol, isLinewise);
    this.setMode('normal');
    this.visualStart = null;
    this.update();
  }

  executeVisualYank() {
    const range = this.getVisualRange();
    const isLinewise = this.mode === 'visualline';
    this.yankRange(range.startRow, range.startCol, range.endRow, range.endCol, isLinewise);
    this.cursor = { row: range.startRow, col: range.startCol };
    this.setMode('normal');
    this.visualStart = null;
    this.setStatus(`${range.endRow - range.startRow + 1} line(s) yanked`);
    this.update();
  }

  executeVisualIndent(dir) {
    const range = this.getVisualRange();
    this.saveUndo();
    for (let r = range.startRow; r <= range.endRow; r++) {
      if (dir > 0) {
        this.lines[r] = '  ' + this.lines[r];
      } else {
        this.lines[r] = this.lines[r].replace(/^  /, '');
      }
    }
    this.stats.indentUsed = true;
    this.setMode('normal');
    this.visualStart = null;
    this.update();
  }

  executeVisualToggleCase() {
    const range = this.getVisualRange();
    this.saveUndo();
    if (range.startRow === range.endRow) {
      const line = this.lines[range.startRow];
      const sel = line.slice(range.startCol, range.endCol + 1);
      const toggled = sel.split('').map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('');
      this.lines[range.startRow] = line.slice(0, range.startCol) + toggled + line.slice(range.endCol + 1);
    }
    this.setMode('normal');
    this.visualStart = null;
    this.update();
  }

  executeVisualCase(upper) {
    const range = this.getVisualRange();
    this.saveUndo();
    if (range.startRow === range.endRow) {
      const line = this.lines[range.startRow];
      const sel = line.slice(range.startCol, range.endCol + 1);
      const cased = upper ? sel.toUpperCase() : sel.toLowerCase();
      this.lines[range.startRow] = line.slice(0, range.startCol) + cased + line.slice(range.endCol + 1);
    }
    this.setMode('normal');
    this.visualStart = null;
    this.update();
  }

  handleNormalMovement(key) {
    const line = this.currentLine();
    if (key === 'h' || key === 'ArrowLeft') {
      if (this.cursor.col > 0) this.cursor.col--;
    } else if (key === 'l' || key === 'ArrowRight') {
      if (this.cursor.col < line.length - 1) this.cursor.col++;
    } else if (key === 'j' || key === 'ArrowDown') {
      if (this.cursor.row < this.lines.length - 1) this.cursor.row++;
    } else if (key === 'k' || key === 'ArrowUp') {
      if (this.cursor.row > 0) this.cursor.row--;
    } else if (key === 'w') {
      const pos = this.wordForwardStart();
      this.cursor.row = pos.row; this.cursor.col = pos.col;
      this.stats.wordJumps++;
    } else if (key === 'e') {
      const pos = this.wordForwardEnd();
      this.cursor.row = pos.row; this.cursor.col = pos.col;
    } else if (key === 'b') {
      const pos = this.wordBackwardStart();
      this.cursor.row = pos.row; this.cursor.col = pos.col;
      this.stats.wordJumps++;
    } else if (key === 'W') {
      // WORD forward
      let col = this.cursor.col;
      while (col < line.length && !/\s/.test(line[col])) col++;
      while (col < line.length && /\s/.test(line[col])) col++;
      this.cursor.col = Math.min(col, line.length - 1);
    } else if (key === 'E') {
      let col = this.cursor.col + 1;
      while (col < line.length && /\s/.test(line[col])) col++;
      while (col + 1 < line.length && !/\s/.test(line[col + 1])) col++;
      this.cursor.col = Math.min(col, line.length - 1);
    } else if (key === 'B') {
      let col = this.cursor.col - 1;
      while (col > 0 && /\s/.test(line[col])) col--;
      while (col > 0 && !/\s/.test(line[col - 1])) col--;
      this.cursor.col = Math.max(0, col);
    } else if (key === '0') {
      this.cursor.col = 0;
      this.stats.lineNavUsed = true;
    } else if (key === '^') {
      const m = line.match(/^(\s*)/);
      this.cursor.col = m ? m[1].length : 0;
      this.stats.lineNavUsed = true;
    } else if (key === '$') {
      this.cursor.col = Math.max(0, line.length - 1);
      this.stats.lineNavUsed = true;
    } else if (key === 'g_') {
      let col = line.length - 1;
      while (col > 0 && /\s/.test(line[col])) col--;
      this.cursor.col = col;
    } else if (key === 'gg') {
      this.addJump();
      this.cursor.row = 0; this.cursor.col = 0;
      this.stats.usedGG = true;
    } else if (key === 'G') {
      this.addJump();
      this.cursor.row = this.lines.length - 1;
      this.cursor.col = 0;
    } else if (key === '}') {
      let r = this.cursor.row + 1;
      while (r < this.lines.length - 1 && this.lines[r].trim() !== '') r++;
      this.cursor.row = r;
      this.addJump();
    } else if (key === '{') {
      let r = this.cursor.row - 1;
      while (r > 0 && this.lines[r].trim() !== '') r--;
      this.cursor.row = r;
      this.addJump();
    } else if (key === 'H') {
      this.cursor.row = 0;
    } else if (key === 'M') {
      this.cursor.row = Math.floor(this.lines.length / 2);
    } else if (key === 'L') {
      this.cursor.row = this.lines.length - 1;
    } else if (key === '%') {
      const brackets = { '(': ')', '{': '}', '[': ']', ')': '(', '}': '{', ']': '[' };
      const ch = line[this.cursor.col];
      if (brackets[ch]) {
        const target = brackets[ch];
        const forward = '({['.includes(ch);
        if (forward) {
          let depth = 0;
          for (let r = this.cursor.row; r < this.lines.length; r++) {
            const start = r === this.cursor.row ? this.cursor.col : 0;
            for (let c = start; c < this.lines[r].length; c++) {
              if (this.lines[r][c] === ch) depth++;
              else if (this.lines[r][c] === target) {
                depth--;
                if (depth === 0) { this.cursor.row = r; this.cursor.col = c; return; }
              }
            }
          }
        }
      }
    }
  }

  handleNormal(key) {
    // Ctrl combinations
    if (key === 'Ctrl+r') { this.redo(); return; }
    if (key === 'Ctrl+o') { this.jumpBack(); return; }
    if (key === 'Ctrl+i') { this.jumpForward(); return; }
    if (key === 'Ctrl+d') {
      const jump = Math.floor(this.lines.length / 4) || 1;
      this.cursor.row = Math.min(this.cursor.row + jump, this.lines.length - 1);
      this.clampCursor(); this.update(); return;
    }
    if (key === 'Ctrl+u') {
      const jump = Math.floor(this.lines.length / 4) || 1;
      this.cursor.row = Math.max(this.cursor.row - jump, 0);
      this.clampCursor(); this.update(); return;
    }
    if (key === 'Ctrl+f') {
      this.cursor.row = Math.min(this.cursor.row + 10, this.lines.length - 1);
      this.clampCursor(); this.update(); return;
    }
    if (key === 'Ctrl+b') {
      this.cursor.row = Math.max(this.cursor.row - 10, 0);
      this.clampCursor(); this.update(); return;
    }

    // Count prefix
    if (/^[1-9]$/.test(key) && !this.cmdBuffer) {
      this.countBuffer += key;
      return;
    }
    if (key === '0' && this.countBuffer) {
      this.countBuffer += key;
      return;
    }

    const count = parseInt(this.countBuffer) || 1;
    this.countBuffer = '';

    // Multi-key commands accumulation
    if (this.cmdBuffer === 'g') {
      if (key === 'g') {
        this.handleNormalMovement('gg');
        this.cmdBuffer = '';
        this.clampCursor(); this.update(); return;
      } else if (key === 'U') {
        // gU + motion
        const rng = this.innerWord();
        this.saveUndo();
        this.lines[rng.startRow] = this.lines[rng.startRow].slice(0, rng.startCol) +
          this.lines[rng.startRow].slice(rng.startCol, rng.endCol + 1).toUpperCase() +
          this.lines[rng.startRow].slice(rng.endCol + 1);
        this.stats.operatorUsed = true;
        this.cmdBuffer = '';
        this.update(); return;
      } else if (key === 'u') {
        const rng = this.innerWord();
        this.saveUndo();
        this.lines[rng.startRow] = this.lines[rng.startRow].slice(0, rng.startCol) +
          this.lines[rng.startRow].slice(rng.startCol, rng.endCol + 1).toLowerCase() +
          this.lines[rng.startRow].slice(rng.endCol + 1);
        this.stats.operatorUsed = true;
        this.cmdBuffer = ''; this.update(); return;
      } else if (key === '~') {
        const rng = this.innerWord();
        this.saveUndo();
        const w = this.lines[rng.startRow].slice(rng.startCol, rng.endCol + 1);
        const toggled = w.split('').map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('');
        this.lines[rng.startRow] = this.lines[rng.startRow].slice(0, rng.startCol) + toggled + this.lines[rng.startRow].slice(rng.endCol + 1);
        this.cmdBuffer = ''; this.update(); return;
      } else if (key === 'J') {
        // Join without space
        this.saveUndo();
        if (this.cursor.row < this.lines.length - 1) {
          this.lines[this.cursor.row] = this.lines[this.cursor.row] + this.lines[this.cursor.row + 1].trim();
          this.lines.splice(this.cursor.row + 1, 1);
        }
        this.cmdBuffer = ''; this.update(); return;
      }
      this.cmdBuffer = ''; // clear if no match
    }

    if (this.cmdBuffer === 'd') {
      this.handleDeleteMotion(key, count);
      return;
    }
    if (this.cmdBuffer === 'c') {
      this.handleChangeMotion(key, count);
      return;
    }
    if (this.cmdBuffer === 'y') {
      this.handleYankMotion(key, count);
      return;
    }
    if (this.cmdBuffer === 'f') {
      const col = this.findChar(key, true, false);
      if (col !== null) { this.cursor.col = col; this.lastFindChar = key; this.lastFindForward = true; this.lastFindTill = false; }
      this.cmdBuffer = ''; this.clampCursor(); this.update(); return;
    }
    if (this.cmdBuffer === 'F') {
      const col = this.findChar(key, false, false);
      if (col !== null) { this.cursor.col = col; this.lastFindChar = key; this.lastFindForward = false; this.lastFindTill = false; }
      this.cmdBuffer = ''; this.clampCursor(); this.update(); return;
    }
    if (this.cmdBuffer === 't') {
      const col = this.findChar(key, true, true);
      if (col !== null) { this.cursor.col = col; this.lastFindChar = key; this.lastFindForward = true; this.lastFindTill = true; }
      this.cmdBuffer = ''; this.clampCursor(); this.update(); return;
    }
    if (this.cmdBuffer === 'T') {
      const col = this.findChar(key, false, true);
      if (col !== null) { this.cursor.col = col; }
      this.cmdBuffer = ''; this.clampCursor(); this.update(); return;
    }
    if (this.cmdBuffer === 'm') {
      this.marks[key] = { row: this.cursor.row, col: this.cursor.col };
      this.setStatus(`Mark ${key} set`);
      this.stats.marksUsed = true;
      this.cmdBuffer = ''; return;
    }
    if (this.cmdBuffer === '`') {
      if (this.marks[key]) {
        this.addJump();
        this.cursor.row = this.marks[key].row;
        this.cursor.col = this.marks[key].col;
        this.stats.marksUsed = true;
        this.clampCursor();
      } else {
        this.setStatus(`Mark ${key} not set`);
      }
      this.cmdBuffer = ''; this.update(); return;
    }
    if (this.cmdBuffer === "'") {
      if (this.marks[key]) {
        this.addJump();
        this.cursor.row = this.marks[key].row;
        this.cursor.col = 0;
        this.stats.marksUsed = true;
        this.clampCursor();
      } else {
        this.setStatus(`Mark ${key} not set`);
      }
      this.cmdBuffer = ''; this.update(); return;
    }
    if (this.cmdBuffer === 'r') {
      if (key.length === 1) {
        this.saveUndo();
        const line = this.lines[this.cursor.row];
        this.lines[this.cursor.row] = line.slice(0, this.cursor.col) + key + line.slice(this.cursor.col + 1);
        this.cmdBuffer = ''; this.update();
      }
      return;
    }
    if (this.cmdBuffer === 'q') {
      if (key === 'q') {
        // Stop recording
        if (this.macroRecording) {
          const reg = this.macroRecording;
          this.macroBuffer[reg] = this.macroBuffer[reg] || [];
          // Remove last 'qq' from recording (the stop command)
          this.macroBuffer[reg].pop();
          this.macroRecording = null;
          this.setStatus(`Macro ${reg} recorded`);
        }
        this.cmdBuffer = ''; return;
      }
      // Start recording into register
      this.macroRecording = key;
      this.macroBuffer[key] = [];
      this.setStatus(`Recording @${key}`);
      this.cmdBuffer = ''; return;
    }
    if (this.cmdBuffer === '@') {
      this.playMacro(key, count);
      this.stats.macroUsed = true;
      this.cmdBuffer = ''; return;
    }
    if (this.cmdBuffer === '"') {
      // Register prefix — next command will use this register
      this.activeRegister = key;
      this.cmdBuffer = ''; return;
    }
    if (this.cmdBuffer === 'z') {
      if (key === 'z') {
        // center — no op in browser
      } else if (key === 'a') {
        // toggle fold — no op
      }
      this.cmdBuffer = ''; return;
    }
    if (this.cmdBuffer === '>') {
      if (key === '>') {
        this.saveUndo();
        for (let i = 0; i < count; i++) {
          this.lines[this.cursor.row] = '  ' + this.lines[this.cursor.row];
        }
        this.stats.indentUsed = true;
        this.cmdBuffer = ''; this.update(); return;
      }
    }
    if (this.cmdBuffer === '<') {
      if (key === '<') {
        this.saveUndo();
        for (let i = 0; i < count; i++) {
          this.lines[this.cursor.row] = this.lines[this.cursor.row].replace(/^  /, '');
        }
        this.stats.indentUsed = true;
        this.cmdBuffer = ''; this.update(); return;
      }
    }

    // ── Search entry ──
    if (key === '/') {
      this.cmdBuffer = '/';
      this.cmdLineInput = '';
      // Switch to search input mode (handled by search overlay in app.js)
      this.onStatusMsg('/');
      this.mode = 'search';
      this.update(); return;
    }
    if (key === '?') {
      this.cmdBuffer = '?';
      this.cmdLineInput = '';
      this.onStatusMsg('?');
      this.mode = 'search';
      this.update(); return;
    }

    // Handle search mode key (called if app.js delegates back)
    if (this.mode === 'search') {
      if (key === 'Enter') {
        const forward = this.cmdBuffer === '/';
        this.search(this.cmdLineInput, forward);
        this.cmdLineInput = '';
        this.mode = 'normal';
        this.onStatusMsg('');
      } else if (key === 'Backspace') {
        this.cmdLineInput = this.cmdLineInput.slice(0, -1);
        this.onStatusMsg((this.cmdBuffer === '/' ? '/' : '?') + this.cmdLineInput);
      } else if (key.length === 1) {
        this.cmdLineInput += key;
        this.onStatusMsg((this.cmdBuffer === '/' ? '/' : '?') + this.cmdLineInput);
      }
      return;
    }

    // ── Single-key commands ──
    switch (key) {
      case 'i': this.saveUndo(); this.setMode('insert'); this.update(); break;
      case 'I':
        this.saveUndo();
        this.cursor.col = this.currentLine().match(/^(\s*)/)[1].length;
        this.setMode('insert'); this.update(); break;
      case 'a':
        this.saveUndo();
        if (this.cursor.col < this.currentLine().length) this.cursor.col++;
        this.setMode('insert'); this.update(); break;
      case 'A':
        this.saveUndo();
        this.cursor.col = this.currentLine().length;
        this.setMode('insert'); this.update(); break;
      case 'o':
        this.saveUndo();
        const indentO = this.currentLine().match(/^(\s*)/)[1];
        this.lines.splice(this.cursor.row + 1, 0, indentO);
        this.cursor.row++;
        this.cursor.col = indentO.length;
        this.setMode('insert'); this.update(); break;
      case 'O':
        this.saveUndo();
        const indentU = this.currentLine().match(/^(\s*)/)[1];
        this.lines.splice(this.cursor.row, 0, indentU);
        this.cursor.col = indentU.length;
        this.setMode('insert'); this.update(); break;
      case 'x':
      case 'Delete':
        this.saveUndo();
        const lineX = this.lines[this.cursor.row];
        if (lineX.length > 0) {
          this.register['"'] = { text: lineX[this.cursor.col], linewise: false };
          this.lines[this.cursor.row] = lineX.slice(0, this.cursor.col) + lineX.slice(this.cursor.col + 1);
          this.clampCursor();
        }
        this.update(); break;
      case 'X':
        if (this.cursor.col > 0) {
          this.saveUndo();
          const lX = this.lines[this.cursor.row];
          this.lines[this.cursor.row] = lX.slice(0, this.cursor.col - 1) + lX.slice(this.cursor.col);
          this.cursor.col--;
        }
        this.update(); break;
      case 's':
        this.saveUndo();
        const lineS = this.lines[this.cursor.row];
        this.register['"'] = { text: lineS[this.cursor.col] || '', linewise: false };
        this.lines[this.cursor.row] = lineS.slice(0, this.cursor.col) + lineS.slice(this.cursor.col + 1);
        this.setMode('insert'); this.update(); break;
      case 'S':
        this.saveUndo();
        this.register['"'] = { text: this.lines[this.cursor.row], linewise: true };
        this.lines[this.cursor.row] = '';
        this.cursor.col = 0;
        this.setMode('insert'); this.update(); break;
      case 'D':
        this.saveUndo();
        const lD = this.lines[this.cursor.row];
        this.register['"'] = { text: lD.slice(this.cursor.col), linewise: false };
        this.lines[this.cursor.row] = lD.slice(0, this.cursor.col);
        this.update(); break;
      case 'C':
        this.saveUndo();
        const lC = this.lines[this.cursor.row];
        this.register['"'] = { text: lC.slice(this.cursor.col), linewise: false };
        this.lines[this.cursor.row] = lC.slice(0, this.cursor.col);
        this.setMode('insert'); this.update(); break;
      case 'p': this.paste(false); break;
      case 'P': this.paste(true); break;
      case 'u': this.undo(); break;
      case 'n': this.repeatSearch(true); break;
      case 'N': this.repeatSearch(false); break;
      case '*': this.searchWordUnderCursor(true); break;
      case '#': this.searchWordUnderCursor(false); break;
      case 'v':
        this.setMode('visual');
        this.visualStart = { ...this.cursor };
        this.visualEnd = { ...this.cursor };
        this.update(); break;
      case 'V':
        this.setMode('visualline');
        this.visualStart = { ...this.cursor };
        this.visualEnd = { ...this.cursor };
        this.update(); break;
      case 'Ctrl+v':
        this.setMode('visualblock');
        this.visualStart = { ...this.cursor };
        this.visualEnd = { ...this.cursor };
        this.update(); break;
      case 'J':
        this.saveUndo();
        if (this.cursor.row < this.lines.length - 1) {
          const sep = this.lines[this.cursor.row + 1].trimStart() === '' ? '' : ' ';
          this.lines[this.cursor.row] = this.lines[this.cursor.row] + sep + this.lines[this.cursor.row + 1].trimStart();
          this.lines.splice(this.cursor.row + 1, 1);
        }
        this.update(); break;
      case 'R': this.setMode('replace'); this.replacedChars = []; this.update(); break;
      case '~':
        this.saveUndo();
        const lTilde = this.lines[this.cursor.row];
        if (lTilde[this.cursor.col]) {
          const c = lTilde[this.cursor.col];
          const nc = c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
          this.lines[this.cursor.row] = lTilde.slice(0, this.cursor.col) + nc + lTilde.slice(this.cursor.col + 1);
          if (this.cursor.col < lTilde.length - 1) this.cursor.col++;
        }
        this.update(); break;
      case '.':
        // Repeat last command — simplified
        if (this.lastCommand) this.lastCommand();
        break;
      case ':':
        this.setMode('command');
        this.cmdLineInput = '';
        this.onStatusMsg(':');
        this.update(); break;
      case ';':
        if (this.lastFindChar) {
          const col = this.findChar(this.lastFindChar, this.lastFindForward, this.lastFindTill);
          if (col !== null) this.cursor.col = col;
          this.clampCursor(); this.update();
        }
        break;
      case ',':
        if (this.lastFindChar) {
          const col = this.findChar(this.lastFindChar, !this.lastFindForward, this.lastFindTill);
          if (col !== null) this.cursor.col = col;
          this.clampCursor(); this.update();
        }
        break;
      case 'Ctrl+a':
        this.incrementNumber(count);
        break;
      case 'Ctrl+x':
        this.incrementNumber(-count);
        break;
      case 'ZZ':
        this.setStatus('Saved and quit (simulated)');
        break;
      case 'ZQ':
        this.setStatus('Quit without save (simulated)');
        break;
      default:
        // Multi-key starters
        if (['d', 'c', 'y', 'g', 'f', 'F', 't', 'T', 'm', '`', "'", 'r', 'z', '>', '<', '@', '"'].includes(key)) {
          this.cmdBuffer = key;
        } else if (key === 'q') {
          if (this.macroRecording) {
            // Stop recording
            const reg = this.macroRecording;
            this.macroRecording = null;
            this.setStatus(`Macro ${reg} recorded`);
          } else {
            this.cmdBuffer = 'q';
          }
        } else {
          // Movement
          this.handleNormalMovement(key);
          this.clampCursor();
          this.update();
        }
    }

    // Record macro
    if (this.macroRecording && key !== 'q') {
      this.macroBuffer[this.macroRecording] = this.macroBuffer[this.macroRecording] || [];
      this.macroBuffer[this.macroRecording].push(key);
    }
  }

  handleDeleteMotion(key, count) {
    const line = this.lines[this.cursor.row];
    this.cmdBuffer = '';

    if (key === 'd') {
      // dd
      this.yankRange(this.cursor.row, 0, Math.min(this.cursor.row + count - 1, this.lines.length - 1), 0, true);
      this.deleteRange(this.cursor.row, 0, Math.min(this.cursor.row + count - 1, this.lines.length - 1), 0, true);
    } else if (key === 'w') {
      const pos = this.wordForwardStart();
      this.deleteRange(this.cursor.row, this.cursor.col, pos.row, Math.max(this.cursor.col, pos.col - 1), false);
    } else if (key === 'e') {
      const pos = this.wordForwardEnd();
      this.deleteRange(this.cursor.row, this.cursor.col, pos.row, pos.col, false);
    } else if (key === 'b') {
      const pos = this.wordBackwardStart();
      this.deleteRange(pos.row, pos.col, this.cursor.row, this.cursor.col - 1, false);
    } else if (key === '$') {
      this.deleteRange(this.cursor.row, this.cursor.col, this.cursor.row, line.length - 1, false);
    } else if (key === '0') {
      this.deleteRange(this.cursor.row, 0, this.cursor.row, this.cursor.col - 1, false);
    } else if (key === 'G') {
      this.deleteRange(this.cursor.row, 0, this.lines.length - 1, 0, true);
    } else if (key === 'g') {
      this.cmdBuffer = 'dg'; return;
    } else if (key === 'i') {
      this.cmdBuffer = 'di'; return;
    } else if (key === 'a') {
      this.cmdBuffer = 'da'; return;
    }

    this.clampCursor();
    this.update();
  }

  handleChangeMotion(key, count) {
    this.handleDeleteMotion(key, count);
    if (key !== 'c') {
      this.setMode('insert');
    }
  }

  handleYankMotion(key, count) {
    const line = this.lines[this.cursor.row];
    this.cmdBuffer = '';

    if (key === 'y') {
      this.yankRange(this.cursor.row, 0, Math.min(this.cursor.row + count - 1, this.lines.length - 1), 0, true);
      this.setStatus(`${count} line(s) yanked`);
    } else if (key === 'w') {
      const pos = this.wordForwardStart();
      this.yankRange(this.cursor.row, this.cursor.col, pos.row, Math.max(this.cursor.col, pos.col - 1), false);
      this.setStatus('Yanked word');
    } else if (key === 'e') {
      const pos = this.wordForwardEnd();
      this.yankRange(this.cursor.row, this.cursor.col, pos.row, pos.col, false);
    } else if (key === '$') {
      this.yankRange(this.cursor.row, this.cursor.col, this.cursor.row, line.length - 1, false);
    } else if (key === 'G') {
      this.yankRange(this.cursor.row, 0, this.lines.length - 1, 0, true);
      this.setStatus(`Yanked to end of file`);
    } else if (key === 'i') {
      this.cmdBuffer = 'yi'; return;
    } else if (key === 'a') {
      this.cmdBuffer = 'ya'; return;
    }

    this.update();
  }

  playMacro(reg, count = 1) {
    const keys = this.macroBuffer[reg];
    if (!keys || keys.length === 0) {
      this.setStatus(`No macro in register ${reg}`);
      return;
    }
    this.lastMacro = reg;
    for (let i = 0; i < count; i++) {
      for (const k of keys) {
        this.handleKey(k, null);
      }
    }
  }

  incrementNumber(delta) {
    const line = this.lines[this.cursor.row];
    const match = line.slice(this.cursor.col).match(/(-?\d+)/);
    if (!match) return;
    const numStr = match[1];
    const numStart = this.cursor.col + match.index;
    const num = parseInt(numStr) + delta;
    this.saveUndo();
    this.lines[this.cursor.row] = line.slice(0, numStart) + num.toString() + line.slice(numStart + numStr.length);
    this.update();
  }
}
