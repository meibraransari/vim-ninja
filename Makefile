# ============================================================
# VimNinja — Makefile
# ============================================================

.PHONY: help install dev build up down restart logs shell-frontend shell-sandbox clean prune

# Default target
.DEFAULT_GOAL := help

# Colors
CYAN  := \033[36m
GREEN := \033[32m
RESET := \033[0m

help: ## Show this help message
	@echo ""
	@echo "  $(CYAN)⚡ VimNinja — Docker Commands$(RESET)"
	@echo "  ─────────────────────────────────────"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""

install: ## Copy .env.example to .env (first-time setup)
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✅  Created .env from .env.example — edit it to customize"; \
	else \
		echo "ℹ️  .env already exists — skipping"; \
	fi

dev: ## Open index.html directly in browser (no Docker needed)
	@echo "$(CYAN)Opening index.html in browser...$(RESET)"
	@if command -v xdg-open > /dev/null; then xdg-open index.html; \
	elif command -v open > /dev/null; then open index.html; \
	else echo "  Open index.html manually in your browser"; fi

build: ## Build all Docker images (no cache)
	@echo "$(CYAN)Building Docker images...$(RESET)"
	docker compose build --no-cache --progress=plain

build-cache: ## Build Docker images (with layer cache)
	@echo "$(CYAN)Building Docker images (cached)...$(RESET)"
	docker compose build --progress=plain

up: ## Start all services in detached mode
	@echo "$(CYAN)Starting VimNinja services...$(RESET)"
	docker compose up -d
	@echo ""
	@echo "  $(GREEN)✅ Services started!$(RESET)"
	@echo "  Frontend  → http://localhost:$${FRONTEND_PORT:-8080}"
	@echo "  Sandbox   → docker exec -it vimninja-sandbox bash"
	@echo ""

down: ## Stop and remove containers
	@echo "$(CYAN)Stopping services...$(RESET)"
	docker compose down

restart: ## Restart all services
	@echo "$(CYAN)Restarting services...$(RESET)"
	docker compose restart

logs: ## Follow logs from all services
	docker compose logs -f

logs-frontend: ## Follow frontend logs only
	docker compose logs -f frontend

logs-sandbox: ## Follow sandbox logs only
	docker compose logs -f vim-sandbox

ps: ## Show running containers
	docker compose ps

shell-frontend: ## Open shell inside frontend container
	docker exec -it vimninja-frontend sh

shell-sandbox: ## Open bash inside vim-sandbox container (practice here!)
	@echo "$(CYAN)Opening VimNinja sandbox shell...$(RESET)"
	@echo "  Type 'vim ~/practice/01-modes.txt' to start practicing!"
	docker exec -it vimninja-sandbox bash

vim-sandbox: ## Launch vim directly inside sandbox
	docker exec -it vimninja-sandbox vim ~/practice/01-modes.txt

nvim-sandbox: ## Launch neovim directly inside sandbox
	docker exec -it vimninja-sandbox nvim ~/practice/01-modes.txt

clean: ## Stop containers and remove volumes
	@echo "$(CYAN)Cleaning up containers and volumes...$(RESET)"
	docker compose down -v
	@echo "$(GREEN)✅ Cleaned up$(RESET)"

prune: ## Remove all stopped containers, unused images, volumes
	@echo "$(CYAN)Pruning Docker system...$(RESET)"
	docker system prune -f
	docker volume prune -f

health: ## Check health of running services
	@echo "$(CYAN)Checking service health...$(RESET)"
	@docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

status: ps health ## Alias for ps + health

.PHONY: docker-up docker-down docker-build
docker-up:   up
docker-down: down
docker-build: build
