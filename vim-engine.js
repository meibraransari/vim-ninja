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
      windowSplitUsed: false,
      bufferNavUsed: false,
      foldUsed: false,
      netrwUsed: false,
      shellFilterUsed: false,
      cmdHistoryUsed: false,
      spellCheckUsed: false,
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
    this.pendingCount = 0;      // count saved when operator key (d/c/y) is typed: e.g. '5' then 'd' saves 5
    this.activeRegister = '"';  // active register for \"ayy / \"ap style commands
    this.lastVisualStart = null;
    this.lastVisualEnd = null;
    this.lastVisualMode = null;
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
      windowSplitUsed: false, bufferNavUsed: false, foldUsed: false,
      netrwUsed: false, shellFilterUsed: false, cmdHistoryUsed: false, spellCheckUsed: false,
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
    this.pendingCount = 0;
    this.activeRegister = '"';
    this.lastVisualStart = null;
    this.lastVisualEnd = null;
    this.lastVisualMode = null;
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
    if (prev !== mode) {
      if (prev.startsWith('visual') && mode === 'normal') {
        this.lastVisualStart = this.visualStart ? { ...this.visualStart } : { ...this.cursor };
        this.lastVisualEnd = this.visualEnd ? { ...this.visualEnd } : { ...this.cursor };
        this.lastVisualMode = prev;
      }
      this.mode = mode;
      this.stats.modeChanges++;
      this.onModeChange(mode);
    }
    if (mode === 'normal') {
      this.clampCursor();
      this.autoCompleteState = null;
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
    const word = this.wordUnderCursor();
    if (word) this.search(word, forward);
  }

  wordUnderCursor() {
    const line = this.currentLine();
    if (line.length === 0) return '';
    let start = this.cursor.col;
    while (start > 0 && /\w/.test(line[start - 1])) start--;
    let end = this.cursor.col;
    // ensure we include the character under cursor
    while (end < line.length && /\w/.test(line[end])) end++;
    return line.slice(start, end);
  }

  // ── Yank/Delete/Change helpers ──
  yankRange(startRow, startCol, endRow, endCol, linewise = false) {
    const regName = this.activeRegister || '"';
    if (linewise) {
      const yanked = this.lines.slice(startRow, endRow + 1).join('\n');
      this.register[regName] = { text: yanked, linewise: true };
      this.register['"'] = { text: yanked, linewise: true };
      this.register['0'] = { text: yanked, linewise: true };
    } else {
      if (startRow === endRow) {
        const text = this.lines[startRow].slice(startCol, endCol + 1);
        this.register[regName] = { text, linewise: false };
        this.register['"'] = { text, linewise: false };
        this.register['0'] = { text, linewise: false };
      } else {
        let text = this.lines[startRow].slice(startCol);
        for (let r = startRow + 1; r < endRow; r++) text += '\n' + this.lines[r];
        text += '\n' + this.lines[endRow].slice(0, endCol + 1);
        this.register[regName] = { text, linewise: false };
        this.register['"'] = { text, linewise: false };
        this.register['0'] = { text, linewise: false };
      }
    }
    // Track register stat and reset
    if (regName !== '"') this.stats.registerUsed = true;
    this.activeRegister = '"';
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
    const regName = this.activeRegister || '"';
    const reg = this.register[regName] || this.register['"'];
    if (regName !== '"') this.stats.registerUsed = true;
    this.activeRegister = '"'; // reset after use
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
    if (line.length === 0) {
      return { startRow: this.cursor.row, startCol: 0, endRow: this.cursor.row, endCol: 0 };
    }
    let start = this.cursor.col;
    let end = this.cursor.col;
    
    const char = line[this.cursor.col] || '';
    const isWordChar = (c) => /\w/.test(c);
    const isSpaceChar = (c) => /\s/.test(c);
    const isPunctChar = (c) => !isWordChar(c) && !isSpaceChar(c);
    
    const matcher = isWordChar(char) ? isWordChar : (isPunctChar(char) ? isPunctChar : isSpaceChar);
    
    while (start > 0 && matcher(line[start - 1])) start--;
    while (end < line.length - 1 && matcher(line[end + 1])) end++;
    return { startRow: this.cursor.row, startCol: start, endRow: this.cursor.row, endCol: end };
  }

  aroundWord() {
    const line = this.currentLine();
    if (line.length === 0) {
      return { startRow: this.cursor.row, startCol: 0, endRow: this.cursor.row, endCol: 0 };
    }
    const rng = this.innerWord();
    let start = rng.startCol;
    let end = rng.endCol;
    
    // Expand to include trailing spaces
    let trailingStart = end + 1;
    while (trailingStart < line.length && /\s/.test(line[trailingStart])) trailingStart++;
    if (trailingStart > end + 1) {
      return { startRow: this.cursor.row, startCol: start, endRow: this.cursor.row, endCol: trailingStart - 1 };
    }
    
    // If no trailing spaces, include leading spaces
    let leadingEnd = start - 1;
    while (leadingEnd >= 0 && /\s/.test(line[leadingEnd])) leadingEnd--;
    if (leadingEnd < start - 1) {
      return { startRow: this.cursor.row, startCol: leadingEnd + 1, endRow: this.cursor.row, endCol: end };
    }
    
    return rng;
  }

  innerPair(open, close) {
    const line = this.currentLine();
    let openIdx = -1;
    let closeIdx = -1;
    
    // Find the matching pair containing the cursor
    // Search backward for open bracket
    let depth = 0;
    for (let i = this.cursor.col; i >= 0; i--) {
      if (line[i] === close) {
        depth++;
      } else if (line[i] === open) {
        if (depth === 0) {
          openIdx = i;
          break;
        }
        depth--;
      }
    }
    
    if (openIdx === -1) {
      // Try searching forward for the first open bracket after cursor
      for (let i = this.cursor.col; i < line.length; i++) {
        if (line[i] === open) {
          openIdx = i;
          break;
        }
      }
    }
    
    if (openIdx === -1) return null;
    
    // Search forward from openIdx for matching close bracket
    depth = 0;
    for (let i = openIdx + 1; i < line.length; i++) {
      if (line[i] === open) {
        depth++;
      } else if (line[i] === close) {
        if (depth === 0) {
          closeIdx = i;
          break;
        }
        depth--;
      }
    }
    
    if (closeIdx === -1) return null;
    return { startRow: this.cursor.row, startCol: openIdx + 1, endRow: this.cursor.row, endCol: closeIdx - 1 };
  }

  innerQuote(q) {
    const line = this.currentLine();
    let idxs = [];
    for (let i = 0; i < line.length; i++) {
      if (line[i] === q) {
        if (i === 0 || line[i - 1] !== '\\') {
          idxs.push(i);
        }
      }
    }
    if (idxs.length < 2) return null;
    
    let startIdx = -1;
    let endIdx = -1;
    
    // Find pair containing the cursor
    for (let i = 0; i < idxs.length - 1; i += 2) {
      const s = idxs[i];
      const e = idxs[i + 1];
      if (this.cursor.col >= s && this.cursor.col <= e) {
        startIdx = s;
        endIdx = e;
        break;
      }
    }
    
    // If not inside, pick first pair after cursor
    if (startIdx === -1) {
      for (let i = 0; i < idxs.length - 1; i += 2) {
        const s = idxs[i];
        const e = idxs[i + 1];
        if (s > this.cursor.col) {
          startIdx = s;
          endIdx = e;
          break;
        }
      }
    }
    
    // Fallback to last pair
    if (startIdx === -1) {
      startIdx = idxs[idxs.length - 2];
      endIdx = idxs[idxs.length - 1];
    }
    
    return { startRow: this.cursor.row, startCol: startIdx + 1, endRow: this.cursor.row, endCol: endIdx - 1 };
  }

  innerParagraph() {
    let startRow = this.cursor.row;
    while (startRow > 0 && this.lines[startRow - 1].trim() !== '') startRow--;
    let endRow = this.cursor.row;
    while (endRow < this.lines.length - 1 && this.lines[endRow + 1].trim() !== '') endRow++;
    return { startRow, startCol: 0, endRow, endCol: (this.lines[endRow] || '').length - 1, linewise: true };
  }

  aroundParagraph() {
    let rng = this.innerParagraph();
    let startRow = rng.startRow;
    let endRow = rng.endRow;
    if (endRow < this.lines.length - 1 && this.lines[endRow + 1].trim() === '') {
      endRow++;
    } else if (startRow > 0 && this.lines[startRow - 1].trim() === '') {
      startRow--;
    }
    return { startRow, startCol: 0, endRow, endCol: (this.lines[endRow] || '').length - 1, linewise: true };
  }

  getTextObjectRange(objType, isAround) {
    if (objType === 'w') {
      return isAround ? this.aroundWord() : this.innerWord();
    }
    if (objType === 'W') {
      const line = this.currentLine();
      if (line.length === 0) {
        return { startRow: this.cursor.row, startCol: 0, endRow: this.cursor.row, endCol: 0 };
      }
      let start = this.cursor.col;
      let end = this.cursor.col;
      while (start > 0 && !/\s/.test(line[start - 1])) start--;
      while (end < line.length - 1 && !/\s/.test(line[end + 1])) end++;
      if (isAround) {
        while (end < line.length - 1 && /\s/.test(line[end + 1])) end++;
        if (end === this.cursor.col) {
          while (start > 0 && /\s/.test(line[start - 1])) start--;
        }
      }
      return { startRow: this.cursor.row, startCol: start, endRow: this.cursor.row, endCol: end };
    }
    if (objType === '(' || objType === ')' || objType === 'b') {
      const r = this.innerPair('(', ')');
      if (!r) return null;
      if (isAround) { r.startCol--; r.endCol++; }
      return r;
    }
    if (objType === '{' || objType === '}' || objType === 'B') {
      const r = this.innerPair('{', '}');
      if (!r) return null;
      if (isAround) { r.startCol--; r.endCol++; }
      return r;
    }
    if (objType === '[' || objType === ']') {
      const r = this.innerPair('[', ']');
      if (!r) return null;
      if (isAround) { r.startCol--; r.endCol++; }
      return r;
    }
    if (objType === '"') {
      const r = this.innerQuote('"');
      if (!r) return null;
      if (isAround) { r.startCol--; r.endCol++; }
      return r;
    }
    if (objType === "'") {
      const r = this.innerQuote("'");
      if (!r) return null;
      if (isAround) { r.startCol--; r.endCol++; }
      return r;
    }
    if (objType === '`') {
      const r = this.innerQuote('`');
      if (!r) return null;
      if (isAround) { r.startCol--; r.endCol++; }
      return r;
    }
    if (objType === 'p') {
      return isAround ? this.aroundParagraph() : this.innerParagraph();
    }
    return this.innerWord();
  }

  getMotionRange(motionKey, count = 1) {
    const startRow = this.cursor.row;
    const startCol = this.cursor.col;
    const savedCursor = { ...this.cursor };

    for (let i = 0; i < count; i++) {
      this.handleNormalMovement(motionKey);
    }

    const endRow = this.cursor.row;
    const endCol = this.cursor.col;
    this.cursor = savedCursor;

    let linewise = false;
    if (['G', 'gg', 'j', 'k', 'ArrowUp', 'ArrowDown'].includes(motionKey)) {
      linewise = true;
    }

    if (startRow < endRow || (startRow === endRow && startCol <= endCol)) {
      return { startRow, startCol, endRow, endCol, linewise };
    } else {
      return { startRow: endRow, startCol: endCol, endRow: startRow, endCol: startCol, linewise };
    }
  }

  executeOperator(op, range) {
    if (!range) return;
    const { startRow, startCol, endRow, endCol, linewise } = range;

    if (op === 'd') {
      this.deleteRange(startRow, startCol, endRow, endCol, linewise);
      this.stats.operatorUsed = true;
    } else if (op === 'c') {
      this.deleteRange(startRow, startCol, endRow, endCol, linewise);
      this.setMode('insert');
      this.stats.operatorUsed = true;
    } else if (op === 'y') {
      this.yankRange(startRow, startCol, endRow, endCol, linewise);
      this.stats.operatorUsed = true;
    } else if (op === 'gU') {
      this.saveUndo();
      for (let r = startRow; r <= endRow; r++) {
        const line = this.lines[r] || '';
        const sc = (r === startRow) ? startCol : 0;
        const ec = (r === endRow) ? endCol : line.length - 1;
        const before = line.slice(0, sc);
        const mid = line.slice(sc, ec + 1).toUpperCase();
        const after = line.slice(ec + 1);
        this.lines[r] = before + mid + after;
      }
      this.stats.operatorUsed = true;
    } else if (op === 'gu') {
      this.saveUndo();
      for (let r = startRow; r <= endRow; r++) {
        const line = this.lines[r] || '';
        const sc = (r === startRow) ? startCol : 0;
        const ec = (r === endRow) ? endCol : line.length - 1;
        const before = line.slice(0, sc);
        const mid = line.slice(sc, ec + 1).toLowerCase();
        const after = line.slice(ec + 1);
        this.lines[r] = before + mid + after;
      }
      this.stats.operatorUsed = true;
    } else if (op === 'g~') {
      this.saveUndo();
      for (let r = startRow; r <= endRow; r++) {
        const line = this.lines[r] || '';
        const sc = (r === startRow) ? startCol : 0;
        const ec = (r === endRow) ? endCol : line.length - 1;
        const before = line.slice(0, sc);
        const mid = line.slice(sc, ec + 1).split('').map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('');
        const after = line.slice(ec + 1);
        this.lines[r] = before + mid + after;
      }
      this.stats.operatorUsed = true;
    } else if (op === '!') {
      this.filterRange = range;
      this.setMode('command');
      this.cmdLineInput = '!';
      this.onStatusMsg('!');
      this.update();
      return;
    }

    this.clampCursor();
    this.update();
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
    if (cmd.startsWith('!')) {
      if (this.filterRange) {
        const { startRow, endRow } = this.filterRange;
        const subLines = this.lines.slice(startRow, endRow + 1);
        if (cmd.includes('sort')) {
          subLines.sort();
        }
        this.lines.splice(startRow, subLines.length, ...subLines);
        this.filterRange = null;
        this.stats.shellFilterUsed = true;
        this.setStatus(`Filtered lines through "${cmd}"`);
      } else {
        this.setStatus(`Executed shell command: ${cmd} (simulated)`);
      }
      this.update();
      return;
    }
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
    } else if (cmd === 'sp' || cmd.startsWith('split')) {
      this.setStatus('Split horizontally (simulated)');
      this.stats.windowSplitUsed = true;
    } else if (cmd === 'vsp' || cmd.startsWith('vsplit')) {
      this.setStatus('Split vertically (simulated)');
      this.stats.windowSplitUsed = true;
    } else if (cmd === 'bn' || cmd === 'bnext') {
      this.setStatus('Buffer next (simulated)');
      this.stats.bufferNavUsed = true;
    } else if (cmd === 'bp' || cmd === 'bprev') {
      this.setStatus('Buffer previous (simulated)');
      this.stats.bufferNavUsed = true;
    } else if (cmd === 'bd' || cmd === 'bdelete') {
      this.setStatus('Buffer deleted (simulated)');
      this.stats.bufferNavUsed = true;
    } else if (cmd === 'tabnew') {
      this.setStatus('New tab opened (simulated)');
    } else if (cmd === 'tabn' || cmd === 'tabnext') {
      this.setStatus('Next tab (simulated)');
    } else if (cmd === 'tabp' || cmd === 'tabprev') {
      this.setStatus('Previous tab (simulated)');
    } else if (cmd === 'tabc' || cmd === 'tabclose') {
      this.setStatus('Tab closed (simulated)');
    } else if (cmd === 'h' || cmd === 'help' || cmd.startsWith('help ')) {
      this.setStatus('Vim Help documentation (simulated)');
    } else if (cmd.startsWith('set ')) {
      this.setStatus(`(${cmd} applied — simulated)`);
      if (cmd.includes('spell')) {
        this.stats.spellCheckUsed = true;
      }
    } else if (cmd === 'Ex' || cmd === 'Lexplore' || cmd.startsWith('Ex ') || cmd.startsWith('Lexplore ')) {
      this.setStatus('netrw: Directory listing (simulated)');
      this.stats.netrwUsed = true;
    } else if (cmd.startsWith('r ')) {
      const rest = cmd.slice(2).trim();
      if (rest.startsWith('!')) {
        this.saveUndo();
        this.lines.splice(this.cursor.row + 1, 0, `[Output of command: ${rest.slice(1)}]`);
        this.stats.shellFilterUsed = true;
      } else {
        this.lines.splice(this.cursor.row + 1, 0, `[Contents of file: ${rest}]`);
      }
      this.setStatus('Read file contents (simulated)');
      this.update();
    } else if (cmd === 'ls' || cmd === 'files' || cmd === 'buffers') {
      this.setStatus('1 %a "[current file]" line 1');
      this.stats.bufferNavUsed = true;
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
    if (key === 'Ctrl+n' || key === 'Ctrl+p') {
      const line = this.lines[this.cursor.row] || '';
      const beforeCursor = line.slice(0, this.cursor.col);
      const match = beforeCursor.match(/(\w+)$/);
      if (match) {
        const prefix = match[1];
        const allWords = this.getText().match(/\b\w+/g) || [];
        const candidates = [...new Set(allWords.filter(w => w.startsWith(prefix) && w !== prefix))];
        if (candidates.length > 0) {
          if (!this.autoCompleteState || this.autoCompleteState.prefix !== prefix) {
            this.autoCompleteState = {
              prefix,
              candidates,
              index: key === 'Ctrl+n' ? 0 : candidates.length - 1,
              originalWord: prefix,
              row: this.cursor.row,
              colStart: this.cursor.col - prefix.length
            };
          } else {
            const dir = key === 'Ctrl+n' ? 1 : -1;
            this.autoCompleteState.index = (this.autoCompleteState.index + dir + candidates.length) % candidates.length;
          }
          const word = candidates[this.autoCompleteState.index];
          const start = this.autoCompleteState.colStart;
          this.lines[this.cursor.row] = line.slice(0, start) + word + line.slice(this.cursor.col);
          this.cursor.col = start + word.length;
          this.update();
        }
      }
      return;
    }

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
    } else if (key === 'Ctrl+w') {
      const line = this.lines[this.cursor.row];
      if (this.cursor.col > 0) {
        let col = this.cursor.col - 1;
        while (col > 0 && /\s/.test(line[col])) col--;
        if (/\w/.test(line[col])) {
          while (col > 0 && /\w/.test(line[col - 1])) col--;
        } else {
          while (col > 0 && !/\w/.test(line[col - 1]) && !/\s/.test(line[col - 1])) col--;
        }
        this.lines[this.cursor.row] = line.slice(0, col) + line.slice(this.cursor.col);
        this.cursor.col = col;
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
    if (this.cmdBuffer === 'i' || this.cmdBuffer === 'a') {
      const isAround = this.cmdBuffer === 'a';
      const range = this.getTextObjectRange(key, isAround);
      if (range) {
        this.visualStart = { row: range.startRow, col: range.startCol };
        this.cursor = { row: range.endRow, col: range.endCol };
        this.visualEnd = { ...this.cursor };
        this.stats.textObjUsed = true;
      }
      this.cmdBuffer = '';
      this.update();
      return;
    }

    if (key === 'i' || key === 'a') {
      this.cmdBuffer = key;
      return;
    }

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
    } else if (key === 'ge') {
      let row = this.cursor.row;
      let col = this.cursor.col - 1;
      if (col < 0 && row > 0) {
        row--;
        col = (this.lines[row] || '').length - 1;
      }
      let ln = this.lines[row] || '';
      const isWordChar = (c) => /\w/.test(c);
      while (col > 0 && isWordChar(ln[col])) col--;
      while (col > 0 && !isWordChar(ln[col])) col--;
      this.cursor.row = row; this.cursor.col = Math.max(0, col);
    } else if (key === 'gE') {
      let row = this.cursor.row;
      let col = this.cursor.col - 1;
      if (col < 0 && row > 0) {
        row--;
        col = (this.lines[row] || '').length - 1;
      }
      let ln = this.lines[row] || '';
      while (col > 0 && !/\s/.test(ln[col])) col--;
      while (col > 0 && /\s/.test(ln[col])) col--;
      this.cursor.row = row; this.cursor.col = Math.max(0, col);
    } else if (key === 'W') {
      let row = this.cursor.row;
      let col = this.cursor.col;
      let ln = this.lines[row] || '';
      while (col < ln.length && !/\s/.test(ln[col])) col++;
      while (col < ln.length && /\s/.test(ln[col])) col++;
      if (col >= ln.length && row < this.lines.length - 1) {
        row++;
        col = 0;
        ln = this.lines[row] || '';
        while (col < ln.length && /\s/.test(ln[col])) col++;
      }
      this.cursor.row = row; this.cursor.col = col;
    } else if (key === 'E') {
      let row = this.cursor.row;
      let col = this.cursor.col + 1;
      let ln = this.lines[row] || '';
      if (col >= ln.length && row < this.lines.length - 1) {
        row++;
        ln = this.lines[row] || '';
        col = 0;
      }
      while (col < ln.length && /\s/.test(ln[col])) col++;
      while (col + 1 < ln.length && !/\s/.test(ln[col + 1])) col++;
      this.cursor.row = row; this.cursor.col = Math.min(col, ln.length - 1);
    } else if (key === 'B') {
      let row = this.cursor.row;
      let col = this.cursor.col - 1;
      if (col < 0 && row > 0) {
        row--;
        const ln2 = this.lines[row] || '';
        col = ln2.length - 1;
      }
      const ln = this.lines[row] || '';
      while (col > 0 && /\s/.test(ln[col])) col--;
      while (col > 0 && !/\s/.test(ln[col - 1])) col--;
      this.cursor.row = row; this.cursor.col = Math.max(0, col);
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
    if (key === 'Ctrl+w') { this.cmdBuffer = 'Ctrl+w'; return; }
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

    // Multi-key commands accumulation and execution
    const isOperator = (op) => ['d', 'c', 'y', '>', '<', '=', '!'].includes(op);
    const isCaseChange = (op) => ['gU', 'gu', 'g~'].includes(op);

    if (this.cmdBuffer === 'Ctrl+w') {
      if (key === 'v') {
        this.setStatus('Split window vertically (simulated)');
      } else if (key === 's') {
        this.setStatus('Split window horizontally (simulated)');
      } else if (key === 'w' || key === 'Ctrl+w') {
        this.setStatus('Switch window focus (simulated)');
      } else if (key === 'q') {
        this.setStatus('Close split window (simulated)');
      } else if (key === '=') {
        this.setStatus('Equalize splits (simulated)');
      } else {
        this.setStatus(`Window cmd: Ctrl+w ${key}`);
      }
    }

    if (this.cmdBuffer === '[') {
      if (key === 'd') {
        this.setStatus('LSP: Previous diagnostic (simulated)');
      } else if (key === 'c') {
        this.setStatus('Diff: Previous change (simulated)');
      } else if (key === 's') {
        this.setStatus('Spell: Previous misspelled word (simulated)');
      } else if (key === '[') {
        this.handleNormalMovement('gg');
      }
      this.cmdBuffer = '';
      this.update(); return;
    }

    if (this.cmdBuffer === ']') {
      if (key === 'd') {
        this.setStatus('LSP: Next diagnostic (simulated)');
      } else if (key === 'c') {
        this.setStatus('Diff: Next change (simulated)');
      } else if (key === 's') {
        this.setStatus('Spell: Next misspelled word (simulated)');
      } else if (key === ']') {
        this.handleNormalMovement('G');
      }
      this.cmdBuffer = '';
      this.update(); return;
    }

    if (this.cmdBuffer === 'g') {
      if (key === 'g') {
        this.handleNormalMovement('gg');
        this.cmdBuffer = '';
        this.clampCursor(); this.update(); return;
      } else if (key === 'v') {
        if (this.lastVisualMode) {
          this.visualStart = { ...this.lastVisualStart };
          this.visualEnd = { ...this.lastVisualEnd };
          this.cursor = { ...this.lastVisualEnd };
          this.setMode(this.lastVisualMode);
          this.stats.visualUsed = true;
        }
        this.cmdBuffer = '';
        this.update(); return;
      } else if (key === 'J') {
        this.saveUndo();
        if (this.cursor.row < this.lines.length - 1) {
          this.lines[this.cursor.row] = this.lines[this.cursor.row] + this.lines[this.cursor.row + 1].trimStart();
          this.lines.splice(this.cursor.row + 1, 1);
        }
        this.cmdBuffer = ''; this.update(); return;
      } else if (key === 'e') {
        this.handleNormalMovement('ge');
        this.cmdBuffer = '';
        this.clampCursor(); this.update(); return;
      } else if (key === 'E') {
        this.handleNormalMovement('gE');
        this.cmdBuffer = '';
        this.clampCursor(); this.update(); return;
      } else if (key === 'd') {
        const word = this.wordUnderCursor();
        if (word && word.trim() !== '') {
          for (let r = 0; r < this.lines.length; r++) {
            const idx = this.lines[r].indexOf(word);
            if (idx !== -1) {
              this.addJump();
              this.cursor.row = r;
              this.cursor.col = idx;
              this.setStatus(`gd: Go to definition of "${word}"`);
              break;
            }
          }
        }
        this.cmdBuffer = ''; this.clampCursor(); this.update(); return;
      } else if (key === 'r') {
        const word = this.wordUnderCursor();
        if (word && word.trim() !== '') {
          this.setStatus(`gr: LSP References for "${word}" (simulated)`);
        }
        this.cmdBuffer = ''; this.update(); return;
      } else if (['U', 'u', '~'].includes(key)) {
        this.cmdBuffer = 'g' + key;
        return;
      }
      this.cmdBuffer = ''; // clear if no match
    }

    // Operator motions or text objects
    if (isOperator(this.cmdBuffer)) {
      const op = this.cmdBuffer;
      if (key === op) {
        const pc = this.pendingCount || 1;
        const startRow = this.cursor.row;
        const endRow = Math.min(this.lines.length - 1, startRow + pc - 1);
        this.executeOperator(op, {
          startRow,
          startCol: 0,
          endRow,
          endCol: (this.lines[endRow] || '').length - 1,
          linewise: true
        });
        this.cmdBuffer = '';
        this.pendingCount = 0;
        return;
      }
      if (key === 'i' || key === 'a') {
        this.cmdBuffer = op + key;
        return;
      }
      if (key === 'g') {
        this.cmdBuffer = op + 'g';
        return;
      }
      // Treat key as a motion
      const motionRange = this.getMotionRange(key, this.pendingCount || 1);
      if (motionRange) {
        this.executeOperator(op, motionRange);
      }
      this.cmdBuffer = '';
      this.pendingCount = 0;
      return;
    }

    // Operator gg motions (dgg, cgg, ygg)
    if (this.cmdBuffer.length === 2 && this.cmdBuffer[1] === 'g') {
      const op = this.cmdBuffer[0];
      if (key === 'g') {
        this.executeOperator(op, {
          startRow: 0,
          startCol: 0,
          endRow: this.cursor.row,
          endCol: this.currentLine().length - 1,
          linewise: true
        });
      }
      this.cmdBuffer = '';
      this.pendingCount = 0;
      return;
    }

    // Text objects execution (diw, daw, etc.)
    if (this.cmdBuffer.length === 2 && ['i', 'a'].includes(this.cmdBuffer[1])) {
      const op = this.cmdBuffer[0];
      const isAround = this.cmdBuffer[1] === 'a';
      const range = this.getTextObjectRange(key, isAround);
      if (range) {
        this.executeOperator(op, range);
        this.stats.textObjUsed = true;
      }
      this.cmdBuffer = '';
      this.pendingCount = 0;
      return;
    }

    // Case change motions/text objects (gU, gu, g~)
    if (isCaseChange(this.cmdBuffer)) {
      const op = this.cmdBuffer;
      if (key === 'i' || key === 'a') {
        this.cmdBuffer = op + key;
        return;
      }
      const motionRange = this.getMotionRange(key, this.pendingCount || 1);
      if (motionRange) {
        this.executeOperator(op, motionRange);
      }
      this.cmdBuffer = '';
      this.pendingCount = 0;
      return;
    }

    // Case change text objects (gUiw, guiw, g~iw)
    if (this.cmdBuffer.length === 3 && ['i', 'a'].includes(this.cmdBuffer[2])) {
      const op = this.cmdBuffer.slice(0, 2);
      const isAround = this.cmdBuffer[2] === 'a';
      const range = this.getTextObjectRange(key, isAround);
      if (range) {
        this.executeOperator(op, range);
        this.stats.textObjUsed = true;
      }
      this.cmdBuffer = '';
      this.pendingCount = 0;
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
        if (this.macroRecording) {
          const reg = this.macroRecording;
          this.macroBuffer[reg] = this.macroBuffer[reg] || [];
          this.macroBuffer[reg].pop();
          this.macroRecording = null;
          this.setStatus(`Macro ${reg} recorded`);
        }
        this.cmdBuffer = ''; return;
      }
      if (key === ':' || key === '/') {
        this.setStatus(`Command/Search History Window (simulated)`);
        this.stats.cmdHistoryUsed = true;
        this.cmdBuffer = ''; return;
      }
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
      this.activeRegister = key;
      this.cmdBuffer = ''; return;
    }
    if (this.cmdBuffer === 'z') {
      if (['c', 'o', 'a', 'M', 'R', 'z', 't', 'b', 'f'].includes(key)) {
        this.stats.foldUsed = true;
      }
      if (key === '=') {
        this.setStatus('Spell Suggestions: 1. spelling  2. spelling error (simulated)');
        this.stats.spellCheckUsed = true;
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
      case 'U': this.undo(); break;
      case 'n': this.repeatSearch(true); break;
      case 'N': this.repeatSearch(false); break;
      case '*': this.searchWordUnderCursor(true); break;
      case '#': this.searchWordUnderCursor(false); break;
      case 'K':
        const wordK = this.wordUnderCursor();
        if (wordK && wordK.trim() !== '') {
          this.setStatus(`LSP Hover: Documentation for "${wordK}" (simulated)`);
        }
        break;
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
        if (['d', 'c', 'y', 'g', 'f', 'F', 't', 'T', 'm', '`', "'", 'r', 'z', '>', '<', '@', '"', '[', ']'].includes(key)) {
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
          // Movement — apply count prefix (e.g. 5j moves 5 lines down, 10l moves 10 chars right)
          for (let i = 0; i < count; i++) {
            this.handleNormalMovement(key);
            // Stop early if we hit a boundary (avoids redundant loops)
            if (key === 'j' || key === 'ArrowDown') {
              if (this.cursor.row >= this.lines.length - 1) break;
            } else if (key === 'k' || key === 'ArrowUp') {
              if (this.cursor.row <= 0) break;
            } else if (key === 'l' || key === 'ArrowRight') {
              const ln = this.lines[this.cursor.row] || '';
              if (this.cursor.col >= ln.length - 1) break;
            } else if (key === 'h' || key === 'ArrowLeft') {
              if (this.cursor.col <= 0) break;
            }
          }
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
    const targetReg = reg === '@' ? this.lastMacro : reg;
    const keys = this.macroBuffer[targetReg];
    if (!keys || keys.length === 0) {
      this.setStatus(`No macro in register ${targetReg || ''}`);
      return;
    }
    this.lastMacro = targetReg;
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
