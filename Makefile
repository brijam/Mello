.PHONY: dev dev-server dev-client build up down migrate seed install

install:
	npm install

dev-server:
	npm run dev:server

dev-client:
	npm run dev:client

build:
	npm run build

up:
	docker compose up -d

down:
	docker compose down

up-dev:
	docker compose -f docker-compose.dev.yml up -d

down-dev:
	docker compose -f docker-compose.dev.yml down

migrate:
	cd server && npx drizzle-kit migrate

seed:
	cd server && npx tsx src/db/seed.ts
