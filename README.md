# ⚡ VimNinja — Interactive Vim Learning Platform

> Master the world's most powerful text editor through interactive lessons, real practice, and progressive challenges.

---

## 🚀 Quick Start

Just open `index.html` in your browser — no server needed!

```bash
# Windows
start index.html

# Mac/Linux
open index.html
```

---

## 📁 Project Structure

```
vim-ninja/
├── index.html      — Main app shell
├── style.css       — Complete dark-theme styling
├── data.js         — All lessons, cheatsheet, achievements
├── vim-engine.js   — Browser Vim emulator (full mode system)
└── app.js          — App controller & page routing
```

---

## 🎓 What's Included

### 20 Lessons across 3 levels:

**🌱 Beginner (10 lessons)**
- Introduction to Vim Modes
- Basic Movement (hjkl)
- Moving by Words (w, e, b)
- Insert Mode Commands (i, a, I, A, o, O)
- Delete, Cut & Change (dd, dw, D, cc, cw)
- Copy (Yank) & Paste (yy, p, P)
- Undo & Redo (u, Ctrl+r)
- Search & Navigation (/, ?, n, N)
- Visual Mode (v, V, Ctrl+v)
- Search & Replace (:%s/old/new/g)

**⚡ Intermediate (10 lessons)**
- Line Navigation (0, ^, $, g_)
- File Navigation (gg, G, Ctrl+f/b)
- Find Character (f, t, F, T, ;, ,)
- Text Objects (iw, aw, i{, a", etc.)
- Marks (ma, `a)
- Macros (qa, @a, @@)
- Registers ("a, :reg, "+)
- Windows & Tabs (:sp, :vsp, Ctrl+w)
- Buffers (:bn, :bp, :ls)
- Indentation (>>, <<, gg=G)

**🥷 Advanced (5+ lessons)**
- Operators & Motions grammar
- Vim Configuration (.vimrc)
- Multi-line Editing (Ctrl+v block)
- Ex Commands (:g, :r, :!)
- Advanced Search & Regex (\v, \w)
- Jumps & Change History (Ctrl+o/i)
- Folding (zo, zc, za, zM)
- Neovim & Lua

---

## 🎮 Features

| Feature | Description |
|---------|-------------|
| **Vim Emulator** | Real Vim modes: Normal, Insert, Visual, Visual Line, Visual Block, Command, Replace, Search |
| **200+ Commands** | Full cheatsheet with search and category filters |
| **XP System** | Earn XP for completing lessons |
| **Achievements** | 12 unlock-able achievements |
| **Progress Tracking** | LocalStorage-based persistence |
| **Challenges** | Each lesson has a validation challenge |
| **Hints** | Built-in hint system for each exercise |

---

## ⌨️ Supported Vim Commands

### Movement
`h j k l` · `w W e E b B` · `0 ^ $ g_` · `gg G` · `{n}G` · `H M L`
`f F t T ; ,` · `% { }` · `Ctrl+d u f b`

### Insert Mode Entry
`i I a A o O` · `s S cc` · `R` (replace mode)

### Operators
`d c y > < = ~ g~ gU gu`

### Text Objects
`iw aw iW aW is as ip ap i( a( i[ a[ i{ a{ i" a" i' a' i\` a\`` 

### Visual Modes
`v V Ctrl+v` · `o O` (switch ends) · `gv` (reselect)

### Delete/Change/Yank
`dd dw de db d$ d0 dG` · `cc cw ciw` · `yy yw y$` · `p P`

### Registers & Marks
`:reg` · `"xy "xp "Xy` · `ma \`a 'a :marks` · `\`\`` · `\`[ \`]`

### Macros
`qa q @a @@ 10@a`

### Search
`/pattern ?pattern n N * # :noh` · `\<word\>` · `\c \C`

### Substitute
`:%s/old/new/g` · `:%s/old/new/gc` · `:g/pat/d`

### Files & Buffers
`:w :q :wq :q! ZZ ZQ` · `:e :bn :bp :bd :ls`

### Windows & Tabs  
`:sp :vsp` · `Ctrl+w h/j/k/l/w/s/v/q/=`

### Misc
`u Ctrl+r . J gJ r ~ Ctrl+a Ctrl+x`

---

## 🏆 Achievements

| Achievement | Requirement |
|-------------|-------------|
| 👣 First Steps | Complete 1 lesson |
| 🌱 Getting Started | Complete 5 lessons |
| 📚 Making Progress | Complete 10 lessons |
| 🎓 Vim Beginner | Complete all beginner lessons |
| ⚡ Vim Intermediate | Complete all intermediate lessons |
| 🥷 Vim Master | Complete all advanced lessons |
| 🏆 Vim Ninja | Complete ALL lessons |
| 💯 Century | Earn 100 XP |
| ⚡ Power User | Earn 500 XP |
| 🌟 Vim God | Earn 1000 XP |

---

## 📚 Reference Materials Used

- `Vim_Cheat_Sheet` — Full command reference
- `basic_vim.md` — CKA-focused shortcuts
- `vim_theme` — vimrc configuration options
- `vimrc/` — Real vimrc examples
- [vim-hero.com](https://vim-hero.com) — Lesson style inspiration

---

## 🔧 Tech Stack

- **Pure HTML + CSS + JavaScript** — No dependencies, no build step
- **Custom Vim Engine** — Full modal editing emulation in browser
- **LocalStorage** — Progress persistence
- **Google Fonts** — JetBrains Mono + Inter

---

*Made with ⚡ by VimNinja — Learn Vim the fun way!*
