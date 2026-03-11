SHELL := /bin/bash

.PHONY: install dev build up down logs db-migrate db-seed

install:
	npm install

dev:
	npm run dev

build:
	npm run build

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=200

db-migrate:
	npm run db:migrate

db-seed:
	npm run db:seed
