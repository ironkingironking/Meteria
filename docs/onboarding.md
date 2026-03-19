# Meteria Developer Onboarding

## Prerequisites

- Node.js 20+
- npm 10+
- Docker + Docker Compose
- Python 3.11+ (for gateway local runs)

## First-time setup

```bash
cp .env.example .env
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Services:

- API: `http://localhost:4000`
- Web: `http://localhost:3000`

## Gateway (optional local run)

```bash
cd gateway
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp config.example.yaml config.yaml
python -m app.main --config ./config.yaml
```

## Daily workflow

```bash
npm run typecheck
npm run build
```

## Branch and release

- PR validation: `.github/workflows/ci.yml`
- `develop` branch: staging deployment workflow
- `v*` tags / manual dispatch: production workflow

## Environment strategy

- `.env.example` for local
- `.env.staging.example` for staging reference
- `.env.production.example` for production reference

Do not commit real secrets.
