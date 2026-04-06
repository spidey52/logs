.PHONY: help install install-all dev dev-ui migrate

help:
	@echo "make install      — bun install in server/"
	@echo "make install-all  — server + frontend"
	@echo "make dev          — bun run dev (API)"
	@echo "make dev-ui       — Vite dev server (UI, proxies /api)"
	@echo "make migrate      — bun run db:migrate"

install:
	cd server && bun install

install-all: install
	cd frontend && bun install

dev:
	cd server && bun run dev

dev-ui:
	cd frontend && bun run dev

migrate:
	cd server && bun run db:migrate
