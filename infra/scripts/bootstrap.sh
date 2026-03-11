#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  cp .env.example .env
fi

npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
