-- ============================================================
-- VimNinja Sandbox — Neovim init.lua
-- Minimal, modern Neovim configuration for practice
-- ============================================================

-- ── Options ────────────────────────────────────────────────
local opt = vim.opt

opt.number         = true     -- Line numbers
opt.relativenumber = true     -- Relative numbers (great for motions)
opt.ruler          = true
opt.showcmd        = true
opt.showmode       = true
opt.cursorline     = true
opt.laststatus     = 2
opt.wildmenu       = true
opt.termguicolors  = true

-- Encoding
opt.encoding    = "utf-8"
opt.fileencoding = "utf-8"

-- Indentation
opt.tabstop     = 2
opt.shiftwidth  = 2
opt.softtabstop = 2
opt.expandtab   = true
opt.autoindent  = true
opt.smartindent = true

-- Search
opt.hlsearch   = true
opt.incsearch  = true
opt.ignorecase = true
opt.smartcase  = true
opt.showmatch  = true

-- Scrolling
opt.scrolloff  = 5
opt.sidescrolloff = 8

-- Buffers
opt.hidden   = true
opt.autoread = true
opt.swapfile = false
opt.backup   = false
opt.undofile = true
opt.undodir  = vim.fn.expand("~/.vim/undodir")

-- Performance
opt.lazyredraw = true
opt.ttyfast    = true

-- Split behavior
opt.splitright = true
opt.splitbelow = true

-- Display
opt.wrap       = true
opt.linebreak  = true
opt.colorcolumn = "81"
opt.list       = false
opt.listchars  = { tab = "▸ ", eol = "¬", trail = "·" }

-- ── Colorscheme ────────────────────────────────────────────
vim.cmd("colorscheme elflord")

-- ── Key mappings ───────────────────────────────────────────
local function map(mode, lhs, rhs, opts)
  opts = opts or {}
  opts.noremap = opts.noremap ~= false
  opts.silent = opts.silent ~= false
  vim.api.nvim_set_keymap(mode, lhs, rhs, opts)
end

local opts = { noremap = true, silent = true }

-- Leader key
vim.g.mapleader      = ","
vim.g.maplocalleader = "\\"

-- jk to exit insert mode
map("i", "jk", "<ESC>", opts)

-- Clear search highlight
map("n", "<leader><space>", ":nohlsearch<CR>", opts)

-- Fast save/quit
map("n", "<leader>w", ":w<CR>", opts)
map("n", "<leader>q", ":q<CR>", opts)
map("n", "<leader>x", ":wq<CR>", opts)

-- Move by visual lines
map("n", "j", "gj", opts)
map("n", "k", "gk", opts)

-- Center search results
map("n", "n", "nzz", opts)
map("n", "N", "Nzz", opts)

-- Window navigation
map("n", "<C-h>", "<C-w>h", opts)
map("n", "<C-j>", "<C-w>j", opts)
map("n", "<C-k>", "<C-w>k", opts)
map("n", "<C-l>", "<C-w>l", opts)

-- Buffer navigation
map("n", "<Tab>",   ":bnext<CR>", opts)
map("n", "<S-Tab>", ":bprev<CR>", opts)

-- Indent in visual mode (stay in visual)
map("v", "<", "<gv", opts)
map("v", ">", ">gv", opts)

-- Y yanks to end of line (consistent with D, C)
map("n", "Y", "y$", opts)

-- Paste without losing register
map("v", "p", '"_dP', opts)

-- Toggle relative numbers
map("n", "<leader>n", ":set relativenumber!<CR>", opts)

-- Toggle whitespace display
map("n", "<leader>l", ":set list!<CR>", opts)

-- ── Status line ────────────────────────────────────────────
opt.statusline = table.concat({
  " %{mode()} |",
  " %f",
  " %m%r",
  "%=",
  " %{&fileencoding} |",
  " %{&filetype} |",
  " %l:%c / %L ",
})

-- ── Auto commands ──────────────────────────────────────────
vim.cmd([[
  augroup VimNinja
    autocmd!
    " Remove trailing whitespace on save
    autocmd BufWritePre * silent! %s/\s\+$//e
    " File-type specific indent for python
    autocmd FileType python setlocal tabstop=4 shiftwidth=4 softtabstop=4
  augroup END
]])

-- Auto-create undo directory
local undodir = vim.fn.expand("~/.vim/undodir")
if vim.fn.isdirectory(undodir) == 0 then
  vim.fn.mkdir(undodir, "p")
end

-- ── Print welcome on startup ───────────────────────────────
-- Keep this fully compatible via legacy command
vim.cmd('autocmd VimEnter * echo "⚡ VimNinja Sandbox — Happy Learning!"')
